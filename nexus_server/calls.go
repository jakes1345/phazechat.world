package main

import (
	"sync"
	"time"
)

// pendingCallees records who an outgoing call was placed to, keyed by the
// exact connection that dialled. It sits beside the PendingCall* fields on
// Client: call_answer and call_reject need it to check that the person
// answering or rejecting is really the one being called, rather than anyone
// who names the caller in Recipient.
//
// It has its own mutex (not s.Mu) because it's package-level and test
// servers run side by side. Callers update it while holding s.Mu so it moves
// in step with the rest of the call state.
var pendingCallees = struct {
	sync.Mutex
	m map[*Client]string
}{m: map[*Client]string{}}

func setPendingCallee(c *Client, callee string) {
	pendingCallees.Lock()
	pendingCallees.m[c] = callee
	pendingCallees.Unlock()
}

func pendingCalleeOf(c *Client) string {
	pendingCallees.Lock()
	defer pendingCallees.Unlock()
	return pendingCallees.m[c]
}

func clearPendingCallee(c *Client) {
	pendingCallees.Lock()
	delete(pendingCallees.m, c)
	pendingCallees.Unlock()
}

// outgoingCallLocked finds the connection of `caller` that placed a call to
// `callee` which is still in flight (ringing, or answered and not yet ended).
// Caller must hold s.Mu.
func (s *NexusServer) outgoingCallLocked(caller, callee string) *Client {
	for _, c := range s.Clients[caller] {
		if (c.PendingCallRoom != "" || c.PendingCallID != 0) && pendingCalleeOf(c) == callee {
			return c
		}
	}
	return nil
}

// clearOutgoingCallLocked resets a dialling connection's pending-call state
// and returns what's needed to finalize the call row after s.Mu is released.
// Caller must hold s.Mu.
func clearOutgoingCallLocked(c *Client) (callID int64, answered bool, started time.Time) {
	callID, answered, started = c.PendingCallID, c.PendingCallAnswered, c.PendingCallStarted
	c.PendingCallID = 0
	c.PendingCallAnswered = false
	c.PendingCallRoom = ""
	clearPendingCallee(c)
	return
}

// callOutcome finalizes a call row's answered/duration fields. A call that
// was never answered is a miss regardless of how long it rang.
func callOutcome(answered bool, startedAt, endedAt time.Time) (answeredOut bool, durationS int) {
	if !answered {
		return false, 0
	}
	d := max(int(endedAt.Sub(startedAt).Seconds()), 0)
	return true, d
}

// recordCallStart inserts a new call row and returns its id, or 0 on error
// (callers treat 0 as "couldn't log it" and carry on — a missing call-history
// row must never block the call itself).
func (s *NexusServer) recordCallStart(caller, callee, kind string) (int64, time.Time) {
	now := time.Now()
	res, err := s.DB.Exec(
		`INSERT INTO calls (caller, callee, kind, started_at) VALUES (?, ?, ?, ?)`,
		caller, callee, kind, now,
	)
	if err != nil {
		return 0, now
	}
	id, _ := res.LastInsertId()
	return id, now
}

// finalizeCall writes the outcome for a previously-started call row and
// reports what to tell both parties.
func (s *NexusServer) finalizeCall(callID int64, answered bool, startedAt time.Time) (kind string, answeredOut bool, durationS int) {
	answeredOut, durationS = callOutcome(answered, startedAt, time.Now())
	s.DB.QueryRow(`SELECT kind FROM calls WHERE id = ?`, callID).Scan(&kind)
	s.DB.Exec(`UPDATE calls SET answered = ?, duration_s = ? WHERE id = ?`,
		boolToInt(answeredOut), durationS, callID)
	return kind, answeredOut, durationS
}

func boolToInt(b bool) int {
	if b {
		return 1
	}
	return 0
}
