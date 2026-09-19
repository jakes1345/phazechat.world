package main

import (
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"
	"time"

	"github.com/gorilla/websocket"
)

// Group management.
//
// Before this, a group chat was create-only for its entire lifetime — no
// add, no remove, no rename, in any client (see docs/skype-era-gaps.md §3).
// These tests pin the three capabilities that close that gap, and — since
// this is exactly the kind of authorization logic that's easy to get subtly
// backwards — spend more of their weight on who is NOT allowed to do
// something than on the happy path.

func friends(t *testing.T, srv *NexusServer, a, b string) {
	t.Helper()
	if _, err := srv.DB.Exec(`INSERT INTO friends (user_a, user_b, status) VALUES (?, ?, 'accepted')`, a, b); err != nil {
		t.Fatalf("seed friendship %s/%s: %v", a, b, err)
	}
}

// makeGroup registers alice/bob/carol/dave, friends alice with each of the
// other three (so she can create a group with all of them), and creates a
// group owned by alice containing alice+bob. carol and dave are registered
// and friended to alice but deliberately left OUT of the group, so tests
// can add them and assert on who could see it happen.
func makeGroup(t *testing.T, srv *NexusServer, wsBase string) (convoID string, alice, bob *websocket.Conn) {
	t.Helper()
	for _, u := range []string{"alice", "bob", "carol", "dave"} {
		registerAndVerify(t, srv, u, "password123")
	}
	friends(t, srv, "alice", "bob")
	friends(t, srv, "alice", "carol")
	friends(t, srv, "alice", "dave")

	a := dial(t, wsBase)
	b := dial(t, wsBase)
	auth(t, a, "alice", "password123")
	auth(t, b, "bob", "password123")
	time.Sleep(100 * time.Millisecond) // drain the post-auth burst

	if err := a.WriteJSON(NexusMessage{
		Type: "convo_create", ConvoName: "Test Group", Members: []string{"bob"},
	}); err != nil {
		t.Fatalf("convo_create: %v", err)
	}
	created := readUntil(t, a, func(m NexusMessage) bool { return m.Type == "convo_created" })
	readUntil(t, b, func(m NexusMessage) bool { return m.Type == "convo_created" }) // bob's copy
	return created.ConvoID, a, b
}

// dialWithCookies opens a WS connection carrying whatever cookies `jar` holds
// for hs.URL — the same thing a browser does on every reconnect after an
// HTTP login, letting the server's cookie pre-auth branch (as opposed to a
// client-sent "auth" message) authenticate the connection.
func dialWithCookies(t *testing.T, hs *httptest.Server, jar http.CookieJar, wsBase string) *websocket.Conn {
	t.Helper()
	header := http.Header{}
	for _, c := range jar.Cookies(mustParseURL(t, hs.URL)) {
		header.Add("Cookie", c.String())
	}
	c, _, err := websocket.DefaultDialer.Dial(wsBase+"/ws", header)
	if err != nil {
		t.Fatalf("dial with cookies: %v", err)
	}
	t.Cleanup(func() { c.Close() })
	c.SetReadDeadline(time.Now().Add(5 * time.Second))
	return c
}

func mustParseURL(t *testing.T, raw string) *url.URL {
	t.Helper()
	u, err := url.Parse(raw)
	if err != nil {
		t.Fatalf("parse url %q: %v", raw, err)
	}
	return u
}

// A user reconnecting after an HTTP login (a page reload, most commonly)
// authenticates via cookie, not a client-sent "auth" message — a separate
// code path in handleConnections that has to independently remember to send
// every burst a freshly-authed connection gets, convo_info included. It's
// exactly the kind of duplication that drifts: this pins that a group chat
// created in an earlier session is still there after the page reloads.
func TestGroupManagement_VisibleAfterCookieReauth(t *testing.T) {
	srv, hs, wsBase := newTestServer(t)
	registerAndVerify(t, srv, "alice", "password123")
	registerAndVerify(t, srv, "bob", "password123")
	friends(t, srv, "alice", "bob")

	jar := newJar(t)
	res, body := loginRaw(t, hs, jar, "alice", "password123", "")
	if res.StatusCode != 200 || body["status"] != "ok" {
		t.Fatalf("login failed: status=%d body=%v", res.StatusCode, body)
	}

	first := dialWithCookies(t, hs, jar, wsBase)
	readUntil(t, first, func(m NexusMessage) bool { return m.Type == "auth_result" })
	if err := first.WriteJSON(NexusMessage{
		Type: "convo_create", ConvoName: "Reload Test Group", Members: []string{"bob"},
	}); err != nil {
		t.Fatalf("convo_create: %v", err)
	}
	created := readUntil(t, first, func(m NexusMessage) bool { return m.Type == "convo_created" })
	first.Close()

	// Simulate the page reload: a brand new connection, same cookies, no
	// "auth" message sent at all.
	second := dialWithCookies(t, hs, jar, wsBase)
	readUntil(t, second, func(m NexusMessage) bool { return m.Type == "auth_result" })
	info := readUntil(t, second, func(m NexusMessage) bool {
		return m.Type == "convo_info" && m.ConvoID == created.ConvoID
	})
	if info.ConvoName != "Reload Test Group" {
		t.Fatalf("expected the group to survive a cookie-reauth reconnect, got %+v", info)
	}
}

func TestGroupManagement_AddMember(t *testing.T) {
	srv, _, wsBase := newTestServer(t)
	convoID, alice, bob := makeGroup(t, srv, wsBase)

	// carol is alice's friend but not bob's — added by alice, this must
	// still work, since eligibility is checked against the person doing the
	// adding, not against every existing member.
	if err := alice.WriteJSON(NexusMessage{
		Type: "convo_add_member", ConvoID: convoID, Members: []string{"carol"},
	}); err != nil {
		t.Fatalf("convo_add_member: %v", err)
	}

	// Everyone who ends up a member — including carol, who had no prior copy
	// of this conversation at all — gets the update. For carol this IS how
	// the group appears in her client; convo_updated has to be handled as an
	// upsert, not assumed to already exist.
	aliceUpdate := readUntil(t, alice, func(m NexusMessage) bool { return m.Type == "convo_updated" })
	bobUpdate := readUntil(t, bob, func(m NexusMessage) bool { return m.Type == "convo_updated" })
	if len(aliceUpdate.Members) != 3 || len(bobUpdate.Members) != 3 {
		t.Fatalf("expected 3 members after add, alice saw %v bob saw %v", aliceUpdate.Members, bobUpdate.Members)
	}

	// carol wasn't connected at the moment she was added, so the transient
	// convo_updated broadcast above never reached her — sendTo only reaches
	// an active connection. The real path for her is the same one every
	// conversation a user belongs to goes through on login: a convo_info
	// per conversation, built from conversation_members, which by now
	// includes her. Checking for convo_updated here would be testing the
	// wrong mechanism.
	carol := dial(t, wsBase)
	auth(t, carol, "carol", "password123")
	carolInfo := readUntil(t, carol, func(m NexusMessage) bool {
		return m.Type == "convo_info" && m.ConvoID == convoID
	})
	if len(carolInfo.Members) != 3 {
		t.Fatalf("carol's own view should list all 3 members, got %v", carolInfo.Members)
	}
}

func TestGroupManagement_AddMemberRejectsNonFriends(t *testing.T) {
	srv, _, wsBase := newTestServer(t)
	convoID, alice, _ := makeGroup(t, srv, wsBase)

	registerAndVerify(t, srv, "stranger", "password123")
	// Deliberately no friendship seeded between alice and stranger.

	if err := alice.WriteJSON(NexusMessage{
		Type: "convo_add_member", ConvoID: convoID, Members: []string{"stranger"},
	}); err != nil {
		t.Fatalf("convo_add_member: %v", err)
	}
	got := readUntil(t, alice, func(m NexusMessage) bool { return m.Type == "convo_error" || m.Type == "convo_updated" })
	if got.Type != "convo_error" {
		t.Fatalf("adding a non-friend should be rejected, got %+v", got)
	}
}

func TestGroupManagement_AddMemberRejectsNonMembers(t *testing.T) {
	srv, _, wsBase := newTestServer(t)
	convoID, _, _ := makeGroup(t, srv, wsBase)

	// carol is nobody's friend-of-the-group member yet, and more to the
	// point isn't IN the group — she must not be able to add people to a
	// conversation she doesn't belong to, even ones she's friends with.
	friends(t, srv, "carol", "dave")
	carol := dial(t, wsBase)
	auth(t, carol, "carol", "password123")

	if err := carol.WriteJSON(NexusMessage{
		Type: "convo_add_member", ConvoID: convoID, Members: []string{"dave"},
	}); err != nil {
		t.Fatalf("convo_add_member: %v", err)
	}
	got := readUntil(t, carol, func(m NexusMessage) bool { return m.Type == "convo_error" || m.Type == "convo_updated" })
	if got.Type != "convo_error" {
		t.Fatalf("a non-member adding someone should be rejected, got %+v", got)
	}
}

func TestGroupManagement_CreatorCanRemoveMember(t *testing.T) {
	srv, _, wsBase := newTestServer(t)
	convoID, alice, bob := makeGroup(t, srv, wsBase)

	if err := alice.WriteJSON(NexusMessage{
		Type: "convo_remove_member", ConvoID: convoID, Recipient: "bob",
	}); err != nil {
		t.Fatalf("convo_remove_member: %v", err)
	}

	// bob gets a distinct notice — he's no longer in the member list by the
	// time the broadcast to remaining members goes out, so he can't be
	// reached by that path at all.
	removed := readUntil(t, bob, func(m NexusMessage) bool { return m.Type == "convo_removed" })
	if removed.ConvoID != convoID {
		t.Fatalf("convo_removed carried wrong convo id: %q", removed.ConvoID)
	}
	aliceUpdate := readUntil(t, alice, func(m NexusMessage) bool { return m.Type == "convo_updated" })
	if len(aliceUpdate.Members) != 1 || aliceUpdate.Members[0] != "alice" {
		t.Fatalf("expected alice alone after removing bob, got %v", aliceUpdate.Members)
	}
}

func TestGroupManagement_OnlyCreatorCanRemoveMember(t *testing.T) {
	srv, _, wsBase := newTestServer(t)
	convoID, alice, bob := makeGroup(t, srv, wsBase)
	// Give bob someone else in the group he could try to kick.
	if err := alice.WriteJSON(NexusMessage{Type: "convo_add_member", ConvoID: convoID, Members: []string{"carol"}}); err != nil {
		t.Fatalf("convo_add_member: %v", err)
	}
	readUntil(t, alice, func(m NexusMessage) bool { return m.Type == "convo_updated" })
	readUntil(t, bob, func(m NexusMessage) bool { return m.Type == "convo_updated" })

	// bob is a member but not the creator — he must not be able to kick carol.
	if err := bob.WriteJSON(NexusMessage{
		Type: "convo_remove_member", ConvoID: convoID, Recipient: "carol",
	}); err != nil {
		t.Fatalf("convo_remove_member: %v", err)
	}
	got := readUntil(t, bob, func(m NexusMessage) bool { return m.Type == "convo_error" || m.Type == "convo_updated" })
	if got.Type != "convo_error" {
		t.Fatalf("a non-creator removing a member should be rejected, got %+v", got)
	}
}

func TestGroupManagement_RemoveMemberRejectsSelfRemoval(t *testing.T) {
	srv, _, wsBase := newTestServer(t)
	convoID, alice, _ := makeGroup(t, srv, wsBase)

	// The creator removing themselves via this path would be a confusing
	// way to spell "leave" — convo_leave already exists for that and
	// behaves differently (no restriction to creator-only). Must be
	// rejected outright, not silently do something.
	if err := alice.WriteJSON(NexusMessage{
		Type: "convo_remove_member", ConvoID: convoID, Recipient: "alice",
	}); err != nil {
		t.Fatalf("convo_remove_member: %v", err)
	}
	got := readUntil(t, alice, func(m NexusMessage) bool { return m.Type == "convo_error" || m.Type == "convo_updated" })
	if got.Type != "convo_error" {
		t.Fatalf("self-removal via convo_remove_member should be rejected, got %+v", got)
	}
}

func TestGroupManagement_CreatorCanRename(t *testing.T) {
	srv, _, wsBase := newTestServer(t)
	convoID, alice, bob := makeGroup(t, srv, wsBase)

	if err := alice.WriteJSON(NexusMessage{
		Type: "convo_rename", ConvoID: convoID, ConvoName: "Renamed Group",
	}); err != nil {
		t.Fatalf("convo_rename: %v", err)
	}
	aliceUpdate := readUntil(t, alice, func(m NexusMessage) bool { return m.Type == "convo_updated" })
	bobUpdate := readUntil(t, bob, func(m NexusMessage) bool { return m.Type == "convo_updated" })
	if aliceUpdate.ConvoName != "Renamed Group" || bobUpdate.ConvoName != "Renamed Group" {
		t.Fatalf("rename didn't propagate: alice saw %q bob saw %q", aliceUpdate.ConvoName, bobUpdate.ConvoName)
	}
}

func TestGroupManagement_OnlyCreatorCanRename(t *testing.T) {
	srv, _, wsBase := newTestServer(t)
	convoID, _, bob := makeGroup(t, srv, wsBase)

	if err := bob.WriteJSON(NexusMessage{
		Type: "convo_rename", ConvoID: convoID, ConvoName: "Bob's Takeover",
	}); err != nil {
		t.Fatalf("convo_rename: %v", err)
	}
	got := readUntil(t, bob, func(m NexusMessage) bool { return m.Type == "convo_error" || m.Type == "convo_updated" })
	if got.Type != "convo_error" {
		t.Fatalf("a non-creator renaming the group should be rejected, got %+v", got)
	}
}

func TestGroupManagement_RenameRejectsEmptyName(t *testing.T) {
	srv, _, wsBase := newTestServer(t)
	convoID, alice, _ := makeGroup(t, srv, wsBase)

	if err := alice.WriteJSON(NexusMessage{
		Type: "convo_rename", ConvoID: convoID, ConvoName: "   ",
	}); err != nil {
		t.Fatalf("convo_rename: %v", err)
	}
	got := readUntil(t, alice, func(m NexusMessage) bool { return m.Type == "convo_error" || m.Type == "convo_updated" })
	if got.Type != "convo_error" {
		t.Fatalf("renaming to a blank name should be rejected, got %+v", got)
	}
}
