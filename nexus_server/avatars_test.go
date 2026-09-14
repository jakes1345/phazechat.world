package main

import (
	"bytes"
	"image"
	"image/jpeg"
	"image/png"
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
