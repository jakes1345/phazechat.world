package main

import (
	"errors"
	"net"
	"testing"
)

func withMX(t *testing.T, fn func(string) ([]*net.MX, error)) {
	t.Helper()
	orig := lookupMX
	lookupMX = fn
	t.Cleanup(func() { lookupMX = orig })
}

func TestIsDisposableEmail_BlocklistNeedsNoDNS(t *testing.T) {
	withMX(t, func(string) ([]*net.MX, error) {
		t.Fatal("blocklisted domain should not reach DNS")
		return nil, nil
	})
	if _, blocked := isDisposableEmail("x@mailinator.com"); !blocked {
		t.Fatal("mailinator.com should be blocked")
	}
}

func TestIsDisposableEmail_RealMailDomainAllowed(t *testing.T) {
	withMX(t, func(string) ([]*net.MX, error) { return []*net.MX{{Host: "mx.example.org.", Pref: 10}}, nil })
	if reason, blocked := isDisposableEmail("alice@example.org"); blocked {
		t.Fatalf("domain with MX should pass, got %q", reason)
	}
}

func TestIsDisposableEmail_DefinitelyNoMailBlocked(t *testing.T) {
	withMX(t, func(d string) ([]*net.MX, error) {
		return nil, &net.DNSError{Err: "no such host", Name: d, IsNotFound: true}
	})
	if _, blocked := isDisposableEmail("a@nonexistent.invalid"); !blocked {
		t.Fatal("NXDOMAIN should block")
	}

	withMX(t, func(string) ([]*net.MX, error) { return nil, nil })
	if _, blocked := isDisposableEmail("a@nomx.example"); !blocked {
		t.Fatal("domain with zero MX records should block")
	}
}

// The regression: a DNS outage used to reject every signup.
func TestIsDisposableEmail_LookupFailureFailsOpen(t *testing.T) {
	withMX(t, func(d string) ([]*net.MX, error) {
		return nil, &net.DNSError{Err: "i/o timeout", Name: d, IsTimeout: true}
	})
	if reason, blocked := isDisposableEmail("alice@gmail.com"); blocked {
		t.Fatalf("DNS timeout must not block signup, got %q", reason)
	}

	withMX(t, func(string) ([]*net.MX, error) { return nil, errors.New("resolver unavailable") })
	if reason, blocked := isDisposableEmail("alice@gmail.com"); blocked {
		t.Fatalf("resolver error must not block signup, got %q", reason)
	}
}
