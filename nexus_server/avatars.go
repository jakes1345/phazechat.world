package main

import (
	"bytes"
	"errors"
	"image"
	_ "image/jpeg"
	"image/png"
	"io"
	"net/http"
	"os"
	"path/filepath"
)

const maxAvatarBytes = 2 << 20 // 2 MB

// validateAvatar checks size and sniffs the real content type — the file
// extension is never trusted. Returns nil only for PNG/JPEG within the cap.
func validateAvatar(data []byte) error {
	if len(data) == 0 {
		return errors.New("empty upload")
	}
	if len(data) > maxAvatarBytes {
		return errors.New("avatar too large (2 MB max)")
	}
	switch http.DetectContentType(data) {
	case "image/png", "image/jpeg":
		return nil
	}
	return errors.New("avatar must be a PNG or JPEG image")
}

// avatarUploadHandler stores the caller's profile picture as
// avatars/<username>.png. Decode + re-encode strips any non-image payload
// hiding behind a valid header.
func (s *NexusServer) avatarUploadHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "POST required", http.StatusMethodNotAllowed)
		return
	}
	username := s.sessionUsername(tokenFromRequest(r))
	if username == "" {
		http.Error(w, "auth required", http.StatusUnauthorized)
		return
	}
	if banned, _ := s.userBanInfo(username); banned {
		http.Error(w, "account suspended", http.StatusForbidden)
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, maxAvatarBytes+4096)
	data, err := io.ReadAll(r.Body)
	if err != nil {
		http.Error(w, "avatar too large (2 MB max)", http.StatusRequestEntityTooLarge)
		return
	}
	if err := validateAvatar(data); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	img, _, err := image.Decode(bytes.NewReader(data))
	if err != nil {
		http.Error(w, "could not read image", http.StatusBadRequest)
		return
	}

	if err := os.MkdirAll("avatars", 0o755); err != nil {
		http.Error(w, "storage error", http.StatusInternalServerError)
		return
	}
	out, err := os.Create(filepath.Join("avatars", username+".png"))
	if err != nil {
		http.Error(w, "storage error", http.StatusInternalServerError)
		return
	}
	defer out.Close()
	if err := png.Encode(out, img); err != nil {
		http.Error(w, "storage error", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.Write([]byte(`{"ok":true}`))
}
