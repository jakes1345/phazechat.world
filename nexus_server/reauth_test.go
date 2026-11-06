package main

import (
	"testing"
	"time"
)

func countConns(srv *NexusServer, user string) int {
	srv.Mu.RLock()
	defer srv.Mu.RUnlock()
	return len(srv.Clients[user])
}

// Re-authenticating a socket as the same user must not register it twice.
func TestReauth_SameUserIsANoOp(t *testing.T) {
	srv, _, wsBase := newTestServer(t)
	registerAndVerify(t, srv, "alice", "password123")
	registerAndVerify(t, srv, "bob", "password123")
	tok, err := srv.issueSessionToken("alice", "test")
	if err != nil {
		t.Fatal(err)
	}

	c := dial(t, wsBase)
	auth(t, c, "alice", "password123")
	auth(t, c, "alice", "password123")
	c.WriteJSON(NexusMessage{Type: "session_auth", QRToken: tok})
	readUntil(t, c, func(m NexusMessage) bool { return m.Type == "auth_result" && m.Status == "ok" })

	if n := countConns(srv, "alice"); n != 1 {
		t.Fatalf("alice has %d registry entries for one socket, want 1", n)
	}

	// And a DM arrives exactly once: the sentinel follows the first copy.
	b := dial(t, wsBase)
	auth(t, b, "bob", "password123")
	b.WriteJSON(NexusMessage{Type: "msg", Recipient: "alice", Body: "one", MsgID: "m-one"})
	b.WriteJSON(NexusMessage{Type: "msg", Recipient: "alice", Body: "two", MsgID: "m-two"})
	readUntil(t, c, func(m NexusMessage) bool { return m.Type == "msg" && m.Body == "one" })
	next := readUntil(t, c, func(m NexusMessage) bool { return m.Type == "msg" })
	if next.Body != "two" {
		t.Fatalf("duplicate delivery: got %q after the first message", next.Body)
	}
}

// A socket re-authed as someone else must stop receiving the first user's
// traffic and stop counting toward their presence.
func TestReauth_DifferentUserDetachesTheOldOne(t *testing.T) {
	srv, _, wsBase := newTestServer(t)
	registerAndVerify(t, srv, "alice", "password123")
	registerAndVerify(t, srv, "bob", "password123")
	registerAndVerify(t, srv, "carol", "password123")

	c := dial(t, wsBase)
	auth(t, c, "alice", "password123")
	auth(t, c, "bob", "password123")

	if n := countConns(srv, "alice"); n != 0 {
		t.Fatalf("socket re-authed as bob is still registered as alice (%d entries)", n)
	}
	if srv.isOnline("alice") {
		t.Fatal("alice still shows online via a socket that is now bob's")
	}
	if n := countConns(srv, "bob"); n != 1 {
		t.Fatalf("bob has %d entries, want 1", n)
	}

	// carol messages alice, then bob: the socket must see only bob's.
	carol := dial(t, wsBase)
	auth(t, carol, "carol", "password123")
	carol.WriteJSON(NexusMessage{Type: "msg", Recipient: "alice", Body: "for-alice", MsgID: "m-a"})
	time.Sleep(50 * time.Millisecond)
	carol.WriteJSON(NexusMessage{Type: "msg", Recipient: "bob", Body: "for-bob", MsgID: "m-b"})
	readUntilNot(t, c,
		func(m NexusMessage) bool { return m.Type == "msg" && m.Body == "for-alice" },
		func(m NexusMessage) bool { return m.Type == "msg" && m.Body == "for-bob" })
}
