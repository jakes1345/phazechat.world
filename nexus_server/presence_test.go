package main

import "testing"

func TestValidStatus(t *testing.T) {
	for _, s := range []string{"Online", "Away", "Do Not Disturb", "Invisible"} {
		if !validStatus(s) {
			t.Errorf("expected %q valid", s)
		}
	}
	for _, s := range []string{"", "Offline", "online", "hacker", "AWAY"} {
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
