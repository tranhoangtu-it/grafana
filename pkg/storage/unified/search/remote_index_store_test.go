package search

import (
	"context"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
	"gocloud.dev/blob/memblob"

	"github.com/grafana/grafana/pkg/storage/unified/resource"
)

func newTestNsResource() resource.NamespacedResource {
	return resource.NamespacedResource{
		Namespace: "default",
		Group:     "dashboard.grafana.app",
		Resource:  "dashboards",
	}
}

func setupTestFiles(t *testing.T, dir string, files map[string]string) {
	t.Helper()
	for name, content := range files {
		path := filepath.Join(dir, name)
		require.NoError(t, os.MkdirAll(filepath.Dir(path), 0750))
		require.NoError(t, os.WriteFile(path, []byte(content), 0600))
	}
}

func TestRemoteIndexStore_UploadDownloadRoundTrip(t *testing.T) {
	ctx := context.Background()
	bucket := memblob.OpenBucket(nil)
	defer bucket.Close()
	store := NewRemoteIndexStore(bucket)
	ns := newTestNsResource()

	// Create local index files
	srcDir := t.TempDir()
	files := map[string]string{
		"index_meta.json": `{"some":"data"}`,
		"store/root.bolt": "bolt-data-here",
		"00000001.zap":    "segment-data-1",
		"00000002.zap":    "segment-data-2",
	}
	setupTestFiles(t, srcDir, files)

	meta := IndexMeta{
		GrafanaBuildVersion:   "11.0.0",
		UploadTimestamp:       time.Now().Truncate(time.Second),
		LatestResourceVersion: 42,
	}

	// Upload
	err := store.UploadIndex(ctx, ns, "snap-001", srcDir, meta)
	require.NoError(t, err)

	// Download to new dir
	destDir := t.TempDir()
	gotMeta, err := store.DownloadIndex(ctx, ns, "snap-001", destDir)
	require.NoError(t, err)

	// Verify meta
	require.Equal(t, meta.GrafanaBuildVersion, gotMeta.GrafanaBuildVersion)
	require.Equal(t, meta.LatestResourceVersion, gotMeta.LatestResourceVersion)
	require.Len(t, gotMeta.Files, len(files))

	// Verify file contents
	for name, content := range files {
		got, err := os.ReadFile(filepath.Join(destDir, name))
		require.NoError(t, err, "reading %s", name)
		require.Equal(t, content, string(got), "content mismatch for %s", name)
	}
}

func TestRemoteIndexStore_ListIndexes(t *testing.T) {
	ctx := context.Background()
	bucket := memblob.OpenBucket(nil)
	defer bucket.Close()
	store := NewRemoteIndexStore(bucket)
	ns := newTestNsResource()

	// Upload two snapshots
	for _, key := range []string{"snap-001", "snap-002"} {
		srcDir := t.TempDir()
		setupTestFiles(t, srcDir, map[string]string{
			"index_meta.json": `{"some":"data"}`,
			"00000001.zap":    "segment-data",
		})
		meta := IndexMeta{
			GrafanaBuildVersion:   "11.0.0",
			UploadTimestamp:       time.Now().Truncate(time.Second),
			LatestResourceVersion: 10,
		}
		require.NoError(t, store.UploadIndex(ctx, ns, key, srcDir, meta))
	}

	indexes, err := store.ListIndexes(ctx, ns)
	require.NoError(t, err)
	require.Len(t, indexes, 2)
	require.Contains(t, indexes, "snap-001")
	require.Contains(t, indexes, "snap-002")
}

func TestRemoteIndexStore_DeleteIndex(t *testing.T) {
	ctx := context.Background()
	bucket := memblob.OpenBucket(nil)
	defer bucket.Close()
	store := NewRemoteIndexStore(bucket)
	ns := newTestNsResource()

	srcDir := t.TempDir()
	setupTestFiles(t, srcDir, map[string]string{
		"index_meta.json": `{"some":"data"}`,
		"00000001.zap":    "segment-data",
	})
	meta := IndexMeta{
		GrafanaBuildVersion:   "11.0.0",
		UploadTimestamp:       time.Now().Truncate(time.Second),
		LatestResourceVersion: 10,
	}
	require.NoError(t, store.UploadIndex(ctx, ns, "snap-001", srcDir, meta))

	// Delete
	require.NoError(t, store.DeleteIndex(ctx, ns, "snap-001"))

	// List should be empty
	indexes, err := store.ListIndexes(ctx, ns)
	require.NoError(t, err)
	require.Empty(t, indexes)
}

func TestRemoteIndexStore_DownloadValidatesCompleteness(t *testing.T) {
	ctx := context.Background()
	bucket := memblob.OpenBucket(nil)
	defer bucket.Close()
	store := NewRemoteIndexStore(bucket)
	ns := newTestNsResource()

	// Upload normally first
	srcDir := t.TempDir()
	setupTestFiles(t, srcDir, map[string]string{
		"index_meta.json": `{"some":"data"}`,
		"00000001.zap":    "segment-data",
	})
	meta := IndexMeta{
		GrafanaBuildVersion:   "11.0.0",
		UploadTimestamp:       time.Now().Truncate(time.Second),
		LatestResourceVersion: 10,
	}
	require.NoError(t, store.UploadIndex(ctx, ns, "snap-001", srcDir, meta))

	// Delete one of the data files from the bucket to simulate partial upload
	prefix := "default/dashboard.grafana.app.dashboards/snap-001/"
	require.NoError(t, bucket.Delete(ctx, prefix+"00000001.zap"))

	// Download should fail validation
	destDir := t.TempDir()
	_, err := store.DownloadIndex(ctx, ns, "snap-001", destDir)
	require.Error(t, err)
	require.Contains(t, err.Error(), "missing")
}
