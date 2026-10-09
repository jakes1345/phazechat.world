package main

import (
	"encoding/json"
	"fmt"
	"os"
	"testing"
)

// The web client draws rewards from rewardCatalog.json; the server decides
// what can be won from rewardCatalog in rewards.go. They must agree.
func TestRewardCatalogMatchesWebCatalog(t *testing.T) {
	raw, err := os.ReadFile("../web/src/rewardCatalog.json")
	if err != nil {
		t.Fatalf("read web catalog: %v", err)
	}
	var web []struct{ ID, Kind, Rarity string }
	if err := json.Unmarshal(raw, &web); err != nil {
		t.Fatal(err)
	}
	if len(web) != len(rewardCatalog) {
		t.Fatalf("web has %d rewards, server has %d", len(web), len(rewardCatalog))
	}
	for i, w := range web {
		g := rewardCatalog[i]
		if w.ID != g.ID || w.Kind != g.Kind || w.Rarity != g.Rarity {
			t.Errorf("entry %d: web %+v vs server %+v", i, w, g)
		}
	}
}

func TestRarityWeightsSumTo100(t *testing.T) {
	sum := 0
	for _, r := range rarityOrder {
		sum += rarityWeight[r]
	}
	if sum != 100 {
		t.Fatalf("weights sum to %d; Settings shows them as percentages", sum)
	}
}

// intn that always returns the same value, for steering the roll.
func fixed(v int) func(int) int {
	return func(n int) int {
		if v >= n {
			return n - 1
		}
		return v
	}
}

func TestRollReward_RespectsRarityBands(t *testing.T) {
	// 0 lands in the first band (common), 99 in the last (legendary).
	if it, _ := rollReward(map[string]bool{}, 0, 0, fixed(0)); it.Rarity != "common" {
		t.Errorf("roll 0 gave %s", it.Rarity)
	}
	if it, _ := rollReward(map[string]bool{}, 0, 0, fixed(99)); it.Rarity != "legendary" {
		t.Errorf("roll 99 gave %s", it.Rarity)
	}
}

// A duplicate may only drop once every item of the rolled rarity is owned;
// until then a crate always gives something new.
func TestRollReward_DuplicatesOnlyWhenRarityExhausted(t *testing.T) {
	owned := map[string]bool{}
	sawDupe := false
	for i := 0; i < 3000; i++ {
		it, dupe := rollReward(owned, 0, 0, cryptoIntn)
		if owned[it.ID] != dupe {
			t.Fatalf("dupe flag %v but owned=%v for %s", dupe, owned[it.ID], it.ID)
		}
		if dupe {
			sawDupe = true
			for _, c := range rewardCatalog {
				if c.Rarity == it.Rarity && !owned[c.ID] {
					t.Fatalf("dropped a dupe %s while %s (%s) was still unowned", it.ID, c.ID, c.Rarity)
				}
			}
		}
		owned[it.ID] = true
	}
	if !sawDupe {
		t.Fatal("collection should have completed and started producing duplicates")
	}
}

func TestRollReward_PityFloors(t *testing.T) {
	// Even a worst-case roll can't come up common once pity has kicked in.
	if it, _ := rollReward(map[string]bool{}, pityRareAfter, 0, fixed(0)); rarityRank(it.Rarity) < 1 {
		t.Errorf("rare pity gave %s", it.Rarity)
	}
	if it, _ := rollReward(map[string]bool{}, pityRareAfter, pityEpicAfter, fixed(0)); rarityRank(it.Rarity) < 2 {
		t.Errorf("epic pity gave %s", it.Rarity)
	}
	// Floors hold even when the user owns everything at that rarity: it's a dupe, not a downgrade.
	owned := map[string]bool{}
	for _, c := range rewardCatalog {
		owned[c.ID] = true
	}
	it, dupe := rollReward(owned, pityEpicAfter, pityEpicAfter, fixed(0))
	if !dupe || rarityRank(it.Rarity) < 2 {
		t.Errorf("full collection under epic pity gave %+v dupe=%v", it, dupe)
	}
}

func TestPityCounters(t *testing.T) {
	r, e := pityCounters([]string{"squad", "cheers", "boba"})
	if r != 3 || e != 3 {
		t.Errorf("3 commons: %d/%d", r, e)
	}
	r, e = pityCounters([]string{"squad", "comet", "cheers"})
	if r != 1 || e != 3 {
		t.Errorf("rare then common: %d/%d", r, e)
	}
	r, e = pityCounters([]string{"squad", "legend"})
	if r != 0 || e != 0 {
		t.Errorf("legendary resets both: %d/%d", r, e)
	}
}

func referTo(t *testing.T, srv *NexusServer, owner, user, ip string) {
	t.Helper()
	if _, err := srv.registerUser(user, user+"@example.com", "", "correct-horse-9"); err != nil {
		t.Fatalf("register %s: %v", user, err)
	}
	srv.DB.Exec("UPDATE users SET referred_by = ?, signup_ip = ?, is_verified = 1 WHERE username = ?", owner, ip, user)
}

func TestSyncCrates_RulesAndIdempotence(t *testing.T) {
	srv, _, _ := newTestServer(t)
	registerAndVerify(t, srv, "alice", "correct-horse-1")

	// An unverified signup earns nothing.
	srv.registerUser("ghosty", "ghosty@example.com", "", "correct-horse-9")
	srv.DB.Exec("UPDATE users SET referred_by = 'alice' WHERE username = 'ghosty'")
	if n := srv.syncCrates("alice"); n != 0 {
		t.Fatalf("unverified earned %d", n)
	}

	// Three verified friends behind one connection: only 2 count.
	referTo(t, srv, "alice", "bob", "10.0.0.1")
	referTo(t, srv, "alice", "carol", "10.0.0.1")
	referTo(t, srv, "alice", "dave", "10.0.0.1")
	if n := srv.syncCrates("alice"); n != 2 {
		t.Fatalf("same-IP cap: granted %d, want 2", n)
	}
	if n := srv.syncCrates("alice"); n != 0 {
		t.Fatalf("second sync granted %d, want 0 (idempotent)", n)
	}

	// Distinct IPs are fine, up to the daily cap (5 total already: 2 + 3).
	for i, u := range []string{"erin", "frank", "grace", "heidi", "ivan"} {
		referTo(t, srv, "alice", u, fmt.Sprintf("10.0.1.%d", i+1))
	}
	if n := srv.syncCrates("alice"); n != 3 {
		t.Fatalf("daily cap: granted %d, want 3", n)
	}
	if got := srv.unopenedCrates("alice"); got != 5 {
		t.Fatalf("unopened = %d, want 5", got)
	}
}

func grantCrates(srv *NexusServer, owner string, n int) {
	for i := 0; i < n; i++ {
		srv.DB.Exec("INSERT INTO reward_crates (owner, source) VALUES (?, ?)", owner, fmt.Sprintf("src-%s-%d", owner, i))
	}
}

func TestOpenCrate_SpendsOneAndPrefersNewItems(t *testing.T) {
	srv, _, _ := newTestServer(t)
	registerAndVerify(t, srv, "alice", "correct-horse-1")
	if _, _, _, err := srv.openCrate("alice"); err != errNoCrates {
		t.Fatalf("no crates: %v", err)
	}
	grantCrates(srv, "alice", 3)
	seen := map[string]bool{}
	for i := 0; i < 3; i++ {
		it, dupe, shards, err := srv.openCrate("alice")
		if err != nil {
			t.Fatalf("open %d: %v", i, err)
		}
		// Only 3 crates against 5+ items per rarity: nothing can be a dupe yet.
		if dupe || shards != 0 || seen[it.ID] {
			t.Fatalf("open %d: %s dupe=%v shards=%d", i, it.ID, dupe, shards)
		}
		seen[it.ID] = true
	}
	if _, _, _, err := srv.openCrate("alice"); err != errNoCrates {
		t.Fatalf("after spending all: %v", err)
	}
	if got := len(srv.openedItems("alice")); got != 3 {
		t.Fatalf("inventory = %d", got)
	}
}

// Many crates: the inventory caps at the catalog, every duplicate pays
// shards, and the balance equals exactly what duplicates paid.
func TestOpenCrate_DuplicatesBecomeShards(t *testing.T) {
	srv, _, _ := newTestServer(t)
	registerAndVerify(t, srv, "alice", "correct-horse-1")
	grantCrates(srv, "alice", 120)
	want := 0
	for i := 0; i < 120; i++ {
		it, dupe, shards, err := srv.openCrate("alice")
		if err != nil {
			t.Fatal(err)
		}
		if dupe != (shards > 0) || (dupe && shards != shardsForDuplicate[it.Rarity]) {
			t.Fatalf("%s dupe=%v shards=%d", it.ID, dupe, shards)
		}
		want += shards
	}
	if got := len(srv.openedItems("alice")); got != len(rewardCatalog) {
		t.Fatalf("120 crates should complete the collection, have %d/%d", got, len(rewardCatalog))
	}
	if got := srv.shardBalance("alice"); got != want || want == 0 {
		t.Fatalf("balance %d, duplicates paid %d", got, want)
	}
}

func TestCraftReward(t *testing.T) {
	srv, _, _ := newTestServer(t)
	registerAndVerify(t, srv, "alice", "correct-horse-1")
	// 100 shards, as if from duplicates.
	srv.DB.Exec("INSERT INTO reward_crates (owner, source, item, shards) VALUES ('alice', 'seed', 'squad', 100)")

	if _, err := srv.craftReward("alice", "nope"); err != errUnknown {
		t.Fatalf("unknown: %v", err)
	}
	if _, err := srv.craftReward("alice", "legend"); err != errNotEnough {
		t.Fatalf("legendary with 100 shards: %v", err)
	}
	if _, err := srv.craftReward("alice", "squad"); err != errOwned {
		t.Fatalf("already owned: %v", err)
	}
	it, err := srv.craftReward("alice", "comet") // rare: 90
	if err != nil || it.ID != "comet" {
		t.Fatalf("craft comet: %+v %v", it, err)
	}
	if got := srv.shardBalance("alice"); got != 100-craftCost["rare"] {
		t.Fatalf("balance after craft = %d", got)
	}
	if _, err := srv.craftReward("alice", "comet"); err != errOwned {
		t.Fatalf("recraft: %v", err)
	}
	inv := srv.openedItems("alice")
	if len(inv) != 2 || inv[0] != "squad" || inv[1] != "comet" {
		t.Fatalf("inventory = %v", inv)
	}
}

// End to end over the socket: a referral verifies → referrer hears
// crate_earned live, opens it, friends see the new item, stats agree.
func TestReferral_CrateFlowOverWebSocket(t *testing.T) {
	srv, _, wsBase := newTestServer(t)
	registerAndVerify(t, srv, "alice", "correct-horse-1")
	registerAndVerify(t, srv, "zed", "correct-horse-1")
	srv.DB.Exec("INSERT INTO friends (user_a, user_b, status) VALUES ('alice','zed','accepted')")

	a := dial(t, wsBase)
	auth(t, a, "alice", "correct-horse-1")
	z := dial(t, wsBase)
	auth(t, z, "zed", "correct-horse-1")

	code, err := srv.registerUser("bob", "bob@example.com", "", "correct-horse-9")
	if err != nil {
		t.Fatal(err)
	}
	srv.DB.Exec("UPDATE users SET referred_by = 'alice' WHERE username = 'bob'")
	if srv.unopenedCrates("alice") != 0 {
		t.Fatal("crate granted before verification")
	}
	b := dial(t, wsBase)
	b.WriteJSON(NexusMessage{Type: "verify_email", Sender: "bob", Body: code})
	readUntil(t, b, func(m NexusMessage) bool { return m.Type == "verify_result" && m.Status == "ok" })

	earned := readUntil(t, a, func(m NexusMessage) bool { return m.Type == "crate_earned" })
	if earned.Sender != "bob" || earned.Crates != 1 || earned.Token != "1" {
		t.Fatalf("crate_earned = %+v", earned)
	}

	a.WriteJSON(NexusMessage{Type: "open_crate"})
	opened := readUntil(t, a, func(m NexusMessage) bool { return m.Type == "crate_opened" })
	if opened.Error != "" || opened.Item == "" || opened.Crates != 0 || len(opened.Items) != 1 || opened.Dupe {
		t.Fatalf("crate_opened = %+v", opened)
	}
	if _, ok := rewardByID(opened.Item); !ok {
		t.Fatalf("unknown item %q", opened.Item)
	}

	// zed (a friend) is told what alice now owns.
	p := readUntil(t, z, func(m NexusMessage) bool { return m.Type == "referral_perks" && len(m.Perks["alice"]) > 0 })
	if p.Perks["alice"][0] != opened.Item {
		t.Fatalf("friend saw %v, want %s", p.Perks["alice"], opened.Item)
	}

	// Spend shards the way a real duplicate would pay them, then craft.
	srv.DB.Exec("INSERT INTO reward_crates (owner, source, item, shards) VALUES ('alice', 'seed', 'squad', 500)")
	a.WriteJSON(NexusMessage{Type: "craft_reward", Item: "fx-aurora"}) // legendary: 700
	if r := readUntil(t, a, func(m NexusMessage) bool { return m.Type == "craft_result" }); r.Error == "" {
		t.Fatalf("crafting beyond balance should fail: %+v", r)
	}
	a.WriteJSON(NexusMessage{Type: "craft_reward", Item: "fx-hearts"}) // rare: 90
	cr := readUntil(t, a, func(m NexusMessage) bool { return m.Type == "craft_result" })
	if cr.Error != "" && opened.Item != "fx-hearts" {
		t.Fatalf("craft failed: %+v", cr)
	}

	// Nothing left to open.
	a.WriteJSON(NexusMessage{Type: "open_crate"})
	if r := readUntil(t, a, func(m NexusMessage) bool { return m.Type == "crate_opened" }); r.Error == "" {
		t.Fatalf("second open should fail: %+v", r)
	}

	a.WriteJSON(NexusMessage{Type: "get_referral_stats"})
	st := readUntil(t, a, func(m NexusMessage) bool { return m.Type == "referral_stats" })
	if st.Token != "1" || st.Crates != 0 || len(st.Items) < 1 || st.Duration != ambassadorAt-1 || st.Costs["rare"] != craftCost["rare"] {
		t.Fatalf("stats = %+v", st)
	}

	// A fresh login gets the inventory of self and friends.
	a2 := dial(t, wsBase)
	auth(t, a2, "alice", "correct-horse-1")
	lp := readUntil(t, a2, func(m NexusMessage) bool { return m.Type == "referral_perks" })
	if len(lp.Perks["alice"]) < 1 {
		t.Fatalf("login perks = %+v", lp.Perks)
	}
}
