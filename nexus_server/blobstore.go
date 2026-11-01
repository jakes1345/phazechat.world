package main

import (
	"context"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
)

// Blob storage for user files: chat uploads and profile pictures.
//
// By default these live on local disk (uploadDir() and ./avatars), which is
// right for self-hosting and for a host with a persistent volume. A host
// whose disk is wiped on restart — Cloudflare Containers — sets
// PHAZE_BLOB_STORE=s3 and the same files go to an S3-compatible bucket
// (Cloudflare R2) instead, sharing the bucket and credentials Litestream
// uses for the database:
//
//	PHAZE_BLOB_STORE=s3
//	BUCKET_NAME            bucket (LITESTREAM_BUCKET also accepted)
//	AWS_ENDPOINT_URL_S3    e.g. https://<account>.r2.cloudflarestorage.com
//	AWS_REGION             "auto" for R2
//	AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY
//
// Keys are "uploads/<name>" and "avatars/<username>.png"; Litestream keeps
// the database under "nexus.db/", so the three never collide.

var errBlobNotFound = errors.New("blob not found")

type blobInfo struct {
	Size    int64
	ModTime time.Time
}

type blobStore interface {
	// Put stores r under key. size may be -1 when unknown.
	Put(ctx context.Context, key string, r io.Reader, size int64, contentType string) error
	// Open returns the blob for reading; errBlobNotFound when absent.
	Open(ctx context.Context, key string) (io.ReadSeekCloser, blobInfo, error)
	Delete(ctx context.Context, key string) error
}

// diskBlobStore maps key prefixes onto directories, so existing installs
// keep their files exactly where they already are.
type diskBlobStore struct {
	dirFor func(prefix string) string
}

func (d diskBlobStore) path(key string) (string, error) {
	prefix, name, ok := strings.Cut(key, "/")
	if !ok || name == "" || name != filepath.Base(name) || name == "." || name == ".." {
		return "", fmt.Errorf("bad blob key %q", key)
	}
	return filepath.Join(d.dirFor(prefix), name), nil
}

func (d diskBlobStore) Put(_ context.Context, key string, r io.Reader, _ int64, _ string) error {
	p, err := d.path(key)
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
		return err
	}
	// Write to a temp file and rename, so a reader never sees half a file
	// and a failed copy leaves nothing behind.
	tmp, err := os.CreateTemp(filepath.Dir(p), ".tmp-*")
	if err != nil {
		return err
	}
	if _, err := io.Copy(tmp, r); err != nil {
		tmp.Close()
		os.Remove(tmp.Name())
		return err
	}
	if err := tmp.Close(); err != nil {
		os.Remove(tmp.Name())
		return err
	}
	return os.Rename(tmp.Name(), p)
}

func (d diskBlobStore) Open(_ context.Context, key string) (io.ReadSeekCloser, blobInfo, error) {
	p, err := d.path(key)
	if err != nil {
		return nil, blobInfo{}, errBlobNotFound
	}
	f, err := os.Open(p)
	if errors.Is(err, os.ErrNotExist) {
		return nil, blobInfo{}, errBlobNotFound
	} else if err != nil {
		return nil, blobInfo{}, err
	}
	st, err := f.Stat()
	if err != nil {
		f.Close()
		return nil, blobInfo{}, err
	}
	return f, blobInfo{Size: st.Size(), ModTime: st.ModTime()}, nil
}

func (d diskBlobStore) Delete(_ context.Context, key string) error {
	p, err := d.path(key)
	if err != nil {
		return err
	}
	if err := os.Remove(p); err != nil && !errors.Is(err, os.ErrNotExist) {
		return err
	}
	return nil
}

type s3BlobStore struct {
	client *minio.Client
	bucket string
}

func newS3BlobStore(endpoint, region, bucket, accessKey, secretKey string) (*s3BlobStore, error) {
	if bucket == "" || endpoint == "" || accessKey == "" || secretKey == "" {
		return nil, errors.New("s3 blob store needs BUCKET_NAME, AWS_ENDPOINT_URL_S3, AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY")
	}
	u, err := url.Parse(endpoint)
	if err != nil || u.Host == "" {
		return nil, fmt.Errorf("bad AWS_ENDPOINT_URL_S3 %q", endpoint)
	}
	client, err := minio.New(u.Host, &minio.Options{
		Creds:  credentials.NewStaticV4(accessKey, secretKey, ""),
		Secure: u.Scheme != "http",
		Region: region,
		// R2 serves path-style; it also keeps bucket names out of DNS.
		BucketLookup: minio.BucketLookupPath,
	})
	if err != nil {
		return nil, err
	}
	return &s3BlobStore{client: client, bucket: bucket}, nil
}

func (s *s3BlobStore) Put(ctx context.Context, key string, r io.Reader, size int64, contentType string) error {
	if contentType == "" {
		contentType = "application/octet-stream"
	}
	_, err := s.client.PutObject(ctx, s.bucket, key, r, size, minio.PutObjectOptions{ContentType: contentType})
	return err
}

func (s *s3BlobStore) Open(ctx context.Context, key string) (io.ReadSeekCloser, blobInfo, error) {
	obj, err := s.client.GetObject(ctx, s.bucket, key, minio.GetObjectOptions{})
	if err != nil {
		return nil, blobInfo{}, err
	}
	// GetObject is lazy; Stat makes the request and surfaces a 404.
	st, err := obj.Stat()
	if err != nil {
		obj.Close()
		if minio.ToErrorResponse(err).StatusCode == http.StatusNotFound {
			return nil, blobInfo{}, errBlobNotFound
		}
		return nil, blobInfo{}, err
	}
	return obj, blobInfo{Size: st.Size, ModTime: st.LastModified}, nil
}

func (s *s3BlobStore) Delete(ctx context.Context, key string) error {
	return s.client.RemoveObject(ctx, s.bucket, key, minio.RemoveObjectOptions{})
}

func defaultDiskBlobStore() diskBlobStore {
	return diskBlobStore{dirFor: func(prefix string) string {
		if prefix == "uploads" {
			return uploadDir()
		}
		return prefix
	}}
}

// blobStoreFromEnv picks the store at startup. An s3 store that is
// misconfigured is fatal rather than a silent fall back to local disk:
// on an ephemeral host that fall back would quietly lose every file.
func blobStoreFromEnv() (blobStore, error) {
	switch mode := strings.ToLower(strings.TrimSpace(os.Getenv("PHAZE_BLOB_STORE"))); mode {
	case "", "disk":
		return defaultDiskBlobStore(), nil
	case "s3":
		bucket := os.Getenv("BUCKET_NAME")
		if bucket == "" {
			bucket = os.Getenv("LITESTREAM_BUCKET")
		}
		return newS3BlobStore(os.Getenv("AWS_ENDPOINT_URL_S3"), os.Getenv("AWS_REGION"), bucket,
			os.Getenv("AWS_ACCESS_KEY_ID"), os.Getenv("AWS_SECRET_ACCESS_KEY"))
	default:
		return nil, fmt.Errorf("unknown PHAZE_BLOB_STORE %q (want disk or s3)", mode)
	}
}

var (
	blobsOnce sync.Once
	blobsImpl blobStore
)

// blobs returns the process-wide store, choosing it on first use.
func blobs() blobStore {
	blobsOnce.Do(func() {
		if blobsImpl != nil {
			return
		}
		b, err := blobStoreFromEnv()
		if err != nil {
			log.Fatalf("[blobs] %v", err)
		}
		blobsImpl = b
	})
	return blobsImpl
}

// serveBlob writes a stored blob with Range and If-Modified-Since support.
func serveBlob(w http.ResponseWriter, r *http.Request, key string) {
	f, info, err := blobs().Open(r.Context(), key)
	if errors.Is(err, errBlobNotFound) {
		http.NotFound(w, r)
		return
	} else if err != nil {
		log.Printf("[blobs] open %s: %v", key, err)
		http.Error(w, "storage error", http.StatusInternalServerError)
		return
	}
	defer f.Close()
	http.ServeContent(w, r, filepath.Base(key), info.ModTime, f)
}
