package main

import (
	"testing"
	"time"
)

// A group message queued while a member is offline still carries its
// conversation ID when delivered at sign-in.
func TestOfflineGroupMessageKeepsConvoID(t *testing.T) {
	srv, _, wsBase := newTestServer(t)
	convoID, alice, bob := makeGroup(t, srv, wsBase)
	bob.Close()
	waitFor(t, func() bool { return len(srv.clientsOf("bob")) == 0 })

	if err := alice.WriteJSON(NexusMessage{Type: "convo_msg", ConvoID: convoID, Body: "while you were out"}); err != nil {
		t.Fatal(err)
	}
	waitFor(t, func() bool {
		var n int
		srv.DB.QueryRow(`SELECT COUNT(*) FROM offline_messages WHERE recipient='bob'`).Scan(&n)
		return n > 0
	})

	bob2 := dial(t, wsBase)
	auth(t, bob2, "bob", "password123")
	got := readUntil(t, bob2, func(m NexusMessage) bool {
		return m.Type == "convo_msg" && m.Body == "while you were out"
	})
	if got.ConvoID != convoID {
		t.Fatalf("offline group message lost its conversation: got %q want %q", got.ConvoID, convoID)
	}
}

func waitFor(t *testing.T, cond func() bool) {
	t.Helper()
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		if cond() {
			return
		}
		time.Sleep(20 * time.Millisecond)
	}
	t.Fatal("condition not met in time")
}
