package main

import (
	"fmt"
	"sync"
	"testing"
	"time"
)

type pushRecorder struct {
	mu    sync.Mutex
	notes map[string][]pushNote
}

func recordPushes(t *testing.T) *pushRecorder {
	t.Helper()
	r := &pushRecorder{notes: map[string][]pushNote{}}
	h := func(to string, n pushNote) {
		r.mu.Lock()
		r.notes[to] = append(r.notes[to], n)
		r.mu.Unlock()
	}
	notifyHook.Store(&h)
	t.Cleanup(func() { notifyHook.Store(nil) })
	return r
}

func (r *pushRecorder) forUser(u string) []pushNote {
	r.mu.Lock()
	defer r.mu.Unlock()
	return append([]pushNote(nil), r.notes[u]...)
}

// waitFor polls briefly, since pushes happen after the reply is sent.
func (r *pushRecorder) waitFor(t *testing.T, u string, want int) []pushNote {
	t.Helper()
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		if got := r.forUser(u); len(got) >= want {
			return got
		}
		time.Sleep(20 * time.Millisecond)
	}
	return r.forUser(u)
}

func TestMentions(t *testing.T) {
	cases := []struct {
		body, user string
		want       bool
	}{
		{"hey @bob look", "bob", true},
		{"hey @BOB look", "bob", true},
		{"thanks @bob.", "bob", true},
		{"@bobby hi", "bob", false},
		{"bob@example.com", "example", false},
		{"no mention", "bob", false},
		{"@al", "al", false}, // usernames are at least 3 characters
	}
	for _, c := range cases {
		if got := mentions(c.body, c.user); got != c.want {
			t.Errorf("mentions(%q, %q) = %v, want %v", c.body, c.user, got, c.want)
		}
	}
}

func TestChannelPushFor(t *testing.T) {
	msg := NexusMessage{Type: "channel_msg_in", Sender: "alice", Body: "hello all"}
	if k, ok := channelPushFor("space1", msg, "bob"); !ok || k != pushKindChannel {
		t.Fatalf("plain message in a space should push, got %q %v", k, ok)
	}
	if _, ok := channelPushFor("space1", msg, "alice"); ok {
		t.Fatalf("the sender should never get a push")
	}
	if _, ok := channelPushFor(globalSpaceID, msg, "bob"); ok {
		t.Fatalf("plain Hub messages should not push")
	}
	at := msg
	at.Body = "@bob come look"
	if k, ok := channelPushFor(globalSpaceID, at, "bob"); !ok || k != pushKindMention {
		t.Fatalf("a mention in the Hub should push, got %q %v", k, ok)
	}
	for _, typ := range []string{"channel_react_in", "channel_edit_in", "channel_delete_in", "channel_pin_in", "wb_stroke", "wb_undo", "wb_clear", "server_channels_updated"} {
		m := msg
		m.Type = typ
		if _, ok := channelPushFor("space1", m, "bob"); ok {
			t.Errorf("%s should not push", typ)
		}
	}
}

func TestPushPreview(t *testing.T) {
	if got := pushPreview("E2EE:abc"); got != "New encrypted message" {
		t.Fatalf("encrypted body leaked: %q", got)
	}
	long := ""
	for i := 0; i < 150; i++ {
		long += "é"
	}
	got := []rune(pushPreview(long))
	if len(got) != 101 || got[100] != '…' {
		t.Fatalf("long preview not cut on a character boundary: %d runes", len(got))
	}
}

func TestFCMMessage_DataOnlyWithChatTarget(t *testing.T) {
	m := fcmMessage("tok", pushNote{Title: "alice", Body: "hi", Kind: pushKindDM, Sender: "alice"})
	if m.Notification != nil || (m.Android != nil && m.Android.Notification != nil) {
		t.Fatalf("message should be data-only so the app builds the notification")
	}
	if m.Data["sender"] != "alice" || m.Data["title"] != "alice" || m.Data["body"] != "hi" || m.Data["kind"] != "dm" {
		t.Fatalf("data missing fields: %v", m.Data)
	}
	if _, ok := m.Data["convo_id"]; ok {
		t.Fatalf("empty fields should be left out: %v", m.Data)
	}
	if m.Android == nil || m.Android.Priority != "high" {
		t.Fatalf("expected high priority")
	}
}

func TestRegisterFCMToken_SeveralDevicesAndMoves(t *testing.T) {
	srv, _, _ := newTestServer(t)
	registerAndVerify(t, srv, "alice", "password123")
	registerAndVerify(t, srv, "bob", "password123")

	for _, tok := range []string{"phone", "tablet", "phone"} {
		if err := srv.registerFCMToken("alice", tok); err != nil {
			t.Fatalf("register: %v", err)
		}
	}
	if got := srv.fcmTokensFor("alice"); len(got) != 2 {
		t.Fatalf("alice should have two devices, got %v", got)
	}
	// The tablet is signed in to bob now: it stops getting alice's pushes.
	if err := srv.registerFCMToken("bob", "tablet"); err != nil {
		t.Fatalf("register: %v", err)
	}
	if got := srv.fcmTokensFor("alice"); len(got) != 1 || got[0] != "phone" {
		t.Fatalf("alice should keep only the phone, got %v", got)
	}
	if got := srv.fcmTokensFor("bob"); len(got) != 1 || got[0] != "tablet" {
		t.Fatalf("bob should have the tablet, got %v", got)
	}
	for i := 0; i < maxFCMTokensPerUser+5; i++ {
		srv.registerFCMToken("bob", fmt.Sprintf("dev%d", i))
	}
	if got := srv.fcmTokensFor("bob"); len(got) != maxFCMTokensPerUser {
		t.Fatalf("expected the cap of %d devices, got %d", maxFCMTokensPerUser, len(got))
	}
}

// Tokens stored the old way, one per user, carry over on upgrade.
func TestFCMTokenMigration(t *testing.T) {
	srv, _, _ := newTestServer(t)
	registerAndVerify(t, srv, "alice", "password123")
	if _, err := srv.DB.Exec(`DELETE FROM fcm_tokens`); err != nil {
		t.Fatalf("clear: %v", err)
	}
	if _, err := srv.DB.Exec(`UPDATE users SET fcm_token = 'oldtok' WHERE username = 'alice'`); err != nil {
		t.Fatalf("seed: %v", err)
	}
	srv.initDB()
	if got := srv.fcmTokensFor("alice"); len(got) != 1 || got[0] != "oldtok" {
		t.Fatalf("old token not carried over: %v", got)
	}
}

func TestPush_FriendRequestToOfflineUser(t *testing.T) {
	rec := recordPushes(t)
	srv, _, wsBase := newTestServer(t)
	registerAndVerify(t, srv, "alice", "password123")
	registerAndVerify(t, srv, "bob", "password123")

	alice := dial(t, wsBase)
	auth(t, alice, "alice", "password123")
	if err := alice.WriteJSON(NexusMessage{Type: "friend_request", Recipient: "bob"}); err != nil {
		t.Fatalf("send: %v", err)
	}
	readUntil(t, alice, func(m NexusMessage) bool { return m.Type == "friend_request_sent" })
	got := rec.waitFor(t, "bob", 1)
	if len(got) != 1 || got[0].Kind != pushKindFriendRequest || got[0].Sender != "alice" {
		t.Fatalf("expected one friend request push to bob, got %+v", got)
	}
}

func TestPush_MissedCallWhenNobodyToRing(t *testing.T) {
	rec := recordPushes(t)
	srv, _, wsBase := newTestServer(t)
	registerAndVerify(t, srv, "alice", "password123")
	registerAndVerify(t, srv, "bob", "password123")
	friends(t, srv, "alice", "bob")

	alice := dial(t, wsBase)
	auth(t, alice, "alice", "password123")
	if err := alice.WriteJSON(NexusMessage{Type: "call_offer", Recipient: "bob", Body: "audio"}); err != nil {
		t.Fatalf("send: %v", err)
	}
	readUntil(t, alice, func(m NexusMessage) bool { return m.Type == "call_error" })
	got := rec.waitFor(t, "bob", 1)
	if len(got) != 1 || got[0].Kind != pushKindMissedCall || got[0].Sender != "alice" {
		t.Fatalf("expected a missed call push to bob, got %+v", got)
	}
}

func TestPush_ChannelOnlyRealMessagesToMembers(t *testing.T) {
	rec := recordPushes(t)
	srv, _, _ := newTestServer(t)
	registerAndVerify(t, srv, "alice", "password123")
	registerAndVerify(t, srv, "bob", "password123")
	registerAndVerify(t, srv, "carol", "password123")
	if _, err := srv.DB.Exec(`INSERT INTO servers (id, name, owner) VALUES ('sp1', 'Crew', 'alice')`); err != nil {
		t.Fatalf("seed space: %v", err)
	}
	for _, u := range []string{"alice", "bob"} {
		if _, err := srv.DB.Exec(`INSERT INTO server_members (server_id, username) VALUES ('sp1', ?)`, u); err != nil {
			t.Fatalf("seed member: %v", err)
		}
	}

	srv.broadcastChannelMsg("sp1", NexusMessage{Type: "channel_react_in", ServerID: "sp1", Sender: "alice", Body: "👍"})
	srv.broadcastChannelMsg("sp1", NexusMessage{Type: "channel_msg_in", ServerID: "sp1", Sender: "alice", Body: "hi crew"})

	got := rec.waitFor(t, "bob", 1)
	if len(got) != 1 || got[0].Kind != pushKindChannel || got[0].ServerID != "sp1" {
		t.Fatalf("bob should get exactly the one real message, got %+v", got)
	}
	if n := rec.forUser("carol"); len(n) != 0 {
		t.Fatalf("carol isn't a member and got %+v", n)
	}
	if n := rec.forUser("alice"); len(n) != 0 {
		t.Fatalf("the sender got her own push: %+v", n)
	}
}
