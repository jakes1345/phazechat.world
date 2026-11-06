package main

import "testing"

// The DM relay forwards only DM fields, with the authenticated sender.
func TestDM_ForwardsOnlyWhitelistedFields(t *testing.T) {
	srv, _, wsBase := newTestServer(t)
	registerAndVerify(t, srv, "alice", "password123")
	registerAndVerify(t, srv, "bob", "password123")
	a, b := dial(t, wsBase), dial(t, wsBase)
	auth(t, a, "alice", "password123")
	auth(t, b, "bob", "password123")

	a.WriteJSON(NexusMessage{
		Type: "msg", Sender: "mallory", Recipient: "bob", Body: "hi", MsgID: "m1",
		Status: "banned", Members: []string{"x"}, TurnConfig: &TurnConfig{URL: "turn:evil"},
		ConvoID: "c", Error: "fake",
	})
	got := readUntil(t, b, func(m NexusMessage) bool { return m.Type == "msg" })
	if got.Sender != "alice" || got.Body != "hi" || got.MsgID != "m1" || got.Recipient != "bob" {
		t.Fatalf("core DM fields wrong: %+v", got)
	}
	if got.Status != "" || got.Members != nil || got.TurnConfig != nil || got.ConvoID != "" || got.Error != "" {
		t.Fatalf("extra client fields were forwarded: %+v", got)
	}
}

// A DM to an account that doesn't exist is refused and leaves no trace.
func TestDM_NonexistentRecipientNotPersisted(t *testing.T) {
	srv, _, wsBase := newTestServer(t)
	registerAndVerify(t, srv, "alice", "password123")
	a := dial(t, wsBase)
	auth(t, a, "alice", "password123")

	a.WriteJSON(NexusMessage{Type: "msg", Recipient: "ghost", Body: "boo", MsgID: "g1"})
	st := readUntil(t, a, func(m NexusMessage) bool { return m.Type == "msg_status" })
	if st.Error == "" {
		t.Fatalf("expected an error for a nonexistent recipient, got %+v", st)
	}
	var n int
	srv.DB.QueryRow(`SELECT COUNT(*) FROM dm_messages WHERE recipient = 'ghost'`).Scan(&n)
	var q int
	srv.DB.QueryRow(`SELECT COUNT(*) FROM offline_messages WHERE recipient = 'ghost'`).Scan(&q)
	if n != 0 || q != 0 {
		t.Fatalf("message to nonexistent user stored: dm_messages=%d offline=%d", n, q)
	}
}

// Edit/delete need the original author; reactions need a participant; and
// none of them reach anyone outside the conversation.
func TestDM_EditDeleteReactRequireParticipant(t *testing.T) {
	srv, _, wsBase := newTestServer(t)
	for _, u := range []string{"alice", "bob", "mallory"} {
		registerAndVerify(t, srv, u, "password123")
	}
	a, b, m := dial(t, wsBase), dial(t, wsBase), dial(t, wsBase)
	auth(t, a, "alice", "password123")
	auth(t, b, "bob", "password123")
	auth(t, m, "mallory", "password123")

	a.WriteJSON(NexusMessage{Type: "msg", Recipient: "bob", Body: "original", MsgID: "ab-1"})
	readUntil(t, b, func(x NexusMessage) bool { return x.Type == "msg" && x.MsgID == "ab-1" })

	// Mallory isn't in the conversation.
	m.WriteJSON(NexusMessage{Type: "msg_edit", Recipient: "bob", MsgID: "ab-1", Body: "pwned"})
	m.WriteJSON(NexusMessage{Type: "msg_delete", Recipient: "bob", MsgID: "ab-1"})
	m.WriteJSON(NexusMessage{Type: "msg_react", Recipient: "bob", MsgID: "ab-1", Reaction: "x"})
	// Bob is a participant but not the author: can react, can't edit/delete.
	b.WriteJSON(NexusMessage{Type: "msg_edit", Recipient: "alice", MsgID: "ab-1", Body: "bob-edit"})
	b.WriteJSON(NexusMessage{Type: "msg_delete", Recipient: "alice", MsgID: "ab-1"})
	b.WriteJSON(NexusMessage{Type: "msg_react", Recipient: "alice", MsgID: "ab-1", Reaction: "👍", Body: "junk"})

	react := readUntilNot(t, a,
		func(x NexusMessage) bool { return x.Type == "msg_edit" || x.Type == "msg_delete" },
		func(x NexusMessage) bool { return x.Type == "msg_react" })
	if react.Sender != "bob" || react.Reaction != "👍" || react.Body != "" {
		t.Fatalf("unexpected react relay: %+v", react)
	}

	// Alice (the author) can edit.
	a.WriteJSON(NexusMessage{Type: "msg_edit", Recipient: "bob", MsgID: "ab-1", Body: "fixed"})
	edit := readUntilNot(t, b,
		func(x NexusMessage) bool {
			return (x.Type == "msg_edit" || x.Type == "msg_delete") && x.Sender != "alice"
		},
		func(x NexusMessage) bool { return x.Type == "msg_edit" })
	if edit.Body != "fixed" {
		t.Fatalf("author edit not relayed: %+v", edit)
	}

	var body string
	var deleted int
	srv.DB.QueryRow(`SELECT body, deleted FROM dm_messages WHERE msg_id = 'ab-1'`).Scan(&body, &deleted)
	if body != "fixed" || deleted != 0 {
		t.Fatalf("stored message = %q deleted=%d, want only alice's edit", body, deleted)
	}
	var reacts int
	srv.DB.QueryRow(`SELECT COUNT(*) FROM dm_reactions WHERE msg_id = 'ab-1' AND username = 'mallory'`).Scan(&reacts)
	if reacts != 0 {
		t.Fatal("outsider's reaction was stored")
	}
}
