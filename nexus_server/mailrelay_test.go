package main

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestSendEmailGoesThroughWorkerRelay(t *testing.T) {
	var got map[string]string
	relay := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "POST" || r.URL.Path != "/send" {
			t.Errorf("relay got %s %s", r.Method, r.URL.Path)
		}
		b, _ := io.ReadAll(r.Body)
		_ = json.Unmarshal(b, &got)
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"messageId":"m1"}`))
	}))
	defer relay.Close()

	t.Setenv("PHAZE_MAIL_RELAY", relay.URL+"/send")
	// The relay wins over any other provider that happens to be set.
	t.Setenv("RESEND_API_KEY", "should-not-be-used")
	if !mailConfigured() {
		t.Fatal("mailConfigured() = false with the relay set")
	}
	s := &NexusServer{}
	if err := s.sendEmail("someone@example.com", "Activate your Phaze account", "<p>123456</p>"); err != nil {
		t.Fatalf("sendEmail: %v", err)
	}
	if got["to"] != "someone@example.com" || got["subject"] != "Activate your Phaze account" || got["html"] != "<p>123456</p>" {
		t.Fatalf("relay got %v", got)
	}
}

func TestSendEmailRelayErrorIsReported(t *testing.T) {
	relay := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusBadGateway)
		_, _ = w.Write([]byte(`{"error":"domain not onboarded","code":"E_SENDER_DOMAIN_NOT_AVAILABLE"}`))
	}))
	defer relay.Close()
	t.Setenv("PHAZE_MAIL_RELAY", relay.URL+"/send")
	err := (&NexusServer{}).sendEmail("someone@example.com", "s", "<p>b</p>")
	if err == nil || !strings.Contains(err.Error(), "E_SENDER_DOMAIN_NOT_AVAILABLE") {
		t.Fatalf("want relay error with code, got %v", err)
	}
}

func TestMailNotConfiguredWithoutAnyTransport(t *testing.T) {
	for _, k := range []string{"PHAZE_MAIL_RELAY", "RESEND_API_KEY", "BREVO_API_KEY", "SMTP_HOST", "SMTP_USER", "SMTP_PASS"} {
		t.Setenv(k, "")
	}
	if mailConfigured() {
		t.Fatal("mailConfigured() = true with nothing set")
	}
}
