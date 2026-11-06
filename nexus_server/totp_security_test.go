package main

import "testing"

// A session token alone must not be able to replace an enabled 2FA secret.
func TestTOTP_EnableRefusedWhileAlreadyEnabled(t *testing.T) {
	srv, _, wsBase := newTestServer(t)
	registerAndVerify(t, srv, "alice", "password123")
	if _, err := srv.DB.Exec(`UPDATE users SET totp_secret = 'ORIGINALSECRET', totp_enabled = 1 WHERE username = 'alice'`); err != nil {
		t.Fatal(err)
	}
	tok, _ := srv.issueSessionToken("alice", "test")

	c := dial(t, wsBase)
	c.WriteJSON(NexusMessage{Type: "session_auth", QRToken: tok})
	readUntil(t, c, func(m NexusMessage) bool { return m.Type == "auth_result" && m.Status == "ok" })

	c.WriteJSON(NexusMessage{Type: "enable_totp"})
	res := readUntil(t, c, func(m NexusMessage) bool { return m.Type == "totp_result" })
	if res.Error == "" || res.TOTPURI != "" {
		t.Fatalf("enable_totp over an enabled secret was accepted: %+v", res)
	}
	secret, enabled := srv.totpStatus("alice")
	if secret != "ORIGINALSECRET" || !enabled {
		t.Fatalf("2FA state changed: secret=%q enabled=%v", secret, enabled)
	}

	// With 2FA off, enrolment still works for current clients (no password).
	srv.disableTOTP("alice")
	c.WriteJSON(NexusMessage{Type: "enable_totp"})
	res = readUntil(t, c, func(m NexusMessage) bool { return m.Type == "totp_result" })
	if res.Status != "pending_confirm" || res.TOTPURI == "" {
		t.Fatalf("enrolment with 2FA off failed: %+v", res)
	}
}
