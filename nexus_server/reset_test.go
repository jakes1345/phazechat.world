package main

import (
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
)

// The reset token comes from the URL; it must be escaped, not reflected raw.
func TestResetPageEscapesToken(t *testing.T) {
	s := &NexusServer{}
	payload := `"><script>alert(document.cookie)</script>`
	req := httptest.NewRequest(http.MethodGet, "/reset?token="+url.QueryEscape(payload), nil)
	rec := httptest.NewRecorder()
	s.resetHandler(rec, req)
	body := rec.Body.String()
	if strings.Contains(body, "<script>") {
		t.Fatalf("token reflected unescaped:\n%s", body)
	}
	if !strings.Contains(body, "&lt;script&gt;") && !strings.Contains(body, "&#34;&gt;&lt;script") {
		t.Fatalf("expected escaped token in form, got:\n%s", body)
	}
	csp := rec.Header().Get("Content-Security-Policy")
	if !strings.Contains(csp, "default-src 'none'") {
		t.Fatalf("missing strict CSP: %q", csp)
	}
	if rec.Header().Get("Referrer-Policy") != "no-referrer" {
		t.Fatalf("token page must not send Referer")
	}
}

func TestResetPageMissingToken(t *testing.T) {
	s := &NexusServer{}
	rec := httptest.NewRecorder()
	s.resetHandler(rec, httptest.NewRequest(http.MethodGet, "/reset", nil))
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status %d", rec.Code)
	}
}
