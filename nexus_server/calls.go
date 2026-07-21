package main

import "time"

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
