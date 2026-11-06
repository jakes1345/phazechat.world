package main

import (
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/pquerna/otp/totp"
)

// Staff with 2FA can't open the admin portal (and get a session token)
// with the password alone.
func TestAdminLoginRequiresTOTPWhenEnabled(t *testing.T) {
	srv, ts, _ := newTestServer(t)
	defer ts.Close()
	registerAndVerify(t, srv, "boss", "adminpass123")
	srv.DB.Exec("UPDATE users SET is_admin = 1, role = 'admin' WHERE username = 'boss'")
	key, err := totp.Generate(totp.GenerateOpts{Issuer: "Phaze", AccountName: "boss"})
	if err != nil {
		t.Fatal(err)
	}
	srv.DB.Exec("UPDATE users SET totp_secret = ?, totp_enabled = 1 WHERE username = 'boss'", key.Secret())

	post := func(body string) int {
		resp, err := http.Post(ts.URL+"/api/v1/admin/login", "application/json", strings.NewReader(body))
		if err != nil {
			t.Fatal(err)
		}
		resp.Body.Close()
		return resp.StatusCode
	}
	if code := post(`{"username":"boss","password":"adminpass123"}`); code != http.StatusUnauthorized {
		t.Fatalf("password only: %d", code)
	}
	if code := post(`{"username":"boss","password":"adminpass123","totp":"000000"}`); code != http.StatusUnauthorized {
		t.Fatalf("wrong code: %d", code)
	}
	good, _ := totp.GenerateCode(key.Secret(), time.Now())
	if code := post(`{"username":"boss","password":"adminpass123","totp":"` + good + `"}`); code != http.StatusOK {
		t.Fatalf("valid code: %d", code)
	}
}
