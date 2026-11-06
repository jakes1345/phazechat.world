package main

import (
	"testing"

	"github.com/gorilla/websocket"
)

// remoteSetup signs in host, viewer and mallory on a server with the remote
// code map initialised (newTestServer leaves it nil), and has host register
// code 123456.
func remoteSetup(t *testing.T) (srv *NexusServer, host, viewer, mallory *websocket.Conn) {
	t.Helper()
	srv, _, wsBase := newTestServer(t)
	srv.RemoteCodes = map[string]remoteCodeEntry{}
	for _, u := range []string{"host", "viewer", "mallory"} {
		registerAndVerify(t, srv, u, "password123")
	}
	host, viewer, mallory = dial(t, wsBase), dial(t, wsBase), dial(t, wsBase)
	auth(t, host, "host", "password123")
	auth(t, viewer, "viewer", "password123")
	auth(t, mallory, "mallory", "password123")

	host.WriteJSON(NexusMessage{Type: "remote_register", Body: "123456"})
	readUntil(t, host, func(m NexusMessage) bool { return m.Type == "remote_registered" })
	return srv, host, viewer, mallory
}

func TestRemote_CannotOverwriteSomeoneElsesCode(t *testing.T) {
	srv, _, _, mallory := remoteSetup(t)
	mallory.WriteJSON(NexusMessage{Type: "remote_register", Body: "123456"})
	got := readUntil(t, mallory, func(m NexusMessage) bool {
		return m.Type == "remote_error" || m.Type == "remote_registered"
	})
	if got.Type != "remote_error" {
		t.Fatalf("mallory took over host's code: %+v", got)
	}
	srv.RemoteCodesMu.RLock()
	owner := srv.RemoteCodes["123456"].Username
	srv.RemoteCodesMu.RUnlock()
	if owner != "host" {
		t.Fatalf("code owner = %q, want host", owner)
	}
}

func TestRemote_SignallingNeedsAPairingLookup(t *testing.T) {
	_, host, viewer, mallory := remoteSetup(t)

	// Mallory never looked the code up: her offer and end must not reach host.
	mallory.WriteJSON(NexusMessage{Type: "remote_offer", Recipient: "host", SDP: "evil"})
	if e := readUntil(t, mallory, func(m NexusMessage) bool { return m.Type == "remote_error" }); e.Error == "" {
		t.Fatal("expected an error for an unpaired offer")
	}
	mallory.WriteJSON(NexusMessage{Type: "remote_end", Recipient: "host"})
	mallory.WriteJSON(NexusMessage{Type: "remote_ice", Recipient: "host", Candidate: "x"})

	// Viewer pairs with the right code; the host's first remote_* message is
	// the viewer's offer (nothing from mallory got through, and mallory's
	// remote_end did not delete the host's code).
	viewer.WriteJSON(NexusMessage{Type: "remote_lookup", Body: "123456"})
	res := readUntil(t, viewer, func(m NexusMessage) bool { return m.Type == "remote_lookup_result" })
	if res.Status != "ok" || res.Body != "host" {
		t.Fatalf("lookup failed: %+v", res)
	}
	viewer.WriteJSON(NexusMessage{Type: "remote_offer", Sender: "mallory", Recipient: "host", SDP: "good"})
	offer := readUntil(t, host, func(m NexusMessage) bool {
		return m.Type == "remote_offer" || m.Type == "remote_end" || m.Type == "remote_ice"
	})
	if offer.Type != "remote_offer" || offer.Sender != "viewer" || offer.SDP != "good" {
		t.Fatalf("host got %+v, want viewer's offer", offer)
	}

	// Host answers the viewer (host→viewer direction).
	host.WriteJSON(NexusMessage{Type: "remote_answer", Recipient: "viewer", SDP: "ans"})
	ans := readUntil(t, viewer, func(m NexusMessage) bool { return m.Type == "remote_answer" })
	if ans.Sender != "host" || ans.SDP != "ans" {
		t.Fatalf("unexpected answer relay: %+v", ans)
	}

	// Host can't use the pairing to signal mallory.
	host.WriteJSON(NexusMessage{Type: "remote_answer", Recipient: "mallory", SDP: "x"})

	// Viewer ends; pairing is gone, so a later offer is refused.
	viewer.WriteJSON(NexusMessage{Type: "remote_end", Recipient: "host"})
	readUntil(t, host, func(m NexusMessage) bool { return m.Type == "remote_end" && m.Sender == "viewer" })
	viewer.WriteJSON(NexusMessage{Type: "remote_offer", Recipient: "host", SDP: "again"})
	readUntil(t, viewer, func(m NexusMessage) bool { return m.Type == "remote_error" })

	// Mallory's queue: she must have received nothing from host.
	mallory.WriteJSON(NexusMessage{Type: "remote_lookup", Body: "000000"})
	readUntilNot(t, mallory,
		func(m NexusMessage) bool { return m.Type == "remote_answer" },
		func(m NexusMessage) bool { return m.Type == "remote_lookup_result" })
}

func TestRemote_StrangerEndDoesNotDeleteHostCode(t *testing.T) {
	srv, _, _, mallory := remoteSetup(t)
	mallory.WriteJSON(NexusMessage{Type: "remote_end", Recipient: "host"})
	// Round-trip something so the end has been processed.
	mallory.WriteJSON(NexusMessage{Type: "remote_lookup", Body: "123456"})
	readUntil(t, mallory, func(m NexusMessage) bool { return m.Type == "remote_lookup_result" })
	srv.RemoteCodesMu.RLock()
	_, ok := srv.RemoteCodes["123456"]
	srv.RemoteCodesMu.RUnlock()
	if !ok {
		t.Fatal("an unpaired remote_end deleted the host's code")
	}
}
