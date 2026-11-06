package main

import (
	"testing"

	"github.com/gorilla/websocket"
)

// readUntilNot reads until `until` matches, failing the test if a message
// matching `forbidden` shows up first. Used for "X must not happen" checks
// without burning a read deadline (which poisons a gorilla conn).
func readUntilNot(t *testing.T, c *websocket.Conn, forbidden, until func(NexusMessage) bool) NexusMessage {
	t.Helper()
	return readUntil(t, c, func(m NexusMessage) bool {
		if forbidden(m) {
			t.Fatalf("unexpected message: %+v", m)
		}
		return until(m)
	})
}

// callSetup signs in alice, bob and mallory (alice-bob friends) and has alice
// ring bob. Returns the three connections and the offered room.
func callSetup(t *testing.T) (srv *NexusServer, alice, bob, mallory *websocket.Conn, room string) {
	t.Helper()
	srv, _, wsBase := newTestServer(t)
	for _, u := range []string{"alice", "bob", "mallory"} {
		registerAndVerify(t, srv, u, "password123")
	}
	friends(t, srv, "alice", "bob")
	alice, bob, mallory = dial(t, wsBase), dial(t, wsBase), dial(t, wsBase)
	auth(t, alice, "alice", "password123")
	auth(t, bob, "bob", "password123")
	auth(t, mallory, "mallory", "password123")

	alice.WriteJSON(NexusMessage{Type: "call_offer", Recipient: "bob", Body: "video"})
	offer := readUntil(t, bob, func(m NexusMessage) bool { return m.Type == "call_offer" })
	return srv, alice, bob, mallory, offer.RoomID
}

func TestCalls_OnlyCalleeCanAnswer(t *testing.T) {
	_, alice, bob, mallory, room := callSetup(t)

	// Mallory tries to pick up alice's call to bob.
	mallory.WriteJSON(NexusMessage{Type: "call_answer", Recipient: "alice"})
	got := readUntil(t, mallory, func(m NexusMessage) bool {
		return m.Type == "call_jitsi" || m.Type == "call_end"
	})
	if got.Type == "call_jitsi" || got.RoomID != "" {
		t.Fatalf("mallory was handed the call room: %+v", got)
	}

	// Bob can still answer, and alice's first call_jitsi is bob's.
	bob.WriteJSON(NexusMessage{Type: "call_answer", Recipient: "alice", Body: "video"})
	j := readUntil(t, alice, func(m NexusMessage) bool { return m.Type == "call_jitsi" })
	if j.RoomID != room {
		t.Fatalf("alice got room %q, want %q", j.RoomID, room)
	}
	readUntil(t, bob, func(m NexusMessage) bool { return m.Type == "call_jitsi" && m.RoomID == room })

	// A second answer once it's been picked up gets nothing.
	bob.WriteJSON(NexusMessage{Type: "call_answer", Recipient: "alice"})
	if again := readUntil(t, bob, func(m NexusMessage) bool {
		return m.Type == "call_jitsi" || m.Type == "call_end"
	}); again.Type == "call_jitsi" {
		t.Fatalf("second answer re-issued the room: %+v", again)
	}
}

func TestCalls_StrangerCannotEndOrRejectSomeoneElsesCall(t *testing.T) {
	srv, alice, bob, mallory, room := callSetup(t)

	mallory.WriteJSON(NexusMessage{Type: "call_reject", Recipient: "alice"})
	mallory.WriteJSON(NexusMessage{Type: "call_end", Recipient: "alice"})
	mallory.WriteJSON(NexusMessage{Type: "call_end", Recipient: "bob"})

	// The call is still alive: bob answers and alice gets the room without
	// having seen any hang-up or call_log first.
	bob.WriteJSON(NexusMessage{Type: "call_answer", Recipient: "alice"})
	readUntilNot(t, alice,
		func(m NexusMessage) bool {
			return m.Type == "call_end" || m.Type == "call_reject" || m.Type == "call_log"
		},
		func(m NexusMessage) bool { return m.Type == "call_jitsi" && m.RoomID == room })

	// The call row was left for the real hang-up: it logs as answered.
	// (Had mallory's call_end finalized it, it would have been a miss and
	// this hang-up would log nothing.)
	alice.WriteJSON(NexusMessage{Type: "call_end", Recipient: "bob"})
	readUntil(t, bob, func(m NexusMessage) bool { return m.Type == "call_end" && m.Sender == "alice" })
	logMsg := readUntil(t, bob, func(m NexusMessage) bool { return m.Type == "call_log" })
	if logMsg.Status != "answered" {
		t.Fatalf("call_log status = %q, want answered", logMsg.Status)
	}
	var answered int
	srv.DB.QueryRow(`SELECT answered FROM calls WHERE caller = 'alice' AND callee = 'bob'`).Scan(&answered)
	if answered != 1 {
		t.Fatalf("call row not recorded as answered")
	}
}

func TestCalls_RelayedHangupCarriesAuthenticatedSender(t *testing.T) {
	_, alice, bob, _, _ := callSetup(t)

	bob.WriteJSON(NexusMessage{Type: "call_reject", Sender: "mallory", Recipient: "alice", Body: "answered_elsewhere"})
	rej := readUntil(t, alice, func(m NexusMessage) bool { return m.Type == "call_reject" })
	if rej.Sender != "bob" {
		t.Fatalf("relayed reject sender = %q, want bob", rej.Sender)
	}
	if rej.Body != "" {
		t.Fatalf("client-supplied body forwarded: %q", rej.Body)
	}
	logMsg := readUntil(t, alice, func(m NexusMessage) bool { return m.Type == "call_log" })
	if logMsg.Status != "missed" || logMsg.Sender != "alice" || logMsg.Recipient != "bob" {
		t.Fatalf("unexpected call_log: %+v", logMsg)
	}
}

func TestCalls_CallerCancelStopsCalleeRinging(t *testing.T) {
	_, alice, bob, _, _ := callSetup(t)

	alice.WriteJSON(NexusMessage{Type: "call_reject", Recipient: "bob"})
	got := readUntil(t, bob, func(m NexusMessage) bool { return m.Type == "call_reject" })
	if got.Sender != "alice" {
		t.Fatalf("cancel sender = %q, want alice", got.Sender)
	}
	readUntil(t, bob, func(m NexusMessage) bool { return m.Type == "call_log" && m.Status == "missed" })

	// And it can no longer be answered.
	bob.WriteJSON(NexusMessage{Type: "call_answer", Recipient: "alice"})
	if again := readUntil(t, bob, func(m NexusMessage) bool {
		return m.Type == "call_jitsi" || m.Type == "call_end"
	}); again.Type == "call_jitsi" {
		t.Fatalf("cancelled call was still answerable: %+v", again)
	}
}

func TestCalls_CallerDisconnectWhileRingingStopsRinging(t *testing.T) {
	_, alice, bob, _, _ := callSetup(t)
	alice.Close()
	got := readUntil(t, bob, func(m NexusMessage) bool { return m.Type == "call_end" })
	if got.Sender != "alice" {
		t.Fatalf("call_end sender = %q, want alice", got.Sender)
	}
	readUntil(t, bob, func(m NexusMessage) bool { return m.Type == "call_log" && m.Status == "missed" })
}

func TestCalls_CallInviteSenderIsAuthenticated(t *testing.T) {
	_, alice, bob, _, _ := callSetup(t)
	alice.WriteJSON(NexusMessage{Type: "call_invite", Sender: "mallory", Recipient: "bob", ChannelID: "room-1", Body: "junk"})
	inv := readUntil(t, bob, func(m NexusMessage) bool { return m.Type == "call_invite" })
	if inv.Sender != "alice" || inv.ChannelID != "room-1" || inv.Body != "" {
		t.Fatalf("unexpected call_invite relay: %+v", inv)
	}
}
