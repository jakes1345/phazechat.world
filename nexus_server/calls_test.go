package main

import (
	"testing"
	"time"
)

func TestCallOutcome(t *testing.T) {
	start := time.Now()

	if answered, dur := callOutcome(false, start, start.Add(30*time.Second)); answered || dur != 0 {
		t.Errorf("unanswered call must be a miss with 0 duration, got answered=%v dur=%d", answered, dur)
	}

	if answered, dur := callOutcome(true, start, start.Add(252*time.Second)); !answered || dur != 252 {
		t.Errorf("answered 252s call, got answered=%v dur=%d", answered, dur)
	}

	// Clock skew guard: an end time before the start must never go negative.
	if answered, dur := callOutcome(true, start, start.Add(-5*time.Second)); !answered || dur != 0 {
		t.Errorf("backwards duration must clamp to 0, got answered=%v dur=%d", answered, dur)
	}
}
