package main

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"
)

// Response shape as documented for
// POST /v1/turn/keys/{id}/credentials/generate-ice-servers.
const cfTURNResponse = `{
  "iceServers": [
    {"urls": ["stun:stun.cloudflare.com:3478", "stun:stun.cloudflare.com:53"]},
    {
      "urls": [
        "turn:turn.cloudflare.com:3478?transport=udp",
        "turn:turn.cloudflare.com:53?transport=udp",
        "turn:turn.cloudflare.com:3478?transport=tcp",
        "turn:turn.cloudflare.com:80?transport=tcp",
        "turns:turn.cloudflare.com:5349?transport=tcp",
        "turns:turn.cloudflare.com:443?transport=tcp"
      ],
      "username": "bc91b63e2b5d759f8eb9f3b58062439e0a0e15893d76317d833265ad08d6631099ce7c7087caabb31ad3e1c386424e3e",
      "credential": "ebd71f1d3edbc2b0edae3cd5a6d82284aeb5c3b8fdaa9b8e3bf9cec683e0d45fe9f5b44e5145db3300f06c250a15b4a0"
    }
  ]
}`

func newTestCFTURN(t *testing.T, handler http.HandlerFunc) (*cfTURN, *time.Time) {
	t.Helper()
	srv := httptest.NewServer(handler)
	t.Cleanup(srv.Close)
	now := time.Date(2026, 11, 6, 8, 0, 0, 0, time.UTC)
	c := &cfTURN{
		keyID:    "key-123",
		apiToken: "token-abc",
		endpoint: srv.URL + "/v1/turn/keys/%s/credentials/generate-ice-servers",
		client:   srv.Client(),
		now:      func() time.Time { return now },
	}
	return c, &now
}

func TestCFTURNFetchesAndFlattens(t *testing.T) {
	var gotAuth, gotPath string
	var gotTTL int64
	c, _ := newTestCFTURN(t, func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			t.Errorf("method = %s, want POST", r.Method)
		}
		gotAuth = r.Header.Get("Authorization")
		gotPath = r.URL.Path
		var body struct{ TTL int64 }
		json.NewDecoder(r.Body).Decode(&body)
		gotTTL = body.TTL
		w.WriteHeader(http.StatusCreated)
		w.Write([]byte(cfTURNResponse))
	})

	cfg := c.Config(context.Background())
	if cfg == nil {
		t.Fatal("Config returned nil")
	}
	if gotAuth != "Bearer token-abc" {
		t.Errorf("Authorization = %q", gotAuth)
	}
	if gotPath != "/v1/turn/keys/key-123/credentials/generate-ice-servers" {
		t.Errorf("path = %q", gotPath)
	}
	if gotTTL != int64(cfTURNTTL/time.Second) {
		t.Errorf("ttl = %d", gotTTL)
	}
	if cfg.URL != "turn:turn.cloudflare.com:3478?transport=udp" {
		t.Errorf("URL = %q", cfg.URL)
	}
	want := []string{
		"turn:turn.cloudflare.com:3478?transport=tcp",
		"turn:turn.cloudflare.com:80?transport=tcp",
		"turns:turn.cloudflare.com:5349?transport=tcp",
		"turns:turn.cloudflare.com:443?transport=tcp",
		"stun:stun.cloudflare.com:3478",
	}
	if len(cfg.URLs) != len(want) {
		t.Fatalf("URLs = %v, want %v", cfg.URLs, want)
	}
	for i := range want {
		if cfg.URLs[i] != want[i] {
			t.Errorf("URLs[%d] = %q, want %q", i, cfg.URLs[i], want[i])
		}
	}
	if cfg.Username == "" || cfg.Password == "" {
		t.Error("credentials missing")
	}
}

func TestCFTURNCachesAndRefreshesBeforeExpiry(t *testing.T) {
	var calls atomic.Int32
	c, now := newTestCFTURN(t, func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		w.WriteHeader(http.StatusCreated)
		w.Write([]byte(cfTURNResponse))
	})

	c.Config(context.Background())
	c.Config(context.Background())
	if n := calls.Load(); n != 1 {
		t.Fatalf("calls after two Config = %d, want 1 (cached)", n)
	}

	// Inside the refresh window: still served from cache, refreshed in the background.
	*now = now.Add(cfTURNTTL - cfTURNRefreshBefore + time.Minute)
	if c.Config(context.Background()) == nil {
		t.Fatal("cached config not returned during refresh window")
	}
	deadline := time.Now().Add(2 * time.Second)
	for calls.Load() < 2 && time.Now().Before(deadline) {
		time.Sleep(5 * time.Millisecond)
	}
	if n := calls.Load(); n != 2 {
		t.Fatalf("calls after refresh window = %d, want 2", n)
	}
}

func TestCFTURNFailureBacksOff(t *testing.T) {
	var calls atomic.Int32
	c, now := newTestCFTURN(t, func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		http.Error(w, `{"error":"bad token"}`, http.StatusUnauthorized)
	})

	if c.Config(context.Background()) != nil {
		t.Fatal("expected nil on API error")
	}
	if c.Config(context.Background()) != nil {
		t.Fatal("expected nil while backing off")
	}
	if n := calls.Load(); n != 1 {
		t.Fatalf("calls = %d, want 1 during back-off", n)
	}
	*now = now.Add(cfTURNRetryAfter + time.Second)
	c.Config(context.Background())
	if n := calls.Load(); n != 2 {
		t.Fatalf("calls after back-off = %d, want 2", n)
	}
}

func TestCFTURNKeepsCachedSetWhenRefreshFails(t *testing.T) {
	var fail atomic.Bool
	c, now := newTestCFTURN(t, func(w http.ResponseWriter, r *http.Request) {
		if fail.Load() {
			http.Error(w, "down", http.StatusServiceUnavailable)
			return
		}
		w.WriteHeader(http.StatusCreated)
		w.Write([]byte(cfTURNResponse))
	})
	first := c.Config(context.Background())
	fail.Store(true)
	*now = now.Add(cfTURNTTL - time.Hour)
	if got := c.refresh(context.Background()); got != first {
		t.Fatal("refresh failure should keep the still-valid cached set")
	}
}

func TestTurnConfigFromICERejectsMissingCredentials(t *testing.T) {
	_, err := turnConfigFromICE([]cfICEServer{{URLs: []string{"stun:stun.cloudflare.com:3478"}}})
	if err == nil {
		t.Fatal("expected error with no TURN entry")
	}
}

func TestNewCFTURNFromEnv(t *testing.T) {
	t.Setenv("PHAZE_CF_TURN_KEY_ID", "")
	t.Setenv("PHAZE_CF_TURN_API_TOKEN", "x")
	if newCFTURNFromEnv() != nil {
		t.Fatal("expected nil without key id")
	}
	t.Setenv("PHAZE_CF_TURN_KEY_ID", "k")
	if newCFTURNFromEnv() == nil {
		t.Fatal("expected client when both are set")
	}
}

func TestTurnProviderReportsWhatCallsGet(t *testing.T) {
	savedCF, savedURL, savedUser, savedPass, savedSecret := cloudflareTURN, TurnURL, TurnUsername, TurnPassword, TurnSecret
	t.Cleanup(func() {
		cloudflareTURN, TurnURL, TurnUsername, TurnPassword, TurnSecret = savedCF, savedURL, savedUser, savedPass, savedSecret
	})
	s := &NexusServer{}
	ctx := context.Background()

	cloudflareTURN, TurnURL, TurnUsername, TurnPassword, TurnSecret = nil, "", "", "", ""
	if got := s.turnProvider(ctx); got != "" {
		t.Fatalf("nothing set: provider = %q, want empty", got)
	}

	good, _ := newTestCFTURN(t, func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusCreated)
		w.Write([]byte(cfTURNResponse))
	})
	cloudflareTURN = good
	if got := s.turnProvider(ctx); got != "cloudflare" {
		t.Fatalf("working Cloudflare key: provider = %q, want cloudflare", got)
	}

	bad, _ := newTestCFTURN(t, func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, `{"error":"bad token"}`, http.StatusUnauthorized)
	})
	cloudflareTURN = bad
	if got := s.turnProvider(ctx); got != "" {
		t.Fatalf("rejected Cloudflare key: provider = %q, want empty", got)
	}

	TurnURL, TurnSecret = "turn:example.org:3478", "shared"
	if got := s.turnProvider(ctx); got != "coturn" {
		t.Fatalf("rejected Cloudflare key with coturn set: provider = %q, want coturn", got)
	}
	TurnUsername, TurnPassword = "u", "p"
	if got := s.turnProvider(ctx); got != "static" {
		t.Fatalf("static credentials: provider = %q, want static", got)
	}
}
