package main

import "testing"

// Signing out unregisters this device's push token, but only if it's still
// the one on file: a token registered since by another device stays.
func TestUnregisterFCMToken(t *testing.T) {
	srv, _, wsBase := newTestServer(t)
	registerAndVerify(t, srv, "alice", "password123")
	c := dial(t, wsBase)
	auth(t, c, "alice", "password123")

	stored := func() string {
		var tok string
		srv.DB.QueryRow(`SELECT COALESCE(fcm_token,'') FROM users WHERE username = ?`, "alice").Scan(&tok)
		return tok
	}
	// Each write is followed by a request with a reply, so the server has
	// handled it before we look at the database.
	sync := func() {
		c.WriteJSON(NexusMessage{Type: "list_sessions"})
		readUntil(t, c, func(m NexusMessage) bool { return m.Type == "sessions_list" })
	}

	c.WriteJSON(NexusMessage{Type: "register_fcm_token", Body: "token-new-phone"})
	sync()
	c.WriteJSON(NexusMessage{Type: "unregister_fcm_token", Body: "token-old-phone"})
	sync()
	if got := stored(); got != "token-new-phone" {
		t.Fatalf("unregistering another device's token cleared the current one: %q", got)
	}
	c.WriteJSON(NexusMessage{Type: "unregister_fcm_token", Body: "token-new-phone"})
	sync()
	if got := stored(); got != "" {
		t.Fatalf("token still registered after unregister: %q", got)
	}
}
