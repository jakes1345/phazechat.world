package main

import (
	"bytes"
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// An HTML payload stored under an allowed extension must never be served
// as HTML from our origin.
func TestUploadsServeNeverSniffsHTML(t *testing.T) {
	root := t.TempDir()
	useBlobs(t, diskBlobStore{dirFor: func(prefix string) string { return filepath.Join(root, prefix) }})
	html := []byte("<!doctype html><script>alert(1)</script>")
	for _, name := range []string{"a1b2.heic", "c3d4.txt", "e5f6.png"} {
		if err := blobs().Put(context.Background(), "uploads/"+name, bytes.NewReader(html), int64(len(html)), "text/html"); err != nil {
			t.Fatal(err)
		}
		rec := httptest.NewRecorder()
		(&NexusServer{}).uploadsServeHandler(rec, httptest.NewRequest(http.MethodGet, "/uploads/"+name, nil))
		ct := rec.Header().Get("Content-Type")
		if strings.Contains(ct, "html") {
			t.Fatalf("%s served as %q", name, ct)
		}
		if !strings.Contains(rec.Header().Get("Content-Security-Policy"), "sandbox") {
			t.Fatalf("%s served without sandbox CSP", name)
		}
	}
	rec := httptest.NewRecorder()
	(&NexusServer{}).uploadsServeHandler(rec, httptest.NewRequest(http.MethodGet, "/uploads/x.html", nil))
	if rec.Code != http.StatusNotFound {
		t.Fatalf("disallowed extension served with %d", rec.Code)
	}
}

func TestIsHEIC(t *testing.T) {
	ok := append([]byte{0, 0, 0, 24}, []byte("ftypheic0000")...)
	if !isHEIC(ok) {
		t.Fatal("real HEIC header rejected")
	}
	if isHEIC([]byte("<!doctype html><html>")) {
		t.Fatal("HTML accepted as HEIC")
	}
}

// /public/uploads/... must not bypass uploadsServeHandler.
func TestPublicDoesNotServeUploads(t *testing.T) {
	root := t.TempDir()
	if err := os.MkdirAll(filepath.Join(root, "uploads"), 0o755); err != nil {
		t.Fatal(err)
	}
	os.WriteFile(filepath.Join(root, "uploads", "x.txt"), []byte("<script>"), 0o644)
	os.WriteFile(filepath.Join(root, "ok.txt"), []byte("hi"), 0o644)
	h := publicFilesHandler(http.FileServer(http.Dir(root)))
	for _, p := range []string{"/public/uploads/x.txt", "/public/./uploads/x.txt", "/public/foo/../uploads/x.txt", "/public/uploads/"} {
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, p, nil))
		if rec.Code == http.StatusOK {
			t.Fatalf("%s served from /public/", p)
		}
	}
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/public/ok.txt", nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("other public files must still be served, got %d", rec.Code)
	}
}
