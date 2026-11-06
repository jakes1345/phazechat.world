package main

import (
	"fmt"
	"log"
	"net/http"
	"os"
	"sort"
	"sync"
	"time"
)

// Self-hosted status page. Two pieces:
//   1. /status — public HTML page that shows the current health snapshot +
//      a 24h sparkline of recent health probes.
//   2. A background self-prober that snapshots /health every minute and
//      retains rolling 24h history in memory. Cheaper than UptimeRobot
//      for our scale and never blocks user-facing requests.
//
// Persistent uptime tracking (multi-week, post-restart) needs a DB row.
// v1 keeps it in-memory; reboots reset history. Good enough for the
// "is it up right now / has it been flapping today" question.

type healthSample struct {
	at time.Time
	ok bool
}

var (
	healthHistMu sync.Mutex
	healthHist   []healthSample // last ~1440 samples = 24h at 1/min
)

const healthHistMax = 1440

func recordHealth(ok bool) {
	healthHistMu.Lock()
	defer healthHistMu.Unlock()
	healthHist = append(healthHist, healthSample{at: time.Now().UTC(), ok: ok})
	if len(healthHist) > healthHistMax {
		healthHist = healthHist[len(healthHist)-healthHistMax:]
	}
}

func currentHealthSummary() (uptimePct float64, lastDown time.Time, total int) {
	healthHistMu.Lock()
	defer healthHistMu.Unlock()
	if len(healthHist) == 0 {
		return 100.0, time.Time{}, 0
	}
	okCount := 0
	for _, s := range healthHist {
		if s.ok {
			okCount++
		} else {
			lastDown = s.at
		}
	}
	uptimePct = float64(okCount) / float64(len(healthHist)) * 100
	total = len(healthHist)
	return
}

func healthHistorySnapshot() []healthSample {
	healthHistMu.Lock()
	defer healthHistMu.Unlock()
	out := make([]healthSample, len(healthHist))
	copy(out, healthHist)
	sort.Slice(out, func(i, j int) bool { return out[i].at.Before(out[j].at) })
	return out
}

// startStatusProber starts a 1-minute self-prober that hits /health and
// records the result. Logs degraded transitions so Sentry / log analytics
// alerts can fire on them.
func (s *NexusServer) startStatusProber() {
	go func() {
		t := time.NewTicker(60 * time.Second)
		defer t.Stop()
		// First probe fires before the listener has finished binding —
		// record it without logging so boot doesn't look like a false alert.
		lastOK := s.probeSelf()
		recordHealth(lastOK)
		for {
			<-t.C
			ok := s.probeSelf()
			recordHealth(ok)
			if ok != lastOK {
				if ok {
					log.Printf("[status] recovered: health passing")
				} else {
					log.Printf("[status] DEGRADED: health probe failed")
				}
				lastOK = ok
			}
		}
	}()
}

func (s *NexusServer) probeSelf() bool {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	client := &http.Client{Timeout: 5 * time.Second}
	resp, err := client.Get("http://127.0.0.1:" + port + "/health")
	if err != nil || resp == nil {
		return false
	}
	defer resp.Body.Close()
	return resp.StatusCode >= 200 && resp.StatusCode < 300
}

func (s *NexusServer) statusPageHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("Cache-Control", "no-cache")
	// rateLimit sets "default-src 'none'", which would block this page's
	// inline <style>. Replace it with a policy that allows exactly that,
	// plus the same-origin favicon and nothing else.
	w.Header().Set("Content-Security-Policy",
		"default-src 'none'; style-src 'unsafe-inline'; img-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'")
	uptime, lastDown, total := currentHealthSummary()
	hist := healthHistorySnapshot()

	// Build sparkline bars. Each bar = 1 sample (1 min). Green = ok, red = down.
	var bars string
	for _, s := range hist {
		cls := "ok"
		if !s.ok {
			cls = "down"
		}
		bars += `<span class="bar ` + cls + `" title="` + s.at.Format(time.RFC3339) + `"></span>`
	}

	state := "All systems operational"
	stateCls := "ok"
	if total > 0 && uptime < 99.0 {
		state = "Recent incidents — see below"
		stateCls = "warn"
	}
	if total > 0 && uptime < 95.0 {
		state = "Service degraded"
		stateCls = "down"
	}

	lastDownStr := "No outages recorded in current window."
	if !lastDown.IsZero() {
		lastDownStr = "Last down: " + lastDown.Format("2006-01-02 15:04 UTC")
	}

	fmt.Fprintf(w, `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Service Status | Phaze</title>
<meta name="description" content="Live health of the phazechat.world server, checked every minute.">
<meta name="robots" content="noindex">
<link rel="icon" href="/public/site/img/favicon.ico" sizes="any">
<style>
*{box-sizing:border-box}
body{margin:0;font-family:Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;background:#F5F9FC;color:#13222C;line-height:1.6;-webkit-font-smoothing:antialiased}
a{color:#0077B3}
.wrap{max-width:760px;margin:0 auto;padding:40px 20px 56px}
.top{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:28px}
.brand{display:inline-flex;align-items:center;gap:10px;font-weight:800;font-size:1.1rem;color:#13222C;text-decoration:none}
.brand img{width:28px;height:28px}
h1{margin:0 0 4px;font-size:1.7rem;letter-spacing:-.02em}
.muted{color:#4E6372;font-size:.92rem}
.badge{display:inline-flex;align-items:center;gap:8px;padding:7px 14px;border-radius:999px;font-weight:700;font-size:.86rem;border:1px solid}
.badge::before{content:"";width:9px;height:9px;border-radius:50%%;background:currentColor}
.badge.ok{background:#E4F5EA;color:#157F3B;border-color:#BFE5CB}
.badge.warn{background:#FFF3DC;color:#8A5200;border-color:#F3D9A4}
.badge.down{background:#FDECEA;color:#B42318;border-color:#F5C2BC}
.card{background:#fff;border:1px solid #DCE6EE;border-radius:14px;padding:22px;margin-top:16px;box-shadow:0 1px 2px rgba(16,42,60,.06)}
.card h2{margin:0 0 10px;font-size:.78rem;color:#4E6372;text-transform:uppercase;letter-spacing:.1em}
.metric{font-size:2.4rem;font-weight:800;letter-spacing:-.02em}
.sparkline{display:flex;gap:1px;margin-top:14px;height:34px;align-items:end}
.bar{flex:1;min-width:1px;background:#22A355;border-radius:1px;height:100%%}
.bar.down{background:#D92D20}
.empty{margin-top:14px;padding:14px;color:#4E6372;text-align:center;font-size:.92rem;background:#F5F9FC;border-radius:10px}
.axis{display:flex;justify-content:space-between;margin-top:6px;font-size:.78rem;color:#6B7F8D}
code{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:.86em;background:#EDF4F9;border:1px solid #DCE6EE;padding:.05em .35em;border-radius:6px;word-break:break-all}
p{margin:0}
p+p{margin-top:8px}
footer{margin-top:28px;text-align:center;color:#4E6372;font-size:.86rem}
</style></head>
<body><div class="wrap">
<div class="top"><a class="brand" href="/"><img src="/public/site/img/logo-64.png" width="28" height="28" alt=""> Phaze</a><a href="/support">Support</a></div>
<h1>Service status</h1>
<p class="muted">phazechat.world</p>
<div class="card">
  <span class="badge %s">%s</span>
</div>
<div class="card">
  <h2>Uptime, last 24 hours</h2>
  <div class="metric">%.2f%%</div>
  <p class="muted">%s</p>
  %s
</div>
<div class="card">
  <h2>How this is measured</h2>
  <p>The server requests its own <code>/health</code> endpoint every 60 seconds. Each bar above is one check: green passed, red failed.</p>
  <p class="muted">Checks in this window: %d. History resets when the server restarts.</p>
</div>
<footer>Hosted on Cloudflare &middot; <a href="/">Back to Phaze</a></footer>
</div></body></html>`,
		stateCls, state, uptime, lastDownStr,
		func() string {
			if total == 0 {
				return `<div class="empty" style="margin-top:14px">No samples yet — try again in a minute.</div>`
			}
			return `<div class="sparkline" role="img" aria-label="Health check results for the last 24 hours">` + bars + `</div><div class="axis"><span>Oldest check</span><span>Latest</span></div>`
		}(),
		total)
}

func (s *NexusServer) initStatusPage() {
	s.startStatusProber()
	http.HandleFunc("/status", rateLimit(s.statusPageHandler))
	http.HandleFunc("/status/", rateLimit(s.statusPageHandler))
}
