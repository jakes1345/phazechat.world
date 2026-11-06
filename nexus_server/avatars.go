package main

import (
	"bytes"
	"errors"
	"fmt"
	"image"
	_ "image/jpeg"
	"image/png"
	"io"
	"log"
	"net/http"
)

const maxAvatarBytes = 2 << 20 // 2 MB

// validateAvatar checks size and sniffs the real content type — the file
// extension is never trusted. Returns nil only for PNG/JPEG within the cap.
// maxAvatarSide bounds avatar width and height (16 megapixels at most).
const maxAvatarSide = 4096

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
	// Check the declared size before decoding: a 2 MB PNG can claim
	// 50000x50000 pixels and make image.Decode allocate gigabytes.
	cfg, _, err := image.DecodeConfig(bytes.NewReader(data))
	if err != nil {
		http.Error(w, "could not read image", http.StatusBadRequest)
		return
	}
	if cfg.Width <= 0 || cfg.Height <= 0 || cfg.Width > maxAvatarSide || cfg.Height > maxAvatarSide {
		http.Error(w, fmt.Sprintf("avatar must be at most %dx%d pixels", maxAvatarSide, maxAvatarSide), http.StatusBadRequest)
		return
	}
	img, _, err := image.Decode(bytes.NewReader(data))
	if err != nil {
		http.Error(w, "could not read image", http.StatusBadRequest)
		return
	}

	var buf bytes.Buffer
	if err := png.Encode(&buf, img); err != nil {
		http.Error(w, "storage error", http.StatusInternalServerError)
		return
	}
	if err := blobs().Put(r.Context(), "avatars/"+username+".png", &buf, int64(buf.Len()), "image/png"); err != nil {
		log.Printf("[avatar] store %s: %v", username, err)
		http.Error(w, "storage error", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.Write([]byte(`{"ok":true}`))
}
