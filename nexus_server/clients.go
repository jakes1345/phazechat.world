package main

import (
	"sync"
	"time"
)

// Connection registry helpers.
//
// A user may hold several live connections at once — browser tabs, the desktop
// app, a phone. Every read or write of s.Clients should go through one of these
// so the locking and the fan-out stay in one place.

// clientsOf returns a snapshot of the user's live connections.
//
// The slice is a copy, so callers can Send() on the results without holding
// s.Mu. That matters: Send takes each connection's own write mutex and can
// block for up to the write deadline, and holding the registry lock across
// that would stall every other connection on the server.
func (s *NexusServer) clientsOf(username string) []*Client {
	s.Mu.RLock()
	defer s.Mu.RUnlock()
	cs := s.Clients[username]
	if len(cs) == 0 {
		return nil
	}
	out := make([]*Client, len(cs))
	copy(out, cs)
	return out
}

// sendTo delivers a message to every connection the user has open, and reports
// whether at least one of them took it.
//
// A false return means "deliver this some other way" (offline queue, push
// notification) — the same signal the old single-connection lookup gave.
func (s *NexusServer) sendTo(username string, m NexusMessage) bool {
	delivered := false
	for _, c := range s.clientsOf(username) {
		if err := c.Send(m); err == nil {
			delivered = true
		}
	}
	return delivered
}

// sendToOthers is sendTo, skipping one connection.
//
// Used for echoing a user's own action back to their other sessions: the tab
// that sent it has already applied the change locally, so re-delivering it
// there would double up.
func (s *NexusServer) sendToOthers(username string, except *Client, m NexusMessage) {
	for _, c := range s.clientsOf(username) {
		if c == except {
			continue
		}
		c.Send(m)
	}
}

// isOnline reports whether the user has any live connection.
func (s *NexusServer) isOnline(username string) bool {
	s.Mu.RLock()
	defer s.Mu.RUnlock()
	return len(s.Clients[username]) > 0
}

// addClient registers a connection. Caller must NOT hold s.Mu.
func (s *NexusServer) addClient(username string, c *Client) {
	s.Mu.Lock()
	defer s.Mu.Unlock()
	s.Clients[username] = append(s.Clients[username], c)
}

// addClientLocked registers a connection while s.Mu is already held.
func (s *NexusServer) addClientLocked(username string, c *Client) {
	s.Clients[username] = append(s.Clients[username], c)
}

// removeClient drops one connection and returns how many the user has left.
//
// Zero means they've gone fully offline and their friends should be told;
// anything above zero means they just closed one tab and their presence is
// unchanged.
func (s *NexusServer) removeClient(username string, c *Client) int {
	s.Mu.Lock()
	defer s.Mu.Unlock()
	return s.removeClientLocked(username, c)
}

// removeClientLocked is removeClient for callers already holding s.Mu.
func (s *NexusServer) removeClientLocked(username string, c *Client) int {
	cs := s.Clients[username]
	for i, existing := range cs {
		if existing == c {
			cs = append(cs[:i], cs[i+1:]...)
			break
		}
	}
	if len(cs) == 0 {
		delete(s.Clients, username)
		return 0
	}
	s.Clients[username] = cs
	return len(cs)
}

// dropAllClients disconnects every session a user has, after sending each one
// a reason. Used for admin actions — ban, account deletion — where the intent
// really is to remove the person from the server entirely.
func (s *NexusServer) dropAllClients(username string, reason NexusMessage) {
	s.Mu.Lock()
	cs := s.Clients[username]
	delete(s.Clients, username)
	s.Mu.Unlock()
	for _, c := range cs {
		c.Send(reason)
		c.Conn.Close()
	}
}

// onlineUsernames lists every user with at least one live connection.
func (s *NexusServer) onlineUsernames() []string {
	s.Mu.RLock()
	defer s.Mu.RUnlock()
	out := make([]string, 0, len(s.Clients))
	for u := range s.Clients {
		out = append(out, u)
	}
	return out
}

// onlineUserCount counts distinct signed-in users, not open sockets — one
// person with three tabs is one user online.
func (s *NexusServer) onlineUserCount() int {
	s.Mu.RLock()
	defer s.Mu.RUnlock()
	return len(s.Clients)
}

// connectionCount counts open sockets across all users.
func (s *NexusServer) connectionCount() int {
	s.Mu.RLock()
	defer s.Mu.RUnlock()
	n := 0
	for _, cs := range s.Clients {
		n += len(cs)
	}
	return n
}

// broadcastAll sends to every connection on the server.
func (s *NexusServer) broadcastAll(m NexusMessage) {
	s.Mu.RLock()
	all := make([]*Client, 0, len(s.Clients))
	for _, cs := range s.Clients {
		all = append(all, cs...)
	}
	s.Mu.RUnlock()
	for _, c := range all {
		c.Send(m)
	}
}

// anyClientInCall reports whether any of the user's connections is mid-call.
//
// Call state is per-connection: a call belongs to the specific tab that placed
// or answered it. For busy checks, though, the question is about the person —
// if they're on a call anywhere, a new caller should get call_busy.
func (s *NexusServer) anyClientInCall(username string) (*Client, bool) {
	s.Mu.RLock()
	defer s.Mu.RUnlock()
	for _, c := range s.Clients[username] {
		if c.InCall {
			return c, true
		}
	}
	return nil, false
}

// callPeerLocked finds which of `peer`'s connections is in a call with
// `with`. Caller must hold s.Mu.
//
// Call state is per-connection by design: a call belongs to the specific tab
// or device that answered it, not to the account. So routing call signalling
// means finding that one connection rather than fanning out.
func (s *NexusServer) callPeerLocked(peer, with string) *Client {
	for _, c := range s.Clients[peer] {
		if c.InCall && c.CallPartner == with {
			return c
		}
	}
	return nil
}

// callPeer is callPeerLocked for callers not already holding s.Mu.
func (s *NexusServer) callPeer(peer, with string) *Client {
	s.Mu.RLock()
	defer s.Mu.RUnlock()
	return s.callPeerLocked(peer, with)
}

// ringingClients returns the connections an incoming call should ring.
//
// Every session the callee has open: the call should ring on their laptop and
// their phone at once, and whichever one answers takes it. This mirrors how
// real multi-device calling behaves.
func (s *NexusServer) ringingClients(username string) []*Client {
	return s.clientsOf(username)
}

// detachClient unregisters one connection and cleans up everything that hung
// off it: an in-progress call (the partner is told and the call row closed),
// and — when it was the user's last connection — presence, voice rooms and
// live streams.
//
// State is read and cleared under s.Mu, but every network write and DB call
// happens after the lock is released: Send can block for the full write
// deadline on a slow peer, and holding the registry lock across that (or
// across a DB round-trip) stalls every other connection on the server.
//
// Returns how many connections the user still has open.
func (s *NexusServer) detachClient(username string, client *Client) int {
	if username == "" || client == nil {
		return 0
	}
	s.Mu.Lock()
	remaining := s.removeClientLocked(username, client)

	var (
		notify    []*Client // the other side's connections to tell
		logRow    int64
		answered  bool
		started   time.Time
		logCaller string
		logCallee string
	)
	if callPartner := client.CallPartner; callPartner != "" {
		// The peer's call lives on one specific connection of theirs, not
		// on all of them — find that one.
		if partner := s.callPeerLocked(callPartner, username); partner != nil {
			partner.InCall = false
			partner.CallPartner = ""
			notify = []*Client{partner}
			// The call row lives on whichever side placed the call.
			if client.PendingCallID != 0 {
				logCaller, logCallee = username, callPartner
				logRow, answered, started = clearOutgoingCallLocked(client)
			} else if partner.PendingCallID != 0 {
				logCaller, logCallee = callPartner, username
				logRow, answered, started = clearOutgoingCallLocked(partner)
			}
		}
	} else if callee := pendingCalleeOf(client); callee != "" && client.PendingCallRoom != "" {
		// Hung up by disconnecting while still ringing: stop the callee's
		// devices ringing for a call nobody can answer any more.
		notify = append(notify, s.Clients[callee]...)
		logCaller, logCallee = username, callee
		logRow, answered, started = clearOutgoingCallLocked(client)
	}
	client.InCall = false
	client.CallPartner = ""
	clearPendingCallee(client)
	s.Mu.Unlock()

	for _, c := range notify {
		c.Send(NexusMessage{Type: "call_end", Sender: username})
	}
	if logRow != 0 {
		kind, ans, duration := s.finalizeCall(logRow, answered, started)
		status := "missed"
		if ans {
			status = "answered"
		}
		// Only the surviving side is still connected to receive this live.
		m := NexusMessage{Type: "call_log", Sender: logCaller, Recipient: logCallee, Body: kind, Status: status, Ts: started.UnixMilli(), Duration: duration}
		for _, c := range notify {
			c.Send(m)
		}
	}

	if remaining == 0 {
		s.broadcastPresence(username, "Offline")
		s.voiceRoomEvictUser(username)
		s.streamEvictUser(username)
	}
	return remaining
}

// reauthConnection is called before a socket that may already be signed in
// is registered under `newUser` (auth, session_auth, qr_login_check).
//
// Registering again without this appended the same *Client a second time —
// duplicate deliveries and a ghost entry that kept the user "online" after
// the socket closed — and a socket re-authed as someone else stayed in the
// first user's list, so it kept receiving their messages.
//
// Returns true when the socket is already registered as newUser: the caller
// should just confirm success and not register it again. When it was signed
// in as someone else, it is detached from that account first.
func (s *NexusServer) reauthConnection(client *Client, current, newUser string) (alreadyThisUser bool) {
	if current == "" {
		return false
	}
	if current == newUser {
		return true
	}
	s.detachClient(current, client)
	return false
}

// userExists reports whether an account with this name exists.
func (s *NexusServer) userExists(username string) bool {
	if username == "" {
		return false
	}
	var one int
	return s.DB.QueryRow(`SELECT 1 FROM users WHERE username = ?`, username).Scan(&one) == nil
}

// dmParticipants returns who sent and who received a stored DM.
func (s *NexusServer) dmParticipants(msgID string) (sender, recipient string, ok bool) {
	err := s.DB.QueryRow(`SELECT sender, recipient FROM dm_messages WHERE msg_id = ?`, msgID).Scan(&sender, &recipient)
	return sender, recipient, err == nil
}

// ── Remote screen sessions ────────────────────────────────────────────────
//
// A viewer earns the right to signal a host by looking up the host's 6-digit
// code (remote_lookup). That pairing is recorded here, and remote_offer /
// answer / ice / input / end are only relayed between a host and a viewer
// that were paired this way — otherwise anyone could push an offer at any
// user who happens to be sharing.

// remoteBindingTTL bounds how long a pairing outlives its last use. Sessions
// end with remote_end or a new share, so this only mops up abandoned ones.
const remoteBindingTTL = 12 * time.Hour

type remotePair struct{ host, viewer string }

type remoteBindingSet struct {
	mu    sync.Mutex
	pairs map[remotePair]time.Time
}

// Keyed by server so the side-by-side servers in tests stay independent.
// (Kept out of NexusServer itself, whose definition lives in main.go.)
var remoteBindingsByServer sync.Map // *NexusServer -> *remoteBindingSet

func (s *NexusServer) remoteBindings() *remoteBindingSet {
	v, _ := remoteBindingsByServer.LoadOrStore(s, &remoteBindingSet{pairs: map[remotePair]time.Time{}})
	return v.(*remoteBindingSet)
}

func (b *remoteBindingSet) bind(host, viewer string) {
	b.mu.Lock()
	defer b.mu.Unlock()
	now := time.Now()
	for p, at := range b.pairs {
		if now.Sub(at) > remoteBindingTTL {
			delete(b.pairs, p)
		}
	}
	b.pairs[remotePair{host, viewer}] = now
}

// pairOf reports whether a and b are paired in either direction, and which
// of them is the host.
func (b *remoteBindingSet) pairOf(a, c string) (host string, ok bool) {
	b.mu.Lock()
	defer b.mu.Unlock()
	now := time.Now()
	for _, p := range []remotePair{{a, c}, {c, a}} {
		if at, found := b.pairs[p]; found {
			if now.Sub(at) > remoteBindingTTL {
				delete(b.pairs, p)
				continue
			}
			b.pairs[p] = now
			return p.host, true
		}
	}
	return "", false
}

func (b *remoteBindingSet) unbind(host, viewer string) {
	b.mu.Lock()
	delete(b.pairs, remotePair{host, viewer})
	b.mu.Unlock()
}

// dropHost forgets every viewer paired with this host.
func (b *remoteBindingSet) dropHost(host string) {
	b.mu.Lock()
	for p := range b.pairs {
		if p.host == host {
			delete(b.pairs, p)
		}
	}
	b.mu.Unlock()
}

// otherOf returns whichever of a and b isn't `one`.
func otherOf(one, a, b string) string {
	if a == one {
		return b
	}
	return a
}

// deleteRemoteCodesOf removes every pairing code the user registered. Only
// ever called with the code owner's own name (or the host of a pairing being
// torn down), never on a third party's say-so.
func (s *NexusServer) deleteRemoteCodesOf(username string) {
	s.RemoteCodesMu.Lock()
	for k, v := range s.RemoteCodes {
		if v.Username == username {
			delete(s.RemoteCodes, k)
		}
	}
	s.RemoteCodesMu.Unlock()
}
