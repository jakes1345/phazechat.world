package main

import (
	"strings"
	"testing"
	"time"

	"github.com/gorilla/websocket"
)

// Group calls from a group chat ring every other member and nobody else.

func TestGroupCall_RingsOtherMembers(t *testing.T) {
	srv, _, wsBase := newTestServer(t)
	convoID, alice, bob := makeGroup(t, srv, wsBase)

	if err := alice.WriteJSON(NexusMessage{Type: "convo_call", ConvoID: convoID, Body: "video"}); err != nil {
		t.Fatalf("convo_call: %v", err)
	}
	started := readUntil(t, alice, func(m NexusMessage) bool { return m.Type == "convo_call_started" })
	if !strings.HasPrefix(started.ChannelID, "call_g") || started.ConvoID != convoID || started.Body != "video" {
		t.Fatalf("unexpected start ack: %+v", started)
	}
	invite := readUntil(t, bob, func(m NexusMessage) bool { return m.Type == "call_invite" })
	if invite.Sender != "alice" || invite.ChannelID != started.ChannelID || invite.ConvoID != convoID || invite.ConvoName != "Test Group" {
		t.Fatalf("bob got the wrong invite: %+v", invite)
	}
}

func TestGroupCall_OutsiderCannotRingGroup(t *testing.T) {
	srv, _, wsBase := newTestServer(t)
	convoID, _, bob := makeGroup(t, srv, wsBase)

	// carol is alice's friend but not in the group.
	carol := dial(t, wsBase)
	auth(t, carol, "carol", "password123")
	time.Sleep(100 * time.Millisecond)
	if err := carol.WriteJSON(NexusMessage{Type: "convo_call", ConvoID: convoID}); err != nil {
		t.Fatalf("convo_call: %v", err)
	}
	errMsg := readUntil(t, carol, func(m NexusMessage) bool { return m.Type == "convo_error" })
	if errMsg.ConvoID != convoID {
		t.Fatalf("unexpected error: %+v", errMsg)
	}
	assertNoMessage(t, bob, "call_invite")
}

// The call room only lets in the group's members.
func TestGroupCall_OnlyMembersCanJoinTheRoom(t *testing.T) {
	srv, _, wsBase := newTestServer(t)
	convoID, alice, bob := makeGroup(t, srv, wsBase)
	carol := dial(t, wsBase)
	auth(t, carol, "carol", "password123")
	time.Sleep(100 * time.Millisecond)

	if err := alice.WriteJSON(NexusMessage{Type: "convo_call", ConvoID: convoID, Body: "audio"}); err != nil {
		t.Fatalf("convo_call: %v", err)
	}
	started := readUntil(t, alice, func(m NexusMessage) bool { return m.Type == "convo_call_started" })
	room := started.ChannelID

	alice.WriteJSON(NexusMessage{Type: "voice_join", ChannelID: room})
	bob.WriteJSON(NexusMessage{Type: "voice_join", ChannelID: room})
	peers := readUntil(t, bob, func(m NexusMessage) bool { return m.Type == "voice_peers" && m.ChannelID == room })
	if peers.Error != "" {
		t.Fatalf("bob, a member, could not join: %s", peers.Error)
	}

	carol.WriteJSON(NexusMessage{Type: "voice_join", ChannelID: room})
	denied := readUntil(t, carol, func(m NexusMessage) bool { return m.Type == "voice_peers" && m.ChannelID == room })
	if denied.Error == "" {
		t.Fatalf("carol is not in the group but joined the call room")
	}
}

func assertNoMessage(t *testing.T, c *websocket.Conn, typ string) {
	t.Helper()
	c.SetReadDeadline(time.Now().Add(400 * time.Millisecond))
	defer c.SetReadDeadline(time.Now().Add(5 * time.Second))
	for {
		var m NexusMessage
		if err := c.ReadJSON(&m); err != nil {
			return
		}
		if m.Type == typ {
			t.Fatalf("did not expect %s, got %+v", typ, m)
		}
	}
}
