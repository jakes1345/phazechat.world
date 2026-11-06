package main

// Cloudflare Realtime TURN.
//
// Set PHAZE_CF_TURN_KEY_ID and PHAZE_CF_TURN_API_TOKEN (from the TURN key
// made under Realtime > TURN Server in the Cloudflare dashboard) and the
// server hands every client short-lived credentials for turn.cloudflare.com.
// Cloudflare runs the relay, so there is no TURN server of our own to host.
//
// One credential set is shared by everyone and refreshed well before it
// expires, so joining a call never waits on Cloudflare's API.

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"strings"
	"sync"
	"time"
)

const (
	cfTURNEndpoint = "https://rtc.live.cloudflare.com/v1/turn/keys/%s/credentials/generate-ice-servers"
	// How long each credential set is valid. Longer than any call, so a call
	// that starts just before a refresh keeps working to the end.
	cfTURNTTL = 48 * time.Hour
	// Fetch a new set once the current one has less than this left.
	cfTURNRefreshBefore = 24 * time.Hour
	// After a failed fetch, wait this long before asking Cloudflare again.
	cfTURNRetryAfter = time.Minute
)

type cfTURN struct {
	keyID    string
	apiToken string
	endpoint string // printf pattern taking the key id; overridable in tests
	client   *http.Client
	now      func() time.Time

	mu         sync.Mutex
	cached     *TurnConfig
	expires    time.Time
	lastFail   time.Time
	refreshing bool
}

func newCFTURNFromEnv() *cfTURN {
	keyID := strings.TrimSpace(os.Getenv("PHAZE_CF_TURN_KEY_ID"))
	token := strings.TrimSpace(os.Getenv("PHAZE_CF_TURN_API_TOKEN"))
	if keyID == "" || token == "" {
		return nil
	}
	return &cfTURN{
		keyID:    keyID,
		apiToken: token,
		endpoint: cfTURNEndpoint,
		client:   &http.Client{Timeout: 10 * time.Second},
		now:      time.Now,
	}
}

var cloudflareTURN = newCFTURNFromEnv()

// Config returns usable TURN settings, or nil when none could be had.
// With a valid set cached it returns at once and refreshes in the background
// when the set is getting old; with nothing usable cached it fetches inline.
func (c *cfTURN) Config(ctx context.Context) *TurnConfig {
	c.mu.Lock()
	now := c.now()
	if c.cached != nil && now.Before(c.expires) {
		cfg := c.cached
		if c.expires.Sub(now) < cfTURNRefreshBefore && !c.refreshing && now.Sub(c.lastFail) > cfTURNRetryAfter {
			c.refreshing = true
			go c.refresh(context.Background())
		}
		c.mu.Unlock()
		return cfg
	}
	if now.Sub(c.lastFail) < cfTURNRetryAfter {
		c.mu.Unlock()
		return nil
	}
	c.mu.Unlock()
	return c.refresh(ctx)
}

func (c *cfTURN) refresh(ctx context.Context) *TurnConfig {
	cfg, err := c.fetch(ctx)
	c.mu.Lock()
	defer c.mu.Unlock()
	c.refreshing = false
	if err != nil {
		c.lastFail = c.now()
		log.Printf("[TURN] Cloudflare credentials: %v", err)
		if c.cached != nil && c.now().Before(c.expires) {
			return c.cached
		}
		return nil
	}
	c.cached = cfg
	c.expires = c.now().Add(cfTURNTTL)
	log.Printf("[TURN] Cloudflare credentials refreshed (valid %v)", cfTURNTTL)
	return cfg
}

type cfICEServer struct {
	URLs       []string `json:"urls"`
	Username   string   `json:"username"`
	Credential string   `json:"credential"`
}

func (c *cfTURN) fetch(ctx context.Context) (*TurnConfig, error) {
	body, _ := json.Marshal(map[string]int64{"ttl": int64(cfTURNTTL / time.Second)})
	endpoint := fmt.Sprintf(c.endpoint, url.PathEscape(c.keyID))
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+c.apiToken)
	req.Header.Set("Content-Type", "application/json")
	resp, err := c.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	raw, err := io.ReadAll(io.LimitReader(resp.Body, 64<<10))
	if err != nil {
		return nil, err
	}
	if resp.StatusCode != http.StatusCreated && resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("HTTP %d: %s", resp.StatusCode, strings.TrimSpace(string(raw)))
	}
	var parsed struct {
		ICEServers []cfICEServer `json:"iceServers"`
	}
	if err := json.Unmarshal(raw, &parsed); err != nil {
		return nil, fmt.Errorf("decoding response: %w", err)
	}
	return turnConfigFromICE(parsed.ICEServers)
}

// turnConfigFromICE flattens Cloudflare's ICE server list into TurnConfig:
// TURN URLs first (the first one becomes URL), then STUN. URLs on port 53
// are dropped because browsers block that port and the attempt only times
// out.
func turnConfigFromICE(servers []cfICEServer) (*TurnConfig, error) {
	var turn, stun []string
	var user, cred string
	for _, s := range servers {
		for _, u := range s.URLs {
			if usesPort53(u) {
				continue
			}
			switch {
			case strings.HasPrefix(u, "turn:"), strings.HasPrefix(u, "turns:"):
				turn = append(turn, u)
				if s.Username != "" {
					user, cred = s.Username, s.Credential
				}
			case strings.HasPrefix(u, "stun:"):
				stun = append(stun, u)
			}
		}
	}
	if len(turn) == 0 || user == "" || cred == "" {
		return nil, errors.New("response has no TURN server with credentials")
	}
	all := append(turn, stun...)
	return &TurnConfig{URL: all[0], URLs: all[1:], Username: user, Password: cred}, nil
}

func usesPort53(iceURL string) bool {
	hostPort := iceURL
	if i := strings.Index(hostPort, ":"); i >= 0 {
		hostPort = hostPort[i+1:]
	}
	if i := strings.Index(hostPort, "?"); i >= 0 {
		hostPort = hostPort[:i]
	}
	return strings.HasSuffix(hostPort, ":53")
}
