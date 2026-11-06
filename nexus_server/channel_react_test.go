package main

import (
	"strconv"
	"testing"
)

// A reaction names a channel and a message id. Ids are global and sequential,
// so the server has to check the message is in that channel — otherwise a
// member of one space can react to (and get broadcast the reactions of) a
// message in a private space they're not in.
func TestChannelReact_MessageMustBelongToChannel(t *testing.T) {
	srv, _, wsBase := newTestServer(t)
	registerAndVerify(t, srv, "owner", "password123")
	registerAndVerify(t, srv, "mallory", "password123")

	exec := func(q string, args ...any) {
		t.Helper()
		if _, err := srv.DB.Exec(q, args...); err != nil {
			t.Fatalf("%s: %v", q, err)
		}
	}
	exec(`INSERT INTO servers (id, name, owner, visibility, invite_code) VALUES ('priv', 'Private', 'owner', 'private', 'inv1')`)
	exec(`INSERT INTO server_members (server_id, username, role) VALUES ('priv', 'owner', 'owner')`)
	exec(`INSERT INTO channels (id, server_id, name, kind, position) VALUES ('privchan', 'priv', 'general', 'text', 0)`)
	exec(`INSERT INTO servers (id, name, owner, visibility, invite_code) VALUES ('pub', 'Public', 'mallory', 'public', 'inv2')`)
	exec(`INSERT INTO server_members (server_id, username, role) VALUES ('pub', 'mallory', 'owner')`)
	exec(`INSERT INTO channels (id, server_id, name, kind, position) VALUES ('pubchan', 'pub', 'general', 'text', 0)`)
	res, err := srv.DB.Exec(`INSERT INTO channel_messages (channel_id, sender, body) VALUES ('privchan', 'owner', 'secret')`)
	if err != nil {
		t.Fatal(err)
	}
	privID, _ := res.LastInsertId()
	res, _ = srv.DB.Exec(`INSERT INTO channel_messages (channel_id, sender, body) VALUES ('pubchan', 'mallory', 'hello')`)
	pubID, _ := res.LastInsertId()

	m := dial(t, wsBase)
	auth(t, m, "mallory", "password123")

	// Cross-channel reaction: must be ignored.
	m.WriteJSON(NexusMessage{Type: "channel_react", ChannelID: "pubchan", MsgID: strconv.FormatInt(privID, 10), Reaction: "x"})
	// Legit reaction in her own channel, as a sentinel.
	m.WriteJSON(NexusMessage{Type: "channel_react", ChannelID: "pubchan", MsgID: strconv.FormatInt(pubID, 10), Reaction: "y"})
	got := readUntilNot(t, m,
		func(msg NexusMessage) bool {
			return msg.Type == "channel_react_in" && msg.MsgID == strconv.FormatInt(privID, 10)
		},
		func(msg NexusMessage) bool { return msg.Type == "channel_react_in" })
	if got.MsgID != strconv.FormatInt(pubID, 10) {
		t.Fatalf("unexpected reaction broadcast: %+v", got)
	}

	var n int
	srv.DB.QueryRow(`SELECT COUNT(*) FROM channel_reactions WHERE msg_id = ?`, privID).Scan(&n)
	if n != 0 {
		t.Fatalf("reaction stored on a message in another space (%d rows)", n)
	}
}
