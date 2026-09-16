package main

import "testing"

func TestValidStatus(t *testing.T) {
	// Skype Me and Not Available are real, sourced Skype statuses (see
	// docs/skype-eras/skype3.md and skype4.md) that only Skype 3's and
	// Skype 4's status pickers respectively offer — but the server has no
	// reliable way to know which era a given client is showing, so it
	// accepts both unconditionally rather than trying to re-derive that
	// era rule server-side. See presence.go's settableStatuses comment.
	for _, s := range []string{"Online", "Away", "Do Not Disturb", "Invisible", "Skype Me", "Not Available"} {
		if !validStatus(s) {
			t.Errorf("expected %q valid", s)
		}
	}
	for _, s := range []string{"", "Offline", "online", "hacker", "AWAY", "skype me", "not available"} {
		if validStatus(s) {
			t.Errorf("expected %q invalid", s)
		}
	}
}

func TestPublicStatus(t *testing.T) {
	if got := publicStatus("Invisible"); got != "Offline" {
		t.Errorf("Invisible must mask to Offline, got %q", got)
	}
	if got := publicStatus("Away"); got != "Away" {
		t.Errorf("Away should pass through, got %q", got)
	}
	if got := publicStatus(""); got != "Online" {
		t.Errorf("empty status defaults to Online, got %q", got)
	}
}
