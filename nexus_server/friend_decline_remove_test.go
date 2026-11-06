package main

import "testing"

func pendingRequest(t *testing.T, srv *NexusServer, from, to string) {
	t.Helper()
	if _, err := srv.DB.Exec(`INSERT INTO friends (user_a, user_b, status) VALUES (?, ?, 'pending')`, from, to); err != nil {
		t.Fatalf("seed request: %v", err)
	}
}

func friendRows(t *testing.T, srv *NexusServer, a, b string) int {
	t.Helper()
	var n int
	srv.DB.QueryRow(`SELECT COUNT(*) FROM friends WHERE (user_a=? AND user_b=?) OR (user_a=? AND user_b=?)`, a, b, b, a).Scan(&n)
	return n
}

func TestFriendReject_DeclinesAndTellsCaller(t *testing.T) {
	srv, _, wsBase := newTestServer(t)
	registerAndVerify(t, srv, "alice", "password123")
	registerAndVerify(t, srv, "bob", "password123")
	pendingRequest(t, srv, "alice", "bob")

	bob := dial(t, wsBase)
	auth(t, bob, "bob", "password123")
	if err := bob.WriteJSON(NexusMessage{Type: "friend_reject", Recipient: "alice"}); err != nil {
		t.Fatalf("send: %v", err)
	}
	got := readUntil(t, bob, func(m NexusMessage) bool { return m.Type == "friend_request_declined" })
	if got.Sender != "alice" {
		t.Fatalf("declined the wrong request: %+v", got)
	}
	if n := friendRows(t, srv, "alice", "bob"); n != 0 {
		t.Fatalf("request still stored (%d rows)", n)
	}
}

// Clients that predate this fix named the requester in Sender. That still
// works, but Sender set to the caller (what every client does on other
// messages) must not be read as the requester.
func TestFriendReject_LegacySenderField(t *testing.T) {
	srv, _, wsBase := newTestServer(t)
	registerAndVerify(t, srv, "alice", "password123")
	registerAndVerify(t, srv, "bob", "password123")
	pendingRequest(t, srv, "alice", "bob")

	bob := dial(t, wsBase)
	auth(t, bob, "bob", "password123")
	if err := bob.WriteJSON(NexusMessage{Type: "friend_reject", Sender: "alice"}); err != nil {
		t.Fatalf("send: %v", err)
	}
	readUntil(t, bob, func(m NexusMessage) bool { return m.Type == "friend_request_declined" })
	if n := friendRows(t, srv, "alice", "bob"); n != 0 {
		t.Fatalf("legacy decline didn't remove the request")
	}
}

// Declining must only ever remove a pending request, never a friendship.
func TestFriendReject_LeavesAcceptedFriendsAlone(t *testing.T) {
	srv, _, wsBase := newTestServer(t)
	registerAndVerify(t, srv, "alice", "password123")
	registerAndVerify(t, srv, "bob", "password123")
	friends(t, srv, "alice", "bob")

	bob := dial(t, wsBase)
	auth(t, bob, "bob", "password123")
	if err := bob.WriteJSON(NexusMessage{Type: "friend_reject", Recipient: "alice"}); err != nil {
		t.Fatalf("send: %v", err)
	}
	readUntil(t, bob, func(m NexusMessage) bool { return m.Type == "friend_request_declined" })
	if !srv.areFriends("alice", "bob") {
		t.Fatalf("decline removed an accepted friendship")
	}
}

func TestFriendRemove_BothSidesTold(t *testing.T) {
	srv, _, wsBase := newTestServer(t)
	registerAndVerify(t, srv, "alice", "password123")
	registerAndVerify(t, srv, "bob", "password123")
	friends(t, srv, "alice", "bob")

	alice := dial(t, wsBase)
	auth(t, alice, "alice", "password123")
	bob := dial(t, wsBase)
	auth(t, bob, "bob", "password123")

	if err := alice.WriteJSON(NexusMessage{Type: "friend_remove", Recipient: "bob"}); err != nil {
		t.Fatalf("send: %v", err)
	}
	mine := readUntil(t, alice, func(m NexusMessage) bool { return m.Type == "friend_removed" })
	if mine.Sender != "bob" {
		t.Fatalf("alice told about the wrong contact: %+v", mine)
	}
	theirs := readUntil(t, bob, func(m NexusMessage) bool { return m.Type == "friend_removed" })
	if theirs.Sender != "alice" {
		t.Fatalf("bob told about the wrong contact: %+v", theirs)
	}
	if srv.areFriends("alice", "bob") {
		t.Fatalf("still friends after remove")
	}
}
