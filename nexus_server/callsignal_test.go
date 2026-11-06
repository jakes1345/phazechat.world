package main

import (
	"testing"

	"github.com/gorilla/websocket"
)

// readSkipping reads c until want matches, failing if a message of type
// forbid arrives first. Negative checks use a later message as the sentinel
// instead of a read timeout, which would leave the websocket unusable.
func readSkipping(t *testing.T, c *websocket.Conn, forbid string, want func(NexusMessage) bool) NexusMessage {
	t.Helper()
	return readUntil(t, c, func(m NexusMessage) bool {
		if m.Type == forbid {
			t.Fatalf("unexpected %s: %+v", forbid, m)
		}
		return want(m)
	})
}

// sentinel sends a DM from -> to and waits for it on each of conns, failing
// if a call_signal shows up there first.
func sentinel(t *testing.T, from *websocket.Conn, to string, tag string, conns ...*websocket.Conn) {
	t.Helper()
	if err := from.WriteJSON(NexusMessage{Type: "msg", Recipient: to, Body: "SEALED::" + tag}); err != nil {
		t.Fatal(err)
	}
	for _, c := range conns {
		readSkipping(t, c, "call_signal", func(m NexusMessage) bool { return m.Type == "msg" && m.Body == "SEALED::"+tag })
	}
}

func callFriends(t *testing.T) (alice, bob, bob2, carol *websocket.Conn) {
	t.Helper()
	srv, _, wsBase := newTestServer(t)
	for _, u := range []string{"alice", "bob", "carol"} {
		registerAndVerify(t, srv, u, "password123")
	}
	for _, pair := range [][2]string{{"alice", "bob"}, {"alice", "carol"}, {"bob", "carol"}} {
		if _, err := srv.DB.Exec(`INSERT INTO friends (user_a, user_b, status) VALUES (?, ?, 'accepted')`, pair[0], pair[1]); err != nil {
			t.Fatalf("seed friends: %v", err)
		}
	}
	alice, bob, bob2, carol = dial(t, wsBase), dial(t, wsBase), dial(t, wsBase), dial(t, wsBase)
	auth(t, alice, "alice", "password123")
	auth(t, bob, "bob", "password123")
	auth(t, bob2, "bob", "password123")
	auth(t, carol, "carol", "password123")
	return
}

func TestCall_WebRTCHandshakeAndRelay(t *testing.T) {
	alice, bob, bob2, carol := callFriends(t)

	if err := alice.WriteJSON(NexusMessage{Type: "call_offer", Recipient: "bob", Body: "video", Status: callRTC}); err != nil {
		t.Fatal(err)
	}
	readUntil(t, bob, func(m NexusMessage) bool { return m.Type == "call_offer" })
	readUntil(t, bob2, func(m NexusMessage) bool { return m.Type == "call_offer" })

	// Signals before the call is answered go nowhere.
	_ = alice.WriteJSON(NexusMessage{Type: "call_signal", Recipient: "bob", Body: "offer", SDP: "v=0 early"})
	sentinel(t, alice, "bob", "early", bob, bob2)

	if err := bob.WriteJSON(NexusMessage{Type: "call_answer", Recipient: "alice", Body: "video", Status: callRTC}); err != nil {
		t.Fatal(err)
	}
	a := readUntil(t, alice, func(m NexusMessage) bool { return m.Type == "call_accepted" || m.Type == "call_jitsi" })
	if a.Type != "call_accepted" || a.Status != "caller" || a.Sender != "bob" || a.Body != "video" {
		t.Fatalf("caller got %+v", a)
	}
	b := readUntil(t, bob, func(m NexusMessage) bool { return m.Type == "call_accepted" || m.Type == "call_jitsi" })
	if b.Type != "call_accepted" || b.Status != "callee" || b.Sender != "alice" {
		t.Fatalf("callee got %+v", b)
	}
	readUntil(t, bob2, func(m NexusMessage) bool { return m.Type == "call_end" && m.Body == "answered_elsewhere" })

	// Offer and ICE reach only the connection that answered.
	if err := alice.WriteJSON(NexusMessage{Type: "call_signal", Sender: "mallory", Recipient: "bob", Body: "offer", SDP: "v=0 offer"}); err != nil {
		t.Fatal(err)
	}
	got := readUntil(t, bob, func(m NexusMessage) bool { return m.Type == "call_signal" })
	if got.Sender != "alice" || got.Body != "offer" || got.SDP != "v=0 offer" {
		t.Fatalf("relayed offer wrong: %+v", got)
	}

	_ = bob.WriteJSON(NexusMessage{Type: "call_signal", Recipient: "alice", Body: "answer", SDP: "v=0 answer"})
	got = readUntil(t, alice, func(m NexusMessage) bool { return m.Type == "call_signal" })
	if got.Body != "answer" || got.SDP != "v=0 answer" {
		t.Fatalf("relayed answer wrong: %+v", got)
	}
	_ = bob.WriteJSON(NexusMessage{Type: "call_signal", Recipient: "alice", Body: "ice", Candidate: `{"candidate":"c"}`})
	got = readUntil(t, alice, func(m NexusMessage) bool { return m.Type == "call_signal" })
	if got.Body != "ice" || got.Candidate != `{"candidate":"c"}` {
		t.Fatalf("relayed ice wrong: %+v", got)
	}

	// Someone outside the call can't inject signals into it.
	_ = carol.WriteJSON(NexusMessage{Type: "call_signal", Recipient: "bob", Body: "offer", SDP: "v=0 evil"})
	sentinel(t, carol, "bob", "carol", bob, bob2)

	// After hang-up the relay closes.
	_ = alice.WriteJSON(NexusMessage{Type: "call_end", Recipient: "bob"})
	readUntil(t, bob, func(m NexusMessage) bool { return m.Type == "call_end" })
	_ = alice.WriteJSON(NexusMessage{Type: "call_signal", Recipient: "bob", Body: "ice", Candidate: "x"})
	sentinel(t, alice, "bob", "after", bob, bob2)
}

func TestCall_FallsBackToJitsiForOlderClients(t *testing.T) {
	alice, bob, _, _ := callFriends(t)
	// Caller supports WebRTC, callee is an older build.
	_ = alice.WriteJSON(NexusMessage{Type: "call_offer", Recipient: "bob", Body: "audio", Status: callRTC})
	readUntil(t, bob, func(m NexusMessage) bool { return m.Type == "call_offer" })
	_ = bob.WriteJSON(NexusMessage{Type: "call_answer", Recipient: "alice", Body: "audio"})
	a := readUntil(t, alice, func(m NexusMessage) bool { return m.Type == "call_accepted" || m.Type == "call_jitsi" })
	if a.Type != "call_jitsi" || a.RoomID == "" {
		t.Fatalf("expected jitsi fallback, got %+v", a)
	}
}

func TestValidCallSignal(t *testing.T) {
	cases := []struct {
		m    NexusMessage
		want bool
	}{
		{NexusMessage{Body: "offer", SDP: "v=0"}, true},
		{NexusMessage{Body: "answer", SDP: "v=0"}, true},
		{NexusMessage{Body: "ice", Candidate: "{}"}, true},
		{NexusMessage{Body: "offer"}, false},
		{NexusMessage{Body: "ice"}, false},
		{NexusMessage{Body: "bye", SDP: "v=0"}, false},
		{NexusMessage{Body: "offer", SDP: string(make([]byte, maxCallSDP+1))}, false},
		{NexusMessage{Body: "ice", Candidate: string(make([]byte, maxCallCandidate+1))}, false},
	}
	for i, c := range cases {
		if got := validCallSignal(c.m); got != c.want {
			t.Errorf("case %d: got %v want %v", i, got, c.want)
		}
	}
}
