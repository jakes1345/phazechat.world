package main

import (
	"strings"
	"testing"
)

// Password re-confirmation on a live session (change_password,
// delete_account, disable_totp) is throttled per user, so a stolen session
// can't brute-force the password through these bcrypt paths.
func TestReauthPassword_ThrottledPerUser(t *testing.T) {
	srv, _, wsBase := newTestServer(t)
	const user = "throttled1"
	registerAndVerify(t, srv, user, "password123")
	t.Cleanup(func() { authTracker.recordReauthSuccess(user) })

	c := dial(t, wsBase)
	auth(t, c, user, "password123")

	for i := 0; i < reauthMaxFails; i++ {
		c.WriteJSON(NexusMessage{Type: "change_password", Body: "wrong" + string(rune('a'+i)) + ":newpassword1"})
		res := readUntil(t, c, func(m NexusMessage) bool { return m.Type == "change_password_result" })
		if res.Error != "Current password incorrect" {
			t.Fatalf("attempt %d: got %+v", i, res)
		}
	}

	// Now even the right password is refused, on every confirm path.
	c.WriteJSON(NexusMessage{Type: "change_password", Body: "password123:newpassword1"})
	res := readUntil(t, c, func(m NexusMessage) bool { return m.Type == "change_password_result" })
	if !strings.Contains(res.Error, "Too many") {
		t.Fatalf("change_password not throttled: %+v", res)
	}
	c.WriteJSON(NexusMessage{Type: "disable_totp", Body: "password123"})
	res = readUntil(t, c, func(m NexusMessage) bool { return m.Type == "totp_result" })
	if !strings.Contains(res.Error, "Too many") {
		t.Fatalf("disable_totp not throttled: %+v", res)
	}
	c.WriteJSON(NexusMessage{Type: "delete_account", Body: "password123"})
	res = readUntil(t, c, func(m NexusMessage) bool { return m.Type == "delete_account_result" })
	if !strings.Contains(res.Error, "Too many") {
		t.Fatalf("delete_account not throttled: %+v", res)
	}
	var n int
	srv.DB.QueryRow(`SELECT COUNT(*) FROM users WHERE username = ?`, user).Scan(&n)
	if n != 1 {
		t.Fatal("account deleted while throttled")
	}

	// Once the window resets, the right password works again.
	authTracker.recordReauthSuccess(user)
	c.WriteJSON(NexusMessage{Type: "change_password", Body: "password123:newpassword1"})
	res = readUntil(t, c, func(m NexusMessage) bool { return m.Type == "change_password_result" })
	if res.Status != "ok" {
		t.Fatalf("change_password after reset: %+v", res)
	}
}
