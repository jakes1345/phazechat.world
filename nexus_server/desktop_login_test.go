package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// The desktop app's proxy gets the session token back from sign-in, because
// its WebSocket can't carry the cookie; browsers keep getting it only as an
// HttpOnly cookie.
func TestLoginReturnsTokenOnlyToDesktopProxy(t *testing.T) {
	t.Setenv("PHAZE_DEVICE_VERIFICATION", "0")
	srv, _, _ := newTestServer(t)
	registerAndVerify(t, srv, "dana", "password123")

	login := func(desktop bool) map[string]string {
		req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/login",
			strings.NewReader(`{"username":"dana","password":"password123","device_info":"test"}`))
		req.Header.Set("Content-Type", "application/json")
		if desktop {
			req.Header.Set(desktopProxyHeader, "1")
		}
		rec := httptest.NewRecorder()
		srv.httpLoginHandler(rec, req)
		if rec.Code != http.StatusOK {
			t.Fatalf("login: %d %s", rec.Code, rec.Body)
		}
		var out map[string]string
		json.NewDecoder(rec.Body).Decode(&out)
		return out
	}
	if tok := login(false)["token"]; tok != "" {
		t.Fatal("browser sign-in must not expose the token to JavaScript")
	}
	tok := login(true)["token"]
	if tok == "" || srv.sessionUsername(tok) != "dana" {
		t.Fatalf("desktop sign-in should return a working token, got %q", tok)
	}
}
