package main

import (
	"strings"
	"testing"
)

// Calls and voice channels load meet.jit.si in an iframe; the SPA's CSP and
// Permissions-Policy must allow that or no web call connects.
func TestWebHeadersAllowJitsiFrame(t *testing.T) {
	if !strings.Contains(webContentSecurityPolicy, "frame-src "+jitsiOrigin) {
		t.Fatalf("CSP does not allow the Jitsi iframe: %s", webContentSecurityPolicy)
	}
	if !strings.Contains(webContentSecurityPolicy, "frame-ancestors 'none'") {
		t.Fatalf("CSP lost frame-ancestors: %s", webContentSecurityPolicy)
	}
	for _, feature := range []string{"camera", "microphone", "display-capture"} {
		want := feature + `=(self "` + jitsiOrigin + `")`
		if !strings.Contains(webPermissionsPolicy, want) {
			t.Fatalf("Permissions-Policy missing %s: %s", want, webPermissionsPolicy)
		}
	}
}
