package main

import (
	"encoding/json"
	"strings"
	"testing"
)

// Whiteboard.
//
// The interesting cases aren't "does a stroke get stored" — they're the
// boundaries: a channel id on its own must not be enough to read or draw on
// someone else's board, and a malformed stroke must never reach other
// people's canvases.

func mkStroke(tool, color string, width float64, n int) string {
	pts := make([][2]float64, n)
	for i := range pts {
		pts[i] = [2]float64{float64(i) / float64(max(n, 1)), 0.5}
	}
	b, _ := json.Marshal(wbStroke{
		ID: "s1", Tool: tool, Color: color, Width: width, Points: pts,
	})
	return string(b)
}

func max(a, b int) int {
	if a > b {
		return a
	}
	return b
}

func TestWhiteboard_ValidateStrokeAcceptsWellFormed(t *testing.T) {
	for _, tool := range []string{"pen", "highlighter", "eraser"} {
		raw := mkStroke(tool, "#1a1a1a", 3, 10)
		if _, ok := validateStroke(raw); !ok {
			t.Errorf("a well-formed %s stroke was rejected", tool)
		}
	}
}

func TestWhiteboard_ValidateStrokeRejectsJunk(t *testing.T) {
	cases := []struct {
		name string
		raw  string
	}{
		{"not json", "{{{"},
		{"unknown tool", mkStroke("flamethrower", "#000", 3, 4)},
		{"no points", `{"id":"x","tool":"pen","color":"#000","width":3,"points":[]}`},
		{"zero width", mkStroke("pen", "#000", 0, 4)},
		{"absurd width", mkStroke("pen", "#000", 9999, 4)},
		// Colour is the one field that ends up in another client's CSS, so it
		// gets the strictest treatment.
		{"css escape in colour", mkStroke("pen", "red;}body{display:none", 3, 4)},
		{"colour with parens", mkStroke("pen", "url(javascript:alert(1))", 3, 4)},
		{"oversized payload", `{"id":"x","tool":"pen","color":"#000","width":3,"points":[` +
			strings.Repeat("[0.1,0.1],", 5000) + `[0.1,0.1]]}`},
	}
	for _, c := range cases {
		if _, ok := validateStroke(c.raw); ok {
			t.Errorf("%s: should have been rejected", c.name)
		}
	}
}

func TestWhiteboard_ValidateStrokeReencodes(t *testing.T) {
	// Anything extra the client tacked on must not survive into storage —
	// what gets persisted should be exactly what was validated.
	raw := `{"id":"s1","tool":"pen","color":"#000","width":3,"points":[[0.1,0.2]],"evil":"payload"}`
	clean, ok := validateStroke(raw)
	if !ok {
		t.Fatal("stroke should validate")
	}
	if strings.Contains(clean, "evil") {
		t.Errorf("unexpected field survived validation: %s", clean)
	}
}

func TestWhiteboard_StoresAndReplaysInOrder(t *testing.T) {
	srv, _, _ := newTestServer(t)
	ch := "chan-wb-1"

	for i, col := range []string{"#111111", "#222222", "#333333"} {
		clean, ok := validateStroke(mkStroke("pen", col, float64(i+1), 3))
		if !ok {
			t.Fatalf("stroke %d invalid", i)
		}
		if _, stored := srv.appendStroke(ch, "alice", clean); !stored {
			t.Fatalf("stroke %d not stored", i)
		}
	}

	state := srv.whiteboardState(ch)
	if len(state) != 3 {
		t.Fatalf("expected 3 strokes replayed, got %d", len(state))
	}
	// Order matters: a board replayed out of order paints differently, since
	// later strokes cover earlier ones.
	for i, want := range []string{"#111111", "#222222", "#333333"} {
		if !strings.Contains(state[i], want) {
			t.Errorf("stroke %d out of order: %s", i, state[i])
		}
	}
}

func TestWhiteboard_UndoTakesBackOnlyYourOwnLastStroke(t *testing.T) {
	srv, _, _ := newTestServer(t)
	ch := "chan-wb-2"

	aliceStroke, _ := validateStroke(mkStroke("pen", "#aaaaaa", 3, 2))
	bobStroke, _ := validateStroke(mkStroke("pen", "#bbbbbb", 3, 2))
	srv.appendStroke(ch, "alice", aliceStroke)
	srv.appendStroke(ch, "bob", bobStroke) // bob drew most recently

	// Alice undoing must remove *her* stroke, not bob's more recent one.
	_, removed, ok := srv.undoLastStroke(ch, "alice")
	if !ok {
		t.Fatal("undo found nothing to remove")
	}
	if !strings.Contains(removed, "#aaaaaa") {
		t.Errorf("undo removed the wrong stroke: %s", removed)
	}

	state := srv.whiteboardState(ch)
	if len(state) != 1 || !strings.Contains(state[0], "#bbbbbb") {
		t.Errorf("bob's stroke should have survived alice's undo, board is now %v", state)
	}
}

func TestWhiteboard_UndoOnEmptyBoardIsHarmless(t *testing.T) {
	srv, _, _ := newTestServer(t)
	if _, _, ok := srv.undoLastStroke("chan-empty", "alice"); ok {
		t.Error("undo reported success on a board with nothing on it")
	}
}

func TestWhiteboard_ClearWipesTheBoard(t *testing.T) {
	srv, _, _ := newTestServer(t)
	ch := "chan-wb-3"
	clean, _ := validateStroke(mkStroke("pen", "#123456", 3, 2))
	srv.appendStroke(ch, "alice", clean)
	srv.appendStroke(ch, "bob", clean)

	srv.clearWhiteboard(ch)
	if n := len(srv.whiteboardState(ch)); n != 0 {
		t.Errorf("board should be empty after clear, has %d strokes", n)
	}
}

func TestWhiteboard_BoardsAreIsolatedFromEachOther(t *testing.T) {
	srv, _, _ := newTestServer(t)
	clean, _ := validateStroke(mkStroke("pen", "#abcdef", 3, 2))
	srv.appendStroke("chan-a", "alice", clean)

	if n := len(srv.whiteboardState("chan-b")); n != 0 {
		t.Errorf("a stroke leaked into an unrelated channel's board (%d strokes)", n)
	}
}

func TestWhiteboard_TrimsPastTheCap(t *testing.T) {
	srv, _, _ := newTestServer(t)
	ch := "chan-wb-cap"
	clean, _ := validateStroke(mkStroke("pen", "#000000", 3, 2))

	// Push past the ceiling. Without trimming, wb_state would eventually grow
	// too large to send and replay would crawl.
	for i := 0; i < maxWhiteboardStrokes+50; i++ {
		srv.appendStroke(ch, "alice", clean)
	}
	if n := len(srv.whiteboardState(ch)); n > maxWhiteboardStrokes {
		t.Errorf("board grew past the cap: %d > %d", n, maxWhiteboardStrokes)
	}
}

func TestWhiteboard_ChannelKindIsCheckedNotAssumed(t *testing.T) {
	srv, _, _ := newTestServer(t)
	srv.DB.Exec(`INSERT INTO servers (id, name, owner, visibility) VALUES ('sv1','Space','alice','private')`)
	srv.DB.Exec(`INSERT INTO channels (id, server_id, name, kind, position) VALUES ('text1','sv1','general','text',0)`)
	srv.DB.Exec(`INSERT INTO channels (id, server_id, name, kind, position) VALUES ('wb1','sv1','ideas','whiteboard',1)`)

	if _, ok := srv.channelIsWhiteboard("text1"); ok {
		t.Error("a text channel was treated as a whiteboard")
	}
	sv, ok := srv.channelIsWhiteboard("wb1")
	if !ok || sv != "sv1" {
		t.Errorf("whiteboard channel not recognised: server=%q ok=%v", sv, ok)
	}
	if _, ok := srv.channelIsWhiteboard("does-not-exist"); ok {
		t.Error("a channel id that doesn't exist was accepted as a whiteboard")
	}
}

// Undo has to name the stroke it wants back, not say "my most recent".
//
// Found by driving two browsers signed in as the same account: one device's
// undo reached across and removed a mark made on the other. "Most recent by
// this author" is ambiguous the moment a person has the board open twice,
// which the multi-connection work made an ordinary thing to do.
func TestWhiteboard_UndoNamesTheStrokeItRemoves(t *testing.T) {
	srv, _, _ := newTestServer(t)
	ch := "chan-wb-uid"

	// Same author, two strokes — as if from two devices.
	first := `{"id":"demo-aaa","tool":"pen","color":"#aaaaaa","width":3,"points":[[0.1,0.1],[0.2,0.2]]}`
	second := `{"id":"demo-bbb","tool":"pen","color":"#bbbbbb","width":3,"points":[[0.3,0.3],[0.4,0.4]]}`
	for _, raw := range []string{first, second} {
		clean, ok := validateStroke(raw)
		if !ok {
			t.Fatalf("stroke should validate: %s", raw)
		}
		srv.appendStroke(ch, "demo", clean)
	}

	// Undo the *earlier* one by name. "Most recent" would have taken the other.
	_, removed, ok := srv.undoStroke(ch, "demo", "demo-aaa")
	if !ok {
		t.Fatal("undo by uid found nothing")
	}
	if !strings.Contains(removed, "#aaaaaa") {
		t.Errorf("undo removed the wrong stroke: %s", removed)
	}

	state := srv.whiteboardState(ch)
	if len(state) != 1 || !strings.Contains(state[0], "#bbbbbb") {
		t.Errorf("the other stroke should have survived, board is %v", state)
	}
}

// Naming a stroke must not become a way to erase other people's work.
func TestWhiteboard_UndoCannotRemoveSomeoneElsesStroke(t *testing.T) {
	srv, _, _ := newTestServer(t)
	ch := "chan-wb-theft"

	bobStroke := `{"id":"bob-xyz","tool":"pen","color":"#bbbbbb","width":3,"points":[[0.1,0.1],[0.2,0.2]]}`
	clean, _ := validateStroke(bobStroke)
	srv.appendStroke(ch, "bob", clean)

	// Alice names bob's stroke. The author check is what stops this.
	if _, _, ok := srv.undoStroke(ch, "alice", "bob-xyz"); ok {
		t.Fatal("alice undid a stroke drawn by bob")
	}
	if n := len(srv.whiteboardState(ch)); n != 1 {
		t.Errorf("bob's stroke should still be on the board, found %d strokes", n)
	}
}

// A stroke with no id can't be addressed for undo, so it's rejected on entry
// rather than becoming an un-removable mark.
func TestWhiteboard_StrokeWithoutIDIsRejected(t *testing.T) {
	raw := `{"tool":"pen","color":"#000","width":3,"points":[[0.1,0.1]]}`
	if _, ok := validateStroke(raw); ok {
		t.Error("a stroke with no id was accepted — it could never be undone")
	}
}
