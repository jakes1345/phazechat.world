package main

import (
	"sync"
	"time"
)

// authFailTracker tracks per-IP and per-user consecutive failed auth attempts.
// When thresholds are breached, connections are throttled or blocked entirely.
type authFailTracker struct {
	mu           sync.Mutex
	ipFails      map[string]*authFail // keyed by IP
	userFails    map[string]*authFail // keyed by username
	totpFails    map[string]*authFail // keyed by username — TOTP code attempts
	signupCounts map[string]*authFail // keyed by IP — successful registrations
	// deviceCodeFails counts wrong new-device codes per user across every
	// challenge. Each challenge allows only a few guesses, but anyone with
	// the password can mint a fresh challenge by signing in again, so
	// without a per-user cap the 6-digit code is brute-forceable.
	deviceCodeFails map[string]*authFail
	// reauthFails counts wrong passwords given to confirm a sensitive action
	// on an already signed-in session (change_password, delete_account,
	// disable_totp), per user.
	reauthFails map[string]*authFail
}

type authFail struct {
	count   int
	firstAt time.Time
	lastAt  time.Time
}

var authTracker = &authFailTracker{
	ipFails:      make(map[string]*authFail),
	userFails:    make(map[string]*authFail),
	totpFails:    make(map[string]*authFail),
	signupCounts: make(map[string]*authFail),

	deviceCodeFails: make(map[string]*authFail),
	reauthFails:     make(map[string]*authFail),
}

const (
	// Per-IP: after 5 fails in 15 min, impose progressive delay. At 50, auto-block.
	authIPFailThreshold  = 5
	authIPBlockThreshold = 50
	authIPWindow         = 15 * time.Minute
	// Per-user: lock account after 10 consecutive fails in 30 min.
	authUserLockThreshold = 10
	authUserWindow        = 30 * time.Minute
	// TOTP: max 5 attempts per 10 min.
	totpMaxAttempts = 5
	totpWindow      = 10 * time.Minute
	// Per-IP signup: max 3 successful registrations per IP per 24 hours.
	signupIPMax    = 3
	signupIPWindow = 24 * time.Hour
	// New-device codes: max 10 wrong guesses per user per hour, across all
	// of that user's challenges.
	deviceCodeMaxFails = 10
	deviceCodeWindow   = time.Hour
	// Password re-confirmation on a live session: 5 wrong per 15 min.
	reauthMaxFails = 5
	reauthWindow   = 15 * time.Minute
)

// confirmPassword checks the password a signed-in user gives to confirm a
// sensitive action. These checks run bcrypt, so without a limit a stolen
// session could guess the password at socket speed (and burn server CPU
// doing it). After reauthMaxFails wrong answers in reauthWindow the check is
// refused without hashing. An empty password is a plain no, not counted.
func (s *NexusServer) confirmPassword(username, password string) (ok, throttled bool) {
	if authTracker.isReauthThrottled(username) {
		return false, true
	}
	if password == "" {
		return false, false
	}
	if s.authenticateUser(username, password) {
		authTracker.recordReauthSuccess(username)
		return true, false
	}
	authTracker.recordReauthFail(username)
	return false, false
}

const reauthThrottledMsg = "Too many incorrect password attempts — wait a few minutes and try again"

func (t *authFailTracker) isReauthThrottled(username string) bool {
	t.mu.Lock()
	defer t.mu.Unlock()
	return overLimit(t.reauthFails, username, reauthMaxFails, reauthWindow)
}

func (t *authFailTracker) recordReauthFail(username string) {
	if username == "" {
		return
	}
	t.mu.Lock()
	defer t.mu.Unlock()
	countFail(t.reauthFails, username, reauthWindow)
}

func (t *authFailTracker) recordReauthSuccess(username string) {
	t.mu.Lock()
	defer t.mu.Unlock()
	delete(t.reauthFails, username)
}

// countFail bumps a windowed counter in m. Caller must hold t.mu.
func countFail(m map[string]*authFail, key string, window time.Duration) {
	now := time.Now()
	if f, ok := m[key]; ok && now.Sub(f.firstAt) <= window {
		f.count++
		f.lastAt = now
		return
	}
	m[key] = &authFail{count: 1, firstAt: now, lastAt: now}
}

// overLimit reports whether key has reached limit in the window. Caller must
// hold t.mu.
func overLimit(m map[string]*authFail, key string, limit int, window time.Duration) bool {
	f, ok := m[key]
	if !ok {
		return false
	}
	if time.Since(f.firstAt) > window {
		delete(m, key)
		return false
	}
	return f.count >= limit
}

// isDeviceCodeThrottled reports whether this user has used up their
// new-device code guesses for now.
func (t *authFailTracker) isDeviceCodeThrottled(username string) bool {
	t.mu.Lock()
	defer t.mu.Unlock()
	return overLimit(t.deviceCodeFails, username, deviceCodeMaxFails, deviceCodeWindow)
}

// recordDeviceCodeFail counts a wrong new-device code for the user.
func (t *authFailTracker) recordDeviceCodeFail(username string) {
	if username == "" {
		return
	}
	t.mu.Lock()
	defer t.mu.Unlock()
	countFail(t.deviceCodeFails, username, deviceCodeWindow)
}

// recordDeviceCodeSuccess clears the counter once a code is accepted.
func (t *authFailTracker) recordDeviceCodeSuccess(username string) {
	t.mu.Lock()
	defer t.mu.Unlock()
	delete(t.deviceCodeFails, username)
}

func (t *authFailTracker) recordFail(ip, username string) {
	t.mu.Lock()
	defer t.mu.Unlock()
	now := time.Now()

	// IP tracking
	if f, ok := t.ipFails[ip]; ok {
		if now.Sub(f.firstAt) > authIPWindow {
			*f = authFail{count: 1, firstAt: now, lastAt: now}
		} else {
			f.count++
			f.lastAt = now
		}
	} else {
		t.ipFails[ip] = &authFail{count: 1, firstAt: now, lastAt: now}
	}

	// User tracking
	if username != "" {
		if f, ok := t.userFails[username]; ok {
			if now.Sub(f.firstAt) > authUserWindow {
				*f = authFail{count: 1, firstAt: now, lastAt: now}
			} else {
				f.count++
				f.lastAt = now
			}
		} else {
			t.userFails[username] = &authFail{count: 1, firstAt: now, lastAt: now}
		}
	}
}

func (t *authFailTracker) recordSuccess(ip, username string) {
	t.mu.Lock()
	defer t.mu.Unlock()
	delete(t.ipFails, ip)
	if username != "" {
		delete(t.userFails, username)
	}
}

// isIPThrottled returns true if this IP should be denied login attempts.
func (t *authFailTracker) isIPThrottled(ip string) bool {
	t.mu.Lock()
	defer t.mu.Unlock()
	f, ok := t.ipFails[ip]
	if !ok {
		return false
	}
	if time.Since(f.firstAt) > authIPWindow {
		delete(t.ipFails, ip)
		return false
	}
	return f.count >= authIPFailThreshold
}

// shouldAutoBlock returns true if the IP has exceeded the hard block threshold.
func (t *authFailTracker) shouldAutoBlock(ip string) bool {
	t.mu.Lock()
	defer t.mu.Unlock()
	f, ok := t.ipFails[ip]
	if !ok {
		return false
	}
	return f.count >= authIPBlockThreshold && time.Since(f.firstAt) <= authIPWindow
}

// isUserLocked returns true if too many consecutive auth failures for this user.
func (t *authFailTracker) isUserLocked(username string) bool {
	t.mu.Lock()
	defer t.mu.Unlock()
	f, ok := t.userFails[username]
	if !ok {
		return false
	}
	if time.Since(f.firstAt) > authUserWindow {
		delete(t.userFails, username)
		return false
	}
	return f.count >= authUserLockThreshold
}

// isTOTPThrottled reports whether this user has burned too many TOTP code
// attempts in the window (brute-force protection for the 6-digit code).
func (t *authFailTracker) isTOTPThrottled(username string) bool {
	t.mu.Lock()
	defer t.mu.Unlock()
	f, ok := t.totpFails[username]
	if !ok {
		return false
	}
	if time.Since(f.firstAt) > totpWindow {
		delete(t.totpFails, username)
		return false
	}
	return f.count >= totpMaxAttempts
}

// recordTOTPFail counts a wrong TOTP code for the user.
func (t *authFailTracker) recordTOTPFail(username string) {
	if username == "" {
		return
	}
	t.mu.Lock()
	defer t.mu.Unlock()
	now := time.Now()
	if f, ok := t.totpFails[username]; ok && now.Sub(f.firstAt) <= totpWindow {
		f.count++
		f.lastAt = now
	} else {
		t.totpFails[username] = &authFail{count: 1, firstAt: now, lastAt: now}
	}
}

// recordTOTPSuccess clears the TOTP attempt counter on a correct code.
func (t *authFailTracker) recordTOTPSuccess(username string) {
	t.mu.Lock()
	defer t.mu.Unlock()
	delete(t.totpFails, username)
}

// recordSignup counts a successful registration for the given IP.
func (t *authFailTracker) recordSignup(ip string) {
	t.mu.Lock()
	defer t.mu.Unlock()
	now := time.Now()
	if f, ok := t.signupCounts[ip]; ok {
		if now.Sub(f.firstAt) > signupIPWindow {
			*f = authFail{count: 1, firstAt: now, lastAt: now}
		} else {
			f.count++
			f.lastAt = now
		}
	} else {
		t.signupCounts[ip] = &authFail{count: 1, firstAt: now, lastAt: now}
	}
}

// isSignupThrottled returns true if this IP has registered too many accounts
// in the signup window.
func (t *authFailTracker) isSignupThrottled(ip string) bool {
	t.mu.Lock()
	defer t.mu.Unlock()
	f, ok := t.signupCounts[ip]
	if !ok {
		return false
	}
	if time.Since(f.firstAt) > signupIPWindow {
		delete(t.signupCounts, ip)
		return false
	}
	return f.count >= signupIPMax
}

// sweepAuthTracker cleans stale entries every 5 minutes.
func sweepAuthTracker() {
	tk := time.NewTicker(5 * time.Minute)
	defer tk.Stop()
	for {
		<-tk.C
		now := time.Now()
		authTracker.mu.Lock()
		for ip, f := range authTracker.ipFails {
			if now.Sub(f.lastAt) > authIPWindow {
				delete(authTracker.ipFails, ip)
			}
		}
		for u, f := range authTracker.userFails {
			if now.Sub(f.lastAt) > authUserWindow {
				delete(authTracker.userFails, u)
			}
		}
		for u, f := range authTracker.totpFails {
			if now.Sub(f.lastAt) > totpWindow {
				delete(authTracker.totpFails, u)
			}
		}
		for ip, f := range authTracker.signupCounts {
			if now.Sub(f.lastAt) > signupIPWindow {
				delete(authTracker.signupCounts, ip)
			}
		}
		for u, f := range authTracker.deviceCodeFails {
			if now.Sub(f.lastAt) > deviceCodeWindow {
				delete(authTracker.deviceCodeFails, u)
			}
		}
		for u, f := range authTracker.reauthFails {
			if now.Sub(f.lastAt) > reauthWindow {
				delete(authTracker.reauthFails, u)
			}
		}
		authTracker.mu.Unlock()
	}
}
