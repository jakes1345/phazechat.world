package main

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/cookiejar"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

// New-device verification.
//
// Signing in from an unrecognised device creates a session that exists but
// grants nothing until it's approved — either in-app from a session that's
// already trusted, or with the code emailed to the account.
//
// The property that actually matters is the last one: a held session must not
// authenticate anything. A gate that issues a token and then forgets to check
// it is worse than no gate, because it looks like protection.

// withMailConfigured makes mailConfigured() report true.
//
// The held-sign-in path only engages when there is some way to reach the user;
// without this every test would take the deliberate fail-open branch and prove
// nothing. The host is unreachable on purpose — delivery failing is fine, the
// point is that a channel exists.
func withMailConfigured(t *testing.T) {
	t.Helper()
	t.Setenv("SMTP_HOST", "127.0.0.1")
	t.Setenv("SMTP_PORT", "2525")
	t.Setenv("SMTP_USER", "phaze-test")
	t.Setenv("SMTP_PASS", "phaze-test")
}

// loginRaw posts to /api/v1/auth/login and returns the response plus its
// decoded body, keeping cookies so the device/session cookies carry forward.
func loginRaw(t *testing.T, hs *httptest.Server, jar http.CookieJar, username, password, userAgent string) (*http.Response, map[string]any) {
	t.Helper()
	payload, _ := json.Marshal(map[string]string{"username": username, "password": password})
	req, err := http.NewRequest("POST", hs.URL+"/api/v1/auth/login", bytes.NewReader(payload))
	if err != nil {
		t.Fatalf("build login request: %v", err)
	}
	req.Header.Set("Content-Type", "application/json")
	if userAgent != "" {
		req.Header.Set("User-Agent", userAgent)
	}
	client := &http.Client{Jar: jar}
	res, err := client.Do(req)
	if err != nil {
		t.Fatalf("login: %v", err)
	}
	var out map[string]any
	json.NewDecoder(res.Body).Decode(&out)
	res.Body.Close()
	return res, out
}

func TestDeviceVerification_UnknownDeviceIsHeldPending(t *testing.T) {
	t.Setenv("PHAZE_DEVICE_VERIFICATION", "1")
	withMailConfigured(t)
	srv, hs, _ := newTestServer(t)
	registerAndVerify(t, srv, "alice", "password123")
	// Give the account an address so a challenge has somewhere to go;
	// otherwise the deliberate fail-open path kicks in.
	srv.DB.Exec(`UPDATE users SET email = 'alice@example.com' WHERE username = 'alice'`)

	jar := newJar(t)
	_, body := loginRaw(t, hs, jar, "alice", "password123", "Mozilla/5.0 (Windows NT 10.0) Chrome/120")

	if body["status"] != "device_verification_required" {
		t.Fatalf("expected the sign-in to be held for verification, got status=%v", body["status"])
	}
	if lbl, _ := body["device_label"].(string); !strings.Contains(lbl, "Chrome") {
		t.Errorf("expected a recognisable device label, got %q", lbl)
	}

	// The session row exists but must be flagged pending.
	var pending int
	if err := srv.DB.QueryRow(
		`SELECT pending_device FROM session_tokens WHERE username = 'alice' ORDER BY rowid DESC LIMIT 1`,
	).Scan(&pending); err != nil {
		t.Fatalf("read session: %v", err)
	}
	if pending != 1 {
		t.Fatal("session was not held pending — the new device got straight in")
	}
}

func TestDeviceVerification_PendingSessionAuthenticatesNothing(t *testing.T) {
	t.Setenv("PHAZE_DEVICE_VERIFICATION", "1")
	withMailConfigured(t)
	srv, _, _ := newTestServer(t)
	registerAndVerify(t, srv, "alice", "password123")

	tok, err := srv.issueSessionToken("alice", "test-device")
	if err != nil {
		t.Fatalf("issue token: %v", err)
	}
	if got := srv.sessionUsername(tok); got != "alice" {
		t.Fatalf("fresh token should authenticate, got %q", got)
	}

	if err := srv.markSessionPendingDevice(tok); err != nil {
		t.Fatalf("mark pending: %v", err)
	}

	// This is the assertion the whole feature rests on.
	if got := srv.sessionUsername(tok); got != "" {
		t.Fatalf("a session awaiting device approval authenticated as %q — "+
			"it must grant nothing until approved", got)
	}

	// ...but it's still findable, so it can be approved later.
	user, pending := srv.sessionState(tok)
	if user != "alice" || !pending {
		t.Fatalf("sessionState should still resolve the held session: user=%q pending=%v", user, pending)
	}
}

func TestDeviceVerification_ApprovalLiftsTheHoldAndRemembersTheDevice(t *testing.T) {
	t.Setenv("PHAZE_DEVICE_VERIFICATION", "1")
	withMailConfigured(t)
	srv, _, _ := newTestServer(t)
	registerAndVerify(t, srv, "alice", "password123")
	srv.DB.Exec(`UPDATE users SET email = 'alice@example.com' WHERE username = 'alice'`)

	tok, _ := srv.issueSessionToken("alice", "web")
	srv.markSessionPendingDevice(tok)
	id, _ := srv.createDeviceChallenge("alice", "dev-abc", tok, "Chrome on Windows", "203.0.113.7")
	if id == 0 {
		t.Fatal("challenge was not created")
	}

	if srv.sessionUsername(tok) != "" {
		t.Fatal("session should be inert before approval")
	}

	deviceID, sessionToken, label, ip, ok := srv.lookupDeviceChallenge(id, "alice")
	if !ok {
		t.Fatal("challenge not found")
	}
	srv.approveDeviceChallenge(id, "alice", deviceID, sessionToken, label, ip)

	if got := srv.sessionUsername(tok); got != "alice" {
		t.Fatalf("session should work after approval, got %q", got)
	}
	if !srv.isKnownDevice("alice", "dev-abc") {
		t.Error("device should be remembered so the next sign-in is silent")
	}
	// Second use of the same challenge must not work.
	if _, _, _, _, ok := srv.lookupDeviceChallenge(id, "alice"); ok {
		t.Error("a consumed challenge is still redeemable")
	}
}

func TestDeviceVerification_DenyRevokesTheSession(t *testing.T) {
	t.Setenv("PHAZE_DEVICE_VERIFICATION", "1")
	withMailConfigured(t)
	srv, _, _ := newTestServer(t)
	registerAndVerify(t, srv, "alice", "password123")
	srv.DB.Exec(`UPDATE users SET email = 'alice@example.com' WHERE username = 'alice'`)

	tok, _ := srv.issueSessionToken("alice", "web")
	srv.markSessionPendingDevice(tok)
	id, _ := srv.createDeviceChallenge("alice", "dev-bad", tok, "Firefox on Linux", "198.51.100.9")

	srv.denyDeviceChallenge(id, "alice", tok)

	if got := srv.sessionUsername(tok); got != "" {
		t.Fatalf("a denied sign-in still authenticates as %q", got)
	}
	user, pending := srv.sessionState(tok)
	if user != "" || pending {
		t.Errorf("denied session should be fully revoked, got user=%q pending=%v", user, pending)
	}
	if srv.isKnownDevice("alice", "dev-bad") {
		t.Error("a denied device must not be remembered")
	}
}

func TestDeviceVerification_WrongCodeIsRejectedAndCapped(t *testing.T) {
	t.Setenv("PHAZE_DEVICE_VERIFICATION", "1")
	withMailConfigured(t)
	srv, _, _ := newTestServer(t)
	registerAndVerify(t, srv, "alice", "password123")
	srv.DB.Exec(`UPDATE users SET email = 'alice@example.com' WHERE username = 'alice'`)

	tok, _ := srv.issueSessionToken("alice", "web")
	srv.markSessionPendingDevice(tok)
	srv.createDeviceChallenge("alice", "dev-xyz", tok, "Safari on macOS", "192.0.2.5")

	for i := 0; i < maxDeviceChallengeAttempts; i++ {
		if _, err := srv.verifyDeviceChallenge(tok, "000000"); err == nil {
			t.Fatal("a wrong code was accepted")
		}
	}
	// Past the cap, even the right code is refused — the sign-in has to
	// start over rather than allowing unlimited guessing.
	var real string
	srv.DB.QueryRow(`SELECT code FROM device_challenges WHERE session_token = ?`, tok).Scan(&real)
	if _, err := srv.verifyDeviceChallenge(tok, real); err != errTooManyAttempts {
		t.Fatalf("expected the challenge to be locked after %d wrong codes, got %v",
			maxDeviceChallengeAttempts, err)
	}
	if srv.sessionUsername(tok) != "" {
		t.Error("session should still be held after a burned challenge")
	}
}

func TestDeviceVerification_CorrectCodeCompletesSignIn(t *testing.T) {
	t.Setenv("PHAZE_DEVICE_VERIFICATION", "1")
	withMailConfigured(t)
	srv, _, _ := newTestServer(t)
	registerAndVerify(t, srv, "alice", "password123")
	srv.DB.Exec(`UPDATE users SET email = 'alice@example.com' WHERE username = 'alice'`)

	tok, _ := srv.issueSessionToken("alice", "web")
	srv.markSessionPendingDevice(tok)
	srv.createDeviceChallenge("alice", "dev-ok", tok, "Chrome on Windows", "192.0.2.1")

	var code string
	srv.DB.QueryRow(`SELECT code FROM device_challenges WHERE session_token = ?`, tok).Scan(&code)
	if len(code) != 6 {
		t.Fatalf("expected a 6-digit code, got %q", code)
	}

	if _, err := srv.verifyDeviceChallenge(tok, code); err != nil {
		t.Fatalf("correct code rejected: %v", err)
	}
	if got := srv.sessionUsername(tok); got != "alice" {
		t.Fatalf("session should be live after verification, got %q", got)
	}
}

func TestDeviceVerification_KnownDeviceSignsInSilently(t *testing.T) {
	t.Setenv("PHAZE_DEVICE_VERIFICATION", "1")
	withMailConfigured(t)
	srv, hs, _ := newTestServer(t)
	registerAndVerify(t, srv, "alice", "password123")
	srv.DB.Exec(`UPDATE users SET email = 'alice@example.com' WHERE username = 'alice'`)

	const ua = "Mozilla/5.0 (Windows NT 10.0) Chrome/120"
	jar := newJar(t)

	// First sign-in: held, and hands back the device cookie.
	_, first := loginRaw(t, hs, jar, "alice", "password123", ua)
	if first["status"] != "device_verification_required" {
		t.Fatalf("first sign-in should be held, got %v", first["status"])
	}

	// Approve it, which is what trusts the device.
	var tok, devID string
	srv.DB.QueryRow(`SELECT session_token, device_id FROM device_challenges WHERE username='alice' ORDER BY id DESC LIMIT 1`).Scan(&tok, &devID)
	var id int64
	srv.DB.QueryRow(`SELECT id FROM device_challenges WHERE session_token = ?`, tok).Scan(&id)
	srv.approveDeviceChallenge(id, "alice", devID, tok, "Chrome on Windows", "127.0.0.1")

	// Second sign-in from the same browser — the jar still holds the device
	// cookie, so this must go straight through.
	_, second := loginRaw(t, hs, jar, "alice", "password123", ua)
	if second["status"] != "ok" {
		t.Fatalf("a previously approved device should sign in silently, got %v — "+
			"being re-challenged every time would make this unusable", second["status"])
	}
}

func TestDeviceVerification_DisabledByEnvSkipsTheGate(t *testing.T) {
	t.Setenv("PHAZE_DEVICE_VERIFICATION", "0")
	srv, hs, _ := newTestServer(t)
	registerAndVerify(t, srv, "alice", "password123")
	srv.DB.Exec(`UPDATE users SET email = 'alice@example.com' WHERE username = 'alice'`)

	jar := newJar(t)
	_, body := loginRaw(t, hs, jar, "alice", "password123", "Mozilla/5.0 Chrome/120")
	if body["status"] != "ok" {
		t.Fatalf("with verification disabled the sign-in should complete, got %v", body["status"])
	}
}

func TestDeviceVerification_ExpiredChallengeIsRefused(t *testing.T) {
	t.Setenv("PHAZE_DEVICE_VERIFICATION", "1")
	withMailConfigured(t)
	srv, _, _ := newTestServer(t)
	registerAndVerify(t, srv, "alice", "password123")
	srv.DB.Exec(`UPDATE users SET email = 'alice@example.com' WHERE username = 'alice'`)

	tok, _ := srv.issueSessionToken("alice", "web")
	srv.markSessionPendingDevice(tok)
	srv.createDeviceChallenge("alice", "dev-old", tok, "Chrome on Windows", "192.0.2.1")

	var code string
	srv.DB.QueryRow(`SELECT code FROM device_challenges WHERE session_token = ?`, tok).Scan(&code)
	srv.DB.Exec(`UPDATE device_challenges SET expires_at = ? WHERE session_token = ?`,
		time.Now().Add(-time.Minute), tok)

	if _, err := srv.verifyDeviceChallenge(tok, code); err != errChallengeExpired {
		t.Fatalf("expected an expired challenge to be refused, got %v", err)
	}
	if srv.sessionUsername(tok) != "" {
		t.Error("session should stay held after an expired challenge")
	}
}

func TestDeviceLabel_ReadsLikeSomethingRecognisable(t *testing.T) {
	cases := []struct{ ua, want string }{
		{"Mozilla/5.0 (Windows NT 10.0; Win64) Chrome/120.0 Safari/537", "Chrome on Windows"},
		{"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) Safari/605", "Safari on macOS"},
		{"Mozilla/5.0 (X11; Linux x86_64) Firefox/121.0", "Firefox on Linux"},
		{"Mozilla/5.0 (Linux; Android 14) Chrome/120 Mobile", "Chrome on Android"},
		{"Mozilla/5.0 (Windows NT 10.0) Edg/120.0", "Edge on Windows"},
	}
	for _, c := range cases {
		if got := deviceLabel(c.ua, ""); got != c.want {
			t.Errorf("deviceLabel(%q) = %q, want %q", c.ua, got, c.want)
		}
	}
	if got := deviceLabel("", "Phaze Desktop"); got != "Phaze Desktop" {
		t.Errorf("with no UA the caller's own label should win, got %q", got)
	}
}

// newJar gives a test its own cookie jar, so the device cookie set at login
// carries into the next request the way a real browser would.
func newJar(t *testing.T) http.CookieJar {
	t.Helper()
	jar, err := cookiejar.New(nil)
	if err != nil {
		t.Fatalf("cookiejar: %v", err)
	}
	return jar
}

// The deliberate escape hatch: if there is genuinely no way to reach someone —
// no session open and no mail transport — holding the sign-in would lock them
// out of their own account forever. In that one case the sign-in is allowed,
// and the server says so loudly in the log.
//
// This is pinned by a test because it is a security-relevant decision, not an
// accident: anyone changing it should have to change this too.
func TestDeviceVerification_FailsOpenWhenTheUserIsUnreachable(t *testing.T) {
	t.Setenv("PHAZE_DEVICE_VERIFICATION", "1")
	// Deliberately NOT calling withMailConfigured: no transport at all.
	t.Setenv("SMTP_HOST", "")
	t.Setenv("SMTP_USER", "")
	t.Setenv("SMTP_PASS", "")
	t.Setenv("RESEND_API_KEY", "")
	t.Setenv("BREVO_API_KEY", "")

	srv, hs, _ := newTestServer(t)
	registerAndVerify(t, srv, "alice", "password123")
	srv.DB.Exec(`UPDATE users SET email = 'alice@example.com' WHERE username = 'alice'`)

	if srv.canDeliverChallenge("alice") {
		t.Fatal("with no transport and no session there should be no way to challenge")
	}

	jar := newJar(t)
	_, body := loginRaw(t, hs, jar, "alice", "password123", "Mozilla/5.0 Chrome/120")
	if body["status"] != "ok" {
		t.Fatalf("unreachable user should still be able to sign in, got %v — "+
			"otherwise enabling this feature locks out every self-hoster without mail",
			body["status"])
	}
}

// A user with a session already open is reachable even with no mail at all —
// they can approve in-app. That must still hold the new sign-in.
func TestDeviceVerification_OpenSessionCountsAsReachable(t *testing.T) {
	t.Setenv("PHAZE_DEVICE_VERIFICATION", "1")
	t.Setenv("SMTP_HOST", "")
	t.Setenv("SMTP_USER", "")
	t.Setenv("SMTP_PASS", "")
	t.Setenv("RESEND_API_KEY", "")
	t.Setenv("BREVO_API_KEY", "")

	srv, hs, wsBase := newTestServer(t)
	registerAndVerify(t, srv, "alice", "password123")

	// Alice is signed in on her phone.
	phone := dial(t, wsBase)
	defer phone.Close()
	auth(t, phone, "alice", "password123")

	if !srv.canDeliverChallenge("alice") {
		t.Fatal("an open session should be a valid approval channel")
	}

	jar := newJar(t)
	_, body := loginRaw(t, hs, jar, "alice", "password123", "Mozilla/5.0 Chrome/120")
	if body["status"] != "device_verification_required" {
		t.Fatalf("sign-in should be held so the open session can approve it, got %v", body["status"])
	}

	// And the open session is told about it.
	if _, ok := waitForMsg(phone, 3*time.Second, func(m NexusMessage) bool {
		return m.Type == "device_challenge" && m.ChallengeID != 0
	}); !ok {
		t.Error("the signed-in session was not prompted to approve the new device")
	}
}
