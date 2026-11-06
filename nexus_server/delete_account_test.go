package main

import "testing"

// Deleting an account removes every row keyed by the username, so a new
// account with the same name starts empty.
func TestDeleteAccountLeavesNothingBehind(t *testing.T) {
	srv, _, _ := newTestServer(t)
	registerAndVerify(t, srv, "gone", "password123")
	seed := []string{
		`INSERT INTO skype_import_messages (username, conversation_id, body, sent_at) VALUES ('gone','c','secret','t')`,
		`INSERT INTO skype_import_contacts (username, skype_id) VALUES ('gone','live:x')`,
		`INSERT INTO known_devices (username, device_id) VALUES ('gone','d1')`,
		`INSERT INTO contact_groups (owner, contact, group_name) VALUES ('gone','x','Work')`,
		`INSERT INTO calls (caller, callee) VALUES ('gone','x')`,
		`INSERT INTO invite_codes (code, inviter, email) VALUES ('abc','gone','a@example.com')`,
		`INSERT INTO reward_crates (owner, source) VALUES ('gone','src1')`,
	}
	for _, q := range seed {
		if _, err := srv.DB.Exec(q); err != nil {
			t.Fatalf("%s: %v", q, err)
		}
	}
	if err := srv.deleteAccount("gone"); err != nil {
		t.Fatal(err)
	}
	for _, q := range []string{
		`SELECT COUNT(*) FROM skype_import_messages WHERE username='gone'`,
		`SELECT COUNT(*) FROM skype_import_contacts WHERE username='gone'`,
		`SELECT COUNT(*) FROM known_devices WHERE username='gone'`,
		`SELECT COUNT(*) FROM contact_groups WHERE owner='gone'`,
		`SELECT COUNT(*) FROM calls WHERE caller='gone'`,
		`SELECT COUNT(*) FROM invite_codes WHERE inviter='gone'`,
		`SELECT COUNT(*) FROM reward_crates WHERE owner='gone'`,
		`SELECT COUNT(*) FROM users WHERE username='gone'`,
	} {
		var n int
		srv.DB.QueryRow(q).Scan(&n)
		if n != 0 {
			t.Errorf("%s = %d after deletion", q, n)
		}
	}
}
