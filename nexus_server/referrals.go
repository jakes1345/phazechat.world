package main

import (
	"log"
	"strconv"
)

// Referrals feed the reward crates in rewards.go. A referral counts once
// the invited account has verified its email — unverified signups can't
// log in and are purged after a day, so counting them would let anyone
// farm rewards with throwaway registrations.

// ambassadorAt is the one deterministic milestone on top of the random
// crates: this many verified friends earns a visible Ambassador badge.
// Keep in sync with AMBASSADOR_AT in web/src/referralRewards.ts.
const ambassadorAt = 10

func (s *NexusServer) verifiedReferralCount(username string) int {
	var n int
	s.DB.QueryRow("SELECT COUNT(*) FROM users WHERE referred_by = ? AND is_verified = 1", username).Scan(&n)
	return n
}

func (s *NexusServer) isAmbassador(username string) bool {
	return s.verifiedReferralCount(username) >= ambassadorAt
}

// sendReferralPerks tells a freshly authenticated client which rewards the
// user and each friend own, so reward emoticons, stickers and effects
// render correctly from the first message on.
func (s *NexusServer) sendReferralPerks(client *Client, username string, friends []string) {
	perks := map[string][]string{}
	for _, u := range append([]string{username}, friends...) {
		if items := s.openedItems(u); len(items) > 0 {
			perks[u] = items
		}
	}
	client.Send(NexusMessage{Type: "referral_perks", Perks: perks, Crates: s.unopenedCrates(username)})
}

// pushPerks refreshes `username`'s inventory on their friends' screens
// (and their own other sessions) after something changed.
func (s *NexusServer) pushPerks(username string) {
	msg := NexusMessage{Type: "referral_perks", Perks: map[string][]string{username: s.openedItems(username)}}
	s.sendTo(username, msg)
	for _, f := range s.getFriends(username) {
		s.sendTo(f, msg)
	}
}

// onReferralVerified runs after `username` verifies their email: the
// referrer is told live, and earns a crate if the anti-farming rules allow.
func (s *NexusServer) onReferralVerified(username string) {
	var ref string
	if s.DB.QueryRow("SELECT COALESCE(referred_by, '') FROM users WHERE username = ?", username).Scan(&ref) != nil || ref == "" {
		return
	}
	count := strconv.Itoa(s.verifiedReferralCount(ref))
	if s.syncCrates(ref) > 0 {
		log.Printf("[referral] %s earned a crate from %s", ref, username)
		s.sendTo(ref, NexusMessage{Type: "crate_earned", Sender: username, Token: count, Crates: s.unopenedCrates(ref)})
		return
	}
	s.sendTo(ref, NexusMessage{Type: "referral_joined", Sender: username, Token: count})
}
