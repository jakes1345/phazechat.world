package main

// callRTC is the status a client puts on call_offer and call_answer to say
// it runs the call itself over WebRTC (see the call_signal relay).
const callRTC = "rtc"

const (
	maxCallSDP       = 64 * 1024
	maxCallCandidate = 4 * 1024
)

// validCallSignal checks a call_signal before it is relayed: a known kind,
// the field that kind needs, and nothing oversized.
func validCallSignal(m NexusMessage) bool {
	if len(m.SDP) > maxCallSDP || len(m.Candidate) > maxCallCandidate {
		return false
	}
	switch m.Body {
	case "offer", "answer":
		return m.SDP != ""
	case "ice":
		return m.Candidate != ""
	default:
		return false
	}
}
