package main

import (
	"bytes"
	"encoding/json"
	"log"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
)

// The export covers stored DMs and every other section without any query
// failing, never includes secrets, and works with the session cookie.
func TestExportIncludesStoredDataAndNoSecrets(t *testing.T) {
	srv, _, _ := newTestServer(t)
	registerAndVerify(t, srv, "alice", "password123")
	registerAndVerify(t, srv, "bob", "password123")
	srv.DB.Exec(`INSERT INTO dm_messages (sender, recipient, body, msg_id) VALUES ('alice','bob','E2EE:abcd','m1')`)

	var logs bytes.Buffer
	log.SetOutput(&logs)
	data := srv.exportUserData("alice")
	log.SetOutput(os.Stderr)
	if strings.Contains(logs.String(), "[export]") {
		t.Fatalf("export query failed: %s", logs.String())
	}
	if dms, _ := data["direct_messages"].([]map[string]any); len(dms) != 1 {
		t.Fatalf("direct messages missing from export: %v", data["direct_messages"])
	}
	if _, ok := data["profile"]; !ok {
		t.Fatal("profile missing")
	}
	blob, _ := json.Marshal(data)
	for _, secret := range []string{"password_hash", "totp_secret", "verification_code"} {
		if strings.Contains(string(blob), secret) {
			t.Fatalf("export leaks %s", secret)
		}
	}

	tok, err := srv.issueSessionToken("alice", "test")
	if err != nil {
		t.Fatal(err)
	}
	req := httptest.NewRequest(http.MethodGet, "/api/v1/export", nil)
	req.AddCookie(&http.Cookie{Name: sessionCookieName, Value: tok})
	rec := httptest.NewRecorder()
	srv.exportHandler(rec, req)
	if rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), "E2EE:abcd") {
		t.Fatalf("cookie export: %d", rec.Code)
	}
}
