package main

import (
	"log"
	"net/http"
	"os"
	"strings"
	"time"
)

// New-device verification.
//
// Signing in from a device this account hasn't used before no longer just
// works. The new session is created but held in a pending state: it can't read
// messages, place calls or do anything else until it's approved. Meanwhile the
// sessions that are already signed in stay exactly as they were — a stranger
// with your password can't sign in and boot you out of your own account.
//
// Two ways to approve:
//
//	in-app   the sessions you already have open get a prompt naming the
//	         device, the IP and the time, with approve/deny. This is the
//	         primary path and needs nothing external.
//	by code  a six-digit code is emailed to the account address, for when
//	         you have no other session open — a new laptop, say.
//
// Deliberately not SMS. Delivering to real phone numbers needs carrier or
// aggregator access, so "self-hosted SMS" isn't a thing; and SMS is the
// weakest of these channels anyway (SIM-swap), which is why NIST deprecated
// it for authentication in 2016. Twilio remains wired up in sendSMS if a
// provider is ever wanted.

const deviceCookieName = "phaze_device"

// deviceChallengeTTL is how long a pending sign-in stays approvable. Long
// enough to go find the email, short enough that an abandoned attempt doesn't
// sit around waiting to be approved by mistake.
const deviceChallengeTTL = 15 * time.Minute

// maxDeviceChallengeAttempts caps guesses at a 6-digit code before the
// challenge is burned and the sign-in has to start over.
const maxDeviceChallengeAttempts = 5

// deviceVerificationEnabled reports whether unknown devices are challenged.
//
// On by default. Set PHAZE_DEVICE_VERIFICATION=0 to disable — useful for
// local development, where there's usually no mail transport configured and
// every fresh browser profile would otherwise need a code.
func deviceVerificationEnabled() bool {
	return strings.TrimSpace(os.Getenv("PHAZE_DEVICE_VERIFICATION")) != "0"
}

// deviceIDFromRequest reads the long-lived device cookie, or "" if absent.
//
// This identifies the *browser or install*, not the session: it outlives
// logout so signing back in on a machine you've already approved is silent.
func deviceIDFromRequest(r *http.Request) string {
	if c, err := r.Cookie(deviceCookieName); err == nil && c.Value != "" {
		return c.Value
	}
	return ""
}

func setDeviceCookie(w http.ResponseWriter, id string) {
	http.SetCookie(w, &http.Cookie{
		Name:     deviceCookieName,
		Value:    id,
		Path:     "/",
		HttpOnly: true,
		Secure:   true,
		SameSite: http.SameSiteLaxMode,
		// Two years. This is a recognition token, not a credential — on its
		// own it grants nothing, so a long life is safe and keeps approved
		// machines approved.
		MaxAge: 2 * 365 * 24 * 3600,
	})
}

// deviceLabel turns a User-Agent into something a person can recognise in an
// approval prompt. Not exact, and not meant to be — it only has to be good
// enough to answer "is this me?".
func deviceLabel(userAgent, fallback string) string {
	ua := strings.ToLower(userAgent)
	browser := "Unknown browser"
	switch {
	case strings.Contains(ua, "edg/"):
		browser = "Edge"
	case strings.Contains(ua, "opr/"), strings.Contains(ua, "opera"):
		browser = "Opera"
	case strings.Contains(ua, "firefox"):
		browser = "Firefox"
	case strings.Contains(ua, "chrome"), strings.Contains(ua, "chromium"):
		browser = "Chrome"
	case strings.Contains(ua, "safari"):
		browser = "Safari"
	}
	os := "unknown OS"
	switch {
	case strings.Contains(ua, "android"):
		os = "Android"
	case strings.Contains(ua, "iphone"), strings.Contains(ua, "ipad"):
		os = "iOS"
	case strings.Contains(ua, "windows"):
		os = "Windows"
	case strings.Contains(ua, "mac os"), strings.Contains(ua, "macintosh"):
		os = "macOS"
	case strings.Contains(ua, "linux"):
		os = "Linux"
	}
	if ua == "" {
		if fallback != "" {
			return fallback
		}
		return "Unknown device"
	}
	return browser + " on " + os
}

// isKnownDevice reports whether this account has approved this device before.
func (s *NexusServer) isKnownDevice(username, deviceID string) bool {
	if deviceID == "" {
		return false
	}
	var n int
	s.DB.QueryRow(
		`SELECT COUNT(*) FROM known_devices WHERE username = ? AND device_id = ?`,
		username, deviceID,
	).Scan(&n)
	return n > 0
}

// rememberDevice records a device as approved for this account.
func (s *NexusServer) rememberDevice(username, deviceID, label, ip string) {
	if deviceID == "" {
		return
	}
	s.DB.Exec(`
		INSERT INTO known_devices (username, device_id, label, last_ip)
		VALUES (?, ?, ?, ?)
		ON CONFLICT(username, device_id)
		DO UPDATE SET last_seen = CURRENT_TIMESTAMP, last_ip = excluded.last_ip`,
		username, deviceID, label, ip)
}

// touchDevice bumps last_seen for an already-known device.
func (s *NexusServer) touchDevice(username, deviceID, ip string) {
	s.DB.Exec(
		`UPDATE known_devices SET last_seen = CURRENT_TIMESTAMP, last_ip = ? WHERE username = ? AND device_id = ?`,
		ip, username, deviceID)
}

// canDeliverChallenge reports whether there is any way to reach this user for
// approval — a session already open, or a mailbox we can actually send to.
//
// Kept separate from whether a given send succeeds. Failing open because one
// SMTP attempt errored would let anyone bypass the check by knocking the mail
// server over; failing open because there is genuinely no channel at all is
// the only case where holding someone out would be a permanent lockout.
func (s *NexusServer) canDeliverChallenge(username string) bool {
	if s.isOnline(username) {
		return true
	}
	if !mailConfigured() {
		return false
	}
	var email string
	s.DB.QueryRow(`SELECT COALESCE(email,'') FROM users WHERE username = ?`, username).Scan(&email)
	return email != ""
}

// createDeviceChallenge gates a session behind approval and tells the user
// about it on every channel available.
//
// Returns the challenge id, and whether a code was actually delivered. A false
// delivered means no mail transport is configured — the caller decides what to
// do about that rather than having this function silently lock someone out.
func (s *NexusServer) createDeviceChallenge(username, deviceID, sessionToken, label, ip string) (int64, bool) {
	code, err := randDigits(6)
	if err != nil {
		return 0, false
	}
	expires := time.Now().Add(deviceChallengeTTL)
	res, err := s.DB.Exec(`
		INSERT INTO device_challenges (username, device_id, session_token, code, label, ip, expires_at)
		VALUES (?, ?, ?, ?, ?, ?, ?)`,
		username, deviceID, sessionToken, code, label, ip, expires)
	if err != nil {
		log.Printf("[device] create challenge for %s: %v", username, err)
		return 0, false
	}
	id, _ := res.LastInsertId()

	// Tell the sessions already signed in, so they can approve in-app without
	// waiting for mail.
	s.sendTo(username, NexusMessage{
		Type:        "device_challenge",
		Sender:      username,
		Body:        label,
		ChallengeID: id,
		DeviceID:    deviceID,
		Status:      ip,
		Ts:          time.Now().UnixMilli(),
	})

	// And email the code, for when there's no other session open.
	var email string
	s.DB.QueryRow(`SELECT COALESCE(email,'') FROM users WHERE username = ?`, username).Scan(&email)
	if email == "" {
		log.Printf("[device] %s has no email on file — cannot send a verification code", username)
		return id, false
	}
	// sendEmail returns nil with no provider configured (it logs the message
	// instead), so a nil error alone doesn't prove anything was delivered.
	if !mailConfigured() {
		log.Printf("[device] no mail transport configured — code for %s exists only in this log", username)
		return id, false
	}
	subject := "Approve the new sign-in to your Phaze account"
	body := "Someone just signed in to your Phaze account from a device we haven't seen before.\r\n\r\n" +
		"Device: " + label + "\r\n" +
		"IP address: " + ip + "\r\n" +
		"Time: " + time.Now().UTC().Format("2006-01-02 15:04:05 UTC") + "\r\n\r\n" +
		"If this was you, enter this code to finish signing in:\r\n\r\n    " + code + "\r\n\r\n" +
		"The code expires in 15 minutes.\r\n\r\n" +
		"If this wasn't you, ignore this email — the sign-in stays blocked — and " +
		"change your password. Your existing sessions have not been affected.\r\n"
	if err := s.sendEmail(email, subject, body); err != nil {
		log.Printf("[device] emailing challenge to %s: %v", username, err)
		return id, false
	}
	return id, true
}

// verifyDeviceChallenge checks a code against the pending challenge for this
// session, and on success lifts the session's hold and trusts the device.
func (s *NexusServer) verifyDeviceChallenge(sessionToken, code string) (string, error) {
	var (
		id        int64
		username  string
		deviceID  string
		want      string
		label     string
		ip        string
		attempts  int
		consumed  int
		expiresAt time.Time
	)
	err := s.DB.QueryRow(`
		SELECT id, username, device_id, code, label, ip, attempts, consumed, expires_at
		  FROM device_challenges
		 WHERE session_token = ?
		 ORDER BY id DESC LIMIT 1`, sessionToken,
	).Scan(&id, &username, &deviceID, &want, &label, &ip, &attempts, &consumed, &expiresAt)
	if err != nil {
		return "", errNoChallenge
	}
	if consumed != 0 {
		return "", errNoChallenge
	}
	if time.Now().After(expiresAt) {
		return "", errChallengeExpired
	}
	if attempts >= maxDeviceChallengeAttempts {
		return "", errTooManyAttempts
	}
	if strings.TrimSpace(code) != want {
		s.DB.Exec(`UPDATE device_challenges SET attempts = attempts + 1 WHERE id = ?`, id)
		return "", errBadCode
	}
	s.approveDeviceChallenge(id, username, deviceID, sessionToken, label, ip)
	return username, nil
}

// approveDeviceChallenge lifts the hold on a session and trusts its device.
// Shared by the emailed-code path and the in-app approve path.
func (s *NexusServer) approveDeviceChallenge(id int64, username, deviceID, sessionToken, label, ip string) {
	s.DB.Exec(`UPDATE device_challenges SET consumed = 1, approved = 1 WHERE id = ?`, id)
	s.DB.Exec(`UPDATE session_tokens SET pending_device = 0 WHERE token = ?`, sessionToken)
	s.rememberDevice(username, deviceID, label, ip)
	log.Printf("[device] %s approved new device %q", username, label)
}

// denyDeviceChallenge burns the challenge and revokes the session it gated,
// so a denied sign-in can't be retried with the same token.
func (s *NexusServer) denyDeviceChallenge(id int64, username, sessionToken string) {
	s.DB.Exec(`UPDATE device_challenges SET consumed = 1, approved = 0 WHERE id = ?`, id)
	s.DB.Exec(`UPDATE session_tokens SET revoked = 1 WHERE token = ?`, sessionToken)
	log.Printf("[device] %s denied a new-device sign-in", username)
}

// lookupDeviceChallenge fetches a challenge by id, scoped to its owner so one
// account can't act on another's.
func (s *NexusServer) lookupDeviceChallenge(id int64, username string) (deviceID, sessionToken, label, ip string, ok bool) {
	var consumed int
	err := s.DB.QueryRow(`
		SELECT device_id, session_token, label, ip, consumed
		  FROM device_challenges
		 WHERE id = ? AND username = ?`, id, username,
	).Scan(&deviceID, &sessionToken, &label, &ip, &consumed)
	if err != nil || consumed != 0 {
		return "", "", "", "", false
	}
	return deviceID, sessionToken, label, ip, true
}

// purgeExpiredDeviceChallenges drops stale rows. Called from data retention.
func (s *NexusServer) purgeExpiredDeviceChallenges() {
	s.DB.Exec(`DELETE FROM device_challenges WHERE consumed = 1 OR expires_at < CURRENT_TIMESTAMP`)
}

type deviceErr struct{ msg string }

func (e *deviceErr) Error() string { return e.msg }

var (
	errNoChallenge      = &deviceErr{"no pending verification for this session"}
	errChallengeExpired = &deviceErr{"that code has expired — sign in again to get a new one"}
	errTooManyAttempts  = &deviceErr{"too many incorrect codes — sign in again to get a new one"}
	errBadCode          = &deviceErr{"incorrect code"}
)
