package main

import (
	"testing"
	"time"

	"github.com/gorilla/websocket"
)

// A user may be signed in from several places at once — a couple of browser
// tabs, the desktop app, their phone.
//
// The server used to keep exactly one connection per account and force-close
// the previous one on every new connect, sending it "kicked". The web client
// treats "kicked" as a full sign-out, so opening a second tab dumped the first
// back to the login screen. With three tabs open they kicked each other in a
// loop and the app was unusable.
//
// These tests pin the corrected behaviour.

// waitForMsg reads until a matching message arrives or the deadline passes.
// Returns false on timeout rather than failing, so callers can assert that
// something specifically did NOT arrive.
func waitForMsg(c *websocket.Conn, d time.Duration, want func(NexusMessage) bool) (NexusMessage, bool) {
	deadline := time.Now().Add(d)
	for {
		remaining := time.Until(deadline)
		if remaining <= 0 {
			return NexusMessage{}, false
		}
		c.SetReadDeadline(time.Now().Add(remaining))
		var m NexusMessage
		if err := c.ReadJSON(&m); err != nil {
			return NexusMessage{}, false
		}
		if want(m) {
			return m, true
		}
	}
}

func TestMultiSession_SecondConnectionDoesNotKickTheFirst(t *testing.T) {
	srv, _, wsBase := newTestServer(t)
	registerAndVerify(t, srv, "alice", "password123")

	first := dial(t, wsBase)
	defer first.Close()
	auth(t, first, "alice", "password123")

	// A second sign-in from the same account — the second tab.
	second := dial(t, wsBase)
	defer second.Close()
	auth(t, second, "alice", "password123")

	// The first connection must NOT be told it was kicked.
	if m, got := waitForMsg(first, 1500*time.Millisecond, func(m NexusMessage) bool {
		return m.Type == "kicked"
	}); got {
		t.Fatalf("first session was kicked when a second signed in (body=%q) — "+
			"this is the bug that logged people out when they opened a second tab", m.Body)
	}

	srv.Mu.RLock()
	n := len(srv.Clients["alice"])
	srv.Mu.RUnlock()
	if n != 2 {
		t.Fatalf("expected 2 live connections for alice, got %d", n)
	}
}

func TestMultiSession_BothConnectionsReceiveMessages(t *testing.T) {
	srv, _, wsBase := newTestServer(t)
	registerAndVerify(t, srv, "alice", "password123")
	registerAndVerify(t, srv, "bob", "password123")
	if _, err := srv.DB.Exec(`INSERT INTO friends (user_a, user_b, status) VALUES ('alice', 'bob', 'accepted')`); err != nil {
		t.Fatalf("seed friendship: %v", err)
	}

	tabA := dial(t, wsBase)
	defer tabA.Close()
	auth(t, tabA, "alice", "password123")

	tabB := dial(t, wsBase)
	defer tabB.Close()
	auth(t, tabB, "alice", "password123")

	bob := dial(t, wsBase)
	defer bob.Close()
	auth(t, bob, "bob", "password123")

	if err := bob.WriteJSON(NexusMessage{
		Type: "msg", Recipient: "alice", Body: "hello from bob", MsgID: "m1",
	}); err != nil {
		t.Fatalf("bob send: %v", err)
	}

	// Both of alice's sessions should see it. Delivering to only the newest
	// would leave her other tabs silently missing messages.
	isMsg := func(m NexusMessage) bool { return m.Type == "msg" && m.Body == "hello from bob" }
	if _, ok := waitForMsg(tabA, 3*time.Second, isMsg); !ok {
		t.Error("first session did not receive the message")
	}
	if _, ok := waitForMsg(tabB, 3*time.Second, isMsg); !ok {
		t.Error("second session did not receive the message")
	}
}

func TestMultiSession_ClosingOneTabKeepsUserOnline(t *testing.T) {
	srv, _, wsBase := newTestServer(t)
	registerAndVerify(t, srv, "alice", "password123")

	tabA := dial(t, wsBase)
	auth(t, tabA, "alice", "password123")

	tabB := dial(t, wsBase)
	defer tabB.Close()
	auth(t, tabB, "alice", "password123")

	// Close one tab. The user is still present via the other.
	tabA.Close()

	deadline := time.Now().Add(3 * time.Second)
	for {
		srv.Mu.RLock()
		n := len(srv.Clients["alice"])
		srv.Mu.RUnlock()
		if n == 1 {
			break
		}
		if time.Now().After(deadline) {
			t.Fatalf("expected 1 remaining connection after closing one tab, got %d", n)
		}
		time.Sleep(50 * time.Millisecond)
	}

	if !srv.isOnline("alice") {
		t.Error("user reported offline while still connected from another session")
	}
}
