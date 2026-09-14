package main

import (
	"encoding/json"
	"log"
	"strings"
)

// Shared whiteboard.
//
// Modelled on the one in Skype for Business, which is the only place the Skype
// family ever shipped a collaborative drawing surface — consumer Skype never
// had one. See docs/skype-era-research.md.
//
// A whiteboard belongs to a channel, the way a Lync whiteboard belonged to a
// meeting. Anyone in the space can draw, and everyone sees it as it happens.
//
// The state is an append-only list of strokes rather than an image. That
// choice buys three things: a late joiner can be handed the history and
// replay it, undo is just dropping the last stroke by an author, and nothing
// has to rasterise on the server. The cost is that a board grows without
// bound, which maxWhiteboardStrokes caps.

// maxWhiteboardStrokes bounds a single board.
//
// Past this, the oldest strokes are dropped as new ones arrive. A board that
// grows forever would eventually make wb_state too large to send and slow the
// canvas replay to a crawl, and silently degrading is worse than a documented
// ceiling.
const maxWhiteboardStrokes = 4000

// Stroke sizes are capped so one client can't push a multi-megabyte path
// through the relay and into every other member's memory.
const maxStrokeBytes = 64 * 1024

// wbStroke is one continuous mark. The server stores it opaquely — it never
// needs to understand the geometry, only who drew it and in what order — but
// the shape is validated on the way in so a malformed payload can't be
// replayed to everyone else.
type wbStroke struct {
	ID     string       `json:"id"`
	Tool   string       `json:"tool"`  // pen | highlighter | eraser
	Color  string       `json:"color"` // css colour
	Width  float64      `json:"width"`
	Points [][2]float64 `json:"points"` // normalised 0..1, so boards scale
}

var validWhiteboardTools = map[string]bool{
	"pen":         true,
	"highlighter": true,
	"eraser":      true,
}

// channelIsWhiteboard reports whether a channel is a whiteboard, and which
// server it belongs to.
func (s *NexusServer) channelIsWhiteboard(channelID string) (serverID string, ok bool) {
	var kind string
	if err := s.DB.QueryRow(
		`SELECT server_id, kind FROM channels WHERE id = ?`, channelID,
	).Scan(&serverID, &kind); err != nil {
		return "", false
	}
	return serverID, kind == "whiteboard"
}

// validateStroke checks a stroke is well-formed before it's stored or relayed.
//
// Returns the re-encoded JSON so what gets persisted is what was validated,
// not whatever the client happened to send alongside it.
func validateStroke(raw string) (string, bool) {
	_, clean, ok := validateStrokeWithUID(raw)
	return clean, ok
}

// validateStrokeWithUID is validateStroke, also returning the stroke's
// client-generated id so it can be stored for targeted undo.
func validateStrokeWithUID(raw string) (uid string, clean string, ok bool) {
	if len(raw) > maxStrokeBytes {
		return "", "", false
	}
	var st wbStroke
	if err := json.Unmarshal([]byte(raw), &st); err != nil {
		return "", "", false
	}
	if !validWhiteboardTools[st.Tool] {
		return "", "", false
	}
	if len(st.Points) == 0 || len(st.Points) > 4000 {
		return "", "", false
	}
	if st.Width <= 0 || st.Width > 200 {
		return "", "", false
	}
	if st.ID == "" || len(st.ID) > 128 {
		return "", "", false
	}
	// Colour is echoed into other clients' CSS, so keep it to a conservative
	// character set rather than trusting it — this is the one field that
	// crosses into markup.
	if len(st.Color) > 32 || strings.ContainsAny(st.Color, `;:{}()<>"'\\`) {
		return "", "", false
	}
	encoded, err := json.Marshal(st)
	if err != nil {
		return "", "", false
	}
	return st.ID, string(encoded), true
}

// appendStroke stores a stroke and trims the board if it has grown past the
// cap.
func (s *NexusServer) appendStroke(channelID, author, stroke string) (int64, bool) {
	uid, _, _ := validateStrokeWithUID(stroke)
	res, err := s.DB.Exec(
		`INSERT INTO whiteboard_strokes (channel_id, author, stroke_uid, stroke) VALUES (?, ?, ?, ?)`,
		channelID, author, uid, stroke)
	if err != nil {
		log.Printf("[whiteboard] append to %s: %v", channelID, err)
		return 0, false
	}
	id, _ := res.LastInsertId()

	var n int
	s.DB.QueryRow(`SELECT COUNT(*) FROM whiteboard_strokes WHERE channel_id = ?`, channelID).Scan(&n)
	if n > maxWhiteboardStrokes {
		s.DB.Exec(`
			DELETE FROM whiteboard_strokes
			 WHERE channel_id = ?
			   AND id NOT IN (
			       SELECT id FROM whiteboard_strokes
			        WHERE channel_id = ?
			        ORDER BY id DESC LIMIT ?
			   )`, channelID, channelID, maxWhiteboardStrokes)
	}
	return id, true
}

// whiteboardState returns every stroke on a board, oldest first, as raw JSON
// ready to be replayed by a joining client.
func (s *NexusServer) whiteboardState(channelID string) []string {
	rows, err := s.DB.Query(
		`SELECT stroke FROM whiteboard_strokes WHERE channel_id = ? ORDER BY id ASC`, channelID)
	if err != nil {
		return nil
	}
	defer rows.Close()
	out := []string{}
	for rows.Next() {
		var st string
		if rows.Scan(&st) == nil {
			out = append(out, st)
		}
	}
	return out
}

// clearWhiteboard wipes a board.
func (s *NexusServer) clearWhiteboard(channelID string) {
	s.DB.Exec(`DELETE FROM whiteboard_strokes WHERE channel_id = ?`, channelID)
}

// undoStroke removes one specific stroke, and only if the caller drew it.
//
// Naming the stroke rather than saying "my most recent" matters as soon as the
// same person has the board open twice: "most recent by this author" would let
// one device take back a mark made on the other. The author check is what
// stops it also being a way to erase someone else's work.
func (s *NexusServer) undoStroke(channelID, author, uid string) (int64, string, bool) {
	if uid == "" {
		return 0, "", false
	}
	var id int64
	var stroke string
	err := s.DB.QueryRow(
		`SELECT id, stroke FROM whiteboard_strokes
		  WHERE channel_id = ? AND author = ? AND stroke_uid = ?
		  ORDER BY id DESC LIMIT 1`, channelID, author, uid,
	).Scan(&id, &stroke)
	if err != nil {
		return 0, "", false
	}
	s.DB.Exec(`DELETE FROM whiteboard_strokes WHERE id = ?`, id)
	return id, stroke, true
}

// undoLastStroke removes the caller's most recent stroke on a board. Used when
// a client asks to undo without naming one.
func (s *NexusServer) undoLastStroke(channelID, author string) (int64, string, bool) {
	var uid string
	if err := s.DB.QueryRow(
		`SELECT stroke_uid FROM whiteboard_strokes
		  WHERE channel_id = ? AND author = ?
		  ORDER BY id DESC LIMIT 1`, channelID, author,
	).Scan(&uid); err != nil {
		return 0, "", false
	}
	return s.undoStroke(channelID, author, uid)
}
