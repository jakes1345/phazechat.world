package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"image"
	"image/color"
	"image/png"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/johannesboyne/gofakes3"
	"github.com/johannesboyne/gofakes3/backend/s3mem"
)

// newFakeS3Store runs an in-memory S3 server and returns a store pointed at
// it, so the S3 path is exercised with real signed HTTP requests.
func newFakeS3Store(t *testing.T) *s3BlobStore {
	t.Helper()
	backend := s3mem.New()
	if err := backend.CreateBucket("phaze"); err != nil {
		t.Fatal(err)
	}
	hs := httptest.NewServer(gofakes3.New(backend).Server())
	t.Cleanup(hs.Close)
	s, err := newS3BlobStore(hs.URL, "auto", "phaze", "key", "secret")
	if err != nil {
		t.Fatal(err)
	}
	return s
}

func tempDiskStore(t *testing.T) diskBlobStore {
	root := t.TempDir()
	return diskBlobStore{dirFor: func(prefix string) string { return filepath.Join(root, prefix) }}
}

func eachStore(t *testing.T, fn func(t *testing.T, store blobStore)) {
	t.Run("disk", func(t *testing.T) { fn(t, tempDiskStore(t)) })
	t.Run("s3", func(t *testing.T) { fn(t, newFakeS3Store(t)) })
}

func TestBlobStore_RoundTripAndDelete(t *testing.T) {
	eachStore(t, func(t *testing.T, store blobStore) {
		ctx := context.Background()
		if _, _, err := store.Open(ctx, "uploads/missing.png"); !errors.Is(err, errBlobNotFound) {
			t.Fatalf("missing: %v", err)
		}
		body := []byte("hello phaze")
		if err := store.Put(ctx, "uploads/a.txt", bytes.NewReader(body), int64(len(body)), "text/plain"); err != nil {
			t.Fatal(err)
		}
		f, info, err := store.Open(ctx, "uploads/a.txt")
		if err != nil {
			t.Fatal(err)
		}
		got, _ := io.ReadAll(f)
		f.Close()
		if !bytes.Equal(got, body) || info.Size != int64(len(body)) {
			t.Fatalf("got %q size %d", got, info.Size)
		}
		// Overwrite replaces, which avatars rely on.
		if err := store.Put(ctx, "uploads/a.txt", strings.NewReader("v2"), 2, "text/plain"); err != nil {
			t.Fatal(err)
		}
		f, _, _ = store.Open(ctx, "uploads/a.txt")
		got, _ = io.ReadAll(f)
		f.Close()
		if string(got) != "v2" {
			t.Fatalf("after overwrite: %q", got)
		}
		if err := store.Delete(ctx, "uploads/a.txt"); err != nil {
			t.Fatal(err)
		}
		if _, _, err := store.Open(ctx, "uploads/a.txt"); !errors.Is(err, errBlobNotFound) {
			t.Fatalf("after delete: %v", err)
		}
	})
}

func TestDiskBlobStore_RejectsTraversal(t *testing.T) {
	store := tempDiskStore(t)
	for _, key := range []string{"uploads/../x", "uploads/a/b", "uploads/", "noprefix", "uploads/.."} {
		if err := store.Put(context.Background(), key, strings.NewReader("x"), 1, ""); err == nil {
			t.Errorf("Put(%q) accepted", key)
		}
	}
}

func TestBlobStoreFromEnv(t *testing.T) {
	t.Setenv("PHAZE_BLOB_STORE", "")
	if b, err := blobStoreFromEnv(); err != nil {
		t.Fatal(err)
	} else if _, ok := b.(diskBlobStore); !ok {
		t.Fatalf("default = %T", b)
	}

	// s3 with missing settings must refuse, never fall back to disk.
	t.Setenv("PHAZE_BLOB_STORE", "s3")
	for _, k := range []string{"BUCKET_NAME", "LITESTREAM_BUCKET", "AWS_ENDPOINT_URL_S3", "AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY"} {
		t.Setenv(k, "")
	}
	if _, err := blobStoreFromEnv(); err == nil {
		t.Fatal("incomplete s3 config accepted")
	}

	t.Setenv("LITESTREAM_BUCKET", "phaze")
	t.Setenv("AWS_ENDPOINT_URL_S3", "https://acct.r2.cloudflarestorage.com")
	t.Setenv("AWS_ACCESS_KEY_ID", "k")
	t.Setenv("AWS_SECRET_ACCESS_KEY", "s")
	t.Setenv("AWS_REGION", "auto")
	b, err := blobStoreFromEnv()
	if err != nil {
		t.Fatal(err)
	}
	if s3, ok := b.(*s3BlobStore); !ok || s3.bucket != "phaze" {
		t.Fatalf("got %T %+v", b, b)
	}

	t.Setenv("PHAZE_BLOB_STORE", "ftp")
	if _, err := blobStoreFromEnv(); err == nil {
		t.Fatal("unknown mode accepted")
	}
}

// useBlobs swaps the process-wide store for one test.
func useBlobs(t *testing.T, store blobStore) {
	t.Helper()
	blobs() // settle the Once so it can't overwrite the swap later
	prev := blobsImpl
	blobsImpl = store
	t.Cleanup(func() { blobsImpl = prev })
}

func testPNG(t *testing.T) []byte {
	t.Helper()
	img := image.NewRGBA(image.Rect(0, 0, 4, 4))
	img.Set(1, 1, color.RGBA{255, 0, 0, 255})
	var buf bytes.Buffer
	if err := png.Encode(&buf, img); err != nil {
		t.Fatal(err)
	}
	return buf.Bytes()
}

// Uploads and avatars go through the handlers into whichever store is
// configured and come back out byte for byte.
func TestUploadsAndAvatars_ThroughHandlers(t *testing.T) {
	eachStore(t, func(t *testing.T, store blobStore) {
		useBlobs(t, store)
		srv, _, _ := newTestServer(t)
		registerAndVerify(t, srv, "alice", "correct-horse-1")
		token, err := srv.issueSessionToken("alice", "test")
		if err != nil {
			t.Fatal(err)
		}
		pic := testPNG(t)

		var form bytes.Buffer
		mw := multipart.NewWriter(&form)
		fw, _ := mw.CreateFormFile("file", "dot.png")
		fw.Write(pic)
		mw.Close()
		req := httptest.NewRequest(http.MethodPost, "/api/v1/upload", &form)
		req.Header.Set("Content-Type", mw.FormDataContentType())
		req.Header.Set("Authorization", "Bearer "+token)
		rec := httptest.NewRecorder()
		srv.uploadHandler(rec, req)
		if rec.Code != http.StatusOK {
			t.Fatalf("upload: %d %s", rec.Code, rec.Body)
		}
		var up struct{ URL string }
		json.NewDecoder(rec.Body).Decode(&up)
		if !strings.HasPrefix(up.URL, "/uploads/") {
			t.Fatalf("url %q", up.URL)
		}

		rec = httptest.NewRecorder()
		srv.uploadsServeHandler(rec, httptest.NewRequest(http.MethodGet, up.URL, nil))
		if rec.Code != http.StatusOK || !bytes.Equal(rec.Body.Bytes(), pic) {
			t.Fatalf("serve upload: %d, %d bytes", rec.Code, rec.Body.Len())
		}
		if ct := rec.Header().Get("Content-Type"); ct != "image/png" {
			t.Fatalf("content type %q", ct)
		}

		rec = httptest.NewRecorder()
		srv.uploadsServeHandler(rec, httptest.NewRequest(http.MethodGet, "/uploads/nope.png", nil))
		if rec.Code != http.StatusNotFound {
			t.Fatalf("missing upload: %d", rec.Code)
		}

		req = httptest.NewRequest(http.MethodPost, "/api/v1/avatars", bytes.NewReader(pic))
		req.Header.Set("Authorization", "Bearer "+token)
		rec = httptest.NewRecorder()
		srv.avatarUploadHandler(rec, req)
		if rec.Code != http.StatusOK {
			t.Fatalf("avatar upload: %d %s", rec.Code, rec.Body)
		}
		rec = httptest.NewRecorder()
		srv.avatarHandler(rec, httptest.NewRequest(http.MethodGet, "/api/v1/avatars/alice", nil))
		if rec.Code != http.StatusOK {
			t.Fatalf("avatar get: %d", rec.Code)
		}
		if _, err := png.Decode(bytes.NewReader(rec.Body.Bytes())); err != nil {
			t.Fatalf("avatar not a png: %v", err)
		}
		rec = httptest.NewRecorder()
		srv.avatarHandler(rec, httptest.NewRequest(http.MethodGet, "/api/v1/avatars/bob", nil))
		if rec.Code != http.StatusNotFound {
			t.Fatalf("missing avatar: %d", rec.Code)
		}
	})
}

// Nothing in the s3 path may touch local disk: on Cloudflare it is wiped.
func TestUploads_S3ModeWritesNothingLocally(t *testing.T) {
	dir := t.TempDir()
	t.Chdir(dir)
	t.Setenv("PHAZE_UPLOAD_DIR", filepath.Join(dir, "uploads"))
	useBlobs(t, newFakeS3Store(t))
	srv, _, _ := newTestServer(t)
	registerAndVerify(t, srv, "alice", "correct-horse-1")
	token, _ := srv.issueSessionToken("alice", "test")
	req := httptest.NewRequest(http.MethodPost, "/api/v1/avatars", bytes.NewReader(testPNG(t)))
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()
	srv.avatarUploadHandler(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("avatar upload: %d", rec.Code)
	}
	for _, p := range []string{"avatars", "uploads"} {
		if _, err := os.Stat(filepath.Join(dir, p)); !errors.Is(err, os.ErrNotExist) {
			t.Fatalf("%s created on local disk", p)
		}
	}
}
