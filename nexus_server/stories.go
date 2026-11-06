package main

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log"
	"net/http"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

// Stories: short-lived posts (24h TTL) attached to a user's profile.
// Visible to anyone who is signed in. v1 surface:
//   POST  /api/v1/stories            create  body: {media_url, media_kind, caption}
//   GET   /api/v1/stories            feed    returns active stories grouped by author
//   GET   /api/v1/stories/{author}   single author's active stories
//   POST  /api/v1/stories/{id}/view  mark viewed
//   DELETE /api/v1/stories/{id}      author-only delete
//
// Storage uses the existing /api/v1/upload endpoint for the actual file;
// stories table only holds the URL the upload returned. Author + auth come
// from the standard session token.

const storyTTL = 24 * time.Hour

type Story struct {
	ID        int64  `json:"id"`
	Author    string `json:"author"`
	MediaURL  string `json:"media_url"`
	MediaKind string `json:"media_kind"` // "image" | "video"
	Caption   string `json:"caption,omitempty"`
	CreatedAt string `json:"created_at"`
	ExpiresAt string `json:"expires_at"`
	Views     int    `json:"views,omitempty"`
}

// requireAuthHTTP returns the authenticated username for an Authorization:
// Bearer request, or "" on failure (response already written).
func (s *NexusServer) requireAuthHTTP(w http.ResponseWriter, r *http.Request) string {
	u := s.sessionUsername(tokenFromRequest(r))
	if u == "" {
		http.Error(w, "auth required", http.StatusUnauthorized)
		return ""
	}
	return u
}

func (s *NexusServer) storiesCreateHandler(w http.ResponseWriter, r *http.Request) {
	user := s.requireAuthHTTP(w, r)
	if user == "" {
		return
	}
	if r.Method != http.MethodPost {
		http.Error(w, "POST required", http.StatusMethodNotAllowed)
		return
	}
	var body struct {
		MediaURL  string `json:"media_url"`
		MediaKind string `json:"media_kind"`
		Caption   string `json:"caption"`
	}
	if err := json.NewDecoder(io.LimitReader(r.Body, 8192)).Decode(&body); err != nil {
		http.Error(w, "bad json", http.StatusBadRequest)
		return
	}
	if body.MediaURL == "" {
		http.Error(w, "media_url required", http.StatusBadRequest)
		return
	}
	// Stories show media from our own uploads only; an external URL would
	// be loaded by every viewer (a tracking pixel).
	if storyUploadKey(body.MediaURL) == "" {
		http.Error(w, "media_url must be a Phaze upload", http.StatusBadRequest)
		return
	}
	if body.MediaKind != "image" && body.MediaKind != "video" {
		http.Error(w, "media_kind must be image or video", http.StatusBadRequest)
		return
	}
	if len(body.Caption) > 280 {
		body.Caption = body.Caption[:280]
	}
	expires := time.Now().UTC().Add(storyTTL).Format(time.RFC3339)
	res, err := s.DB.Exec(
		`INSERT INTO stories (author, media_url, media_kind, caption, expires_at) VALUES (?,?,?,?,?)`,
		user, body.MediaURL, body.MediaKind, body.Caption, expires)
	if err != nil {
		http.Error(w, "db error", http.StatusInternalServerError)
		return
	}
	id, _ := res.LastInsertId()
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(Story{
		ID: id, Author: user, MediaURL: body.MediaURL, MediaKind: body.MediaKind,
		Caption: body.Caption, ExpiresAt: expires,
	})
}

func (s *NexusServer) storiesFeedHandler(w http.ResponseWriter, r *http.Request) {
	if s.requireAuthHTTP(w, r) == "" {
		return
	}
	rows, err := s.DB.Query(
		`SELECT id, author, media_url, media_kind, COALESCE(caption,''),
		        CAST(created_at AS TEXT), CAST(expires_at AS TEXT)
		   FROM stories
		  WHERE datetime(expires_at) > CURRENT_TIMESTAMP
		  ORDER BY author, id DESC LIMIT 500`)
	if err != nil {
		http.Error(w, "db error", http.StatusInternalServerError)
		return
	}
	defer rows.Close()
	out := []Story{}
	for rows.Next() {
		var st Story
		if err := rows.Scan(&st.ID, &st.Author, &st.MediaURL, &st.MediaKind, &st.Caption, &st.CreatedAt, &st.ExpiresAt); err != nil {
			continue
		}
		out = append(out, st)
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(out)
}

func (s *NexusServer) storiesItemHandler(w http.ResponseWriter, r *http.Request) {
	user := s.requireAuthHTTP(w, r)
	if user == "" {
		return
	}
	tail := strings.TrimPrefix(r.URL.Path, "/api/v1/stories/")
	parts := strings.Split(tail, "/")
	if len(parts) == 0 || parts[0] == "" {
		http.Error(w, "missing id", http.StatusBadRequest)
		return
	}

	// /api/v1/stories/{id}/view → POST: mark viewed
	if len(parts) >= 2 && parts[1] == "view" && r.Method == http.MethodPost {
		id, perr := strconv.ParseInt(parts[0], 10, 64)
		if perr != nil {
			http.Error(w, "bad id", http.StatusBadRequest)
			return
		}
		s.DB.Exec(`INSERT OR IGNORE INTO story_views (story_id, viewer) VALUES (?, ?)`, id, user)
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"ok":true}`))
		return
	}

	// /api/v1/stories/{id}/reply → POST body {body}: sends as DM to author,
	// prefixed so the recipient sees it's a story reply. Skips the E2EE
	// pipeline (server-side relay).
	if len(parts) >= 2 && parts[1] == "reply" && r.Method == http.MethodPost {
		id, perr := strconv.ParseInt(parts[0], 10, 64)
		if perr != nil {
			http.Error(w, "bad id", http.StatusBadRequest)
			return
		}
		var body struct {
			Body string `json:"body"`
		}
		if err := json.NewDecoder(io.LimitReader(r.Body, 4096)).Decode(&body); err != nil {
			http.Error(w, "bad json", http.StatusBadRequest)
			return
		}
		if strings.TrimSpace(body.Body) == "" {
			http.Error(w, "empty reply", http.StatusBadRequest)
			return
		}
		var author string
		if err := s.DB.QueryRow(`SELECT author FROM stories WHERE id = ?`, id).Scan(&author); err != nil {
			http.NotFound(w, r)
			return
		}
		// H2: enforce block — a blocked user should not be able to reach
		// someone via story replies when they've been blocked in DMs.
		if s.isBlocked(author, user) || s.isBlocked(user, author) {
			http.Error(w, "cannot reply to this story", http.StatusForbidden)
			return
		}
		// Relay as a regular DM. Author sees it as a normal incoming msg
		// with the body prefixed so they know which story it references.
		text := "↩ reply to your story: " + strings.TrimSpace(body.Body)
		delivered := s.sendTo(author, NexusMessage{
			Type: "msg", Sender: user, Recipient: author, Body: text,
		})
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"ok":true,"delivered":` + map[bool]string{true: "true", false: "false"}[delivered] + `}`))
		return
	}

	// /api/v1/stories/{id} → DELETE: author-only
	if r.Method == http.MethodDelete && len(parts) == 1 {
		id, perr := strconv.ParseInt(parts[0], 10, 64)
		if perr != nil {
			http.Error(w, "bad id", http.StatusBadRequest)
			return
		}
		var author, mediaURL string
		if err := s.DB.QueryRow(`SELECT author, media_url FROM stories WHERE id = ?`, id).Scan(&author, &mediaURL); err != nil {
			http.NotFound(w, r)
			return
		}
		if author != user && !s.roleAtLeast(user, "moderator") {
			http.Error(w, "forbidden", http.StatusForbidden)
			return
		}
		s.DB.Exec(`DELETE FROM stories WHERE id = ?`, id)
		s.DB.Exec(`DELETE FROM story_views WHERE story_id = ?`, id)
		s.deleteStoryMedia(r.Context(), mediaURL)
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"ok":true}`))
		return
	}

	// /api/v1/stories/{author} → GET: single author's active stories
	if r.Method == http.MethodGet && len(parts) == 1 {
		author := parts[0]
		if !validUsername(author) {
			http.Error(w, "bad author", http.StatusBadRequest)
			return
		}
		rows, err := s.DB.Query(
			`SELECT s.id, s.author, s.media_url, s.media_kind, COALESCE(s.caption,''),
			        CAST(s.created_at AS TEXT), CAST(s.expires_at AS TEXT),
			        COALESCE((SELECT COUNT(*) FROM story_views v WHERE v.story_id = s.id), 0)
			   FROM stories s
			  WHERE s.author = ? AND datetime(s.expires_at) > CURRENT_TIMESTAMP
			  ORDER BY s.id ASC`, author)
		if err != nil {
			http.Error(w, "db error", http.StatusInternalServerError)
			return
		}
		defer rows.Close()
		out := []Story{}
		for rows.Next() {
			var st Story
			if err := rows.Scan(&st.ID, &st.Author, &st.MediaURL, &st.MediaKind, &st.Caption, &st.CreatedAt, &st.ExpiresAt, &st.Views); err != nil {
				continue
			}
			out = append(out, st)
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(out)
		return
	}

	http.Error(w, "unsupported", http.StatusMethodNotAllowed)
}

// storiesExpireSweeper deletes expired stories + their views every 10 min.
func (s *NexusServer) storiesExpireSweeper() {
	t := time.NewTicker(10 * time.Minute)
	defer t.Stop()
	for {
		<-t.C
		s.expireStories(context.Background())
	}
}

// expireStories deletes stories past their 24 hours, their views, and their
// media files. expires_at is stored as RFC3339 text ("…T…Z"), which doesn't
// compare correctly against CURRENT_TIMESTAMP ("… …") as a string, so it is
// compared through datetime().
func (s *NexusServer) expireStories(ctx context.Context) int {
	rows, err := s.DB.Query(`SELECT id, media_url FROM stories WHERE datetime(expires_at) <= CURRENT_TIMESTAMP`)
	if err != nil {
		log.Printf("[stories] sweep: %v", err)
		return 0
	}
	type expired struct {
		id  int64
		url string
	}
	var gone []expired
	for rows.Next() {
		var e expired
		if rows.Scan(&e.id, &e.url) == nil {
			gone = append(gone, e)
		}
	}
	rows.Close()
	for _, e := range gone {
		s.DB.Exec(`DELETE FROM stories WHERE id = ?`, e.id)
		s.DB.Exec(`DELETE FROM story_views WHERE story_id = ?`, e.id)
		s.deleteStoryMedia(ctx, e.url)
	}
	if len(gone) > 0 {
		log.Printf("[stories] expired %d stories", len(gone))
	}
	return len(gone)
}

// storyUploadKey returns the blob key for a /uploads/<name> URL, or "" when
// the URL isn't one of our uploads.
func storyUploadKey(mediaURL string) string {
	name, ok := strings.CutPrefix(mediaURL, "/uploads/")
	if !ok || name == "" || name != filepath.Base(name) || strings.HasPrefix(name, ".") {
		return ""
	}
	if ctype, _ := uploadContentType(strings.ToLower(filepath.Ext(name))); ctype == "" {
		return ""
	}
	return "uploads/" + name
}

// deleteStoryMedia removes a story's uploaded file, so the media doesn't
// outlive the story.
func (s *NexusServer) deleteStoryMedia(ctx context.Context, mediaURL string) {
	key := storyUploadKey(mediaURL)
	if key == "" {
		return
	}
	if err := blobs().Delete(ctx, key); err != nil && !errors.Is(err, errBlobNotFound) {
		log.Printf("[stories] delete media %s: %v", key, err)
	}
}

func (s *NexusServer) initStoriesRoutes() {
	http.HandleFunc("/api/v1/stories", rateLimit(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost {
			s.storiesCreateHandler(w, r)
			return
		}
		s.storiesFeedHandler(w, r)
	}))
	http.HandleFunc("/api/v1/stories/", rateLimit(s.storiesItemHandler))
	go s.storiesExpireSweeper()
}
