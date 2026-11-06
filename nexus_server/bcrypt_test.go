package main

import (
	"os"
	"testing"

	"golang.org/x/crypto/bcrypt"
)

// Tests hash a lot of passwords, and at the production cost of 12 under the
// race detector that alone pushed the suite past CI's 20-minute limit. The
// cost is stored in each hash, so tests still exercise the real code paths.
func TestMain(m *testing.M) {
	bcryptCost = bcrypt.MinCost
	os.Exit(m.Run())
}

// The privacy policy promises cost 12 for stored passwords.
func TestProductionBcryptCostMatchesPrivacyPolicy(t *testing.T) {
	if productionBcryptCost != 12 {
		t.Fatalf("production bcrypt cost is %d, the privacy policy says 12", productionBcryptCost)
	}
}
