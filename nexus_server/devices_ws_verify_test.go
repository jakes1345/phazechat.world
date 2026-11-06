package main

import (
	"testing"

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
