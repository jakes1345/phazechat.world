package main

// Sign in with Google (OpenID Connect).
//
// Username and password stay the main way in; Google is an extra door into
// the same accounts.
//
// Web: authorization code flow with PKCE, run by the server, so the browser
// never holds a Google token and the client secret never leaves the server.
//
//	GET  /api/v1/auth/google/start     -> redirect to Google's consent screen
//	GET  /api/v1/auth/google/callback  -> code exchange, ID token check, sign-in
//
// Android: Credential Manager hands the app a Google ID token, which it posts
// here. The nonce it asks for first makes each token usable once.
//
//	GET  /api/v1/auth/google/nonce     -> single-use nonce
//	POST /api/v1/auth/google/idtoken   -> ID token check, sign-in
//
// Both paths end in resolveGoogleIdentity. A Google account that is already
// linked signs straight in. Anything else is parked behind a short-lived
// ticket until the person finishes one of:
//
//	POST /api/v1/auth/google/register  pick a username (brand-new account)
//	POST /api/v1/auth/google/link      prove the existing account's password
//	POST /api/v1/auth/google/totp      2FA code for an account that has it on
//
// An existing account is never joined to a Google account just because the
// email addresses match: whoever signs in with Google also has to show that
// account's password once. Otherwise anyone who registered a Phaze account
// with someone else's address (unverified) would receive that person's
// Google sign-ins.
//
// Signed-in people manage the link from Settings:
//
//	GET  /api/v1/auth/google/status
//	POST /api/v1/auth/google/unlink
//	GET  /api/v1/auth/google/start?intent=link     (web)
//	POST /api/v1/auth/google/idtoken intent=link   (Android, with its bearer token)
//
// Settings come from the environment (Worker secrets in production):
//
//	PHAZE_GOOGLE_CLIENT_ID      OAuth client ID of type "Web application"
//	PHAZE_GOOGLE_CLIENT_SECRET  its secret (web flow only)
//	PHAZE_PUBLIC_URL            origin Google sends people back to
//	                            (default https://phazechat.world)

import (
	"bytes"
	"crypto"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"html"
	"io"
	"log"
	"math/big"
	"net/http"
	"net/url"
	"os"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"

	"golang.org/x/crypto/bcrypt"
)

// Google's endpoints. Variables so tests can point them at a fake Google.
var (
	googleAuthEndpoint  = "https://accounts.google.com/o/oauth2/v2/auth"
	googleTokenEndpoint = "https://oauth2.googleapis.com/token"
	googleJWKSURL       = "https://www.googleapis.com/oauth2/v3/certs"
	googleHTTPClient    = &http.Client{Timeout: 10 * time.Second}
)

const (
	googleStateCookie   = "phaze_google_state"
	googleCookiePath    = "/api/v1/auth/google"
	googleRequestTTL    = 10 * time.Minute
	googleTicketTTL     = 15 * time.Minute
	googleTicketTries   = 5
	googleClockSkew     = 5 * time.Minute
	googleTicketBytes   = 32
	googleVerifierBytes = 48
)

var errGoogleToken = errors.New("google sign-in could not be verified")

func googleClientID() string     { return strings.TrimSpace(os.Getenv("PHAZE_GOOGLE_CLIENT_ID")) }
func googleClientSecret() string { return strings.TrimSpace(os.Getenv("PHAZE_GOOGLE_CLIENT_SECRET")) }

// googleWebEnabled: the browser flow needs both halves of the web client.
func googleWebEnabled() bool { return googleClientID() != "" && googleClientSecret() != "" }

// googleAppEnabled: Android only needs the client ID the tokens are issued to.
func googleAppEnabled() bool { return googleClientID() != "" }

func publicBaseURL() string {
	if v := strings.TrimRight(strings.TrimSpace(os.Getenv("PHAZE_PUBLIC_URL")), "/"); v != "" {
		return v
	}
	return "https://phazechat.world"
}

func googleRedirectURI() string { return publicBaseURL() + "/api/v1/auth/google/callback" }

// ── Database ────────────────────────────────────────────────────────────────

func (s *NexusServer) initGoogleAuthDB() {
	stmts := []string{
		// The Google account ("sub") an account signs in with, and the
		// address Google reported for it, shown in Settings.
		`ALTER TABLE users ADD COLUMN google_sub TEXT`,
		`ALTER TABLE users ADD COLUMN google_email TEXT DEFAULT ''`,
		// 0 for accounts created through Google: they have no password of
		// their own until they set one with "Forgot password", and can't
		// unlink Google before then or they'd be locked out.
		`ALTER TABLE users ADD COLUMN password_set INTEGER DEFAULT 1`,
		`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google_sub ON users(google_sub) WHERE google_sub IS NOT NULL AND google_sub != ''`,
		// One row per sign-in started: the OAuth state for the web flow, or
		// the nonce handed to the Android app. Single use, ten minutes.
		`CREATE TABLE IF NOT EXISTS google_auth_requests (
			id TEXT PRIMARY KEY,
			kind TEXT NOT NULL,
			verifier TEXT NOT NULL DEFAULT '',
			nonce TEXT NOT NULL DEFAULT '',
			intent TEXT NOT NULL DEFAULT 'signin',
			link_user TEXT NOT NULL DEFAULT '',
			ref_by TEXT NOT NULL DEFAULT '',
			expires_at INTEGER NOT NULL
		)`,
		// A verified Google identity waiting on the person's next step.
		// Only a hash of the ticket is stored.
		`CREATE TABLE IF NOT EXISTS google_auth_tickets (
			ticket_hash TEXT PRIMARY KEY,
			kind TEXT NOT NULL,
			google_sub TEXT NOT NULL,
			email TEXT NOT NULL,
			name TEXT NOT NULL DEFAULT '',
			username TEXT NOT NULL DEFAULT '',
			ref_by TEXT NOT NULL DEFAULT '',
			attempts INTEGER NOT NULL DEFAULT 0,
			expires_at INTEGER NOT NULL
		)`,
	}
	for _, q := range stmts {
		if _, err := s.DB.Exec(q); err != nil && !strings.Contains(err.Error(), "duplicate column") && !strings.Contains(err.Error(), "already exists") {
			log.Printf("[google] DB migration skipped (%v)", err)
		}
	}
}

func (s *NexusServer) pruneGoogleAuth() {
	now := time.Now().Unix()
	s.DB.Exec(`DELETE FROM google_auth_requests WHERE expires_at < ?`, now)
	s.DB.Exec(`DELETE FROM google_auth_tickets WHERE expires_at < ?`, now)
}

// ── ID token verification ───────────────────────────────────────────────────

type googleClaims struct {
	Iss           string          `json:"iss"`
	Aud           json.RawMessage `json:"aud"`
	Azp           string          `json:"azp"`
	Sub           string          `json:"sub"`
	Email         string          `json:"email"`
	EmailVerified json.RawMessage `json:"email_verified"`
	Name          string          `json:"name"`
	GivenName     string          `json:"given_name"`
	Nonce         string          `json:"nonce"`
	Exp           int64           `json:"exp"`
	Iat           int64           `json:"iat"`
}

func (c *googleClaims) audiences() []string {
	var one string
	if json.Unmarshal(c.Aud, &one) == nil {
		return []string{one}
	}
	var many []string
	json.Unmarshal(c.Aud, &many)
	return many
}

// emailVerified accepts both the JSON boolean Google sends today and the
// "true" string older tokens carried.
func (c *googleClaims) emailVerified() bool {
	v := strings.Trim(strings.TrimSpace(string(c.EmailVerified)), `"`)
	return v == "true"
}

type googleKeySet struct {
	mu        sync.Mutex
	keys      map[string]*rsa.PublicKey
	expires   time.Time
	lastFetch time.Time
}

var googleKeys = &googleKeySet{}

func (k *googleKeySet) reset() {
	k.mu.Lock()
	k.keys, k.expires, k.lastFetch = nil, time.Time{}, time.Time{}
	k.mu.Unlock()
}

func (k *googleKeySet) key(kid string) (*rsa.PublicKey, error) {
	k.mu.Lock()
	defer k.mu.Unlock()
	now := time.Now()
	if pub, ok := k.keys[kid]; ok && now.Before(k.expires) {
		return pub, nil
	}
	// Refetch when the cache has expired, or for an unknown key ID (Google
	// rotates keys), but at most every ten seconds so junk tokens can't
	// turn the server into a key-fetching loop.
	if now.Before(k.expires) && now.Sub(k.lastFetch) < 10*time.Second {
		return nil, fmt.Errorf("unknown signing key %q", kid)
	}
	keys, maxAge, err := fetchGoogleKeys()
	k.lastFetch = now
	if err != nil {
		if pub, ok := k.keys[kid]; ok {
			return pub, nil // stale but still Google's; better than failing
		}
		return nil, err
	}
	k.keys = keys
	k.expires = now.Add(maxAge)
	if pub, ok := k.keys[kid]; ok {
		return pub, nil
	}
	return nil, fmt.Errorf("unknown signing key %q", kid)
}

var maxAgeRe = regexp.MustCompile(`max-age=(\d+)`)

func fetchGoogleKeys() (map[string]*rsa.PublicKey, time.Duration, error) {
	resp, err := googleHTTPClient.Get(googleJWKSURL)
	if err != nil {
		return nil, 0, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, 0, fmt.Errorf("google keys: HTTP %d", resp.StatusCode)
	}
	var set struct {
		Keys []struct {
			Kid string `json:"kid"`
			Kty string `json:"kty"`
			Alg string `json:"alg"`
			N   string `json:"n"`
			E   string `json:"e"`
		} `json:"keys"`
	}
	if err := json.NewDecoder(io.LimitReader(resp.Body, 1<<20)).Decode(&set); err != nil {
		return nil, 0, err
	}
	keys := map[string]*rsa.PublicKey{}
	for _, jk := range set.Keys {
		if jk.Kty != "RSA" || jk.Kid == "" {
			continue
		}
		nb, err1 := base64.RawURLEncoding.DecodeString(jk.N)
		eb, err2 := base64.RawURLEncoding.DecodeString(jk.E)
		if err1 != nil || err2 != nil || len(eb) == 0 || len(eb) > 4 {
			continue
		}
		e := 0
		for _, b := range eb {
			e = e<<8 | int(b)
		}
		keys[jk.Kid] = &rsa.PublicKey{N: new(big.Int).SetBytes(nb), E: e}
	}
	if len(keys) == 0 {
		return nil, 0, errors.New("google keys: none usable")
	}
	maxAge := time.Hour
	if m := maxAgeRe.FindStringSubmatch(resp.Header.Get("Cache-Control")); m != nil {
		if secs, err := strconv.Atoi(m[1]); err == nil && secs > 0 {
			maxAge = time.Duration(secs) * time.Second
		}
	}
	return keys, maxAge, nil
}

// verifyGoogleIDToken checks an ID token's RS256 signature against Google's
// published keys and its issuer, audience, lifetime and email. The nonce is
// left to the caller, which knows what it expects.
func verifyGoogleIDToken(raw, clientID string) (*googleClaims, error) {
	parts := strings.Split(raw, ".")
	if len(parts) != 3 || clientID == "" {
		return nil, errGoogleToken
	}
	hb, err := base64.RawURLEncoding.DecodeString(parts[0])
	if err != nil {
		return nil, errGoogleToken
	}
	var header struct {
		Alg string `json:"alg"`
		Kid string `json:"kid"`
	}
	if json.Unmarshal(hb, &header) != nil || header.Alg != "RS256" || header.Kid == "" {
		return nil, errGoogleToken
	}
	sig, err := base64.RawURLEncoding.DecodeString(parts[2])
	if err != nil {
		return nil, errGoogleToken
	}
	pub, err := googleKeys.key(header.Kid)
	if err != nil {
		log.Printf("[google] signing key: %v", err)
		return nil, errGoogleToken
	}
	digest := sha256.Sum256([]byte(parts[0] + "." + parts[1]))
	if rsa.VerifyPKCS1v15(pub, crypto.SHA256, digest[:], sig) != nil {
		return nil, errGoogleToken
	}
	cb, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return nil, errGoogleToken
	}
	var c googleClaims
	if json.Unmarshal(cb, &c) != nil {
		return nil, errGoogleToken
	}
	if c.Iss != "https://accounts.google.com" && c.Iss != "accounts.google.com" {
		return nil, errGoogleToken
	}
	auds := c.audiences()
	audOK := false
	for _, a := range auds {
		if a == clientID {
			audOK = true
		}
	}
	if !audOK || (len(auds) > 1 && c.Azp != clientID) {
		return nil, errGoogleToken
	}
	now := time.Now()
	if c.Exp == 0 || now.After(time.Unix(c.Exp, 0).Add(googleClockSkew)) {
		return nil, errGoogleToken
	}
	if c.Iat != 0 && time.Unix(c.Iat, 0).After(now.Add(googleClockSkew)) {
		return nil, errGoogleToken
	}
	if c.Sub == "" || c.Email == "" || !c.emailVerified() {
		return nil, errGoogleToken
	}
	c.Email = strings.ToLower(strings.TrimSpace(c.Email))
	return &c, nil
}

// exchangeGoogleCode trades an authorization code for the ID token.
func exchangeGoogleCode(code, verifier string) (string, error) {
	form := url.Values{
		"code":          {code},
		"client_id":     {googleClientID()},
		"client_secret": {googleClientSecret()},
		"redirect_uri":  {googleRedirectURI()},
		"grant_type":    {"authorization_code"},
		"code_verifier": {verifier},
	}
	resp, err := googleHTTPClient.PostForm(googleTokenEndpoint, form)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("token endpoint: HTTP %d: %s", resp.StatusCode, bytes.TrimSpace(body))
	}
	var tok struct {
		IDToken string `json:"id_token"`
	}
	if json.Unmarshal(body, &tok) != nil || tok.IDToken == "" {
		return "", errors.New("token endpoint: no id_token")
	}
	return tok.IDToken, nil
}

// ── Resolving a verified identity ───────────────────────────────────────────

type googleOutcome struct {
	Status     string `json:"status"`
	Username   string `json:"username,omitempty"`
	Ticket     string `json:"ticket,omitempty"`
	Email      string `json:"email,omitempty"`
	Suggestion string `json:"suggestion,omitempty"`
	Error      string `json:"error,omitempty"`
	code       int
}

func googleFail(code int, msg string) googleOutcome {
	return googleOutcome{Status: "error", Error: msg, code: code}
}

func hashTicket(t string) string {
	h := sha256.Sum256([]byte(t))
	return hex.EncodeToString(h[:])
}

func (s *NexusServer) newGoogleTicket(kind string, c *googleClaims, username, refBy string) (string, error) {
	t, err := randHex(googleTicketBytes)
	if err != nil {
		return "", err
	}
	name := c.Name
	if name == "" {
		name = c.GivenName
	}
	_, err = s.DB.Exec(`INSERT INTO google_auth_tickets (ticket_hash, kind, google_sub, email, name, username, ref_by, expires_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
		hashTicket(t), kind, c.Sub, c.Email, name, username, refBy, time.Now().Add(googleTicketTTL).Unix())
	return t, err
}

type googleTicket struct {
	hash, kind, sub, email, name, username, refBy string
	attempts                                      int
}

func (s *NexusServer) loadGoogleTicket(t, kind string) (*googleTicket, bool) {
	if t == "" {
		return nil, false
	}
	gt := &googleTicket{hash: hashTicket(t)}
	var expires int64
	err := s.DB.QueryRow(`SELECT kind, google_sub, email, name, username, ref_by, attempts, expires_at
		FROM google_auth_tickets WHERE ticket_hash = ?`, gt.hash).
		Scan(&gt.kind, &gt.sub, &gt.email, &gt.name, &gt.username, &gt.refBy, &gt.attempts, &expires)
	if err != nil || gt.kind != kind || time.Now().Unix() > expires || gt.attempts >= googleTicketTries {
		return nil, false
	}
	return gt, true
}

// failGoogleTicket counts a wrong answer and burns the ticket at the limit.
func (s *NexusServer) failGoogleTicket(gt *googleTicket) {
	s.DB.Exec(`UPDATE google_auth_tickets SET attempts = attempts + 1 WHERE ticket_hash = ?`, gt.hash)
	s.DB.Exec(`DELETE FROM google_auth_tickets WHERE ticket_hash = ? AND attempts >= ?`, gt.hash, googleTicketTries)
}

func (s *NexusServer) dropGoogleTicket(gt *googleTicket) {
	s.DB.Exec(`DELETE FROM google_auth_tickets WHERE ticket_hash = ?`, gt.hash)
}

func (s *NexusServer) userByGoogleSub(sub string) string {
	var u string
	s.DB.QueryRow(`SELECT username FROM users WHERE google_sub = ?`, sub).Scan(&u)
	return u
}

func (s *NexusServer) totpOn(username string) bool {
	secret, enabled := s.totpStatus(username)
	return enabled && secret != ""
}

// resolveGoogleIdentity decides what a verified Google identity does next.
// intent "link" attaches it to linkUser (already signed in); otherwise it
// signs in, or hands back a ticket for the step that's still needed.
func (s *NexusServer) resolveGoogleIdentity(c *googleClaims, intent, linkUser, refBy string) googleOutcome {
	owner := s.userByGoogleSub(c.Sub)

	if intent == "link" {
		if linkUser == "" {
			return googleFail(http.StatusUnauthorized, "Sign in to Phaze first, then connect Google from Settings.")
		}
		if owner != "" && owner != linkUser {
			return googleFail(http.StatusConflict, "That Google account is already connected to a different Phaze account.")
		}
		var current string
		s.DB.QueryRow(`SELECT COALESCE(google_sub, '') FROM users WHERE username = ?`, linkUser).Scan(&current)
		if current != "" && current != c.Sub {
			return googleFail(http.StatusConflict, "Disconnect the Google account that's already connected first.")
		}
		if _, err := s.DB.Exec(`UPDATE users SET google_sub = ?, google_email = ? WHERE username = ?`, c.Sub, c.Email, linkUser); err != nil {
			return googleFail(http.StatusInternalServerError, "Couldn't connect Google. Try again.")
		}
		log.Printf("[google] %s connected a Google account", linkUser)
		return googleOutcome{Status: "linked", Username: linkUser, Email: c.Email}
	}

	if owner != "" {
		if banned, reason := s.userBanInfo(owner); banned {
			msg := "Account suspended"
			if reason != "" {
				msg += ": " + reason
			}
			return googleFail(http.StatusForbidden, msg)
		}
		// Keep the address shown in Settings current.
		s.DB.Exec(`UPDATE users SET google_email = ? WHERE username = ?`, c.Email, owner)
		if s.totpOn(owner) {
			t, err := s.newGoogleTicket("totp", c, owner, "")
			if err != nil {
				return googleFail(http.StatusInternalServerError, "session error")
			}
			return googleOutcome{Status: "totp_required", Ticket: t}
		}
		return googleOutcome{Status: "ok", Username: owner}
	}

	// Not linked yet. Accounts already registered with this address can
	// be linked, but only by someone who also knows that account's
	// password; the person can also start a separate account instead.
	var matches []string
	rows, err := s.DB.Query(`SELECT username FROM users WHERE LOWER(email) = ? ORDER BY id LIMIT 5`, c.Email)
	if err == nil {
		for rows.Next() {
			var u string
			if rows.Scan(&u) == nil {
				matches = append(matches, u)
			}
		}
		rows.Close()
	}
	if len(matches) > 0 {
		hint := ""
		if len(matches) == 1 {
			hint = matches[0]
		}
		t, err := s.newGoogleTicket("link", c, hint, refBy)
		if err != nil {
			return googleFail(http.StatusInternalServerError, "session error")
		}
		return googleOutcome{Status: "link_required", Ticket: t, Email: c.Email, Username: hint}
	}

	t, err := s.newGoogleTicket("register", c, "", refBy)
	if err != nil {
		return googleFail(http.StatusInternalServerError, "session error")
	}
	return googleOutcome{Status: "username_required", Ticket: t, Email: c.Email, Suggestion: s.suggestUsername(c)}
}

var usernameStrip = regexp.MustCompile(`[^a-zA-Z0-9_.-]+`)

// suggestUsername offers a free username based on the Google address, e.g.
// jane.doe@gmail.com -> "jane.doe", or "jane.doe7" if that's taken.
func (s *NexusServer) suggestUsername(c *googleClaims) string {
	base := c.Email
	if i := strings.Index(base, "@"); i > 0 {
		base = base[:i]
	}
	base = strings.Trim(usernameStrip.ReplaceAllString(base, ""), ".-_")
	if len(base) > 28 {
		base = base[:28]
	}
	for len(base) < 3 {
		base += "0"
	}
	taken := func(u string) bool {
		var n int
		s.DB.QueryRow(`SELECT COUNT(*) FROM users WHERE LOWER(username) = LOWER(?)`, u).Scan(&n)
		return n > 0
	}
	if validUsername(base) && !taken(base) {
		return base
	}
	for i := 0; i < 20; i++ {
		d, err := randDigits(1 + i/5)
		if err != nil {
			break
		}
		cand := base + d
		if validUsername(cand) && !taken(cand) {
			return cand
		}
	}
	return ""
}

// passwordMatches checks a password without the email-verified gate that
// authenticateUser applies, for the link step: there the address has just
// been proven through Google, and it's the password that proves the account.
func (s *NexusServer) passwordMatches(username, password string) bool {
	var hash string
	if s.DB.QueryRow(`SELECT password_hash FROM users WHERE username = ?`, username).Scan(&hash) != nil {
		return false
	}
	pw := sha256.Sum256([]byte(password))
	if bcrypt.CompareHashAndPassword([]byte(hash), pw[:]) == nil {
		return true
	}
	return bcrypt.CompareHashAndPassword([]byte(hash), []byte(password)) == nil
}

// ── Finishing a sign-in ─────────────────────────────────────────────────────

// googleSignIn issues the session for username. Browsers get the usual
// HttpOnly cookie and have this device remembered; the app gets the token in
// the response body, as it gets from the link-code sign-in.
func (s *NexusServer) googleSignIn(w http.ResponseWriter, r *http.Request, username, device string, app bool) (string, error) {
	if device == "" {
		device = "web"
		if app {
			device = "android"
		}
	}
	tok, err := s.issueSessionToken(username, device)
	if err != nil {
		return "", err
	}
	ip := clientIP(r)
	s.DB.Exec("UPDATE users SET last_ip = ?, last_login_at = CURRENT_TIMESTAMP WHERE username = ?", ip, username)
	authTracker.recordSuccess(ip, username)
	metrics.authSuccess.Add(1)
	s.autoJoinGlobalSpace(username)
	if !app {
		// Google has just checked this person, with its own new-device and
		// 2FA rules, so the browser is remembered rather than challenged
		// with an emailed code on top.
		deviceID := deviceIDFromRequest(r)
		label := deviceLabel(r.UserAgent(), device)
		if deviceID == "" {
			if id, err := randHex(16); err == nil {
				deviceID = id
			}
		}
		if deviceID != "" {
			s.rememberDevice(username, deviceID, label, ip)
			setDeviceCookie(w, deviceID)
		}
		setSessionCookie(w, tok)
	}
	log.Printf("[google] %s signed in with Google (%s)", username, device)
	return tok, nil
}

// ── HTTP handlers ───────────────────────────────────────────────────────────

func writeGoogleJSON(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(code)
	json.NewEncoder(w).Encode(v)
}

func (s *NexusServer) googleConfigHandler(w http.ResponseWriter, r *http.Request) {
	writeGoogleJSON(w, http.StatusOK, map[string]any{
		"web":       googleWebEnabled(),
		"app":       googleAppEnabled(),
		"client_id": googleClientID(),
	})
}

func pkceChallenge(verifier string) string {
	h := sha256.Sum256([]byte(verifier))
	return base64.RawURLEncoding.EncodeToString(h[:])
}

// googleStartHandler begins the web flow and sends the browser to Google.
func (s *NexusServer) googleStartHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "GET required", http.StatusMethodNotAllowed)
		return
	}
	if !googleWebEnabled() {
		googleBackToApp(w, url.Values{"google": {"error"}, "msg": {"Sign in with Google isn't switched on yet."}})
		return
	}
	intent := "signin"
	linkUser := ""
	if r.URL.Query().Get("intent") == "link" {
		intent = "link"
		// The session cookie is SameSite=Strict, so it's only here when
		// this was started from Phaze itself, not from another site.
		linkUser = s.sessionUsername(tokenFromRequest(r))
		if linkUser == "" {
			googleBackToApp(w, url.Values{"google": {"error"}, "msg": {"Sign in to Phaze first, then connect Google from Settings."}})
			return
		}
	}
	refBy := strings.TrimSpace(r.URL.Query().Get("ref"))
	if !validUsername(refBy) {
		refBy = ""
	}

	s.pruneGoogleAuth()
	state, err1 := randHex(32)
	nonce, err2 := randHex(32)
	verifier, err3 := randHex(googleVerifierBytes)
	if err1 != nil || err2 != nil || err3 != nil {
		http.Error(w, "session error", http.StatusInternalServerError)
		return
	}
	if _, err := s.DB.Exec(`INSERT INTO google_auth_requests (id, kind, verifier, nonce, intent, link_user, ref_by, expires_at)
		VALUES (?, 'web', ?, ?, ?, ?, ?, ?)`,
		state, verifier, nonce, intent, linkUser, refBy, time.Now().Add(googleRequestTTL).Unix()); err != nil {
		http.Error(w, "session error", http.StatusInternalServerError)
		return
	}
	// Ties the callback to this browser. Lax, because the callback arrives
	// as a top-level navigation from accounts.google.com and a Strict
	// cookie wouldn't be sent with it.
	http.SetCookie(w, &http.Cookie{
		Name:     googleStateCookie,
		Value:    state,
		Path:     googleCookiePath,
		HttpOnly: true,
		Secure:   true,
		SameSite: http.SameSiteLaxMode,
		MaxAge:   int(googleRequestTTL.Seconds()),
	})
	q := url.Values{
		"client_id":             {googleClientID()},
		"redirect_uri":          {googleRedirectURI()},
		"response_type":         {"code"},
		"scope":                 {"openid email profile"},
		"state":                 {state},
		"nonce":                 {nonce},
		"code_challenge":        {pkceChallenge(verifier)},
		"code_challenge_method": {"S256"},
		"prompt":                {"select_account"},
	}
	w.Header().Set("Cache-Control", "no-store")
	http.Redirect(w, r, googleAuthEndpoint+"?"+q.Encode(), http.StatusFound)
}

// googleBackToApp returns the browser to the web app. It's a small page that
// navigates on, rather than a redirect, because the hop from Google makes a
// redirect chain cross-site, and the SameSite=Strict session cookie only
// counts once the browser makes a same-site navigation of its own. What the
// app needs next rides in the fragment, which never reaches a server log.
func googleBackToApp(w http.ResponseWriter, frag url.Values) {
	target := "/web/"
	if len(frag) > 0 {
		target += "#" + frag.Encode()
	}
	nonce, _ := randHex(16)
	h := w.Header()
	h.Set("Content-Type", "text/html; charset=utf-8")
	h.Set("Cache-Control", "no-store")
	h.Set("Referrer-Policy", "no-referrer")
	h.Set("Content-Security-Policy", "default-src 'none'; script-src 'nonce-"+nonce+"'; style-src 'unsafe-inline'; frame-ancestors 'none'")
	esc := html.EscapeString(target)
	js, _ := json.Marshal(target)
	fmt.Fprintf(w, `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="refresh" content="0;url=%s"><title>Phaze</title></head>
<body style="font-family:system-ui,sans-serif;text-align:center;padding:3rem;color:#334">
<p>Taking you back to Phaze&hellip;</p><p><a href="%s">Continue</a></p>
<script nonce="%s">location.replace(%s)</script></body></html>`, esc, esc, nonce, js)
}

func clearGoogleStateCookie(w http.ResponseWriter) {
	http.SetCookie(w, &http.Cookie{
		Name: googleStateCookie, Value: "", Path: googleCookiePath,
		HttpOnly: true, Secure: true, SameSite: http.SameSiteLaxMode, MaxAge: -1,
	})
}

type googleRequest struct {
	kind, verifier, nonce, intent, linkUser, refBy string
}

// takeGoogleRequest loads and deletes a pending request: each is good once.
func (s *NexusServer) takeGoogleRequest(id, kind string) (*googleRequest, bool) {
	if id == "" {
		return nil, false
	}
	gr := &googleRequest{}
	var expires int64
	err := s.DB.QueryRow(`SELECT kind, verifier, nonce, intent, link_user, ref_by, expires_at FROM google_auth_requests WHERE id = ?`, id).
		Scan(&gr.kind, &gr.verifier, &gr.nonce, &gr.intent, &gr.linkUser, &gr.refBy, &expires)
	if err != nil {
		return nil, false
	}
	res, err := s.DB.Exec(`DELETE FROM google_auth_requests WHERE id = ?`, id)
	if err != nil {
		return nil, false
	}
	if n, _ := res.RowsAffected(); n != 1 {
		return nil, false // someone else got it first
	}
	if gr.kind != kind || time.Now().Unix() > expires {
		return nil, false
	}
	return gr, true
}

// googleCallbackHandler is where Google sends the browser back.
func (s *NexusServer) googleCallbackHandler(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	clearGoogleStateCookie(w)
	if e := q.Get("error"); e != "" {
		// "access_denied" is the person pressing Cancel: just go back.
		if e == "access_denied" {
			googleBackToApp(w, nil)
			return
		}
		googleBackToApp(w, url.Values{"google": {"error"}, "msg": {"Google didn't complete the sign-in. Try again."}})
		return
	}
	state := q.Get("state")
	c, err := r.Cookie(googleStateCookie)
	if err != nil || state == "" || subtle.ConstantTimeCompare([]byte(c.Value), []byte(state)) != 1 {
		googleBackToApp(w, url.Values{"google": {"error"}, "msg": {"That sign-in link expired or was opened in a different browser. Try again."}})
		return
	}
	gr, ok := s.takeGoogleRequest(state, "web")
	if !ok {
		googleBackToApp(w, url.Values{"google": {"error"}, "msg": {"That sign-in expired. Try again."}})
		return
	}
	code := q.Get("code")
	if code == "" {
		googleBackToApp(w, url.Values{"google": {"error"}, "msg": {"Google didn't complete the sign-in. Try again."}})
		return
	}
	rawID, err := exchangeGoogleCode(code, gr.verifier)
	if err != nil {
		log.Printf("[google] code exchange: %v", err)
		googleBackToApp(w, url.Values{"google": {"error"}, "msg": {"Couldn't reach Google to finish signing in. Try again."}})
		return
	}
	claims, err := verifyGoogleIDToken(rawID, googleClientID())
	if err != nil || subtle.ConstantTimeCompare([]byte(claims.Nonce), []byte(gr.nonce)) != 1 {
		googleBackToApp(w, url.Values{"google": {"error"}, "msg": {"Google sign-in could not be verified. Try again."}})
		return
	}
	// A link started while signed in only applies if that session still is.
	if gr.intent == "link" && s.sessionUsername(tokenFromRequest(r)) != "" && s.sessionUsername(tokenFromRequest(r)) != gr.linkUser {
		googleBackToApp(w, url.Values{"google": {"error"}, "msg": {"You switched accounts while connecting Google. Try again."}})
		return
	}

	out := s.resolveGoogleIdentity(claims, gr.intent, gr.linkUser, gr.refBy)
	frag := url.Values{}
	switch out.Status {
	case "ok":
		if _, err := s.googleSignIn(w, r, out.Username, "web/google", false); err != nil {
			frag.Set("google", "error")
			frag.Set("msg", "session error")
			break
		}
		googleBackToApp(w, nil)
		return
	case "linked":
		frag.Set("google", "linked")
		frag.Set("email", out.Email)
	case "totp_required":
		frag.Set("google", "totp")
		frag.Set("ticket", out.Ticket)
	case "link_required":
		frag.Set("google", "link")
		frag.Set("ticket", out.Ticket)
		frag.Set("email", out.Email)
		frag.Set("user", out.Username)
	case "username_required":
		frag.Set("google", "username")
		frag.Set("ticket", out.Ticket)
		frag.Set("email", out.Email)
		frag.Set("suggest", out.Suggestion)
	default:
		frag.Set("google", "error")
		frag.Set("msg", out.Error)
	}
	googleBackToApp(w, frag)
}

// googleNonceHandler gives the Android app a nonce to put in its Google
// request. The ID token comes back carrying it, which is what makes a token
// good for exactly one sign-in here.
func (s *NexusServer) googleNonceHandler(w http.ResponseWriter, r *http.Request) {
	if !googleAppEnabled() {
		writeGoogleJSON(w, http.StatusServiceUnavailable, googleFail(0, "Sign in with Google isn't switched on yet."))
		return
	}
	s.pruneGoogleAuth()
	nonce, err := randHex(32)
	if err != nil {
		http.Error(w, "session error", http.StatusInternalServerError)
		return
	}
	if _, err := s.DB.Exec(`INSERT INTO google_auth_requests (id, kind, nonce, expires_at) VALUES (?, 'app', ?, ?)`,
		nonce, nonce, time.Now().Add(googleRequestTTL).Unix()); err != nil {
		http.Error(w, "session error", http.StatusInternalServerError)
		return
	}
	writeGoogleJSON(w, http.StatusOK, map[string]string{"nonce": nonce, "client_id": googleClientID()})
}

// googleIDTokenHandler signs in (or links) with an ID token from the app.
func (s *NexusServer) googleIDTokenHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "POST required", http.StatusMethodNotAllowed)
		return
	}
	if !googleAppEnabled() {
		writeGoogleJSON(w, http.StatusServiceUnavailable, googleFail(0, "Sign in with Google isn't switched on yet."))
		return
	}
	ip := clientIP(r)
	if authTracker.isIPThrottled(ip) {
		writeGoogleJSON(w, http.StatusTooManyRequests, googleFail(0, "Too many attempts. Try again later."))
		return
	}
	var body struct {
		IDToken string `json:"id_token"`
		Nonce   string `json:"nonce"`
		Intent  string `json:"intent"`
		Device  string `json:"device_info"`
		RefBy   string `json:"ref_by"`
	}
	if json.NewDecoder(io.LimitReader(r.Body, 64<<10)).Decode(&body) != nil || body.IDToken == "" || body.Nonce == "" {
		writeGoogleJSON(w, http.StatusBadRequest, googleFail(0, "id_token and nonce required"))
		return
	}
	if _, ok := s.takeGoogleRequest(body.Nonce, "app"); !ok {
		writeGoogleJSON(w, http.StatusUnauthorized, googleFail(0, "That sign-in expired. Try again."))
		return
	}
	claims, err := verifyGoogleIDToken(body.IDToken, googleClientID())
	if err != nil || subtle.ConstantTimeCompare([]byte(claims.Nonce), []byte(body.Nonce)) != 1 {
		authTracker.recordFail(ip, "")
		writeGoogleJSON(w, http.StatusUnauthorized, googleFail(0, "Google sign-in could not be verified. Try again."))
		return
	}
	intent, linkUser := "signin", ""
	if body.Intent == "link" {
		intent = "link"
		linkUser = s.sessionUsername(tokenFromRequest(r))
	}
	refBy := strings.TrimSpace(body.RefBy)
	if !validUsername(refBy) {
		refBy = ""
	}
	out := s.resolveGoogleIdentity(claims, intent, linkUser, refBy)
	if out.Status == "ok" {
		tok, err := s.googleSignIn(w, r, out.Username, body.Device, true)
		if err != nil {
			writeGoogleJSON(w, http.StatusInternalServerError, googleFail(0, "session error"))
			return
		}
		writeGoogleJSON(w, http.StatusOK, map[string]string{"status": "ok", "username": out.Username, "token": tok})
		return
	}
	code := out.code
	if code == 0 {
		code = http.StatusOK
	}
	writeGoogleJSON(w, code, out)
}

// googleStepBody is the shared request body for the follow-up steps.
type googleStepBody struct {
	Ticket   string `json:"ticket"`
	Username string `json:"username"`
	Password string `json:"password"`
	TOTPCode string `json:"totp_code"`
	Device   string `json:"device_info"`
	Platform string `json:"platform"` // "app" returns the token in the body
}

func readGoogleStep(w http.ResponseWriter, r *http.Request) (*googleStepBody, bool) {
	if r.Method != http.MethodPost {
		http.Error(w, "POST required", http.StatusMethodNotAllowed)
		return nil, false
	}
	var b googleStepBody
	if json.NewDecoder(io.LimitReader(r.Body, 16<<10)).Decode(&b) != nil || b.Ticket == "" {
		writeGoogleJSON(w, http.StatusBadRequest, googleFail(0, "ticket required"))
		return nil, false
	}
	return &b, true
}

func (s *NexusServer) finishGoogleStep(w http.ResponseWriter, r *http.Request, b *googleStepBody, username string) {
	app := b.Platform == "app"
	tok, err := s.googleSignIn(w, r, username, b.Device, app)
	if err != nil {
		writeGoogleJSON(w, http.StatusInternalServerError, googleFail(0, "session error"))
		return
	}
	resp := map[string]string{"status": "ok", "username": username}
	if app {
		resp["token"] = tok
	}
	writeGoogleJSON(w, http.StatusOK, resp)
}

const googleExpiredMsg = "This step expired. Start again with Sign in with Google."

// googleRegisterHandler creates a new account for a Google identity, under the
// username the person picked.
func (s *NexusServer) googleRegisterHandler(w http.ResponseWriter, r *http.Request) {
	b, ok := readGoogleStep(w, r)
	if !ok {
		return
	}
	gt, ok := s.loadGoogleTicket(b.Ticket, "register")
	if !ok {
		writeGoogleJSON(w, http.StatusUnauthorized, googleFail(0, googleExpiredMsg))
		return
	}
	username := strings.TrimSpace(b.Username)
	if !validUsername(username) {
		writeGoogleJSON(w, http.StatusBadRequest, googleFail(0, errBadUsername.Error()))
		return
	}
	ip := clientIP(r)
	if authTracker.isSignupThrottled(ip) {
		writeGoogleJSON(w, http.StatusTooManyRequests, googleFail(0, "Too many accounts created from this network. Try again later."))
		return
	}
	if isVPNOrDatacenter(ip) {
		writeGoogleJSON(w, http.StatusForbidden, googleFail(0, "Registration is not available from VPN or proxy connections. Please disable your VPN and try again."))
		return
	}
	if _, blocked := isDisposableEmail(gt.email); blocked {
		writeGoogleJSON(w, http.StatusForbidden, googleFail(0, "Please use a real email address. Disposable or temporary addresses are not allowed."))
		return
	}
	if s.userByGoogleSub(gt.sub) != "" {
		s.dropGoogleTicket(gt)
		writeGoogleJSON(w, http.StatusConflict, googleFail(0, "That Google account already has a Phaze account. Sign in with Google again."))
		return
	}
	var taken int
	s.DB.QueryRow(`SELECT COUNT(*) FROM users WHERE LOWER(username) = LOWER(?)`, username).Scan(&taken)
	if taken > 0 {
		writeGoogleJSON(w, http.StatusConflict, googleFail(0, "Username already taken"))
		return
	}

	// No password yet: store an unguessable one so the password sign-in
	// can never match. "Forgot password" sets a real one later.
	secret, err := randHex(32)
	if err != nil {
		writeGoogleJSON(w, http.StatusInternalServerError, googleFail(0, "session error"))
		return
	}
	pw := sha256.Sum256([]byte(secret))
	hash, err := bcrypt.GenerateFromPassword(pw[:], bcryptCost)
	if err != nil {
		writeGoogleJSON(w, http.StatusInternalServerError, googleFail(0, "session error"))
		return
	}
	displayName := gt.name
	if len(displayName) > 64 {
		displayName = displayName[:64]
	}
	refBy := ""
	if gt.refBy != "" && !strings.EqualFold(gt.refBy, username) {
		var one int
		if s.DB.QueryRow(`SELECT 1 FROM users WHERE username = ?`, gt.refBy).Scan(&one) == nil {
			refBy = gt.refBy
		}
	}
	_, err = s.DB.Exec(`INSERT INTO users (username, email, mood, display_name, password_hash, salt, is_verified,
			google_sub, google_email, password_set, signup_ip, last_ip, referred_by)
		VALUES (?, ?, '', ?, ?, '', 1, ?, ?, 0, ?, ?, ?)`,
		username, gt.email, displayName, string(hash), gt.sub, gt.email, ip, ip, refBy)
	if err != nil {
		if strings.Contains(strings.ToLower(err.Error()), "unique") {
			writeGoogleJSON(w, http.StatusConflict, googleFail(0, "Username already taken"))
			return
		}
		log.Printf("[google] create %s: %v", username, err)
		writeGoogleJSON(w, http.StatusInternalServerError, googleFail(0, "Couldn't create the account. Try again."))
		return
	}
	s.dropGoogleTicket(gt)
	authTracker.recordSignup(ip)
	log.Printf("New user registered with Google: %s from %s ref=%s", username, ip, refBy)
	// Google has verified the address, so the account is ready now; this
	// is the same follow-up an emailed verification code triggers.
	s.autoJoinGlobalSpace(username)
	s.onReferralVerified(username)
	s.finishGoogleStep(w, r, b, username)
}

// googleLinkHandler joins a Google identity to an existing account whose
// address matches, once the person proves they know its password.
func (s *NexusServer) googleLinkHandler(w http.ResponseWriter, r *http.Request) {
	b, ok := readGoogleStep(w, r)
	if !ok {
		return
	}
	gt, ok := s.loadGoogleTicket(b.Ticket, "link")
	if !ok {
		writeGoogleJSON(w, http.StatusUnauthorized, googleFail(0, googleExpiredMsg))
		return
	}
	username := strings.TrimSpace(b.Username)
	if username == "" {
		username = gt.username
	}
	ip := clientIP(r)
	if authTracker.isIPThrottled(ip) {
		writeGoogleJSON(w, http.StatusTooManyRequests, googleFail(0, "Too many failed attempts. Try again later."))
		return
	}
	if authTracker.isUserLocked(username) {
		writeGoogleJSON(w, http.StatusTooManyRequests, googleFail(0, "Account temporarily locked. Try again in 30 minutes."))
		return
	}
	// Only accounts registered with the address Google just confirmed can
	// be linked from here, and only with their password.
	var email string
	s.DB.QueryRow(`SELECT LOWER(COALESCE(email, '')) FROM users WHERE username = ?`, username).Scan(&email)
	if email == "" || email != gt.email || !s.passwordMatches(username, b.Password) {
		authTracker.recordFail(ip, username)
		s.failGoogleTicket(gt)
		writeGoogleJSON(w, http.StatusUnauthorized, googleFail(0, "Wrong username or password for an account with "+gt.email+"."))
		return
	}
	if banned, reason := s.userBanInfo(username); banned {
		msg := "Account suspended"
		if reason != "" {
			msg += ": " + reason
		}
		writeGoogleJSON(w, http.StatusForbidden, googleFail(0, msg))
		return
	}
	if s.totpOn(username) {
		if authTracker.isTOTPThrottled(username) {
			writeGoogleJSON(w, http.StatusTooManyRequests, googleFail(0, "Too many 2FA attempts — wait a few minutes"))
			return
		}
		if !s.verifyTOTP(username, b.TOTPCode) && !s.consumeBackupCode(username, b.TOTPCode) {
			authTracker.recordTOTPFail(username)
			writeGoogleJSON(w, http.StatusUnauthorized, googleOutcome{Status: "totp_required", Error: "2FA code required or invalid"})
			return
		}
		authTracker.recordTOTPSuccess(username)
	}
	if other := s.userByGoogleSub(gt.sub); other != "" && other != username {
		s.dropGoogleTicket(gt)
		writeGoogleJSON(w, http.StatusConflict, googleFail(0, "That Google account is already connected to a different Phaze account."))
		return
	}
	// The password proved the account and Google proved the address, so a
	// still-unverified address is verified now.
	if _, err := s.DB.Exec(`UPDATE users SET google_sub = ?, google_email = ?, is_verified = 1, verification_code = NULL WHERE username = ?`,
		gt.sub, gt.email, username); err != nil {
		writeGoogleJSON(w, http.StatusInternalServerError, googleFail(0, "Couldn't connect Google. Try again."))
		return
	}
	s.dropGoogleTicket(gt)
	log.Printf("[google] %s linked a Google account at sign-in", username)
	s.finishGoogleStep(w, r, b, username)
}

// googleTOTPHandler finishes a Google sign-in for an account with 2FA on.
func (s *NexusServer) googleTOTPHandler(w http.ResponseWriter, r *http.Request) {
	b, ok := readGoogleStep(w, r)
	if !ok {
		return
	}
	gt, ok := s.loadGoogleTicket(b.Ticket, "totp")
	if !ok || s.userByGoogleSub(gt.sub) != gt.username {
		writeGoogleJSON(w, http.StatusUnauthorized, googleFail(0, googleExpiredMsg))
		return
	}
	username := gt.username
	if authTracker.isTOTPThrottled(username) {
		writeGoogleJSON(w, http.StatusTooManyRequests, googleFail(0, "Too many 2FA attempts — wait a few minutes"))
		return
	}
	if !s.verifyTOTP(username, strings.TrimSpace(b.TOTPCode)) && !s.consumeBackupCode(username, strings.TrimSpace(b.TOTPCode)) {
		authTracker.recordTOTPFail(username)
		s.failGoogleTicket(gt)
		writeGoogleJSON(w, http.StatusUnauthorized, googleOutcome{Status: "totp_required", Error: "That code didn't work. Try again."})
		return
	}
	authTracker.recordTOTPSuccess(username)
	if banned, _ := s.userBanInfo(username); banned {
		writeGoogleJSON(w, http.StatusForbidden, googleFail(0, "Account suspended"))
		return
	}
	s.dropGoogleTicket(gt)
	s.finishGoogleStep(w, r, b, username)
}

// googleStatusHandler reports the signed-in account's Google link.
func (s *NexusServer) googleStatusHandler(w http.ResponseWriter, r *http.Request) {
	username := s.sessionUsername(tokenFromRequest(r))
	if username == "" {
		http.Error(w, "not authenticated", http.StatusUnauthorized)
		return
	}
	var sub, email string
	var pwSet int
	s.DB.QueryRow(`SELECT COALESCE(google_sub, ''), COALESCE(google_email, ''), COALESCE(password_set, 1) FROM users WHERE username = ?`, username).
		Scan(&sub, &email, &pwSet)
	writeGoogleJSON(w, http.StatusOK, map[string]any{
		"enabled":      googleWebEnabled() || googleAppEnabled(),
		"linked":       sub != "",
		"email":        email,
		"password_set": pwSet != 0,
	})
}

// googleUnlinkHandler disconnects Google from the signed-in account.
func (s *NexusServer) googleUnlinkHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "POST required", http.StatusMethodNotAllowed)
		return
	}
	username := s.sessionUsername(tokenFromRequest(r))
	if username == "" {
		http.Error(w, "not authenticated", http.StatusUnauthorized)
		return
	}
	var pwSet int
	s.DB.QueryRow(`SELECT COALESCE(password_set, 1) FROM users WHERE username = ?`, username).Scan(&pwSet)
	if pwSet == 0 {
		writeGoogleJSON(w, http.StatusConflict, googleFail(0,
			"Set a password first, or you'd have no way to sign in. Sign out and use \"Forgot password?\" to get a link by email."))
		return
	}
	if _, err := s.DB.Exec(`UPDATE users SET google_sub = NULL, google_email = '' WHERE username = ?`, username); err != nil {
		writeGoogleJSON(w, http.StatusInternalServerError, googleFail(0, "Couldn't disconnect Google. Try again."))
		return
	}
	log.Printf("[google] %s disconnected Google", username)
	writeGoogleJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// registerGoogleRoutes wires the handlers onto a mux; wrap applies the
// server's usual rate limit and headers in production.
func (s *NexusServer) registerGoogleRoutes(handle func(string, func(http.ResponseWriter, *http.Request)), wrap func(http.HandlerFunc) http.HandlerFunc) {
	handle("/api/v1/auth/google/config", wrap(s.googleConfigHandler))
	handle("/api/v1/auth/google/start", wrap(s.googleStartHandler))
	handle("/api/v1/auth/google/callback", wrap(s.googleCallbackHandler))
	handle("/api/v1/auth/google/nonce", wrap(s.googleNonceHandler))
	handle("/api/v1/auth/google/idtoken", wrap(s.googleIDTokenHandler))
	handle("/api/v1/auth/google/register", wrap(s.googleRegisterHandler))
	handle("/api/v1/auth/google/link", wrap(s.googleLinkHandler))
	handle("/api/v1/auth/google/totp", wrap(s.googleTOTPHandler))
	handle("/api/v1/auth/google/status", wrap(s.googleStatusHandler))
	handle("/api/v1/auth/google/unlink", wrap(s.googleUnlinkHandler))
}
