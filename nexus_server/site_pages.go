package main

import (
	"fmt"
	"net/http"
	"path/filepath"
	"strings"
)

// Marketing-site plumbing that isn't a page handler in main.go: the newer
// pages, the sitemap, root-level icon aliases and the www → apex redirect.

// sitemapPages lists every indexable marketing page with the date its
// content last changed meaningfully. Update the date by hand when you edit a
// template; a crawler that sees "today" on every URL learns to ignore it.
var sitemapPages = []struct {
	Path    string
	LastMod string
	Prio    string
}{
	{"/", "2026-11-06", "1.0"},
	{"/skype-alternative", "2026-11-06", "0.9"},
	{"/features", "2026-11-06", "0.8"},
	{"/download", "2026-11-06", "0.8"},
	{"/security", "2026-11-06", "0.6"},
	{"/rates", "2026-11-06", "0.5"},
	{"/about", "2026-11-06", "0.5"},
	{"/support", "2026-11-06", "0.5"},
	{"/privacy", "2026-11-06", "0.3"},
	{"/terms", "2026-11-06", "0.3"},
	{"/legal", "2026-11-06", "0.2"},
}

func sitemapHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/xml; charset=utf-8")
	w.Header().Set("Cache-Control", "public, max-age=86400")
	const base = "https://phazechat.world"
	fmt.Fprint(w, `<?xml version="1.0" encoding="UTF-8"?>`+"\n")
	fmt.Fprint(w, `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`+"\n")
	for _, p := range sitemapPages {
		fmt.Fprintf(w, "<url><loc>%s%s</loc><lastmod>%s</lastmod><priority>%s</priority></url>\n", base, p.Path, p.LastMod, p.Prio)
	}
	fmt.Fprint(w, `</urlset>`)
}

// staticPage serves one template file for an exact path.
func staticPage(file string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		http.ServeFile(w, r, filepath.Join("templates", file))
	}
}

// rootIcon serves an icon from public/site/img at a root URL that browsers
// and link unfurlers request without being told to (/favicon.ico,
// /apple-touch-icon.png).
func rootIcon(file string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "public, max-age=604800")
		http.ServeFile(w, r, filepath.Join("public", "site", "img", file))
	}
}

func registerSiteRoutes() {
	http.HandleFunc("/sitemap.xml", sitemapHandler)
	http.HandleFunc("/security", staticPage("security.html"))
	http.HandleFunc("/skype-alternative", staticPage("skype-alternative.html"))
	http.HandleFunc("/favicon.ico", rootIcon("favicon.ico"))
	http.HandleFunc("/apple-touch-icon.png", rootIcon("apple-touch-icon.png"))
}

// canonicalHost permanently redirects www.phazechat.world to the apex
// domain, keeping path and query. Only that exact host is touched, so local
// development, self-hosted instances and health checks are unaffected.
func canonicalHost(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		host := strings.ToLower(r.Host)
		if h, _, ok := strings.Cut(host, ":"); ok {
			host = h
		}
		if host == "www.phazechat.world" {
			http.Redirect(w, r, "https://phazechat.world"+r.URL.RequestURI(), http.StatusMovedPermanently)
			return
		}
		next.ServeHTTP(w, r)
	})
}
