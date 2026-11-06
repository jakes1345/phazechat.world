package main

import (
	"testing"
	"time"

	"github.com/gorilla/websocket"
)

// heldWSSignIn signs user in on a trusted "phone" socket, then starts a sign-in
// from a new device on a second socket and returns that held socket, the
// challenge id it was given and the code for it (forced to a known value).
func heldWSSignIn(t *testing.T, wsBase string, srv *NexusServer, user, code string) (*websocket.Conn, *websocket.Conn, int64) {
	t.Helper()
	t.Cleanup(func() {
		authTracker.recordSuccess("127.0.0.1", user)
		authTracker.recordDeviceCodeSuccess(user)
	})
	phone := dial(t, wsBase)
	if res := wsAuthAs(t, phone, user, "password123", "android/Pixel", ""); res.Status != "ok" {
		t.Fatalf("%s: first sign-in should pass, got %+v", user, res)
	}
	held := dial(t, wsBase)
	res := wsAuthAs(t, held, user, "password123", "android/NewPhone", "install-"+user+"-0123456789")
	if res.Status != "device_verification_required" || res.ChallengeID == 0 || res.QRToken != "" {
		t.Fatalf("%s: new device was not held: %+v", user, res)
	}
	if _, err := srv.DB.Exec(`UPDATE device_challenges SET code = ? WHERE id = ?`, code, res.ChallengeID); err != nil {
		t.Fatal(err)
	}
	return phone, held, res.ChallengeID
}

func deviceVerify(t *testing.T, c *websocket.Conn, m NexusMessage) NexusMessage {
	t.Helper()
	m.Type = "device_verify"
	if err := c.WriteJSON(m); err != nil {
		t.Fatalf("send device_verify: %v", err)
	}
	return readUntil(t, c, func(m NexusMessage) bool { return m.Type == "auth_result" })
}

func TestDeviceVerifyWS_WrongCodeRefused(t *testing.T) {
	t.Setenv("PHAZE_DEVICE_VERIFICATION", "1")
	noMailTransport(t)
	srv, _, wsBase := newTestServer(t)
	registerAndVerify(t, srv, "alice", "password123")
	_, held, chID := heldWSSignIn(t, wsBase, srv, "alice", "424242")

	res := deviceVerify(t, held, NexusMessage{Body: "111111", ChallengeID: chID})
	if res.Status != "device_verification_required" || res.Error == "" || res.QRToken != "" {
		t.Fatalf("wrong code was not refused: %+v", res)
	}
	if n := countConns(srv, "alice"); n != 1 {
		t.Fatalf("wrong code registered the socket: alice has %d connections", n)
	}
	// Still pending, so the right code works afterwards.
	if ok := deviceVerify(t, held, NexusMessage{Body: "424242"}); ok.Status != "ok" {
		t.Fatalf("right code after a wrong one: %+v", ok)
	}
}

func TestDeviceVerifyWS_CorrectCodeSignsIn(t *testing.T) {
	t.Setenv("PHAZE_DEVICE_VERIFICATION", "1")
	noMailTransport(t)
	srv, _, wsBase := newTestServer(t)
	registerAndVerify(t, srv, "alice", "password123")
	phone, held, chID := heldWSSignIn(t, wsBase, srv, "alice", "424242")

	res := deviceVerify(t, held, NexusMessage{Sender: "alice", Body: " 424242 ", ChallengeID: chID, DeviceID: "install-alice-0123456789"})
	if res.Status != "ok" || res.Sender != "alice" || res.QRToken == "" {
		t.Fatalf("correct code did not sign in: %+v", res)
	}
	if u := srv.sessionUsername(res.QRToken); u != "alice" {
		t.Fatalf("handed-out token is not a live session (got %q)", u)
	}
	if n := countConns(srv, "alice"); n != 2 {
		t.Fatalf("verified socket not registered: alice has %d connections", n)
	}
	// The trusted session's prompt is closed.
	readUntil(t, phone, func(m NexusMessage) bool {
		return m.Type == "device_result" && m.Status == "approved" && m.ChallengeID == chID
	})
	// The socket now works as a signed-in one.
	held.WriteJSON(NexusMessage{Type: "list_sessions"})
	readUntil(t, held, func(m NexusMessage) bool { return m.Type == "sessions_list" })
	// And the device is trusted: signing in again from it goes straight through.
	again := dial(t, wsBase)
	if r := wsAuthAs(t, again, "alice", "password123", "android/NewPhone", "install-alice-0123456789"); r.Status != "ok" {
		t.Fatalf("verified device should be remembered, got %+v", r)
	}
	// The code is spent.
	if r := deviceVerify(t, held, NexusMessage{Body: "424242"}); r.Status == "ok" {
		t.Fatalf("code was accepted twice: %+v", r)
	}
}

// The bot signs in unattended: it must never be held for a code it can't
// enter. Other accounts still are.
func TestDeviceVerificationWS_BotAccountExempt(t *testing.T) {
	t.Setenv("PHAZE_DEVICE_VERIFICATION", "1")
	t.Setenv("NOVA_USERNAME", "novabot")
	noMailTransport(t)
	srv, _, wsBase := newTestServer(t)
	registerAndVerify(t, srv, "novabot", "password123")
	registerAndVerify(t, srv, "alice", "password123")

	// An open session makes a challenge deliverable, so without the
	// exemption the second sign-in would be held.
	first := dial(t, wsBase)
	if r := wsAuthAs(t, first, "novabot", "password123", "", "nova-bot-novabot-0000"); r.Status != "ok" {
		t.Fatalf("first bot sign-in: %+v", r)
	}
	second := dial(t, wsBase)
	if r := wsAuthAs(t, second, "novabot", "password123", "", "some-other-install-id"); r.Status != "ok" || r.QRToken == "" {
		t.Fatalf("bot sign-in from a new device was held: %+v", r)
	}
	var challenges int
	srv.DB.QueryRow(`SELECT COUNT(*) FROM device_challenges WHERE username = ?`, "novabot").Scan(&challenges)
	if challenges != 0 {
		t.Fatalf("bot sign-in created %d device challenges", challenges)
	}

	phone := dial(t, wsBase)
	wsAuthAs(t, phone, "alice", "password123", "android/Pixel", "")
	other := dial(t, wsBase)
	if r := wsAuthAs(t, other, "alice", "password123", "android/Evil", ""); r.Status != "device_verification_required" {
		t.Fatalf("exemption leaked to another account: %+v", r)
	}
}

// The session minted for a held sign-in is never sent anywhere. If the
// waiting socket goes away, it must not become a live session when the
// challenge is approved from another device.
func TestDeviceVerifyWS_OrphanHeldTokenRevoked(t *testing.T) {
	t.Setenv("PHAZE_DEVICE_VERIFICATION", "1")
	noMailTransport(t)
	srv, _, wsBase := newTestServer(t)
	registerAndVerify(t, srv, "alice", "password123")
	phone, held, chID := heldWSSignIn(t, wsBase, srv, "alice", "424242")

	var tok string
	srv.DB.QueryRow(`SELECT session_token FROM device_challenges WHERE id = ?`, chID).Scan(&tok)
	if tok == "" {
		t.Fatal("no held session token recorded")
	}
	held.Close()
	deadline := time.Now().Add(5 * time.Second)
	for {
		if u, _ := srv.sessionState(tok); u == "" {
			break
		}
		if time.Now().After(deadline) {
			t.Fatal("held session token not revoked after its socket closed")
		}
		time.Sleep(20 * time.Millisecond)
	}
	phone.WriteJSON(NexusMessage{Type: "device_approve", ChallengeID: chID})
	readUntil(t, phone, func(m NexusMessage) bool { return m.Type == "device_result" && m.Status == "approved" })
	if u := srv.sessionUsername(tok); u != "" {
		t.Fatalf("approving the challenge revived the orphaned token for %q", u)
	}
	// The approval still trusts the device, so signing in again from it works.
	again := dial(t, wsBase)
	if r := wsAuthAs(t, again, "alice", "password123", "android/NewPhone", "install-alice-0123456789"); r.Status != "ok" {
		t.Fatalf("approved device should sign in, got %+v", r)
	}
}

// A retry on the same socket replaces the held sign-in; the first one's
// token goes with it.
func TestDeviceVerifyWS_RetryRevokesPreviousHeldToken(t *testing.T) {
	t.Setenv("PHAZE_DEVICE_VERIFICATION", "1")
	noMailTransport(t)
	srv, _, wsBase := newTestServer(t)
	registerAndVerify(t, srv, "alice", "password123")
	_, held, chID := heldWSSignIn(t, wsBase, srv, "alice", "424242")
	var first string
	srv.DB.QueryRow(`SELECT session_token FROM device_challenges WHERE id = ?`, chID).Scan(&first)

	if r := wsAuthAs(t, held, "alice", "password123", "android/NewPhone", "install-alice-0123456789"); r.Status != "device_verification_required" {
		t.Fatalf("retry: %+v", r)
	}
	if u, _ := srv.sessionState(first); u != "" {
		t.Fatal("first held token still valid after the retry replaced it")
	}
}

// Approved in-app while the new device waits: it can finish without a code.
func TestDeviceVerifyWS_ApprovedElsewhereCompletes(t *testing.T) {
	t.Setenv("PHAZE_DEVICE_VERIFICATION", "1")
	noMailTransport(t)
	srv, _, wsBase := newTestServer(t)
	registerAndVerify(t, srv, "alice", "password123")
	phone, held, chID := heldWSSignIn(t, wsBase, srv, "alice", "424242")

	if r := deviceVerify(t, held, NexusMessage{}); r.Status != "device_verification_required" {
		t.Fatalf("empty code before approval: %+v", r)
	}
	phone.WriteJSON(NexusMessage{Type: "device_approve", ChallengeID: chID})
	readUntil(t, phone, func(m NexusMessage) bool { return m.Type == "device_result" && m.Status == "approved" })
	if r := deviceVerify(t, held, NexusMessage{}); r.Status != "ok" || r.QRToken == "" {
		t.Fatalf("approved sign-in did not complete: %+v", r)
	}
}

func TestDeviceVerifyWS_OtherUsersCodeRejected(t *testing.T) {
	t.Setenv("PHAZE_DEVICE_VERIFICATION", "1")
	noMailTransport(t)
	srv, _, wsBase := newTestServer(t)
	registerAndVerify(t, srv, "alice", "password123")
	registerAndVerify(t, srv, "bob", "password123")
	_, aliceHeld, aliceCh := heldWSSignIn(t, wsBase, srv, "alice", "111222")
	_, _, bobCh := heldWSSignIn(t, wsBase, srv, "bob", "333444")

	// Bob's code on Alice's held socket.
	if r := deviceVerify(t, aliceHeld, NexusMessage{Body: "333444"}); r.Status == "ok" {
		t.Fatalf("another user's code signed alice in: %+v", r)
	}
	// Naming Bob's challenge or Bob himself doesn't help either.
	if r := deviceVerify(t, aliceHeld, NexusMessage{Body: "333444", ChallengeID: bobCh}); r.Status == "ok" {
		t.Fatalf("another user's challenge id was usable: %+v", r)
	}
	if r := deviceVerify(t, aliceHeld, NexusMessage{Sender: "bob", Body: "333444"}); r.Status == "ok" {
		t.Fatalf("switching the username was usable: %+v", r)
	}
	// A socket with no held sign-in can't use a code at all.
	stranger := dial(t, wsBase)
	if r := deviceVerify(t, stranger, NexusMessage{Sender: "bob", Body: "333444", ChallengeID: bobCh}); r.Status == "ok" {
		t.Fatalf("code worked on a socket that never signed in: %+v", r)
	}
	if n := countConns(srv, "bob"); n != 1 {
		t.Fatalf("bob gained a connection: %d", n)
	}
	if n := countConns(srv, "alice"); n != 1 {
		t.Fatalf("alice gained a connection: %d", n)
	}
	// Bob's challenge is untouched and Alice's own code still works.
	var bobAttempts int
	srv.DB.QueryRow(`SELECT attempts FROM device_challenges WHERE id = ?`, bobCh).Scan(&bobAttempts)
	if bobAttempts != 0 {
		t.Fatalf("bob's challenge was charged %d attempts by alice's socket", bobAttempts)
	}
	if r := deviceVerify(t, aliceHeld, NexusMessage{Body: "111222", ChallengeID: aliceCh}); r.Status != "ok" || r.Sender != "alice" {
		t.Fatalf("alice's own code: %+v", r)
	}
}
