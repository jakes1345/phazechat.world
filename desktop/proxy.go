package main

import (
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"strings"
)

// defaultServer is the Phaze server the desktop app talks to. PHAZE_SERVER
// overrides it (e.g. http://127.0.0.1:8080 for local development).
const defaultServer = "https://phazechat.world"

// proxiedPrefixes are the server paths the embedded web client reaches with
// relative URLs (fetch('/api/...'), <img src="/uploads/...">). The webview
// loads the client from Wails' own asset server, so without this those
// requests would hit the asset server and fail.
var proxiedPrefixes = []string{"/api/", "/uploads/", "/public/", "/downloads/", "/version"}

func serverURL() *url.URL {
	raw := strings.TrimSpace(os.Getenv("PHAZE_SERVER"))
	if raw == "" {
		raw = defaultServer
	}
	u, err := url.Parse(raw)
	if err != nil || u.Scheme == "" || u.Host == "" {
		u, _ = url.Parse(defaultServer)
	}
	return u
}

// newServerProxy forwards the web client's same-origin HTTP calls to the
// Phaze server. Cookies the server sets are rewritten to the webview's own
// origin so the session cookie keeps working on later requests.
func newServerProxy(target *url.URL) http.Handler {
	rp := &httputil.ReverseProxy{
		Rewrite: func(pr *httputil.ProxyRequest) {
			pr.SetURL(target)
			pr.Out.Host = target.Host
			// The server checks Origin on state-changing requests; present
			// the request as coming from the server's own site.
			pr.Out.Header.Del("Origin")
			pr.Out.Header.Del("Referer")
		},
		ModifyResponse: func(resp *http.Response) error {
			cookies := resp.Header.Values("Set-Cookie")
			if len(cookies) == 0 {
				return nil
			}
			resp.Header.Del("Set-Cookie")
			for _, c := range cookies {
				resp.Header.Add("Set-Cookie", stripCookieDomain(c))
			}
			return nil
		},
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !isProxied(r.URL.Path) {
			http.NotFound(w, r)
			return
		}
		rp.ServeHTTP(w, r)
	})
}

func isProxied(path string) bool {
	for _, p := range proxiedPrefixes {
		if path == strings.TrimSuffix(p, "/") || strings.HasPrefix(path, p) {
			return true
		}
	}
	return false
}

// stripCookieDomain drops a Domain attribute so the cookie is stored for the
// webview's origin rather than rejected as belonging to another site.
func stripCookieDomain(c string) string {
	parts := strings.Split(c, ";")
	out := parts[:1]
	for _, p := range parts[1:] {
		if strings.HasPrefix(strings.ToLower(strings.TrimSpace(p)), "domain=") {
			continue
		}
		out = append(out, p)
	}
	return strings.Join(out, ";")
}
