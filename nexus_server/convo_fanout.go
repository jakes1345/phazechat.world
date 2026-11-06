package main

// fanoutConvoMsg delivers a group message to every other member: live to
// each connection they have open, otherwise into the offline queue with a
// push notification.
//
// It must not be called with s.Mu held. sendTo takes s.Mu.RLock itself, and
// Go's RWMutex doesn't allow a goroutine to take a read lock it already holds
// while a writer (a login or logout) is waiting: both sides block and every
// connection on the server stalls behind them.
func (s *NexusServer) fanoutConvoMsg(convoID, sender, body string, envelopes map[string]string, members []string) {
	var convoName string
	_ = s.DB.QueryRow(`SELECT name FROM conversations WHERE id = ?`, convoID).Scan(&convoName)
	pushTitle := sender
	if convoName != "" {
		pushTitle = sender + " in " + convoName
	}
	const pushBody = "Sent a message"

	for _, m := range members {
		if m == sender {
			continue
		}
		// Prefer the per-member envelope so the server never sees plaintext.
		// Older clients still send one plaintext body for everyone.
		out := body
		if env, ok := envelopes[m]; ok {
			out = env
		}
		fanout := NexusMessage{
			Type:    "convo_msg",
			Sender:  sender,
			Body:    out,
			ConvoID: convoID,
		}
		if !s.sendTo(m, fanout) {
			s.DB.Exec(`INSERT INTO offline_messages (sender, recipient, body, msg_type, convo)
				VALUES (?, ?, ?, 'convo_msg', ?)`, sender, m, out, convoID)
			go s.sendWebPush(m, pushTitle, pushBody)
			go s.sendFCMPush(m, pushTitle, pushBody)
		}
	}
}
