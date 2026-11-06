package main

import (
	"bytes"
	"encoding/binary"
	"hash/crc32"
	"image"
	"image/jpeg"
	"image/png"
	"net/http"
	"net/http/httptest"
	"testing"
)

func pngBytes(t *testing.T) []byte {
	t.Helper()
	var buf bytes.Buffer
	if err := png.Encode(&buf, image.NewRGBA(image.Rect(0, 0, 4, 4))); err != nil {
		t.Fatal(err)
	}
	return buf.Bytes()
}

func jpegBytes(t *testing.T) []byte {
	t.Helper()
	var buf bytes.Buffer
	if err := jpeg.Encode(&buf, image.NewRGBA(image.Rect(0, 0, 4, 4)), nil); err != nil {
		t.Fatal(err)
	}
	return buf.Bytes()
}

func TestValidateAvatar(t *testing.T) {
	if err := validateAvatar(pngBytes(t)); err != nil {
		t.Errorf("png should pass: %v", err)
	}
	if err := validateAvatar(jpegBytes(t)); err != nil {
		t.Errorf("jpeg should pass: %v", err)
	}
	if err := validateAvatar([]byte{}); err == nil {
		t.Error("empty upload must fail")
	}
	if err := validateAvatar([]byte("<svg onload=alert(1)>")); err == nil {
		t.Error("non-image must fail")
	}
	big := make([]byte, maxAvatarBytes+1)
	copy(big, pngBytes(t))
	if err := validateAvatar(big); err == nil {
		t.Error("oversized upload must fail")
	}
}

// A small PNG whose header claims a huge canvas is rejected before decoding,
// so it can't make the server allocate gigabytes.
func TestAvatarUploadRejectsHugeDimensions(t *testing.T) {
	useBlobs(t, tempDiskStore(t))
	srv, _, _ := newTestServer(t)
	registerAndVerify(t, srv, "alice", "correct-horse-1")
	token, err := srv.issueSessionToken("alice", "test")
	if err != nil {
		t.Fatal(err)
	}
	// PNG signature + IHDR declaring 50000x50000 RGBA.
	ihdr := make([]byte, 13)
	binary.BigEndian.PutUint32(ihdr[0:4], 50000)
	binary.BigEndian.PutUint32(ihdr[4:8], 50000)
	ihdr[8], ihdr[9] = 8, 6
	var b bytes.Buffer
	b.Write([]byte("\x89PNG\r\n\x1a\n"))
	binary.Write(&b, binary.BigEndian, uint32(len(ihdr)))
	chunk := append([]byte("IHDR"), ihdr...)
	b.Write(chunk)
	binary.Write(&b, binary.BigEndian, crc32.ChecksumIEEE(chunk))
	b.Write(make([]byte, 64))

	req := httptest.NewRequest(http.MethodPost, "/api/v1/avatars", bytes.NewReader(b.Bytes()))
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()
	srv.avatarUploadHandler(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("huge avatar: got %d %s", rec.Code, rec.Body)
	}
}
