package main

import (
	"crypto"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"io"
	"math/big"
	"net"
	"net/http"
	"net/http/cookiejar"
	"net/http/httptest"
	"net/url"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/pquerna/otp/totp"
	_ "modernc.org/sqlite"
)

const testGoogleClientID = "test-web-client.apps.googleusercontent.com"

// fakeGoogle stands in for accounts.google.com, the token endpoint and the
// key set, signing real RS256 ID tokens with a key generated per test.
type fakeGoogle struct {
	t      *testing.T
	key    *rsa.PrivateKey
	kid    string
	srv    *httptest.Server
	mu     sync.Mutex
	codes  map[string]fakeCode // authorization code -> who signed in
	tokens int
}

type fakeCode struct {
	claims    map[string]any
	challenge string
}

func newFakeGoogle(t *testing.T) *fakeGoogle {
	t.Helper()
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}
	g := &fakeGoogle{t: t, key: key, kid: "test-kid-1", codes: map[string]fakeCode{}}
	mux := http.NewServeMux()
	mux.HandleFunc("/certs", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "public, max-age=3600")
		json.NewEncoder(w).Encode(map[string]any{"keys": []map[string]string{{
			"kid": g.kid, "kty": "RSA", "alg": "RS256", "use": "sig",
			"n": base64.RawURLEncoding.EncodeToString(key.N.Bytes()),
			"e": base64.RawURLEncoding.EncodeToString(big.NewInt(int64(key.E)).Bytes()),
		}}})
	})
	mux.HandleFunc("/token", func(w http.ResponseWriter, r *http.Request) {
		r.ParseForm()
		g.mu.Lock()
		fc, ok := g.codes[r.Form.Get("code")]
		delete(g.codes, r.Form.Get("code"))
		g.tokens++
		g.mu.Unlock()
		if !ok || r.Form.Get("client_id") != testGoogleClientID || r.Form.Get("client_secret") != "test-secret" ||
			r.Form.Get("grant_type") != "authorization_code" || r.Form.Get("redirect_uri") != googleRedirectURI() ||
			pkceChallenge(r.Form.Get("code_verifier")) != fc.challenge {
			w.WriteHeader(http.StatusBadRequest)
			io.WriteString(w, `{"error":"invalid_grant"}`)
			return
		}
		json.NewEncoder(w).Encode(map[string]string{"id_token": g.sign(fc.claims), "access_token": "x", "token_type": "Bearer"})
	})
	g.srv = httptest.NewServer(mux)
	t.Cleanup(g.srv.Close)

	oldAuth, oldTok, oldJWKS := googleAuthEndpoint, googleTokenEndpoint, googleJWKSURL
	googleAuthEndpoint = g.srv.URL + "/auth"
	googleTokenEndpoint = g.srv.URL + "/token"
	googleJWKSURL = g.srv.URL + "/certs"
	googleKeys.reset()
	t.Cleanup(func() {
		googleAuthEndpoint, googleTokenEndpoint, googleJWKSURL = oldAuth, oldTok, oldJWKS
		googleKeys.reset()
	})
	return g
}

func (g *fakeGoogle) sign(claims map[string]any) string {
	return g.signWith(g.key, g.kid, claims)
}

func (g *fakeGoogle) signWith(key *rsa.PrivateKey, kid string, claims map[string]any) string {
	h, _ := json.Marshal(map[string]string{"alg": "RS256", "kid": kid, "typ": "JWT"})
	c, _ := json.Marshal(claims)
	head := base64.RawURLEncoding.EncodeToString(h) + "." + base64.RawURLEncoding.EncodeToString(c)
	sum := sha256.Sum256([]byte(head))
	sig, err := rsa.SignPKCS1v15(rand.Reader, key, crypto.SHA256, sum[:])
	if err != nil {
		g.t.Fatal(err)
	}
	return head + "." + base64.RawURLEncoding.EncodeToString(sig)
}

func googleClaimsFor(sub, email string) map[string]any {
	now := time.Now().Unix()
	return map[string]any{
		"iss": "https://accounts.google.com", "aud": testGoogleClientID, "azp": testGoogleClientID,
		"sub": sub, "email": email, "email_verified": true, "name": "Test Person",
		"iat": now, "exp": now + 3600,
	}
}

type googleHarness struct {
	srv    *NexusServer
	hs     *httptest.Server
	g      *fakeGoogle
	client *http.Client
}

// newGoogleHarness runs the web flow as production does, with no client
// secret (form_post). newGoogleCodeFlowHarness sets one (code + PKCE).
func newGoogleHarness(t *testing.T) *googleHarness {
	t.Helper()
	t.Setenv("PHAZE_GOOGLE_CLIENT_SECRET", "")
	return startGoogleHarness(t)
}

func newGoogleCodeFlowHarness(t *testing.T) *googleHarness {
	t.Helper()
	t.Setenv("PHAZE_GOOGLE_CLIENT_SECRET", "test-secret")
	return startGoogleHarness(t)
}

func startGoogleHarness(t *testing.T) *googleHarness {
	t.Helper()
	t.Setenv("PHAZE_GOOGLE_CLIENT_ID", testGoogleClientID)
	t.Setenv("PHAZE_PUBLIC_URL", "https://phazechat.example")

	// Fresh throttles: the tracker is process-wide and these tests sign
	// up several accounts from 127.0.0.1.
	oldTracker := authTracker
	authTracker = &authFailTracker{
		ipFails: map[string]*authFail{}, userFails: map[string]*authFail{},
		totpFails: map[string]*authFail{}, signupCounts: map[string]*authFail{},
	}
	t.Cleanup(func() { authTracker = oldTracker })
	// No DNS in tests: every test domain has a mail server.
	oldMX := lookupMX
	lookupMX = func(string) ([]*net.MX, error) { return []*net.MX{{Host: "mx.example", Pref: 10}}, nil }
	t.Cleanup(func() { lookupMX = oldMX })

	db, err := sql.Open("sqlite", filepath.Join(t.TempDir(), "google.db"))
	if err != nil {
		t.Fatal(err)
	}
	db.Exec("PRAGMA journal_mode=WAL")
	db.Exec("PRAGMA busy_timeout=5000")
	t.Cleanup(func() { db.Close() })
	srv := &NexusServer{DB: db, Clients: map[string][]*Client{}}
	srv.initDB()

	mux := http.NewServeMux()
	srv.registerGoogleRoutes(mux.HandleFunc, func(h http.HandlerFunc) http.HandlerFunc { return h })
	mux.HandleFunc("/api/v1/auth/me", srv.httpMeHandler)
	mux.HandleFunc("/api/v1/auth/login", srv.httpLoginHandler)
	// TLS, so the client's cookie jar keeps the Secure session cookie.
	hs := httptest.NewTLSServer(mux)
	t.Cleanup(hs.Close)

	client := hs.Client()
	client.Jar, _ = cookiejar.New(nil)
	client.CheckRedirect = func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }
	return &googleHarness{srv: srv, hs: hs, g: newFakeGoogle(t), client: client}
}

var backToAppRe = regexp.MustCompile(`location\.replace\("([^"]*)"\)`)

// webSignIn runs the browser flow: /start, "Google" signs in as claims,
// /callback. Returns the fragment the app is sent to.
func (h *googleHarness) webSignIn(t *testing.T, startQuery string, claims map[string]any) url.Values {
	t.Helper()
	resp, err := h.client.Get(h.hs.URL + "/api/v1/auth/google/start" + startQuery)
	if err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()
	if resp.StatusCode != http.StatusFound {
		t.Fatalf("start: status %d", resp.StatusCode)
	}
	loc, _ := url.Parse(resp.Header.Get("Location"))
	q := loc.Query()
	if !strings.HasPrefix(loc.String(), h.g.srv.URL+"/auth") || q.Get("client_id") != testGoogleClientID ||
		q.Get("scope") != "openid email profile" || q.Get("nonce") == "" ||
		q.Get("redirect_uri") != "https://phazechat.example/api/v1/auth/google/callback" {
		t.Fatalf("unexpected Google URL %s", loc)
	}
	claims["nonce"] = q.Get("nonce")

	if !googleUseCodeFlow() {
		// form_post: Google posts the signed ID token back to the callback.
		if q.Get("response_type") != "id_token" || q.Get("response_mode") != "form_post" || q.Get("code_challenge") != "" {
			t.Fatalf("unexpected form_post Google URL %s", loc)
		}
		resp, err = h.client.PostForm(h.hs.URL+"/api/v1/auth/google/callback", url.Values{"state": {q.Get("state")}, "id_token": {h.g.sign(claims)}})
		if err != nil {
			t.Fatal(err)
		}
		return backToAppFragment(t, resp)
	}

	if q.Get("response_type") != "code" || q.Get("code_challenge_method") != "S256" {
		t.Fatalf("unexpected code-flow Google URL %s", loc)
	}
	code := "code-" + q.Get("state")[:8]
	h.g.mu.Lock()
	h.g.codes[code] = fakeCode{claims: claims, challenge: q.Get("code_challenge")}
	h.g.mu.Unlock()

	resp, err = h.client.Get(h.hs.URL + "/api/v1/auth/google/callback?" + url.Values{"state": {q.Get("state")}, "code": {code}}.Encode())
	if err != nil {
		t.Fatal(err)
	}
	return backToAppFragment(t, resp)
}

func backToAppFragment(t *testing.T, resp *http.Response) url.Values {
	t.Helper()
	body, _ := io.ReadAll(resp.Body)
	resp.Body.Close()
	m := backToAppRe.FindSubmatch(body)
	if m == nil {
		t.Fatalf("callback did not return to the app: %d %s", resp.StatusCode, body)
	}
	var target string
	json.Unmarshal([]byte(`"`+string(m[1])+`"`), &target)
	u, _ := url.Parse(target)
	if u.Path != "/web/" {
		t.Fatalf("back to %q, want /web/", target)
	}
	frag, _ := url.ParseQuery(u.Fragment)
	return frag
}

func (h *googleHarness) postJSON(t *testing.T, path string, body any, bearer string) (int, map[string]any) {
	t.Helper()
	b, _ := json.Marshal(body)
	req, _ := http.NewRequest(http.MethodPost, h.hs.URL+path, strings.NewReader(string(b)))
	req.Header.Set("Content-Type", "application/json")
	if bearer != "" {
		req.Header.Set("Authorization", "Bearer "+bearer)
	}
	resp, err := h.client.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	var out map[string]any
	json.NewDecoder(resp.Body).Decode(&out)
	return resp.StatusCode, out
}

func (h *googleHarness) me(t *testing.T) string {
	t.Helper()
	resp, err := h.client.Get(h.hs.URL + "/api/v1/auth/me")
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return ""
	}
	var out map[string]string
	json.NewDecoder(resp.Body).Decode(&out)
	return out["username"]
}

func (h *googleHarness) signOut() {
	h.client.Jar, _ = cookiejar.New(nil)
}

// makeUser creates a verified password account.
func (h *googleHarness) makeUser(t *testing.T, username, email, password string) {
	t.Helper()
	if _, err := h.srv.registerUser(username, email, "", password); err != nil {
		t.Fatal(err)
	}
	h.srv.DB.Exec("UPDATE users SET is_verified = 1 WHERE username = ?", username)
}

func TestGoogleWeb_NewAccountThenSignInAgain(t *testing.T) {
	newAccountThenSignInAgain(t, newGoogleHarness(t))
}

func TestGoogleWebCodeFlow_NewAccountThenSignInAgain(t *testing.T) {
	newAccountThenSignInAgain(t, newGoogleCodeFlowHarness(t))
}

func newAccountThenSignInAgain(t *testing.T, h *googleHarness) {
	frag := h.webSignIn(t, "?ref=", googleClaimsFor("g-111", "Jane.Doe@Gmail.com"))
	if frag.Get("google") != "username" || frag.Get("ticket") == "" {
		t.Fatalf("fragment = %v, want username step", frag)
	}
	if frag.Get("email") != "jane.doe@gmail.com" || frag.Get("suggest") != "jane.doe" {
		t.Fatalf("email/suggest = %q/%q", frag.Get("email"), frag.Get("suggest"))
	}
	if h.me(t) != "" {
		t.Fatal("signed in before choosing a username")
	}

	code, out := h.postJSON(t, "/api/v1/auth/google/register", map[string]string{"ticket": frag.Get("ticket"), "username": "jane"}, "")
	if code != http.StatusOK || out["status"] != "ok" || out["username"] != "jane" {
		t.Fatalf("register: %d %v", code, out)
	}
	if _, leaked := out["token"]; leaked {
		t.Fatal("web register returned the session token to JavaScript")
	}
	if got := h.me(t); got != "jane" {
		t.Fatalf("me = %q after register", got)
	}
	var verified, pwSet int
	var sub, email, display string
	h.srv.DB.QueryRow("SELECT is_verified, password_set, google_sub, email, display_name FROM users WHERE username='jane'").
		Scan(&verified, &pwSet, &sub, &email, &display)
	if verified != 1 || pwSet != 0 || sub != "g-111" || email != "jane.doe@gmail.com" || display != "Test Person" {
		t.Fatalf("row: verified=%d pwSet=%d sub=%q email=%q display=%q", verified, pwSet, sub, email, display)
	}
	// The placeholder password can't be used to sign in.
	if h.srv.authenticateUser("jane", "") {
		t.Fatal("empty password signs in to a Google-only account")
	}
	// The ticket is spent.
	if code, _ := h.postJSON(t, "/api/v1/auth/google/register", map[string]string{"ticket": frag.Get("ticket"), "username": "jane2"}, ""); code != http.StatusUnauthorized {
		t.Fatalf("ticket reuse: %d", code)
	}

	h.signOut()
	frag = h.webSignIn(t, "", googleClaimsFor("g-111", "jane.doe@gmail.com"))
	if len(frag) != 0 {
		t.Fatalf("second sign-in fragment = %v, want straight in", frag)
	}
	if got := h.me(t); got != "jane" {
		t.Fatalf("me = %q after Google sign-in", got)
	}
}

func TestGoogleWeb_UsernameTaken(t *testing.T) {
	h := newGoogleHarness(t)
	h.makeUser(t, "taken", "someone@example.com", "password123")
	frag := h.webSignIn(t, "", googleClaimsFor("g-1", "new@gmail.com"))
	code, out := h.postJSON(t, "/api/v1/auth/google/register", map[string]string{"ticket": frag.Get("ticket"), "username": "Taken"}, "")
	if code != http.StatusConflict || out["error"] != "Username already taken" {
		t.Fatalf("taken: %d %v", code, out)
	}
	// The ticket survives a taken name, so the person can pick another.
	code, out = h.postJSON(t, "/api/v1/auth/google/register", map[string]string{"ticket": frag.Get("ticket"), "username": "fresh"}, "")
	if code != http.StatusOK || out["username"] != "fresh" {
		t.Fatalf("retry: %d %v", code, out)
	}
}

func TestGoogleWeb_LinkExistingAccountNeedsPassword(t *testing.T) {
	h := newGoogleHarness(t)
	h.makeUser(t, "alice", "Alice@Example.com", "correct horse")

	frag := h.webSignIn(t, "", googleClaimsFor("g-alice", "alice@example.com"))
	if frag.Get("google") != "link" || frag.Get("user") != "alice" {
		t.Fatalf("fragment = %v, want link step for alice", frag)
	}
	ticket := frag.Get("ticket")

	code, _ := h.postJSON(t, "/api/v1/auth/google/link", map[string]string{"ticket": ticket, "username": "alice", "password": "wrong"}, "")
	if code != http.StatusUnauthorized || h.me(t) != "" {
		t.Fatalf("wrong password: %d", code)
	}
	var sub sql.NullString
	h.srv.DB.QueryRow("SELECT google_sub FROM users WHERE username='alice'").Scan(&sub)
	if sub.Valid && sub.String != "" {
		t.Fatal("linked on a wrong password")
	}

	code, out := h.postJSON(t, "/api/v1/auth/google/link", map[string]string{"ticket": ticket, "username": "alice", "password": "correct horse"}, "")
	if code != http.StatusOK || out["username"] != "alice" || h.me(t) != "alice" {
		t.Fatalf("link: %d %v", code, out)
	}

	h.signOut()
	if frag := h.webSignIn(t, "", googleClaimsFor("g-alice", "alice@example.com")); len(frag) != 0 || h.me(t) != "alice" {
		t.Fatalf("after link, Google sign-in: %v", frag)
	}
	// Linking added a door; the password still works.
	if !h.srv.authenticateUser("alice", "correct horse") {
		t.Fatal("password stopped working after linking")
	}
}

func TestGoogleWeb_LinkRefusesAccountWithOtherEmail(t *testing.T) {
	h := newGoogleHarness(t)
	h.makeUser(t, "alice", "alice@example.com", "correct horse")
	h.makeUser(t, "bob", "bob@example.com", "bobs password")
	frag := h.webSignIn(t, "", googleClaimsFor("g-alice", "alice@example.com"))
	// Knowing bob's password doesn't let alice's Google account take bob's.
	code, _ := h.postJSON(t, "/api/v1/auth/google/link", map[string]string{"ticket": frag.Get("ticket"), "username": "bob", "password": "bobs password"}, "")
	if code != http.StatusUnauthorized {
		t.Fatalf("cross-email link: %d", code)
	}
}

func TestGoogleWeb_LinkBurnsTicketAfterFiveWrongPasswords(t *testing.T) {
	h := newGoogleHarness(t)
	h.makeUser(t, "alice", "alice@example.com", "correct horse")
	frag := h.webSignIn(t, "", googleClaimsFor("g-alice", "alice@example.com"))
	for i := 0; i < googleTicketTries; i++ {
		h.postJSON(t, "/api/v1/auth/google/link", map[string]string{"ticket": frag.Get("ticket"), "password": "nope"}, "")
	}
	authTracker.ipFails = map[string]*authFail{} // isolate the ticket limit from the IP throttle
	code, out := h.postJSON(t, "/api/v1/auth/google/link", map[string]string{"ticket": frag.Get("ticket"), "password": "correct horse"}, "")
	if code != http.StatusUnauthorized || out["error"] != googleExpiredMsg {
		t.Fatalf("after %d wrong tries: %d %v", googleTicketTries, code, out)
	}
}

func TestGoogleWeb_TOTPStillRequired(t *testing.T) {
	h := newGoogleHarness(t)
	h.makeUser(t, "carol", "carol@example.com", "carols password")
	h.srv.DB.Exec("UPDATE users SET google_sub = 'g-carol' WHERE username = 'carol'")
	_, secret, err := h.srv.generateTOTPURI("carol")
	if err != nil {
		t.Fatal(err)
	}
	h.srv.DB.Exec("UPDATE users SET totp_secret = ?, totp_enabled = 1 WHERE username = 'carol'", secret)

	frag := h.webSignIn(t, "", googleClaimsFor("g-carol", "carol@gmail.com"))
	if frag.Get("google") != "totp" || h.me(t) != "" {
		t.Fatalf("fragment = %v, want 2FA step", frag)
	}
	if code, _ := h.postJSON(t, "/api/v1/auth/google/totp", map[string]string{"ticket": frag.Get("ticket"), "totp_code": "000000"}, ""); code != http.StatusUnauthorized {
		t.Fatalf("bad code accepted: %d", code)
	}
	good, _ := totp.GenerateCode(secret, time.Now())
	code, out := h.postJSON(t, "/api/v1/auth/google/totp", map[string]string{"ticket": frag.Get("ticket"), "totp_code": good}, "")
	if code != http.StatusOK || h.me(t) != "carol" {
		t.Fatalf("good code: %d %v", code, out)
	}
}

func TestGoogleWeb_BannedAccount(t *testing.T) {
	h := newGoogleHarness(t)
	h.makeUser(t, "dave", "dave@example.com", "daves password")
	h.srv.DB.Exec("UPDATE users SET google_sub = 'g-dave', is_banned = 1, ban_reason = 'spam' WHERE username = 'dave'")
	frag := h.webSignIn(t, "", googleClaimsFor("g-dave", "dave@example.com"))
	if frag.Get("google") != "error" || !strings.Contains(frag.Get("msg"), "suspended") || h.me(t) != "" {
		t.Fatalf("banned: %v", frag)
	}
}

func TestGoogleWeb_FormPostCallbackChecks(t *testing.T) {
	h := newGoogleHarness(t)
	start := func() url.Values {
		resp, err := h.client.Get(h.hs.URL + "/api/v1/auth/google/start")
		if err != nil {
			t.Fatal(err)
		}
		resp.Body.Close()
		for _, c := range resp.Cookies() {
			if c.Name == googleStateCookie && c.SameSite != http.SameSiteNoneMode {
				t.Fatalf("state cookie SameSite = %v, want None for Google's cross-site POST", c.SameSite)
			}
		}
		loc, _ := url.Parse(resp.Header.Get("Location"))
		return loc.Query()
	}
	post := func(form url.Values) url.Values {
		resp, err := h.client.PostForm(h.hs.URL+"/api/v1/auth/google/callback", form)
		if err != nil {
			t.Fatal(err)
		}
		return backToAppFragment(t, resp)
	}
	claims := func(nonce string) map[string]any {
		c := googleClaimsFor("g-fp", "fp@gmail.com")
		c["nonce"] = nonce
		return c
	}

	// No state cookie: another browser, or a forged post.
	h.signOut()
	if frag := post(url.Values{"state": {"abc"}, "id_token": {h.g.sign(claims("x"))}}); frag.Get("google") != "error" {
		t.Fatalf("no cookie: %v", frag)
	}

	// A token for another nonce is refused, and the state is spent.
	q := start()
	if frag := post(url.Values{"state": {q.Get("state")}, "id_token": {h.g.sign(claims("not-the-nonce"))}}); frag.Get("google") != "error" {
		t.Fatalf("nonce mismatch: %v", frag)
	}
	if frag := post(url.Values{"state": {q.Get("state")}, "id_token": {h.g.sign(claims(q.Get("nonce")))}}); frag.Get("google") != "error" {
		t.Fatalf("state reused: %v", frag)
	}

	// A token issued to another app is refused.
	q = start()
	other := claims(q.Get("nonce"))
	other["aud"] = "someone-else.apps.googleusercontent.com"
	if frag := post(url.Values{"state": {q.Get("state")}, "id_token": {h.g.sign(other)}}); frag.Get("google") != "error" {
		t.Fatalf("wrong audience: %v", frag)
	}

	// A form_post request takes no code, and no answer by GET.
	q = start()
	if frag := post(url.Values{"state": {q.Get("state")}, "code": {"c1"}}); frag.Get("google") != "error" {
		t.Fatalf("code on a form_post request: %v", frag)
	}
	q = start()
	resp, _ := h.client.Get(h.hs.URL + "/api/v1/auth/google/callback?" + url.Values{"state": {q.Get("state")}, "id_token": {h.g.sign(claims(q.Get("nonce")))}}.Encode())
	if frag := backToAppFragment(t, resp); frag.Get("google") != "error" {
		t.Fatalf("id_token by GET: %v", frag)
	}

	// Cancel on Google's screen goes quietly back.
	if frag := post(url.Values{"error": {"access_denied"}}); len(frag) != 0 {
		t.Fatalf("cancel: %v", frag)
	}

	// None of that signed anyone in, and every request is spent.
	if h.me(t) != "" {
		t.Fatal("signed in by a refused callback")
	}
	var n int
	h.srv.DB.QueryRow("SELECT COUNT(*) FROM google_auth_requests").Scan(&n)
	if n != 0 {
		t.Fatalf("%d requests left over", n)
	}
	if h.g.tokens != 0 {
		t.Fatalf("form_post called Google's token endpoint %d times", h.g.tokens)
	}
}

func TestGoogleWebCodeFlow_CallbackChecks(t *testing.T) {
	h := newGoogleCodeFlowHarness(t)

	// Callback with no state cookie (another browser, or a forged link).
	resp, err := h.client.Get(h.hs.URL + "/api/v1/auth/google/callback?state=abc&code=xyz")
	if err != nil {
		t.Fatal(err)
	}
	if frag := backToAppFragment(t, resp); frag.Get("google") != "error" {
		t.Fatalf("no cookie: %v", frag)
	}

	// Cancel on Google's screen goes quietly back.
	resp, _ = h.client.Get(h.hs.URL + "/api/v1/auth/google/callback?error=access_denied")
	if frag := backToAppFragment(t, resp); len(frag) != 0 {
		t.Fatalf("cancel: %v", frag)
	}

	// A token whose nonce doesn't match the request is refused.
	claims := googleClaimsFor("g-x", "x@gmail.com")
	resp, _ = h.client.Get(h.hs.URL + "/api/v1/auth/google/start")
	resp.Body.Close()
	loc, _ := url.Parse(resp.Header.Get("Location"))
	claims["nonce"] = "not-the-nonce"
	h.g.codes["c1"] = fakeCode{claims: claims, challenge: loc.Query().Get("code_challenge")}
	resp, _ = h.client.Get(h.hs.URL + "/api/v1/auth/google/callback?state=" + loc.Query().Get("state") + "&code=c1")
	if frag := backToAppFragment(t, resp); frag.Get("google") != "error" {
		t.Fatalf("nonce mismatch: %v", frag)
	}
	// And the state is spent either way.
	var n int
	h.srv.DB.QueryRow("SELECT COUNT(*) FROM google_auth_requests").Scan(&n)
	if n != 0 {
		t.Fatalf("%d requests left over", n)
	}
}

func TestGoogleWeb_ConnectFromSettingsAndUnlink(t *testing.T) {
	h := newGoogleHarness(t)
	h.makeUser(t, "erin", "erin@example.com", "erins password")
	h.makeUser(t, "frank", "frank@example.com", "franks password")
	h.srv.DB.Exec("UPDATE users SET google_sub = 'g-frank' WHERE username = 'frank'")

	if code, _ := h.postJSON(t, "/api/v1/auth/login", map[string]string{"username": "erin", "password": "erins password"}, ""); code != http.StatusOK {
		t.Fatalf("login: %d", code)
	}
	// Someone else's Google account can't be attached.
	if frag := h.webSignIn(t, "?intent=link", googleClaimsFor("g-frank", "frank@gmail.com")); frag.Get("google") != "error" {
		t.Fatalf("connect taken Google account: %v", frag)
	}
	frag := h.webSignIn(t, "?intent=link", googleClaimsFor("g-erin", "erin.personal@gmail.com"))
	if frag.Get("google") != "linked" || frag.Get("email") != "erin.personal@gmail.com" {
		t.Fatalf("connect: %v", frag)
	}

	resp, _ := h.client.Get(h.hs.URL + "/api/v1/auth/google/status")
	var st map[string]any
	json.NewDecoder(resp.Body).Decode(&st)
	resp.Body.Close()
	if st["linked"] != true || st["email"] != "erin.personal@gmail.com" || st["password_set"] != true {
		t.Fatalf("status: %v", st)
	}

	// Google now signs erin in even though the addresses differ.
	h.signOut()
	if frag := h.webSignIn(t, "", googleClaimsFor("g-erin", "erin.personal@gmail.com")); len(frag) != 0 || h.me(t) != "erin" {
		t.Fatalf("sign in after connect: %v", frag)
	}
	if code, _ := h.postJSON(t, "/api/v1/auth/google/unlink", map[string]string{}, ""); code != http.StatusOK {
		t.Fatalf("unlink: %d", code)
	}
	h.signOut()
	if frag := h.webSignIn(t, "", googleClaimsFor("g-erin", "erin.personal@gmail.com")); frag.Get("google") != "username" {
		t.Fatalf("after unlink: %v", frag)
	}
}

func TestGoogleWeb_ConnectNeedsSession(t *testing.T) {
	h := newGoogleHarness(t)
	resp, err := h.client.Get(h.hs.URL + "/api/v1/auth/google/start?intent=link")
	if err != nil {
		t.Fatal(err)
	}
	if frag := backToAppFragment(t, resp); frag.Get("google") != "error" {
		t.Fatalf("connect while signed out: %v", frag)
	}
}

func TestGoogle_GoogleOnlyAccountCannotUnlink(t *testing.T) {
	h := newGoogleHarness(t)
	frag := h.webSignIn(t, "", googleClaimsFor("g-gus", "gus@gmail.com"))
	h.postJSON(t, "/api/v1/auth/google/register", map[string]string{"ticket": frag.Get("ticket"), "username": "gus"}, "")
	if code, _ := h.postJSON(t, "/api/v1/auth/google/unlink", map[string]string{}, ""); code != http.StatusConflict {
		t.Fatalf("unlink with no password: %d", code)
	}
	// After a password reset the account can stand on its own.
	tok, _, err := h.srv.createPasswordReset("gus@gmail.com")
	if err != nil {
		t.Fatal(err)
	}
	if err := h.srv.consumePasswordReset(tok, "a brand new password"); err != nil {
		t.Fatal(err)
	}
	var pwSet int
	h.srv.DB.QueryRow("SELECT password_set FROM users WHERE username='gus'").Scan(&pwSet)
	if pwSet != 1 {
		t.Fatal("password reset didn't mark the password as set")
	}
}

func TestGoogleApp_IDTokenFlow(t *testing.T) {
	h := newGoogleHarness(t)
	getNonce := func() string {
		resp, err := h.client.Get(h.hs.URL + "/api/v1/auth/google/nonce")
		if err != nil {
			t.Fatal(err)
		}
		defer resp.Body.Close()
		var out map[string]string
		json.NewDecoder(resp.Body).Decode(&out)
		if out["client_id"] != testGoogleClientID || out["nonce"] == "" {
			t.Fatalf("nonce: %v", out)
		}
		return out["nonce"]
	}
	signIn := func(claims map[string]any, nonce string) (int, map[string]any) {
		return h.postJSON(t, "/api/v1/auth/google/idtoken", map[string]string{
			"id_token": h.g.sign(claims), "nonce": nonce, "device_info": "android/Pixel"}, "")
	}

	nonce := getNonce()
	claims := googleClaimsFor("g-app", "app.user@gmail.com")
	// Android tokens are issued to the web client, by the Android client.
	claims["azp"] = "android-client.apps.googleusercontent.com"
	claims["nonce"] = nonce
	code, out := signIn(claims, nonce)
	if code != http.StatusOK || out["status"] != "username_required" {
		t.Fatalf("first sign-in: %d %v", code, out)
	}
	code, out = h.postJSON(t, "/api/v1/auth/google/register", map[string]string{
		"ticket": out["ticket"].(string), "username": "appuser", "platform": "app", "device_info": "android/Pixel"}, "")
	if code != http.StatusOK || out["token"] == nil {
		t.Fatalf("register: %d %v", code, out)
	}
	if h.srv.sessionUsername(out["token"].(string)) != "appuser" {
		t.Fatal("app token doesn't sign in")
	}

	// Replaying the same token and nonce fails.
	if code, _ := signIn(claims, nonce); code != http.StatusUnauthorized {
		t.Fatalf("replay: %d", code)
	}

	nonce = getNonce()
	claims["nonce"] = nonce
	code, out = signIn(claims, nonce)
	if code != http.StatusOK || out["status"] != "ok" || h.srv.sessionUsername(out["token"].(string)) != "appuser" {
		t.Fatalf("returning sign-in: %d %v", code, out)
	}

	bad := []struct {
		name  string
		tweak func(map[string]any)
	}{
		{"other audience", func(c map[string]any) { c["aud"] = "someone-elses-app" }},
		{"other issuer", func(c map[string]any) { c["iss"] = "https://evil.example" }},
		{"expired", func(c map[string]any) { c["exp"] = time.Now().Add(-time.Hour).Unix() }},
		{"unverified email", func(c map[string]any) { c["email_verified"] = false }},
		{"no sub", func(c map[string]any) { delete(c, "sub") }},
	}
	for _, tc := range bad {
		nonce := getNonce()
		c := googleClaimsFor("g-app", "app.user@gmail.com")
		c["nonce"] = nonce
		tc.tweak(c)
		if code, _ := signIn(c, nonce); code != http.StatusUnauthorized {
			t.Errorf("%s: status %d, want 401", tc.name, code)
		}
	}

	// Each bad token counts against the IP, like a wrong password; five
	// in a row throttle it. Start the rest from a clean slate.
	if code, _ := signIn(googleClaimsFor("g-app", "app.user@gmail.com"), getNonce()); code != http.StatusTooManyRequests {
		t.Fatalf("after five bad tokens: %d, want 429", code)
	}
	authTracker.ipFails = map[string]*authFail{}

	// A token signed by a key that isn't Google's.
	other, _ := rsa.GenerateKey(rand.Reader, 2048)
	nonce = getNonce()
	c := googleClaimsFor("g-app", "app.user@gmail.com")
	c["nonce"] = nonce
	code, _ = h.postJSON(t, "/api/v1/auth/google/idtoken", map[string]string{"id_token": h.g.signWith(other, h.g.kid, c), "nonce": nonce}, "")
	if code != http.StatusUnauthorized {
		t.Fatalf("forged signature: %d", code)
	}
	// A nonce the server never issued.
	c["nonce"] = "made-up"
	code, _ = h.postJSON(t, "/api/v1/auth/google/idtoken", map[string]string{"id_token": h.g.sign(c), "nonce": "made-up"}, "")
	if code != http.StatusUnauthorized {
		t.Fatalf("unknown nonce: %d", code)
	}
}

func TestGoogle_DisabledWithoutConfig(t *testing.T) {
	h := newGoogleHarness(t)
	t.Setenv("PHAZE_GOOGLE_CLIENT_ID", "")
	resp, _ := h.client.Get(h.hs.URL + "/api/v1/auth/google/config")
	var cfg map[string]any
	json.NewDecoder(resp.Body).Decode(&cfg)
	resp.Body.Close()
	if cfg["web"] != false || cfg["app"] != false {
		t.Fatalf("config: %v", cfg)
	}
	resp, _ = h.client.Get(h.hs.URL + "/api/v1/auth/google/start")
	if frag := backToAppFragment(t, resp); frag.Get("google") != "error" {
		t.Fatalf("start while off: %v", frag)
	}
	if code, _ := h.postJSON(t, "/api/v1/auth/google/idtoken", map[string]string{"id_token": "x", "nonce": "y"}, ""); code != http.StatusServiceUnavailable {
		t.Fatalf("idtoken while off: %d", code)
	}
}

func TestGoogle_DeleteAccountClearsGoogleRows(t *testing.T) {
	h := newGoogleHarness(t)
	frag := h.webSignIn(t, "", googleClaimsFor("g-del", "del@gmail.com"))
	h.postJSON(t, "/api/v1/auth/google/register", map[string]string{"ticket": frag.Get("ticket"), "username": "deleteme"}, "")
	if err := h.srv.deleteAccount("deleteme"); err != nil {
		t.Fatal(err)
	}
	// The Google account is free to start over.
	h.signOut()
	if frag := h.webSignIn(t, "", googleClaimsFor("g-del", "del@gmail.com")); frag.Get("google") != "username" {
		t.Fatalf("after delete: %v", frag)
	}
}
