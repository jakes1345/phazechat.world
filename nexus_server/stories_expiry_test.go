package main

import (
	"bytes"
	"context"
	"errors"
	"testing"
	"time"
)

// A story whose 24 hours ran out an hour ago is gone from the feed and
// its media file is deleted; RFC3339 text vs CURRENT_TIMESTAMP used to keep
// it until the end of the UTC day.
func TestStoriesExpireOnTimeAndTakeTheirMedia(t *testing.T) {
	store := tempDiskStore(t)
	useBlobs(t, store)
	srv, _, _ := newTestServer(t)
	ctx := context.Background()
	if err := store.Put(ctx, "uploads/old1.png", bytes.NewReader([]byte("png")), 3, "image/png"); err != nil {
		t.Fatal(err)
	}
	past := time.Now().UTC().Add(-time.Hour).Format(time.RFC3339)
	future := time.Now().UTC().Add(time.Hour).Format(time.RFC3339)
	srv.DB.Exec(`INSERT INTO stories (author, media_url, media_kind, caption, expires_at) VALUES ('a','/uploads/old1.png','image','',?)`, past)
	srv.DB.Exec(`INSERT INTO stories (author, media_url, media_kind, caption, expires_at) VALUES ('a','/uploads/new1.png','image','',?)`, future)

	var visible int
	srv.DB.QueryRow(`SELECT COUNT(*) FROM stories WHERE datetime(expires_at) > CURRENT_TIMESTAMP`).Scan(&visible)
	if visible != 1 {
		t.Fatalf("expected only the live story visible, got %d", visible)
	}
	if n := srv.expireStories(ctx); n != 1 {
		t.Fatalf("expired %d stories, want 1", n)
	}
	if _, _, err := store.Open(ctx, "uploads/old1.png"); !errors.Is(err, errBlobNotFound) {
		t.Fatalf("expired story's media still stored (err=%v)", err)
	}
}

func TestStoryUploadKey(t *testing.T) {
	for url, want := range map[string]string{
		"/uploads/abc.png":             "uploads/abc.png",
		"https://evil.example/x.png":   "",
		"/uploads/../nexus.db":         "",
		"/uploads/x.html":              "",
		"/uploads/":                    "",
		"//evil.example/uploads/a.png": "",
	} {
		if got := storyUploadKey(url); got != want {
			t.Errorf("storyUploadKey(%q) = %q, want %q", url, got, want)
		}
	}
}
