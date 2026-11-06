package main

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

// With a release APK published, /downloads/Phaze.apk sends people to it.
func TestApkDownloadPrefersReleaseAsset(t *testing.T) {
	updates.mu.Lock()
	prev, prevExp := updates.manifest, updates.expires
	updates.manifest = UpdateManifest{RefreshedAt: time.Now().Unix(), Platforms: map[string]PlatformAsset{
		"android": {URL: "https://github.com/jakes1345/phazechat.world/releases/download/v1.6.6/Phaze.apk"},
	}}
	updates.expires = time.Now().Add(time.Minute)
	updates.mu.Unlock()
	defer func() {
		updates.mu.Lock()
		updates.manifest, updates.expires = prev, prevExp
		updates.mu.Unlock()
	}()

	rec := httptest.NewRecorder()
	(&NexusServer{}).fileDownloadHandler(rec, httptest.NewRequest(http.MethodGet, "/downloads/Phaze.apk", nil))
	if rec.Code != http.StatusFound || rec.Header().Get("Location") == "" {
		t.Fatalf("expected a redirect to the release APK, got %d", rec.Code)
	}
}
