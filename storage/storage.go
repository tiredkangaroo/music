package storage

import (
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"time"

	"github.com/google/uuid"
	"github.com/tiredkangaroo/music/env"
)

type Storage interface {
	// Store uses the provided reader to store the data and returns a link to access the data.
	Store(ctx context.Context, rd io.Reader, contentType string) (string, error)
}

// LocalStorage is a storage implementation that stores data locally on disk. It expects a /data/:key
// path on the BackendURL to serve the files.
type LocalStorage struct {
	DataPath string
}

func (ls *LocalStorage) Store(ctx context.Context, rd io.Reader, contentType string) (string, error) {
	var r [16]byte
	rand.Read(r[:])
	key := fmt.Sprintf("%x", r[:])

	p := filepath.Join(ls.DataPath, key)
	f, err := os.OpenFile(p, os.O_CREATE|os.O_WRONLY, 0644)
	if err != nil {
		return "", err
	}
	defer f.Close()

	if _, err := io.Copy(f, rd); err != nil {
		return "", err
	}

	return env.DefaultEnv.BackendURL + "/api/v1/data/" + key, nil
}

func (ls *LocalStorage) Load(key string) (io.ReadCloser, error) {
	p := filepath.Join(ls.DataPath, key)
	f, err := os.Open(p)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, fmt.Errorf("file not found")
		}
		return nil, fmt.Errorf("open file: %w", err)
	}
	return f, nil
}

func NewLocalStorage(dataPath string) *LocalStorage {
	os.MkdirAll(dataPath, 0755)
	return &LocalStorage{
		DataPath: dataPath,
	}
}

// RemoteStorage is a storage implementation that stores data on a remote tiredkangaroo/storage server.
type RemoteStorage struct {
	StorageURL       string
	StorageAPISecret string
}

func (rs *RemoteStorage) signRequest(req *http.Request) {
	uploadID := uuid.New().String()
	timestamp := strconv.FormatInt(time.Now().UTC().Unix(), 10)

	cs := uploadID + "\n" + timestamp
	csh := hmac.New(sha256.New, []byte(rs.StorageAPISecret))
	csh.Write([]byte(cs))
	csb := csh.Sum(nil)
	csb_hex := fmt.Sprintf("%x", csb)

	req.Header.Set("X-Upload-ID", uploadID)
	req.Header.Set("X-Timestamp", timestamp)
	req.Header.Set("X-Signature", csb_hex)
}

func (rs *RemoteStorage) Store(ctx context.Context, rd io.Reader, contentType string) (string, error) {
	req, err := http.NewRequestWithContext(ctx, "POST", rs.StorageURL+"/push", rd)
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", contentType)
	rs.signRequest(req)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusCreated {
		slog.Error("store image", "status", resp.StatusCode)
		return "", fmt.Errorf("storage server returned status %d", resp.StatusCode)
	}
	data, err := io.ReadAll(resp.Body) // the body is the image key
	if err != nil {
		return "", err
	}
	return env.DefaultEnv.StorageURL + "/pull/" + string(data), nil
}

// NewRemoteStorage creates a new RemoteStorage instance.
func NewRemoteStorage(storageURL, storageAPISecret string) *RemoteStorage {
	return &RemoteStorage{
		StorageURL:       storageURL,
		StorageAPISecret: storageAPISecret,
	}
}
