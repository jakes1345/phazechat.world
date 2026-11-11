package main

import (
	"errors"
	"regexp"
	"strings"
	"time"
)

// Voice rooms are small WebRTC meshes: every member connects directly to
// every other member, and the server only keeps the member list and relays
// signalling (voice_join / voice_peers / voice_signal). Each member uploads
// one stream per other member, so rooms are capped.
const maxVoicePeers = 8

// Ad-hoc group calls use rooms named "call_<random>". They have no Spaces
// channel behind them, so the server keeps its own guest list per room: the
// person who starts the call, plus the friends they invite with call_invite.
// Nobody else can join, even if they learn the room name.
var callRoomIDRe = regexp.MustCompile(`^call_[A-Za-z0-9_-]{1,48}$`)

// A guest list outlives an empty room for a while so an invite can still be
// answered after the caller's network blips; after that it's dropped.
const callRoomGuestTTL = 2 * time.Hour

type callRoomGuests struct {
	allowed map[string]struct{}
	touched time.Time
}

var (
	errVoiceRoomFull   = errors.New("this room is full")
	errNotInvited      = errors.New("you weren't invited to this call")
	errBadCallRoomName = errors.New("bad call room")
)

func isCallRoom(id string) bool { return strings.HasPrefix(id, "call_") }

// pruneCallRoomsLocked drops guest lists for rooms that have been empty past
// the TTL. Caller holds VoiceRoomsMu.
func (s *NexusServer) pruneCallRoomsLocked(now time.Time) {
	for id, g := range s.CallRoomGuests {
		if len(s.VoiceRooms[id]) == 0 && now.Sub(g.touched) > callRoomGuestTTL {
			delete(s.CallRoomGuests, id)
		}
	}
}

// callRoomInvite records that inviter asked invitee into an ad-hoc call room.
// The first invite for an unknown room makes the inviter its owner. Later
// invites only count from people already on the guest list.
func (s *NexusServer) callRoomInvite(roomID, inviter, invitee string) error {
	if !callRoomIDRe.MatchString(roomID) {
		return errBadCallRoomName
	}
	now := time.Now()
	s.VoiceRoomsMu.Lock()
	defer s.VoiceRoomsMu.Unlock()
	if s.CallRoomGuests == nil {
		s.CallRoomGuests = make(map[string]*callRoomGuests)
	}
	s.pruneCallRoomsLocked(now)
	g, ok := s.CallRoomGuests[roomID]
	if !ok {
		if len(s.VoiceRooms[roomID]) > 0 {
			// Members but no guest list can't happen through voiceRoomTryJoin;
			// refuse rather than let a stranger claim the room.
			return errNotInvited
		}
		g = &callRoomGuests{allowed: map[string]struct{}{inviter: {}}}
		s.CallRoomGuests[roomID] = g
	}
	if _, in := g.allowed[inviter]; !in {
		return errNotInvited
	}
	g.allowed[invitee] = struct{}{}
	g.touched = now
	return nil
}

// voiceRoomTryJoin adds username to a voice room if there's space and, for
// ad-hoc call rooms, if they're on the guest list (or are starting the room).
func (s *NexusServer) voiceRoomTryJoin(channelID, username string) error {
	adhoc := isCallRoom(channelID)
	if adhoc && !callRoomIDRe.MatchString(channelID) {
		return errBadCallRoomName
	}
	now := time.Now()
	s.VoiceRoomsMu.Lock()
	defer s.VoiceRoomsMu.Unlock()
	room := s.VoiceRooms[channelID]
	if _, already := room[username]; !already && len(room) >= maxVoicePeers {
		return errVoiceRoomFull
	}
	if adhoc {
		if s.CallRoomGuests == nil {
			s.CallRoomGuests = make(map[string]*callRoomGuests)
		}
		s.pruneCallRoomsLocked(now)
		g, ok := s.CallRoomGuests[channelID]
		switch {
		case !ok && len(room) == 0:
			g = &callRoomGuests{allowed: map[string]struct{}{username: {}}}
			s.CallRoomGuests[channelID] = g
		case !ok:
			return errNotInvited
		}
		if _, in := g.allowed[username]; !in {
			return errNotInvited
		}
		g.touched = now
	}
	if room == nil {
		room = make(map[string]struct{})
		s.VoiceRooms[channelID] = room
	}
	room[username] = struct{}{}
	return nil
}
