package main

import (
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"
)

func TestServerProxyForwardsAPIAndRewritesCookies(t *testing.T) {
	var gotPath, gotOrigin string
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath, gotOrigin = r.URL.RequestURI(), r.Header.Get("Origin")
		http.SetCookie(w, &http.Cookie{Name: "phaze_session", Value: "tok", Domain: "phazechat.world", Path: "/", HttpOnly: true})
		io.WriteString(w, "ok")
	}))
	defer upstream.Close()
	target, _ := url.Parse(upstream.URL)
	h := newServerProxy(target)

	req := httptest.NewRequest(http.MethodGet, "http://wails.localhost/api/v1/stats?x=1", nil)
	req.Header.Set("Origin", "http://wails.localhost")
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK || rec.Body.String() != "ok" {
		t.Fatalf("proxy: %d %q", rec.Code, rec.Body.String())
	}
	if gotPath != "/api/v1/stats?x=1" {
		t.Fatalf("forwarded path %q", gotPath)
	}
	if gotOrigin != "" {
		t.Fatalf("Origin should not be forwarded, got %q", gotOrigin)
	}
	c := rec.Header().Get("Set-Cookie")
	if c == "" || contains(c, "Domain=") || contains(c, "domain=") {
		t.Fatalf("cookie domain not stripped: %q", c)
	}

	rec = httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "http://wails.localhost/etc/passwd", nil))
	if rec.Code != http.StatusNotFound {
		t.Fatalf("non-server path proxied: %d", rec.Code)
	}
}

func contains(s, sub string) bool {
	for i := 0; i+len(sub) <= len(s); i++ {
		if s[i:i+len(sub)] == sub {
			return true
		}
	}
	return false
}
