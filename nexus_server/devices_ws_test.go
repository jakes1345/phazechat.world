package main

import (
	"testing"

	"github.com/gorilla/websocket"
)

func noMailTransport(t *testing.T) {
	t.Helper()
	t.Setenv("SMTP_HOST", "")
	t.Setenv("SMTP_USER", "")
	t.Setenv("SMTP_PASS", "")
	t.Setenv("RESEND_API_KEY", "")
	t.Setenv("BREVO_API_KEY", "")
}

func wsAuthAs(t *testing.T, c *websocket.Conn, user, pw, deviceInfo, deviceID string) NexusMessage {
	t.Helper()
	if err := c.WriteJSON(NexusMessage{Type: "auth", Sender: user, Body: pw, DeviceInfo: deviceInfo, DeviceID: deviceID}); err != nil {
		t.Fatalf("send auth: %v", err)
	}
	return readUntil(t, c, func(m NexusMessage) bool { return m.Type == "auth_result" })
}

// The WebSocket auth path must apply the same new-device hold as HTTP login:
// a password sign-in from an unrecognised device is held, the open session
// is prompted, and approving it lets the device in on its next attempt.
func TestDeviceVerificationWS_NewDeviceIsHeldUntilApproved(t *testing.T) {
	t.Setenv("PHAZE_DEVICE_VERIFICATION", "1")
	noMailTransport(t)
	srv, _, wsBase := newTestServer(t)
	registerAndVerify(t, srv, "alice", "password123")

	// Alice's phone: first ever sign-in, nobody to ask, so it's let in and
	// remembered (the deliberate fail-open, same as HTTP).
	phone := dial(t, wsBase)
	if res := wsAuthAs(t, phone, "alice", "password123", "android/Pixel", ""); res.Status != "ok" {
		t.Fatalf("first sign-in should pass, got %+v", res)
	}

	// Someone else with the password, on another device.
	other := dial(t, wsBase)
	res := wsAuthAs(t, other, "alice", "password123", "android/Evil", "")
	if res.Status != "device_verification_required" || res.Error == "" || res.ChallengeID == 0 {
		t.Fatalf("new device was not held: %+v", res)
	}
	if res.QRToken != "" {
		t.Fatal("held sign-in must not hand out a session token")
	}
	if n := countConns(srv, "alice"); n != 1 {
		t.Fatalf("held socket was registered: alice has %d connections", n)
	}
	ch := readUntil(t, phone, func(m NexusMessage) bool { return m.Type == "device_challenge" })
	if ch.ChallengeID != res.ChallengeID {
		t.Fatalf("phone prompted for challenge %d, want %d", ch.ChallengeID, res.ChallengeID)
	}

	// Not approved yet: trying again is still held.
	if again := wsAuthAs(t, other, "alice", "password123", "android/Evil", ""); again.Status != "device_verification_required" {
		t.Fatalf("retry before approval got %+v", again)
	}

	phone.WriteJSON(NexusMessage{Type: "device_approve", ChallengeID: ch.ChallengeID})
	readUntil(t, phone, func(m NexusMessage) bool { return m.Type == "device_result" && m.Status == "approved" })

	if ok := wsAuthAs(t, other, "alice", "password123", "android/Evil", ""); ok.Status != "ok" {
		t.Fatalf("approved device should now sign in, got %+v", ok)
	}
}

// Derived device ids live in a reserved namespace a client can't claim, so
// knowing (or computing) the victim's derived id doesn't skip the check.
func TestDeviceVerificationWS_CannotClaimDerivedDeviceID(t *testing.T) {
	t.Setenv("PHAZE_DEVICE_VERIFICATION", "1")
	noMailTransport(t)
	srv, _, wsBase := newTestServer(t)
	registerAndVerify(t, srv, "alice", "password123")

	phone := dial(t, wsBase)
	wsAuthAs(t, phone, "alice", "password123", "android/Pixel", "")

	victimID := wsDeviceID("", "", "alice", "android/Pixel", "127.0.0.1")
	other := dial(t, wsBase)
	res := wsAuthAs(t, other, "alice", "password123", "android/Evil", victimID)
	if res.Status != "device_verification_required" {
		t.Fatalf("claiming the victim's derived device id bypassed the check: %+v", res)
	}
}

func TestDeviceVerificationWS_DisabledByEnv(t *testing.T) {
	t.Setenv("PHAZE_DEVICE_VERIFICATION", "0")
	noMailTransport(t)
	srv, _, wsBase := newTestServer(t)
	registerAndVerify(t, srv, "alice", "password123")
	phone := dial(t, wsBase)
	wsAuthAs(t, phone, "alice", "password123", "android/Pixel", "")
	other := dial(t, wsBase)
	if res := wsAuthAs(t, other, "alice", "password123", "android/Other", ""); res.Status != "ok" {
		t.Fatalf("with verification off a new device should sign in, got %+v", res)
	}
}

// Wrong codes are capped per user across challenges, not just per challenge.
func TestDeviceVerification_CodeGuessesCappedAcrossChallenges(t *testing.T) {
	srv, _, _ := newTestServer(t)
	const user = "capuser"
	registerAndVerify(t, srv, user, "password123")
	t.Cleanup(func() { authTracker.recordDeviceCodeSuccess(user) })

	newChallenge := func() (tok, code string) {
		tok, err := srv.issueSessionToken(user, "x")
		if err != nil {
			t.Fatal(err)
		}
		srv.markSessionPendingDevice(tok)
		id, _ := srv.createDeviceChallenge(user, "dev-"+tok[:8], tok, "label", "203.0.113.5")
		srv.DB.QueryRow(`SELECT code FROM device_challenges WHERE id = ?`, id).Scan(&code)
		return tok, code
	}
	wrong := func(code string) string {
		if code == "000000" {
			return "111111"
		}
		return "000000"
	}

	// Two guesses per challenge stays under the per-challenge cap, but the
	// per-user total runs out after deviceCodeMaxFails.
	for i := 0; i < deviceCodeMaxFails/2; i++ {
		tok, code := newChallenge()
		for j := 0; j < 2; j++ {
			if _, err := srv.verifyDeviceChallenge(tok, wrong(code)); err != errBadCode {
				t.Fatalf("guess %d/%d: got %v, want errBadCode", i, j, err)
			}
		}
	}
	tok, code := newChallenge()
	if _, err := srv.verifyDeviceChallenge(tok, code); err != errTooManyAttempts {
		t.Fatalf("after %d wrong codes across challenges the right one was accepted (err=%v)", deviceCodeMaxFails, err)
	}
}

// HTTP login must not clear per-user failure counters while the sign-in is
// still held for device approval.
func TestDeviceVerification_HeldLoginDoesNotResetFailures(t *testing.T) {
	t.Setenv("PHAZE_DEVICE_VERIFICATION", "1")
	withMailConfigured(t)
	srv, hs, _ := newTestServer(t)
	const user = "heldreset"
	registerAndVerify(t, srv, user, "password123")
	t.Cleanup(func() { authTracker.recordSuccess("198.51.100.77", user) })

	for i := 0; i < 3; i++ {
		authTracker.recordFail("198.51.100.77", user)
	}
	_, body := loginRaw(t, hs, newJar(t), user, "password123", "Mozilla/5.0 Chrome/120")
	if body["status"] != "device_verification_required" {
		t.Fatalf("expected held sign-in, got %v", body["status"])
	}
	authTracker.mu.Lock()
	f := authTracker.userFails[user]
	authTracker.mu.Unlock()
	if f == nil || f.count != 3 {
		t.Fatalf("held sign-in cleared the user's failure counter: %+v", f)
	}
}
