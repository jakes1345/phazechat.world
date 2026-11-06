package main

import "testing"

// Wrong guesses burn the code, so it can't be brute-forced.
func TestVerifyCodeBurnsAfterWrongGuesses(t *testing.T) {
	srv, _, _ := newTestServer(t)
	if _, err := srv.DB.Exec(`INSERT INTO users (username, email, mood, password_hash, salt, verification_code) VALUES ('bob','bob@example.com','', 'x', '', '123456')`); err != nil {
		t.Fatal(err)
	}
	for i := 0; i < maxVerifyAttempts; i++ {
		if srv.verifyUser("bob", "000000") {
			t.Fatal("wrong code accepted")
		}
	}
	if srv.verifyUser("bob", "123456") {
		t.Fatal("correct code still works after too many wrong guesses")
	}
	srv.DB.Exec(`UPDATE users SET verification_code='654321' WHERE username='bob'`)
	if !srv.verifyUser("bob", "654321") {
		t.Fatal("a freshly issued code must verify")
	}
}
