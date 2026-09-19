package main

import "testing"

// Contact groups ("Groups panel" — confirmed as early as Skype 3.0.0.214,
// 2007; see docs/skype-eras/skype3.md). Deliberately asymmetric: which
// group a contact sits in is the owner's own filing, not a property of the
// friendship, so these tests pin that alice filing bob under a group
// never touches bob's own view of alice.

func TestContactGroups_SetAndBurstOnReauth(t *testing.T) {
	srv, hs, wsBase := newTestServer(t)
	registerAndVerify(t, srv, "alice", "password123")
	registerAndVerify(t, srv, "bob", "password123")
	friends(t, srv, "alice", "bob")

	a := dial(t, wsBase)
	auth(t, a, "alice", "password123")

	if err := a.WriteJSON(NexusMessage{Type: "contact_group_set", Recipient: "bob", Body: "Work"}); err != nil {
		t.Fatalf("contact_group_set: %v", err)
	}
	got := readUntil(t, a, func(m NexusMessage) bool { return m.Type == "contact_groups" })
	if got.ContactGroups["bob"] != "Work" {
		t.Fatalf("expected bob filed under Work, got %+v", got.ContactGroups)
	}

	// A fresh connection (simulating a reload) must see the same filing in
	// its post-auth burst, without sending contact_group_set again.
	a2 := dial(t, wsBase)
	auth(t, a2, "alice", "password123")
	burst := readUntil(t, a2, func(m NexusMessage) bool { return m.Type == "contact_groups" })
	if burst.ContactGroups["bob"] != "Work" {
		t.Fatalf("expected the filing to survive reauth, got %+v", burst.ContactGroups)
	}
	_ = hs
}

func TestContactGroups_AsymmetricBetweenOwners(t *testing.T) {
	srv, _, wsBase := newTestServer(t)
	registerAndVerify(t, srv, "alice", "password123")
	registerAndVerify(t, srv, "bob", "password123")
	friends(t, srv, "alice", "bob")

	a := dial(t, wsBase)
	b := dial(t, wsBase)
	auth(t, a, "alice", "password123")
	auth(t, b, "bob", "password123")

	if err := a.WriteJSON(NexusMessage{Type: "contact_group_set", Recipient: "bob", Body: "Work"}); err != nil {
		t.Fatalf("contact_group_set: %v", err)
	}
	readUntil(t, a, func(m NexusMessage) bool { return m.Type == "contact_groups" })

	// bob filing alice under a different name must not disturb alice's own
	// filing of bob, and vice versa — this is per-owner data, not a shared
	// property of the friendship.
	if err := b.WriteJSON(NexusMessage{Type: "contact_group_set", Recipient: "alice", Body: "Family"}); err != nil {
		t.Fatalf("contact_group_set: %v", err)
	}
	bobsView := readUntil(t, b, func(m NexusMessage) bool { return m.Type == "contact_groups" })
	if bobsView.ContactGroups["alice"] != "Family" {
		t.Fatalf("expected bob's own filing of alice to be Family, got %+v", bobsView.ContactGroups)
	}

	groups := srv.getContactGroups("alice")
	if groups["bob"] != "Work" {
		t.Fatalf("bob's filing of alice must not overwrite alice's filing of bob, got %+v", groups)
	}
}

func TestContactGroups_RejectsNonContact(t *testing.T) {
	srv, _, wsBase := newTestServer(t)
	registerAndVerify(t, srv, "alice", "password123")
	registerAndVerify(t, srv, "stranger", "password123")
	// Deliberately no friendship seeded.

	a := dial(t, wsBase)
	auth(t, a, "alice", "password123")

	if err := a.WriteJSON(NexusMessage{Type: "contact_group_set", Recipient: "stranger", Body: "Work"}); err != nil {
		t.Fatalf("contact_group_set: %v", err)
	}
	got := readUntil(t, a, func(m NexusMessage) bool { return m.Type == "contact_group_error" || m.Type == "contact_groups" })
	if got.Type != "contact_group_error" {
		t.Fatalf("filing a non-contact should be rejected, got %+v", got)
	}
	_ = srv
}

func TestContactGroups_EmptyNameUnfiles(t *testing.T) {
	srv, _, wsBase := newTestServer(t)
	registerAndVerify(t, srv, "alice", "password123")
	registerAndVerify(t, srv, "bob", "password123")
	friends(t, srv, "alice", "bob")

	a := dial(t, wsBase)
	auth(t, a, "alice", "password123")

	if err := a.WriteJSON(NexusMessage{Type: "contact_group_set", Recipient: "bob", Body: "Work"}); err != nil {
		t.Fatalf("contact_group_set: %v", err)
	}
	readUntil(t, a, func(m NexusMessage) bool { return m.Type == "contact_groups" })

	if err := a.WriteJSON(NexusMessage{Type: "contact_group_set", Recipient: "bob", Body: ""}); err != nil {
		t.Fatalf("contact_group_set: %v", err)
	}
	got := readUntil(t, a, func(m NexusMessage) bool { return m.Type == "contact_groups" })
	if _, stillFiled := got.ContactGroups["bob"]; stillFiled {
		t.Fatalf("expected an empty group name to un-file bob, got %+v", got.ContactGroups)
	}
}
