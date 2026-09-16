package main

// The statuses a user can pick. "Offline" is never set directly — it's
// what everyone else sees when you disconnect or go Invisible.
//
// "Skype Me" and "Not Available" are era-specific: real Skype had "Skype
// Me" (an invite for calls from strangers) from its early days, hid it
// from the status picker starting with version 4, and removed it
// completely by version 5; "Not Available" arrived in version 4 and was
// also gone by version 5 (see docs/skype-eras/skype3.md and skype4.md).
// The client only offers these for the eras that actually had them
// (web/src/presence.ts's statusesForEra), but the server accepts both
// unconditionally rather than re-deriving era rules from a username —
// it has no reliable way to know which theme a client is currently
// showing, and rejecting a status the client legitimately offered would
// be a worse failure mode than accepting one from a client that (by a
// bug elsewhere) offered it for the wrong era.
var settableStatuses = map[string]bool{
	"Online":         true,
	"Away":           true,
	"Do Not Disturb": true,
	"Invisible":      true,
	"Skype Me":       true,
	"Not Available":  true,
}

func validStatus(s string) bool {
	return settableStatuses[s]
}

// publicStatus is what friends are told. Invisible users look offline;
// an unset status reads as Online.
func publicStatus(s string) string {
	switch s {
	case "Invisible":
		return "Offline"
	case "":
		return "Online"
	}
	return s
}

// announcePresence loads the user's persisted status, mirrors it onto the
// live connection, and tells their friends. Used at connect/login time in
// place of the old hardcoded "Online" broadcast.
func (s *NexusServer) announcePresence(username string) {
	st := "Online"
	s.DB.QueryRow("SELECT COALESCE(status, 'Online') FROM users WHERE username = ?", username).Scan(&st)
	// Status is mirrored onto every one of the user's connections: it's a
	// property of the person, not of whichever tab happens to be newest.
	s.Mu.Lock()
	for _, c := range s.Clients[username] {
		c.Status = st
	}
	s.Mu.Unlock()
	s.broadcastPresence(username, st)
}
