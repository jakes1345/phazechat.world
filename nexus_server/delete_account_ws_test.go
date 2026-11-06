package main

import "testing"

// Deleting an account from one session must end every other session of it,
// not just drop the registry entry while those sockets keep acting as the
// deleted user.
func TestDeleteAccount_DropsEverySession(t *testing.T) {
	srv, _, wsBase := newTestServer(t)
	registerAndVerify(t, srv, "alice", "password123")

	tab1 := dial(t, wsBase)
	tab2 := dial(t, wsBase)
	auth(t, tab1, "alice", "password123")
	auth(t, tab2, "alice", "password123")

	tab1.WriteJSON(NexusMessage{Type: "delete_account", Body: "password123"})
	res := readUntil(t, tab1, func(m NexusMessage) bool { return m.Type == "delete_account_result" })
	if res.Status != "ok" {
		t.Fatalf("delete failed: %+v", res)
	}

	kicked := readUntil(t, tab2, func(m NexusMessage) bool { return m.Type == "kicked" })
	if kicked.Body == "" {
		t.Fatalf("kicked without a reason: %+v", kicked)
	}
	// The socket is closed: the next read fails rather than serving more.
	var m NexusMessage
	if err := tab2.ReadJSON(&m); err == nil {
		// One trailing frame is tolerable; a second means it's still live.
		if err := tab2.ReadJSON(&m); err == nil {
			t.Fatalf("other session still open after account deletion, got %+v", m)
		}
	}
	if srv.isOnline("alice") {
		t.Fatal("deleted account still has registered sessions")
	}
}
