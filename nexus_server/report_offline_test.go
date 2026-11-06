package main

import (
	"strings"
	"testing"
)

// The web app used to send report_abuse with no reason, which the server
// rejected while the app said "Report sent". A missing or unknown reason is
// now filed as "other" so the report is kept.
func TestAbuseReport_MissingReasonFiledAsOther(t *testing.T) {
	srv, _, wsBase := newTestServer(t)
	registerAndVerify(t, srv, "alice", "password123")
	registerAndVerify(t, srv, "bob", "password123")

	alice := dial(t, wsBase)
	auth(t, alice, "alice", "password123")

	for _, reason := range []string{"", "made-up-tag"} {
		if err := alice.WriteJSON(NexusMessage{Type: "report_abuse", Recipient: "bob", Status: reason, Body: "r=" + reason}); err != nil {
			t.Fatalf("send report: %v", err)
		}
		res := readUntil(t, alice, func(m NexusMessage) bool { return m.Type == "report_result" })
		if res.Status != "received" {
			t.Fatalf("reason %q: report rejected: %q", reason, res.Error)
		}
		var got string
		if err := srv.DB.QueryRow(`SELECT reason FROM abuse_reports WHERE reporter='alice' AND body=?`, "r="+reason).Scan(&got); err != nil {
			t.Fatalf("reason %q: not stored: %v", reason, err)
		}
		if got != "other" {
			t.Fatalf("reason %q stored as %q, want other", reason, got)
		}
	}
}

func TestAbuseReport_RejectsUnknownUserAndSelf(t *testing.T) {
	srv, _, wsBase := newTestServer(t)
	registerAndVerify(t, srv, "alice", "password123")

	alice := dial(t, wsBase)
	auth(t, alice, "alice", "password123")

	for _, subject := range []string{"nobody_here", "alice"} {
		if err := alice.WriteJSON(NexusMessage{Type: "report_abuse", Recipient: subject, Status: "spam"}); err != nil {
			t.Fatalf("send report: %v", err)
		}
		res := readUntil(t, alice, func(m NexusMessage) bool { return m.Type == "report_result" })
		if res.Status == "received" || res.Error == "" {
			t.Fatalf("report about %q should fail, got %+v", subject, res)
		}
	}
	var n int
	srv.DB.QueryRow(`SELECT COUNT(*) FROM abuse_reports`).Scan(&n)
	if n != 0 {
		t.Fatalf("expected no stored reports, got %d", n)
	}
}

func TestAbuseReport_LongBodyIsCapped(t *testing.T) {
	srv, _, _ := newTestServer(t)
	registerAndVerify(t, srv, "alice", "password123")
	registerAndVerify(t, srv, "bob", "password123")
	if err := srv.recordAbuseReport("alice", "bob", "SPAM", strings.Repeat("x", 5000)); err != nil {
		t.Fatalf("record: %v", err)
	}
	var reason, body string
	srv.DB.QueryRow(`SELECT reason, body FROM abuse_reports`).Scan(&reason, &body)
	if reason != "spam" || len(body) != maxAbuseReportBody {
		t.Fatalf("got reason=%q len(body)=%d", reason, len(body))
	}
}

// A group message queued while a member was offline must still say which
// group it belongs to, or the app can't show it.
func TestOfflineDelivery_GroupMessageKeepsConvoID(t *testing.T) {
	srv, _, wsBase := newTestServer(t)
	registerAndVerify(t, srv, "alice", "password123")
	registerAndVerify(t, srv, "bob", "password123")
	if _, err := srv.DB.Exec(`INSERT INTO offline_messages (sender, recipient, body, msg_type, convo)
		VALUES ('alice', 'bob', 'while you were out', 'convo_msg', 'grp_123')`); err != nil {
		t.Fatalf("seed: %v", err)
	}

	bob := dial(t, wsBase)
	auth(t, bob, "bob", "password123")
	got := readUntil(t, bob, func(m NexusMessage) bool { return m.Type == "convo_msg" })
	if got.ConvoID != "grp_123" || got.Body != "while you were out" || got.Sender != "alice" {
		t.Fatalf("queued group message lost its group: %+v", got)
	}
	if !strings.HasPrefix(got.Status, "offline:") {
		t.Fatalf("expected offline timestamp, got status %q", got.Status)
	}
}
