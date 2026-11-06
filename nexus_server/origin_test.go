package main

import (
	"net/http/httptest"
	"testing"
)

// With an origin allowlist set, the desktop app's webview origins still
// connect and other sites still don't.
func TestOriginAllowedDesktopWebview(t *testing.T) {
	prev := allowedOrigins
	allowedOrigins = map[string]bool{"https://phazechat.world": true}
	defer func() { allowedOrigins = prev }()
	for origin, want := range map[string]bool{
		"https://phazechat.world": true,
		"wails://wails":           true,
		"http://wails.localhost":  true,
		"https://evil.example":    false,
		"":                        true,
	} {
		r := httptest.NewRequest("GET", "/ws", nil)
		if origin != "" {
			r.Header.Set("Origin", origin)
		}
		if got := originAllowed(r); got != want {
			t.Errorf("origin %q: got %v want %v", origin, got, want)
		}
	}
}
