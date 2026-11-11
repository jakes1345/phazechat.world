package main

import (
	"fmt"
	"sort"
	"testing"
	"time"
)

func newVoiceTestServer() *NexusServer {
	return &NexusServer{VoiceRooms: make(map[string]map[string]struct{})}
}

func TestCallRoom_OnlyInvitedGuestsCanJoin(t *testing.T) {
	s := newVoiceTestServer()
	room := "call_abc123_x9"
	if err := s.callRoomInvite(room, "alice", "bob"); err != nil {
		t.Fatalf("first invite: %v", err)
	}
	if err := s.voiceRoomTryJoin(room, "alice"); err != nil {
		t.Fatalf("owner join: %v", err)
	}
	if err := s.voiceRoomTryJoin(room, "bob"); err != nil {
		t.Fatalf("guest join: %v", err)
	}
	if err := s.voiceRoomTryJoin(room, "mallory"); err != errNotInvited {
		t.Fatalf("stranger join = %v, want errNotInvited", err)
	}
	// A guest who is not on the list can't add people.
	if err := s.callRoomInvite(room, "mallory", "eve"); err != errNotInvited {
		t.Fatalf("stranger invite = %v, want errNotInvited", err)
	}
	// A guest who is on the list can.
	if err := s.callRoomInvite(room, "bob", "carol"); err != nil {
		t.Fatalf("guest invite: %v", err)
	}
	if err := s.voiceRoomTryJoin(room, "carol"); err != nil {
		t.Fatalf("second guest join: %v", err)
	}
	peers := s.voiceRoomPeers(room)
	sort.Strings(peers)
	if fmt.Sprint(peers) != "[alice bob carol]" {
		t.Fatalf("peers = %v", peers)
	}
}

func TestCallRoom_StarterWithoutInviteOwnsRoom(t *testing.T) {
	s := newVoiceTestServer()
	room := "call_solo"
	if err := s.voiceRoomTryJoin(room, "alice"); err != nil {
		t.Fatalf("starter join: %v", err)
	}
	if err := s.voiceRoomTryJoin(room, "bob"); err != errNotInvited {
		t.Fatalf("uninvited join = %v, want errNotInvited", err)
	}
	if err := s.callRoomInvite(room, "alice", "bob"); err != nil {
		t.Fatalf("invite: %v", err)
	}
	if err := s.voiceRoomTryJoin(room, "bob"); err != nil {
		t.Fatalf("invited join: %v", err)
	}
}

func TestCallRoom_RejectsBadNames(t *testing.T) {
	s := newVoiceTestServer()
	for _, id := range []string{"call_", "call_has space", "call_" + string(make([]byte, 60))} {
		if err := s.voiceRoomTryJoin(id, "alice"); err != errBadCallRoomName {
			t.Errorf("join %q = %v, want errBadCallRoomName", id, err)
		}
		if err := s.callRoomInvite(id, "alice", "bob"); err != errBadCallRoomName {
			t.Errorf("invite %q = %v, want errBadCallRoomName", id, err)
		}
	}
}

func TestVoiceRoom_Cap(t *testing.T) {
	s := newVoiceTestServer()
	for i := 0; i < maxVoicePeers; i++ {
		if err := s.voiceRoomTryJoin("chan-1", fmt.Sprintf("u%d", i)); err != nil {
			t.Fatalf("join %d: %v", i, err)
		}
	}
	if err := s.voiceRoomTryJoin("chan-1", "late"); err != errVoiceRoomFull {
		t.Fatalf("join past cap = %v, want errVoiceRoomFull", err)
	}
	// Someone already in the room re-joining (a second tab, a reconnect) is fine.
	if err := s.voiceRoomTryJoin("chan-1", "u0"); err != nil {
		t.Fatalf("rejoin: %v", err)
	}
	s.voiceRoomLeave("chan-1", "u3")
	if err := s.voiceRoomTryJoin("chan-1", "late"); err != nil {
		t.Fatalf("join after a leave: %v", err)
	}
}

func TestCallRoom_GuestListExpiresWhenEmpty(t *testing.T) {
	s := newVoiceTestServer()
	room := "call_old"
	if err := s.callRoomInvite(room, "alice", "bob"); err != nil {
		t.Fatal(err)
	}
	s.VoiceRoomsMu.Lock()
	s.CallRoomGuests[room].touched = time.Now().Add(-callRoomGuestTTL - time.Minute)
	s.VoiceRoomsMu.Unlock()
	// The old list is gone, so a new starter takes the name over.
	if err := s.voiceRoomTryJoin(room, "carol"); err != nil {
		t.Fatalf("join after expiry: %v", err)
	}
	if err := s.voiceRoomTryJoin(room, "bob"); err != errNotInvited {
		t.Fatalf("old guest join = %v, want errNotInvited", err)
	}
}
