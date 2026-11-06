package main

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func adminAction(t *testing.T, srv *NexusServer, actor, target, action string) int {
	t.Helper()
	tok, err := srv.issueAdminSessionToken(actor)
	if err != nil {
		t.Fatal(err)
	}
	req := httptest.NewRequest(http.MethodPost, "/api/v1/admin/users/"+target+"/"+action, nil)
	req.AddCookie(&http.Cookie{Name: "phaze_admin_token", Value: tok})
	rec := httptest.NewRecorder()
	srv.adminBanHandler(rec, req)
	return rec.Code
}

// A plain admin can't ban, reset 2FA on, or delete a super_admin, but can
// still moderate regular users.
func TestAdminActionsRespectRoleHierarchy(t *testing.T) {
	srv, _, _ := newTestServer(t)
	for _, u := range []string{"admin1", "owner", "user1"} {
		registerAndVerify(t, srv, u, "password123")
	}
	srv.DB.Exec(`UPDATE users SET role='admin', is_admin=1 WHERE username='admin1'`)
	srv.DB.Exec(`UPDATE users SET role='super_admin', is_admin=1 WHERE username='owner'`)

	for _, action := range []string{"ban", "reset_totp", "delete"} {
		if code := adminAction(t, srv, "admin1", "owner", action); code != http.StatusForbidden {
			t.Fatalf("admin %s on super_admin: got %d", action, code)
		}
	}
	if code := adminAction(t, srv, "admin1", "user1", "ban"); code != http.StatusOK {
		t.Fatalf("admin banning a user: got %d", code)
	}
	if code := adminAction(t, srv, "owner", "admin1", "ban"); code != http.StatusOK {
		t.Fatalf("super_admin banning an admin: got %d", code)
	}
}
