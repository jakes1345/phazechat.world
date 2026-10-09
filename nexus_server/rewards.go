package main

import (
	"crypto/rand"
	"database/sql"
	"errors"
	"math/big"
	"strings"
)

// Reward crates: every verified friend who joins through your invite earns
// one crate; opening it yields a random cosmetic. Earned only — nothing
// here is for sale, on purpose (paid random boxes are regulated as
// gambling in several places, and this is a thank-you, not a store).
//
// The catalog is mirrored in web/src/rewardCatalog.json; a test fails if
// the two drift apart. The server is the authority on who owns what: it
// tells clients each friend's inventory, and clients only draw a reward
// as art / play its effect when the *sender* owns it. That keeps rewards
// meaningful even though shortcodes are public and 1:1 messages are
// end-to-end encrypted — the server never has to read a message.

type rewardItem struct {
	ID     string
	Kind   string // emoticon | sticker | effect
	Rarity string // common | rare | epic | legendary
}

var rewardCatalog = []rewardItem{
	{"squad", "emoticon", "common"},
	{"cheers", "emoticon", "common"},
	{"boba", "emoticon", "common"},
	{"sticker-hello", "sticker", "common"},
	{"sticker-gg", "sticker", "common"},

	{"comet", "emoticon", "rare"},
	{"rocket", "emoticon", "rare"},
	{"sticker-cat", "sticker", "rare"},
	{"fx-confetti", "effect", "rare"},
	{"fx-hearts", "effect", "rare"},

	{"crown", "emoticon", "epic"},
	{"diamond", "emoticon", "epic"},
	{"sticker-cosmic", "sticker", "epic"},
	{"fx-fireworks", "effect", "epic"},

	{"legend", "emoticon", "legendary"},
	{"fx-aurora", "effect", "legendary"},
}

var rarityOrder = []string{"common", "rare", "epic", "legendary"}

// Odds out of 100. Shown to users in Settings — keep the two in step.
var rarityWeight = map[string]int{"common": 60, "rare": 28, "epic": 10, "legendary": 2}

// Pity: so bad luck has a ceiling. After this many crates in a row below
// the rarity, the next one is guaranteed to be at least that rare.
const (
	pityRareAfter = 3
	pityEpicAfter = 9
)

// Duplicates are allowed, but only once you own everything of the rarity
// that dropped — until then a crate always gives something new. A duplicate
// turns into shards, and shards can be spent to craft any item you're
// still missing, so bad luck is never a dead end. Tunable.
var shardsForDuplicate = map[string]int{"common": 10, "rare": 30, "epic": 80, "legendary": 250}
var craftCost = map[string]int{"common": 30, "rare": 90, "epic": 250, "legendary": 700}

// Anti-farming. A referral only earns a crate once it has verified its
// email (disposable domains are refused at signup). On top of that, one
// signup IP can earn a referrer at most 2 crates (a household or dorm is
// fine; one person farming from their own connection is not), and at most
// 5 crates accrue per 24h — the rest wait and are picked up later, since
// syncCrates is idempotent.
const (
	maxCratesPerSignupIP = 2
	maxCratesPerDay      = 5
)

func rarityRank(r string) int {
	for i, x := range rarityOrder {
		if x == r {
			return i
		}
	}
	return 0
}

func rewardByID(id string) (rewardItem, bool) {
	for _, it := range rewardCatalog {
		if it.ID == id {
			return it, true
		}
	}
	return rewardItem{}, false
}

// pityCounters walks a user's opened crates, oldest first, and returns how
// many in a row have come up below rare / below epic.
func pityCounters(opened []string) (sinceRare, sinceEpic int) {
	for _, id := range opened {
		it, ok := rewardByID(id)
		if !ok {
			continue
		}
		if rarityRank(it.Rarity) >= 1 {
			sinceRare = 0
		} else {
			sinceRare++
		}
		if rarityRank(it.Rarity) >= 2 {
			sinceEpic = 0
		} else {
			sinceEpic++
		}
	}
	return
}

// rollReward rolls a rarity from the full odds table (respecting pity
// floors), then picks an item of that rarity the user doesn't own yet.
// Only when they own every item of that rarity does it hand back a
// duplicate (dupe=true). `intn` is injectable so tests are deterministic.
func rollReward(owned map[string]bool, sinceRare, sinceEpic int, intn func(n int) int) (it rewardItem, dupe bool) {
	floor := 0
	if sinceEpic >= pityEpicAfter {
		floor = 2
	} else if sinceRare >= pityRareAfter {
		floor = 1
	}
	total := 0
	for _, r := range rarityOrder {
		if rarityRank(r) >= floor {
			total += rarityWeight[r]
		}
	}
	n := intn(total)
	rarity := rarityOrder[floor]
	for _, r := range rarityOrder {
		if rarityRank(r) < floor {
			continue
		}
		if n < rarityWeight[r] {
			rarity = r
			break
		}
		n -= rarityWeight[r]
	}
	var fresh, all []rewardItem
	for _, c := range rewardCatalog {
		if c.Rarity != rarity {
			continue
		}
		all = append(all, c)
		if !owned[c.ID] {
			fresh = append(fresh, c)
		}
	}
	if len(fresh) > 0 {
		return fresh[intn(len(fresh))], false
	}
	return all[intn(len(all))], true
}

func cryptoIntn(n int) int {
	v, err := rand.Int(rand.Reader, big.NewInt(int64(n)))
	if err != nil {
		panic("crypto/rand: " + err.Error())
	}
	return int(v.Int64())
}

func (s *NexusServer) initRewardsDB() {
	s.DB.Exec(`CREATE TABLE IF NOT EXISTS reward_crates (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		owner TEXT NOT NULL,
		source TEXT NOT NULL UNIQUE,
		item TEXT,
		shards INTEGER NOT NULL DEFAULT 0,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		opened_at DATETIME
	)`)
	s.DB.Exec(`CREATE INDEX IF NOT EXISTS idx_reward_crates_owner ON reward_crates(owner)`)
	// Items crafted with shards. UNIQUE: you can't craft what you own.
	s.DB.Exec(`CREATE TABLE IF NOT EXISTS reward_crafts (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		owner TEXT NOT NULL,
		item TEXT NOT NULL,
		cost INTEGER NOT NULL,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		UNIQUE(owner, item)
	)`)
}

// syncCrates awards crates for verified referrals that haven't earned one
// yet, subject to the anti-farming limits. Returns how many were granted.
func (s *NexusServer) syncCrates(owner string) int {
	rows, err := s.DB.Query(`SELECT username, COALESCE(signup_ip, '') FROM users
		WHERE referred_by = ? AND is_verified = 1
		AND username NOT IN (SELECT source FROM reward_crates)
		ORDER BY created_at, username`, owner)
	if err != nil {
		return 0
	}
	type cand struct{ user, ip string }
	var cands []cand
	for rows.Next() {
		var c cand
		rows.Scan(&c.user, &c.ip)
		cands = append(cands, c)
	}
	rows.Close()

	granted := 0
	for _, c := range cands {
		var today int
		s.DB.QueryRow(`SELECT COUNT(*) FROM reward_crates WHERE owner = ? AND created_at > datetime('now', '-1 day')`, owner).Scan(&today)
		if today >= maxCratesPerDay {
			break
		}
		if c.ip != "" {
			var sameIP int
			s.DB.QueryRow(`SELECT COUNT(*) FROM reward_crates rc JOIN users u ON u.username = rc.source
				WHERE rc.owner = ? AND u.signup_ip = ?`, owner, c.ip).Scan(&sameIP)
			if sameIP >= maxCratesPerSignupIP {
				continue
			}
		}
		if res, err := s.DB.Exec(`INSERT OR IGNORE INTO reward_crates (owner, source) VALUES (?, ?)`, owner, c.user); err == nil {
			if n, _ := res.RowsAffected(); n > 0 {
				granted++
			}
		}
	}
	return granted
}

func (s *NexusServer) unopenedCrates(owner string) int {
	var n int
	s.DB.QueryRow(`SELECT COUNT(*) FROM reward_crates WHERE owner = ? AND item IS NULL`, owner).Scan(&n)
	return n
}

// rolledItems returns what the owner's opened crates dropped, oldest
// first, duplicates included — pity is computed from this.
func (s *NexusServer) rolledItems(owner string) []string {
	rows, err := s.DB.Query(`SELECT item FROM reward_crates WHERE owner = ? AND item IS NOT NULL ORDER BY opened_at, id`, owner)
	if err != nil {
		return nil
	}
	defer rows.Close()
	var out []string
	for rows.Next() {
		var it string
		rows.Scan(&it)
		out = append(out, it)
	}
	return out
}

// openedItems is the owner's inventory: every distinct item they have,
// whether it dropped from a crate or was crafted, in catalog order.
func (s *NexusServer) openedItems(owner string) []string {
	have := map[string]bool{}
	for _, it := range s.rolledItems(owner) {
		have[it] = true
	}
	if rows, err := s.DB.Query(`SELECT item FROM reward_crafts WHERE owner = ?`, owner); err == nil {
		for rows.Next() {
			var it string
			rows.Scan(&it)
			have[it] = true
		}
		rows.Close()
	}
	var out []string
	for _, c := range rewardCatalog {
		if have[c.ID] {
			out = append(out, c.ID)
		}
	}
	return out
}

func (s *NexusServer) shardBalance(owner string) int {
	var gained, spent int
	s.DB.QueryRow(`SELECT COALESCE(SUM(shards), 0) FROM reward_crates WHERE owner = ?`, owner).Scan(&gained)
	s.DB.QueryRow(`SELECT COALESCE(SUM(cost), 0) FROM reward_crafts WHERE owner = ?`, owner).Scan(&spent)
	return gained - spent
}

var (
	errNoCrates  = errors.New("You don't have any crates to open")
	errUnknown   = errors.New("Unknown reward")
	errOwned     = errors.New("You already own that")
	errNotEnough = errors.New("Not enough shards")
)

// openCrate spends the oldest unopened crate. dupe=true means it dropped
// something already owned, which was converted to shards (returned).
func (s *NexusServer) openCrate(owner string) (it rewardItem, dupe bool, shards int, err error) {
	var crateID int64
	err = s.DB.QueryRow(`SELECT id FROM reward_crates WHERE owner = ? AND item IS NULL ORDER BY id LIMIT 1`, owner).Scan(&crateID)
	if errors.Is(err, sql.ErrNoRows) {
		return rewardItem{}, false, 0, errNoCrates
	} else if err != nil {
		return rewardItem{}, false, 0, err
	}
	owned := map[string]bool{}
	for _, id := range s.openedItems(owner) {
		owned[id] = true
	}
	sinceRare, sinceEpic := pityCounters(s.rolledItems(owner))
	it, dupe = rollReward(owned, sinceRare, sinceEpic, cryptoIntn)
	if dupe {
		shards = shardsForDuplicate[it.Rarity]
	}
	// Conditional update: a racing second open can't double-spend a crate.
	res, err := s.DB.Exec(`UPDATE reward_crates SET item = ?, shards = ?, opened_at = CURRENT_TIMESTAMP WHERE id = ? AND item IS NULL`, it.ID, shards, crateID)
	if err != nil {
		return rewardItem{}, false, 0, err
	}
	if n, _ := res.RowsAffected(); n != 1 {
		return rewardItem{}, false, 0, errors.New("Busy — try again")
	}
	return it, dupe, shards, nil
}

// craftReward spends shards on a specific item the owner doesn't have.
func (s *NexusServer) craftReward(owner, itemID string) (rewardItem, error) {
	it, ok := rewardByID(itemID)
	if !ok {
		return rewardItem{}, errUnknown
	}
	for _, have := range s.openedItems(owner) {
		if have == itemID {
			return rewardItem{}, errOwned
		}
	}
	cost := craftCost[it.Rarity]
	if s.shardBalance(owner) < cost {
		return rewardItem{}, errNotEnough
	}
	if _, err := s.DB.Exec(`INSERT INTO reward_crafts (owner, item, cost) VALUES (?, ?, ?)`, owner, itemID, cost); err != nil {
		if strings.Contains(err.Error(), "UNIQUE") {
			return rewardItem{}, errOwned
		}
		return rewardItem{}, err
	}
	return it, nil
}
