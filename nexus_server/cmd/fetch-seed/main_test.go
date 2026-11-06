package main

import (
	"bytes"
	"context"
	"database/sql"
	"errors"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"github.com/johannesboyne/gofakes3"
	"github.com/johannesboyne/gofakes3/backend/s3mem"
	"github.com/minio/minio-go/v7"
)

func fakeBucket(t *testing.T) *minio.Client {
	t.Helper()
	backend := s3mem.New()
	if err := backend.CreateBucket("phaze"); err != nil {
		t.Fatal(err)
	}
	hs := httptest.NewServer(gofakes3.New(backend).Server())
	t.Cleanup(hs.Close)
	c, err := newClient(hs.URL, "auto", "key", "secret")
	if err != nil {
		t.Fatal(err)
	}
	return c
}

func putSeed(t *testing.T, c *minio.Client, body []byte) {
	t.Helper()
	putObject(t, c, seedKey, body)
}

func putObject(t *testing.T, c *minio.Client, key string, body []byte) {
	t.Helper()
	if _, err := c.PutObject(context.Background(), "phaze", key, bytes.NewReader(body), int64(len(body)), minio.PutObjectOptions{}); err != nil {
		t.Fatal(err)
	}
}

func makeDB(t *testing.T) []byte {
	t.Helper()
	p := filepath.Join(t.TempDir(), "src.db")
	db, err := sql.Open("sqlite", p)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`CREATE TABLE users(name TEXT); INSERT INTO users VALUES ('alice')`); err != nil {
		t.Fatal(err)
	}
	db.Close()
	b, err := os.ReadFile(p)
	if err != nil {
		t.Fatal(err)
	}
	return b
}

func TestFetchSeed_ImportsDatabase(t *testing.T) {
	c := fakeBucket(t)
	putSeed(t, c, makeDB(t))
	dst := filepath.Join(t.TempDir(), "data", "nexus.db")
	if err := fetchSeed(context.Background(), c, "phaze", dst); err != nil {
		t.Fatal(err)
	}
	db, err := sql.Open("sqlite", dst)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	var name string
	if err := db.QueryRow(`SELECT name FROM users`).Scan(&name); err != nil || name != "alice" {
		t.Fatalf("got %q, %v", name, err)
	}
}

func TestFetchSeed_NoSeed(t *testing.T) {
	dst := filepath.Join(t.TempDir(), "nexus.db")
	if err := fetchSeed(context.Background(), fakeBucket(t), "phaze", dst); !errors.Is(err, errNoSeed) {
		t.Fatalf("err = %v", err)
	}
	if _, err := os.Stat(dst); !errors.Is(err, os.ErrNotExist) {
		t.Fatal("database created without a seed")
	}
}

func TestFetchSeed_RejectsGarbage(t *testing.T) {
	c := fakeBucket(t)
	putSeed(t, c, []byte("definitely not sqlite, just some bytes"))
	dir := t.TempDir()
	dst := filepath.Join(dir, "nexus.db")
	if err := fetchSeed(context.Background(), c, "phaze", dst); err == nil {
		t.Fatal("garbage accepted")
	}
	entries, _ := os.ReadDir(dir)
	if len(entries) != 0 {
		t.Fatalf("left files behind: %v", entries)
	}
}

func TestFetchSeed_NeverOverwrites(t *testing.T) {
	c := fakeBucket(t)
	putSeed(t, c, makeDB(t))
	dst := filepath.Join(t.TempDir(), "nexus.db")
	if err := os.WriteFile(dst, []byte("live"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := fetchSeed(context.Background(), c, "phaze", dst); err == nil {
		t.Fatal("overwrote an existing database")
	}
	if b, _ := os.ReadFile(dst); string(b) != "live" {
		t.Fatalf("database changed: %q", b)
	}
}

// A copy taken from a live server: recent writes are only in the WAL.
func TestFetchSeed_AppliesWAL(t *testing.T) {
	p := filepath.Join(t.TempDir(), "live.db")
	db, err := sql.Open("sqlite", p)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	db.SetMaxOpenConns(1)
	for _, q := range []string{
		"PRAGMA journal_mode=WAL",
		"PRAGMA wal_autocheckpoint=0",
		"CREATE TABLE users(name TEXT)",
		"INSERT INTO users VALUES ('alice'), ('bob')",
	} {
		if _, err := db.Exec(q); err != nil {
			t.Fatal(err)
		}
	}
	main, _ := os.ReadFile(p)
	wal, err := os.ReadFile(p + "-wal")
	if err != nil || len(wal) == 0 {
		t.Fatalf("expected a WAL: %v", err)
	}

	c := fakeBucket(t)
	putSeed(t, c, main)
	putObject(t, c, seedWALKey, wal)
	dir := t.TempDir()
	dst := filepath.Join(dir, "nexus.db")
	if err := fetchSeed(context.Background(), c, "phaze", dst); err != nil {
		t.Fatal(err)
	}
	got, err := sql.Open("sqlite", "file:"+dst+"?mode=ro")
	if err != nil {
		t.Fatal(err)
	}
	defer got.Close()
	var n int
	if err := got.QueryRow("SELECT count(*) FROM users").Scan(&n); err != nil || n != 2 {
		t.Fatalf("rows = %d, %v", n, err)
	}
	entries, _ := os.ReadDir(dir)
	if len(entries) != 1 {
		t.Fatalf("expected only nexus.db, got %v", entries)
	}
}
