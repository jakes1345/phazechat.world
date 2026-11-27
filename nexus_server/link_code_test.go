package main

import (
	"testing"
	"time"
)

// "Generate link code" on a signed-in device, then typing that code on a new
// device, signs the new device in as the same account, once.

func TestLinkCode_SignsInNewDeviceOnce(t *testing.T) {
	srv, _, wsBase := newTestServer(t)
	registerAndVerify(t, srv, "alice", "password123")

	phone := dial(t, wsBase)
	auth(t, phone, "alice", "password123")
	if err := phone.WriteJSON(NexusMessage{Type: "link_create"}); err != nil {
		t.Fatalf("link_create: %v", err)
	}
	created := readUntil(t, phone, func(m NexusMessage) bool { return m.Type == "link_result" })
	if created.Status != "ok" || created.Token == "" {
		t.Fatalf("no code: %+v", created)
	}

	// The phone polling its own code doesn't use it up.
	phone.WriteJSON(NexusMessage{Type: "link_check", Token: created.Token})
	if m := readUntil(t, phone, func(m NexusMessage) bool { return m.Type == "link_check" }); m.Status != "pending" {
		t.Fatalf("owner poll should stay pending: %+v", m)
	}

	laptop := dial(t, wsBase)
	laptop.WriteJSON(NexusMessage{Type: "link_check", Token: created.Token, DeviceInfo: "web/test"})
	got := readUntil(t, laptop, func(m NexusMessage) bool { return m.Type == "link_check" })
	if got.Status != "approved" || got.Sender != "alice" || got.QRToken == "" {
		t.Fatalf("new device not signed in: %+v", got)
	}
	if u := srv.sessionUsername(got.QRToken); u != "alice" {
		t.Fatalf("session not usable: %q", u)
	}
	// The phone hears that its code was used.
	if m := readUntil(t, phone, func(m NexusMessage) bool { return m.Type == "link_check" && m.Status == "approved" }); m.QRToken != "" {
		t.Fatalf("owner must not get the new session: %+v", m)
	}

	// Second use of the same code fails.
	other := dial(t, wsBase)
	other.WriteJSON(NexusMessage{Type: "link_check", Token: created.Token})
	again := readUntil(t, other, func(m NexusMessage) bool { return m.Type == "link_check" })
	if again.Status == "approved" || again.Error == "" {
		t.Fatalf("code worked twice: %+v", again)
	}
}

func TestLinkCode_ExpiredCodeIsRefused(t *testing.T) {
	srv, _, wsBase := newTestServer(t)
	registerAndVerify(t, srv, "alice", "password123")
	tok, err := srv.createOwnedLinkCode("alice")
	if err != nil {
		t.Fatal(err)
	}
	srv.DB.Exec("UPDATE qr_login_tokens SET expires_at = ? WHERE token = ?", time.Now().Add(-time.Minute), tok)

	c := dial(t, wsBase)
	c.WriteJSON(NexusMessage{Type: "link_check", Token: tok})
	m := readUntil(t, c, func(m NexusMessage) bool { return m.Type == "link_check" })
	if m.Status != "expired" || m.QRToken != "" {
		t.Fatalf("expired code accepted: %+v", m)
	}
}

// Someone else can't hijack an owned code through "Approve another device".
func TestLinkCode_OwnedCodeCannotBeApprovedByAnotherAccount(t *testing.T) {
	srv, _, _ := newTestServer(t)
	registerAndVerify(t, srv, "alice", "password123")
	registerAndVerify(t, srv, "bob", "password123")
	tok, err := srv.createOwnedLinkCode("alice")
	if err != nil {
		t.Fatal(err)
	}
	if err := srv.approveQRLogin(tok, "bob", "web/x"); err == nil {
		t.Fatal("bob approved alice's code")
	}
	u, _, res := srv.redeemLinkCode(tok, "", "web/y")
	if res != linkApproved || u != "alice" {
		t.Fatalf("code should still sign in as alice: %q %v", u, res)
	}
}

// The older flow still works: a signed-out device's code, approved from a
// signed-in one with link_approve.
func TestLinkCode_ApprovedFromSignedInDevice(t *testing.T) {
	srv, _, wsBase := newTestServer(t)
	registerAndVerify(t, srv, "alice", "password123")
	newDev := dial(t, wsBase)
	newDev.WriteJSON(NexusMessage{Type: "link_create"})
	created := readUntil(t, newDev, func(m NexusMessage) bool { return m.Type == "link_result" })

	phone := dial(t, wsBase)
	auth(t, phone, "alice", "password123")
	phone.WriteJSON(NexusMessage{Type: "link_approve", Token: created.Token, DeviceInfo: "web/new"})
	if m := readUntil(t, phone, func(m NexusMessage) bool { return m.Type == "link_result" }); m.Status != "approved" {
		t.Fatalf("approve failed: %+v", m)
	}
	newDev.WriteJSON(NexusMessage{Type: "link_check", Token: created.Token})
	got := readUntil(t, newDev, func(m NexusMessage) bool { return m.Type == "link_check" })
	if got.Status != "approved" || got.Sender != "alice" || got.QRToken == "" {
		t.Fatalf("not signed in: %+v", got)
	}
}
