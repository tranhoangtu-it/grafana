package search

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"time"

	"gocloud.dev/blob"

	"github.com/grafana/grafana/pkg/storage/unified/resource"
)

const metaJSONFile = "meta.json"

// IndexMeta contains metadata about a remote index snapshot.
type IndexMeta struct {
	// GrafanaBuildVersion is the version of Grafana that built this index.
	GrafanaBuildVersion string `json:"grafana_build_version"`
	// UploadTimestamp is when the snapshot was uploaded.
	UploadTimestamp time.Time `json:"upload_timestamp"`
	// LatestResourceVersion is the latest resource version included in the index.
	LatestResourceVersion int64 `json:"latest_resource_version"`
	// Files maps relative file paths to their sizes in bytes.
	Files map[string]int64 `json:"files"`
}

// RemoteIndexStore manages index snapshots on remote object storage.
// Object storage layout:
//
//	/<namespace>/<group>.<resource>/<index-key>/index_meta.json
//	/<namespace>/<group>.<resource>/<index-key>/store/root.bolt
//	/<namespace>/<group>.<resource>/<index-key>/*.zap
//	/<namespace>/<group>.<resource>/<index-key>/meta.json  <- uploaded last, signals complete upload
type RemoteIndexStore interface {
	// UploadIndex uploads a local index directory to remote storage.
	// The meta.json is uploaded last to signal a complete upload.
	UploadIndex(ctx context.Context, nsResource resource.NamespacedResource, indexKey string, localDir string, meta IndexMeta) error

	// DownloadIndex downloads a remote index to a local directory.
	// Validates completeness against the manifest in meta.json.
	DownloadIndex(ctx context.Context, nsResource resource.NamespacedResource, indexKey string, destDir string) (*IndexMeta, error)

	// ListIndexes lists all complete index snapshots for a namespaced resource.
	ListIndexes(ctx context.Context, nsResource resource.NamespacedResource) (map[string]*IndexMeta, error)

	// DeleteIndex deletes all files for an index snapshot.
	DeleteIndex(ctx context.Context, nsResource resource.NamespacedResource, indexKey string) error
}

// remoteIndexStore implements RemoteIndexStore using a CDKBucket.
type remoteIndexStore struct {
	bucket resource.CDKBucket
}

// NewRemoteIndexStore creates a new RemoteIndexStore backed by the given bucket.
func NewRemoteIndexStore(bucket resource.CDKBucket) RemoteIndexStore {
	return &remoteIndexStore{bucket: bucket}
}

// indexPrefix returns the object storage prefix for a namespaced resource + index key.
func indexPrefix(ns resource.NamespacedResource, indexKey string) string {
	return fmt.Sprintf("%s/%s.%s/%s/", ns.Namespace, ns.Group, ns.Resource, indexKey)
}

// nsPrefix returns the object storage prefix for a namespaced resource (without index key).
func nsPrefix(ns resource.NamespacedResource) string {
	return fmt.Sprintf("%s/%s.%s/", ns.Namespace, ns.Group, ns.Resource)
}

func (s *remoteIndexStore) UploadIndex(ctx context.Context, nsResource resource.NamespacedResource, indexKey string, localDir string, meta IndexMeta) error {
	pfx := indexPrefix(nsResource, indexKey)

	// Walk local directory and collect files
	var filePaths []string
	err := filepath.Walk(localDir, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}
		if info.IsDir() {
			return nil
		}
		rel, err := filepath.Rel(localDir, path)
		if err != nil {
			return err
		}
		filePaths = append(filePaths, rel)
		return nil
	})
	if err != nil {
		return fmt.Errorf("walking local dir: %w", err)
	}

	// Build file manifest
	meta.Files = make(map[string]int64, len(filePaths))
	for _, rel := range filePaths {
		info, err := os.Stat(filepath.Join(localDir, rel))
		if err != nil {
			return fmt.Errorf("stat %s: %w", rel, err)
		}
		meta.Files[rel] = info.Size()
	}

	// Upload each file using streaming
	for _, rel := range filePaths {
		objectKey := pfx + filepath.ToSlash(rel)
		if err := s.uploadFile(ctx, objectKey, filepath.Join(localDir, rel)); err != nil {
			return fmt.Errorf("uploading %s: %w", rel, err)
		}
	}

	// Upload meta.json last — its presence signals a complete upload
	metaBytes, err := json.Marshal(meta)
	if err != nil {
		return fmt.Errorf("marshaling meta: %w", err)
	}
	if err := s.bucket.WriteAll(ctx, pfx+metaJSONFile, metaBytes, nil); err != nil {
		return fmt.Errorf("uploading meta.json: %w", err)
	}

	return nil
}

func (s *remoteIndexStore) uploadFile(ctx context.Context, objectKey, localPath string) error {
	f, err := os.Open(localPath)
	if err != nil {
		return err
	}
	defer f.Close()

	return s.bucket.Upload(ctx, objectKey, f, &blob.WriterOptions{
		ContentType: "application/octet-stream",
	})
}

func (s *remoteIndexStore) DownloadIndex(ctx context.Context, nsResource resource.NamespacedResource, indexKey string, destDir string) (*IndexMeta, error) {
	pfx := indexPrefix(nsResource, indexKey)

	// Read meta.json first
	metaBytes, err := s.bucket.ReadAll(ctx, pfx+metaJSONFile)
	if err != nil {
		return nil, fmt.Errorf("reading meta.json: %w", err)
	}
	var meta IndexMeta
	if err := json.Unmarshal(metaBytes, &meta); err != nil {
		return nil, fmt.Errorf("parsing meta.json: %w", err)
	}

	// Download each file from the manifest
	cleanDest := filepath.Clean(destDir) + string(os.PathSeparator)
	for relPath, expectedSize := range meta.Files {
		objectKey := pfx + relPath
		localPath := filepath.Join(destDir, filepath.FromSlash(relPath))

		// Prevent path traversal from malicious manifests
		if !strings.HasPrefix(filepath.Clean(localPath), cleanDest) {
			return nil, fmt.Errorf("path traversal detected in manifest: %s", relPath)
		}

		if err := os.MkdirAll(filepath.Dir(localPath), 0750); err != nil {
			return nil, fmt.Errorf("creating dir for %s: %w", relPath, err)
		}

		if err := s.downloadFile(ctx, objectKey, localPath); err != nil {
			return nil, fmt.Errorf("downloading %s: %w", relPath, err)
		}

		// Validate size
		info, err := os.Stat(localPath)
		if err != nil {
			return nil, fmt.Errorf("stat downloaded %s: %w", relPath, err)
		}
		if info.Size() != expectedSize {
			return nil, fmt.Errorf("size mismatch for %s: expected %d, got %d", relPath, expectedSize, info.Size())
		}
	}

	return &meta, nil
}

func (s *remoteIndexStore) downloadFile(ctx context.Context, objectKey, localPath string) error {
	f, err := os.Create(localPath)
	if err != nil {
		return err
	}

	if err := s.bucket.Download(ctx, objectKey, f, nil); err != nil {
		f.Close()
		return fmt.Errorf("missing file %s: %w", objectKey, err)
	}
	return f.Close()
}

func (s *remoteIndexStore) ListIndexes(ctx context.Context, nsResource resource.NamespacedResource) (map[string]*IndexMeta, error) {
	nsPfx := nsPrefix(nsResource)
	result := make(map[string]*IndexMeta)

	// List all objects under the namespace prefix, looking for meta.json files
	iter := s.bucket.List(&blob.ListOptions{Prefix: nsPfx})
	for {
		obj, err := iter.Next(ctx)
		if err == io.EOF {
			break
		}
		if err != nil {
			return nil, fmt.Errorf("listing objects: %w", err)
		}

		// We only care about meta.json files
		if !strings.HasSuffix(obj.Key, "/"+metaJSONFile) {
			continue
		}

		// Extract index key from: <nsPfx><indexKey>/meta.json
		rel := strings.TrimPrefix(obj.Key, nsPfx)
		indexKey := strings.TrimSuffix(rel, "/"+metaJSONFile)
		if indexKey == "" || strings.Contains(indexKey, "/") {
			continue // skip nested or malformed paths
		}

		// Fetch and parse meta.json
		metaBytes, err := s.bucket.ReadAll(ctx, obj.Key)
		if err != nil {
			continue // skip indexes with unreadable meta
		}
		var meta IndexMeta
		if err := json.Unmarshal(metaBytes, &meta); err != nil {
			continue // skip indexes with corrupt meta
		}
		result[indexKey] = &meta
	}

	return result, nil
}

func (s *remoteIndexStore) DeleteIndex(ctx context.Context, nsResource resource.NamespacedResource, indexKey string) error {
	pfx := indexPrefix(nsResource, indexKey)

	// List all objects under this prefix and delete them
	iter := s.bucket.List(&blob.ListOptions{Prefix: pfx})
	for {
		obj, err := iter.Next(ctx)
		if err == io.EOF {
			break
		}
		if err != nil {
			return fmt.Errorf("listing objects for deletion: %w", err)
		}
		if err := s.bucket.Delete(ctx, obj.Key); err != nil {
			return fmt.Errorf("deleting %s: %w", obj.Key, err)
		}
	}

	return nil
}
