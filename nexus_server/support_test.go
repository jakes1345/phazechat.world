package main

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// The support assistant's per-IP cap stops one visitor from draining the
// LLM quota through the unauthenticated chat endpoint.
func TestSupportLimitCapsPerIP(t *testing.T) {
	calls := 0
	h := supportLimit(func(w http.ResponseWriter, r *http.Request) { calls++ })
	limited := 0
	for i := 0; i < 20; i++ {
		req := httptest.NewRequest(http.MethodPost, "/api/v1/support/chat", strings.NewReader("{}"))
		req.RemoteAddr = "203.0.113.77:5000"
		rec := httptest.NewRecorder()
		h(rec, req)
		if rec.Code == http.StatusTooManyRequests {
			limited++
		}
	}
	if calls > 12 || limited == 0 {
		t.Fatalf("expected the limiter to stop the burst: %d handled, %d limited", calls, limited)
	}
}
