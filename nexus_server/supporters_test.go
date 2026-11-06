package main

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func bmcPost(t *testing.T, srv *NexusServer, body, sig string) int {
	t.Helper()
	req := httptest.NewRequest(http.MethodPost, "/api/v1/webhooks/buymeacoffee", strings.NewReader(body))
	if sig != "" {
		req.Header.Set("X-BMC-Signature", sig)
	}
	rec := httptest.NewRecorder()
	srv.bmcWebhookHandler(rec, req)
	return rec.Code
}

func isSupporter(t *testing.T, srv *NexusServer, user string) bool {
	t.Helper()
	var v int
	if err := srv.DB.QueryRow(`SELECT COALESCE(supporter,0) FROM users WHERE username=?`, user).Scan(&v); err != nil {
		t.Fatal(err)
	}
	return v == 1
}

// A forged payment (no secret configured, or no/bad signature) must not
// grant the supporter badge; a correctly signed one must.
func TestBMCWebhookRequiresSignature(t *testing.T) {
	srv, _, _ := newTestServer(t)
	registerAndVerify(t, srv, "alice", "correct-horse-1")
	var email string
	srv.DB.QueryRow(`SELECT email FROM users WHERE username='alice'`).Scan(&email)
	body := `{"type":"donation.created","data":{"supporter_name":"A","supporter_email":"` + email + `","amount":5}}`

	t.Setenv("BMC_WEBHOOK_SECRET", "")
	if code := bmcPost(t, srv, body, ""); code == http.StatusOK || isSupporter(t, srv, "alice") {
		t.Fatalf("unsigned webhook accepted without a secret configured (%d)", code)
	}

	t.Setenv("BMC_WEBHOOK_SECRET", "s3cret")
	if code := bmcPost(t, srv, body, ""); code != http.StatusUnauthorized || isSupporter(t, srv, "alice") {
		t.Fatalf("webhook without signature: %d", code)
	}
	if code := bmcPost(t, srv, body, "sha256=deadbeef"); code != http.StatusUnauthorized || isSupporter(t, srv, "alice") {
		t.Fatalf("webhook with bad signature: %d", code)
	}

	m := hmac.New(sha256.New, []byte("s3cret"))
	m.Write([]byte(body))
	if code := bmcPost(t, srv, body, hex.EncodeToString(m.Sum(nil))); code != http.StatusOK {
		t.Fatalf("signed webhook: %d", code)
	}
	if !isSupporter(t, srv, "alice") {
		t.Fatal("signed payment did not grant the badge")
	}
}

// The supporter request form ignores a typed username; only the signed-in
// account is recorded.
func TestSupportRequestIgnoresTypedUsername(t *testing.T) {
	srv, _, _ := newTestServer(t)
	req := httptest.NewRequest(http.MethodPost, "/api/v1/support/request",
		strings.NewReader(`{"username":"mallory","name":"M","email":"donor@example.com"}`))
	rec := httptest.NewRecorder()
	srv.supportRequestHandler(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("request: %d %s", rec.Code, rec.Body)
	}
	var u string
	srv.DB.QueryRow(`SELECT COALESCE(username,'') FROM supporter_requests ORDER BY id DESC LIMIT 1`).Scan(&u)
	if u != "" {
		t.Fatalf("typed username %q was stored", u)
	}
}
