// fetch-seed: first-boot import of an existing Phaze database on hosts
// whose disk starts empty (Cloudflare Containers).
//
// The container's entrypoint runs it after `litestream restore` found no
// replica in the bucket. If the bucket holds an object at seed/nexus.db
// (put there by cloudflare/seed-from-fly.sh), it is downloaded together
// with seed/nexus.db-wal when present (a copy taken from a running server
// keeps recent writes in the WAL), folded into one file, checked to be a
// sound SQLite database, and moved into place; Litestream then makes
// it the first replica, so the seed is only ever read once.
//
// Exit status: 0 when the database was seeded or there is no seed, 1 on
// any error (the entrypoint refuses to start rather than run on an empty
// database by mistake).
//
//	fetch-seed -db /data/nexus.db
//
// Reads the same bucket settings as the server and Litestream:
// BUCKET_NAME (or LITESTREAM_BUCKET), AWS_ENDPOINT_URL_S3, AWS_REGION,
// AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY.
package main

import (
	"context"
	"database/sql"
	"errors"
	"flag"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"time"

	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
	_ "modernc.org/sqlite"
)

const (
	seedKey    = "seed/nexus.db"
	seedWALKey = seedKey + "-wal"
)

var errNoSeed = errors.New("no seed in bucket")

func main() {
	dbPath := flag.String("db", "/data/nexus.db", "where to write the database")
	flag.Parse()

	bucket := os.Getenv("BUCKET_NAME")
	if bucket == "" {
		bucket = os.Getenv("LITESTREAM_BUCKET")
	}
	client, err := newClient(os.Getenv("AWS_ENDPOINT_URL_S3"), os.Getenv("AWS_REGION"),
		os.Getenv("AWS_ACCESS_KEY_ID"), os.Getenv("AWS_SECRET_ACCESS_KEY"))
	if err != nil || bucket == "" {
		log.Fatalf("[fetch-seed] bucket settings incomplete: %v", err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Minute)
	defer cancel()

	switch err := fetchSeed(ctx, client, bucket, *dbPath); {
	case errors.Is(err, errNoSeed):
		log.Printf("[fetch-seed] no %s in bucket; starting with a new database", seedKey)
	case err != nil:
		log.Fatalf("[fetch-seed] %v", err)
	default:
		log.Printf("[fetch-seed] imported %s into %s", seedKey, *dbPath)
	}
}

func newClient(endpoint, region, accessKey, secretKey string) (*minio.Client, error) {
	if endpoint == "" || accessKey == "" || secretKey == "" {
		return nil, errors.New("need AWS_ENDPOINT_URL_S3, AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY")
	}
	u, err := url.Parse(endpoint)
	if err != nil || u.Host == "" {
		return nil, fmt.Errorf("bad AWS_ENDPOINT_URL_S3 %q", endpoint)
	}
	return minio.New(u.Host, &minio.Options{
		Creds:        credentials.NewStaticV4(accessKey, secretKey, ""),
		Secure:       u.Scheme != "http",
		Region:       region,
		BucketLookup: minio.BucketLookupPath,
	})
}

// fetchSeed downloads the seed into dbPath. It never overwrites an existing
// database, and a seed that is not a sound SQLite file is rejected before
// anything is put in place.
func fetchSeed(ctx context.Context, client *minio.Client, bucket, dbPath string) error {
	if _, err := os.Stat(dbPath); err == nil {
		return fmt.Errorf("%s already exists; refusing to overwrite it", dbPath)
	}
	if err := os.MkdirAll(filepath.Dir(dbPath), 0o755); err != nil {
		return err
	}
	tmp, err := os.CreateTemp(filepath.Dir(dbPath), ".seed-*.db")
	if err != nil {
		return err
	}
	tmp.Close()
	tmpName := tmp.Name()
	// No-ops once the database has been renamed into place.
	defer os.Remove(tmpName)
	defer os.Remove(tmpName + "-wal")
	defer os.Remove(tmpName + "-shm")

	if err := download(ctx, client, bucket, seedKey, tmpName); err != nil {
		return err
	}
	// SQLite finds a WAL by name, so it sits next to the copy as <db>-wal.
	switch err := download(ctx, client, bucket, seedWALKey, tmpName+"-wal"); {
	case errors.Is(err, errNoSeed):
	case err != nil:
		return err
	default:
		if err := foldWAL(tmpName); err != nil {
			return fmt.Errorf("applying %s: %w", seedWALKey, err)
		}
	}
	if err := checkSQLite(tmpName); err != nil {
		return fmt.Errorf("%s is not a usable database: %w", seedKey, err)
	}
	return os.Rename(tmpName, dbPath)
}

// download writes one object to path; errNoSeed when it does not exist.
func download(ctx context.Context, client *minio.Client, bucket, key, path string) error {
	obj, err := client.GetObject(ctx, bucket, key, minio.GetObjectOptions{})
	if err != nil {
		return err
	}
	defer obj.Close()
	if _, err := obj.Stat(); err != nil {
		if minio.ToErrorResponse(err).StatusCode == http.StatusNotFound {
			return errNoSeed
		}
		return fmt.Errorf("reading %s: %w", key, err)
	}
	f, err := os.Create(path)
	if err != nil {
		return err
	}
	if _, err := io.Copy(f, obj); err != nil {
		f.Close()
		return fmt.Errorf("downloading %s: %w", key, err)
	}
	return f.Close()
}

// foldWAL checkpoints the WAL beside path into the database file and
// switches it back to a rollback journal, leaving one self-contained file.
func foldWAL(path string) error {
	db, err := sql.Open("sqlite", "file:"+path)
	if err != nil {
		return err
	}
	defer db.Close()
	db.SetMaxOpenConns(1)
	var busy, logFrames, checkpointed int
	if err := db.QueryRow("PRAGMA wal_checkpoint(TRUNCATE)").Scan(&busy, &logFrames, &checkpointed); err != nil {
		return err
	}
	if busy != 0 {
		return errors.New("checkpoint did not complete")
	}
	var mode string
	if err := db.QueryRow("PRAGMA journal_mode=DELETE").Scan(&mode); err != nil {
		return err
	}
	if mode != "delete" {
		return fmt.Errorf("journal mode stayed %q", mode)
	}
	return nil
}

func checkSQLite(path string) error {
	f, err := os.Open(path)
	if err != nil {
		return err
	}
	header := make([]byte, 16)
	_, err = io.ReadFull(f, header)
	f.Close()
	if err != nil || string(header) != "SQLite format 3\x00" {
		return errors.New("missing SQLite header")
	}
	db, err := sql.Open("sqlite", "file:"+path+"?mode=ro")
	if err != nil {
		return err
	}
	defer db.Close()
	var result string
	if err := db.QueryRow("PRAGMA quick_check").Scan(&result); err != nil {
		return err
	}
	if result != "ok" {
		return fmt.Errorf("quick_check: %s", result)
	}
	return nil
}
