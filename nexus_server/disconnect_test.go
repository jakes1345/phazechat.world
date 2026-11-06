package main

import "testing"

// Dropping mid-call must still tell the partner and close the call row, now
// that the disconnect path does its sends and DB writes outside s.Mu.
func TestDisconnect_MidCallNotifiesPartnerAndLogsCall(t *testing.T) {
	srv, _, wsBase := newTestServer(t)
	registerAndVerify(t, srv, "alice", "password123")
	registerAndVerify(t, srv, "bob", "password123")
	friends(t, srv, "alice", "bob")

	alice := dial(t, wsBase)
	bob := dial(t, wsBase)
	auth(t, alice, "alice", "password123")
	auth(t, bob, "bob", "password123")

	alice.WriteJSON(NexusMessage{Type: "call_offer", Recipient: "bob", Body: "audio"})
	readUntil(t, bob, func(m NexusMessage) bool { return m.Type == "call_offer" })
	bob.WriteJSON(NexusMessage{Type: "call_answer", Recipient: "alice"})
	readUntil(t, alice, func(m NexusMessage) bool { return m.Type == "call_jitsi" })
	readUntil(t, bob, func(m NexusMessage) bool { return m.Type == "call_jitsi" })

	alice.Close()

	end := readUntil(t, bob, func(m NexusMessage) bool { return m.Type == "call_end" })
	if end.Sender != "alice" {
		t.Fatalf("call_end sender = %q, want alice", end.Sender)
	}
	logMsg := readUntil(t, bob, func(m NexusMessage) bool { return m.Type == "call_log" })
	if logMsg.Status != "answered" || logMsg.Sender != "alice" || logMsg.Recipient != "bob" {
		t.Fatalf("unexpected call_log: %+v", logMsg)
	}
	if c, busy := srv.anyClientInCall("bob"); busy {
		t.Fatalf("bob still marked in a call after alice dropped: %+v", c)
	}
}

// convo_msg fan-out used to hold s.Mu.RLock while sendTo took it again. With
// a writer queued in between that deadlocks; this keeps registry writers busy
// while a group message fans out and checks it still arrives.
func TestConvoMsg_FanOutDoesNotHoldRegistryLock(t *testing.T) {
	srv, _, wsBase := newTestServer(t)
	convoID, alice, bob := makeGroup(t, srv, wsBase)

	stop := make(chan struct{})
	done := make(chan struct{})
	go func() {
		defer close(done)
		for {
			select {
			case <-stop:
				return
			default:
			}
			srv.Mu.Lock()
			srv.Mu.Unlock()
		}
	}()
	defer func() { close(stop); <-done }()

	for i := 0; i < 20; i++ {
		if err := alice.WriteJSON(NexusMessage{Type: "convo_msg", ConvoID: convoID, Body: "hi"}); err != nil {
			t.Fatalf("send convo_msg: %v", err)
		}
		readUntil(t, bob, func(m NexusMessage) bool { return m.Type == "convo_msg" && m.ConvoID == convoID })
	}
}
