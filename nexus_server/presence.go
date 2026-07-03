package main

// The four statuses a user can pick. "Offline" is never set directly —
// it's what everyone else sees when you disconnect or go Invisible.
var settableStatuses = map[string]bool{
	"Online":         true,
	"Away":           true,
	"Do Not Disturb": true,
	"Invisible":      true,
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
	s.Mu.Lock()
	if c, ok := s.Clients[username]; ok {
		c.Status = st
	}
	s.Mu.Unlock()
	s.broadcastPresence(username, st)
}
