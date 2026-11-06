package main

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

// The web app signs in with the HttpOnly cookie and has no token in JS, so
// "Download my data" has to work from the cookie alone.
func TestExportAcceptsSessionCookie(t *testing.T) {
	srv, _, _ := newTestServer(t)
	registerAndVerify(t, srv, "alice", "correct-horse-1")
	token, err := srv.issueSessionToken("alice", "test")
	if err != nil {
		t.Fatal(err)
	}

	cases := map[string]func(*http.Request){
		"cookie": func(r *http.Request) { r.AddCookie(&http.Cookie{Name: sessionCookieName, Value: token}) },
		"bearer": func(r *http.Request) { r.Header.Set("Authorization", "Bearer "+token) },
		"query":  func(r *http.Request) { r.URL.RawQuery = "token=" + token },
	}
	for name, auth := range cases {
		req := httptest.NewRequest(http.MethodGet, "/api/v1/export", nil)
		auth(req)
		rec := httptest.NewRecorder()
		srv.exportHandler(rec, req)
		if rec.Code != http.StatusOK {
			t.Errorf("%s: status %d: %s", name, rec.Code, rec.Body.String())
		}
	}

	rec := httptest.NewRecorder()
	srv.exportHandler(rec, httptest.NewRequest(http.MethodGet, "/api/v1/export", nil))
	if rec.Code != http.StatusUnauthorized {
		t.Errorf("no session: status %d, want 401", rec.Code)
	}
}
