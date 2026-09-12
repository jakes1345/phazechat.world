package main

import (
	"net/http"
	"strings"
	"time"
)

const sessionCookieName = "phaze_session"

// cookie first, then Bearer header (Android/desktop)
func tokenFromRequest(r *http.Request) string {
	if c, err := r.Cookie(sessionCookieName); err == nil && c.Value != "" {
		return c.Value
	}
	h := r.Header.Get("Authorization")
	if tok, ok := strings.CutPrefix(h, "Bearer "); ok {
		return tok
	}
	return ""
}

func setSessionCookie(w http.ResponseWriter, token string) {
	http.SetCookie(w, &http.Cookie{
		Name:     sessionCookieName,
		Value:    token,
		Path:     "/",
		HttpOnly: true,
		Secure:   true,
		SameSite: http.SameSiteStrictMode,
		MaxAge:   30 * 24 * 3600,
	})
}

func clearSessionCookie(w http.ResponseWriter) {
	http.SetCookie(w, &http.Cookie{
		Name:     sessionCookieName,
		Value:    "",
		Path:     "/",
		HttpOnly: true,
		Secure:   true,
		SameSite: http.SameSiteStrictMode,
		MaxAge:   -1,
	})
}

func (s *NexusServer) issueSessionToken(username, device string) (string, error) {
	tok, err := randHex(32)
	if err != nil {
		return "", err
	}
	expires := time.Now().Add(30 * 24 * time.Hour)
	_, err = s.DB.Exec(
		"INSERT INTO session_tokens (token, username, device_info, expires_at) VALUES (?, ?, ?, ?)",
		tok, username, device, expires,
	)
	return tok, err
}

func (s *NexusServer) issueAdminSessionToken(username string) (string, error) {
	tok, err := randHex(32)
	if err != nil {
		return "", err
	}
	expires := time.Now().Add(4 * time.Hour)
	_, err = s.DB.Exec(
		"INSERT INTO session_tokens (token, username, device_info, expires_at) VALUES (?, ?, ?, ?)",
		tok, username, "admin-portal", expires,
	)
	return tok, err
}

// sessionUsername returns the account a token authenticates, or "" if it
// doesn't authenticate anything.
//
// A session awaiting new-device approval returns "" as well: the row exists
// so the pending sign-in can be approved later, but until then it must not
// grant access anywhere. Every caller treats "" as unauthenticated, so gating
// here covers the WebSocket upgrade and every HTTP endpoint at once rather
// than relying on each one to remember.
func (s *NexusServer) sessionUsername(token string) string {
	u, pending := s.sessionState(token)
	if pending {
		return ""
	}
	return u
}

// sessionState reports the account a token belongs to and whether it's still
// waiting on new-device approval.
//
// Use this where the difference matters — the verify endpoint needs to find
// the very session that sessionUsername is deliberately refusing.
func (s *NexusServer) sessionState(token string) (username string, pendingDevice bool) {
	if token == "" {
		return "", false
	}
	var u string
	var expires time.Time
	var revoked, pending int
	err := s.DB.QueryRow(
		"SELECT username, expires_at, revoked, COALESCE(pending_device, 0) FROM session_tokens WHERE token = ?",
		token,
	).Scan(&u, &expires, &revoked, &pending)
	if err != nil || revoked != 0 || time.Now().After(expires) {
		return "", false
	}
	return u, pending != 0
}

// markSessionPendingDevice holds a freshly issued session until its device is
// approved.
func (s *NexusServer) markSessionPendingDevice(token string) error {
	_, err := s.DB.Exec("UPDATE session_tokens SET pending_device = 1 WHERE token = ?", token)
	return err
}

func (s *NexusServer) revokeSession(token string) {
	s.DB.Exec("UPDATE session_tokens SET revoked = 1 WHERE token = ?", token)
}
