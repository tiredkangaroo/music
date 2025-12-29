package library

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"math"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"slices"
	"strconv"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	queries "github.com/tiredkangaroo/music/db"
	"github.com/tiredkangaroo/music/env"
)

// Library represents a music library.
type Library struct {
	storagePath string
	pool        *pgxpool.Pool
	queries     *queries.Queries

	spotifyToken *spotifyToken
}

// Download downloads tracks, albums or playlists specified in things slice. A thing can be a
// link to a spotify track, album or playlist, or it can be a search query like
// "Blinding Lights - The Weeknd".
func (l *Library) Download(ctx context.Context, things []string) error {
	if env.DefaultEnv.Debug {
		slog.Debug("downloading", "things", things)
	}
	args := []string{"download"}
	args = append(args, things...)
	args = append(args, "--save-file", "metadata.spotdl", "--output", "{track-id}", "--format", "m4a", "--bitrate", "auto")

	logs := new(bytes.Buffer)
	cmd := exec.Command(env.DefaultEnv.PathToSpotDL, args...)
	cmd.Stdout = logs
	cmd.Stderr = logs
	cmd.Dir = l.storagePath

	if err := cmd.Run(); err != nil {
		return fmt.Errorf("spotdl command failed: %w\nlogs: %s", err, logs.String())
	} else if env.DefaultEnv.Debug {
		slog.Debug("spotdl logs", "logs", logs.String())
	}
	mdfile := filepath.Join(l.storagePath, "metadata.spotdl")
	defer os.Remove(mdfile)

	type trackMetadata struct {
		ID          string   `json:"song_id"`
		Name        string   `json:"name"`
		Date        string   `json:"date"`
		ArtistID    string   `json:"artist_id"`
		Artist      string   `json:"artist"`
		Artists     []string `json:"artists"`
		AlbumID     string   `json:"album_id"`
		AlbumName   string   `json:"album_name"`
		AlbumArtist string   `json:"album_artist"`
		CoverURL    string   `json:"cover_url"`
		Popularity  int32    `json:"popularity"`
		Duration    int32    `json:"duration"`
	}
	var metadataList []trackMetadata
	metadata, err := os.ReadFile(mdfile)
	if err != nil {
		return err
	}
	err = json.Unmarshal(metadata, &metadataList)
	if err != nil {
		return err
	}

	tx, err := l.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	q := l.queries.WithTx(tx)
	for _, m := range metadataList {
		track_date := releaseDate(m.Date)
		err = q.InsertTrack(context.Background(), queries.InsertTrackParams{
			ArtistID:         m.ArtistID,
			ArtistName:       m.Artist,
			Artists:          m.Artists,
			AlbumID:          m.AlbumID,
			AlbumName:        m.AlbumName,
			CoverUrl:         m.CoverURL,
			AlbumReleaseDate: pgtype.Date{},
			TrackID:          m.ID,
			TrackName:        m.Name,
			Duration:         m.Duration,
			Popularity:       m.Popularity,
			TrackReleaseDate: track_date,
		})
		if err != nil {
			return fmt.Errorf("insert track: %w", err)
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit tx: %w", err)
	}

	return nil
}

// DownloadIfNotExists checks if the track with the specified ID exists in storage,
// and downloads it if it is missing. It is intended to be slightly cheaper than Download
// because it does not run spotdl and does not update the database and extract metadata if
// the track already exists.
func (l *Library) DownloadIfNotExists(ctx context.Context, trackIDs ...string) error {
	for i, trackID := range trackIDs {
		p := filepath.Join(l.storagePath, filepath.Clean(trackID)+".m4a")
		if _, err := os.Stat(p); os.IsNotExist(err) {
			if err := l.Download(ctx, []string{"https://open.spotify.com/track/" + trackID}); err != nil {
				return fmt.Errorf("download track %s (successfully downloaded %d/%d): %w", trackID, i, len(trackIDs), err)
			}
		}
	}
	return nil
}

// ListPlaylists returns all playlists in the library.
func (l *Library) ListPlaylists(ctx context.Context) ([]queries.Playlist, error) {
	return l.queries.ListPlaylists(ctx)
}

// CreatePlaylist creates a new playlist with the specified name and returns its ID and any error if encountered.
func (l *Library) CreatePlaylist(ctx context.Context, name string, description string, imageURL string) (string, error) {
	id, err := l.queries.CreatePlaylist(ctx, queries.CreatePlaylistParams{
		Name:        name,
		Description: description,
		ImageUrl:    imageURL,
	})
	return id.String(), err
}

// DeletePlaylist deletes the playlist with the specified ID.
func (l *Library) DeletePlaylist(ctx context.Context, playlistID string) error {
	id, err := uuid.Parse(playlistID) // validate uuid
	if err != nil {
		return fmt.Errorf("invalid playlist id: %w", err)
	}
	return l.queries.DeletePlaylist(ctx, optuuid(id))
}

// GetPlaylist returns information about the specified playlist including its tracks.
func (l *Library) GetPlaylist(ctx context.Context, playlistID string) (queries.GetPlaylistRow, error) {
	id, err := uuid.Parse(playlistID) // validate uuid
	if err != nil {
		return queries.GetPlaylistRow{}, fmt.Errorf("invalid playlist id: %w", err)
	}
	return l.queries.GetPlaylist(ctx, optuuid(id))
}

// AddTrackToPlaylist adds the specified track to the specified playlist.
func (l *Library) AddTrackToPlaylist(ctx context.Context, playlistID, trackID string) error {
	pid, err := uuid.Parse(playlistID) // validate uuid
	if err != nil {
		return fmt.Errorf("invalid playlist id: %w", err)
	}
	go l.DownloadIfNotExists(ctx, trackID) // best effort download, ignore error, work in a seperate goroutine
	return l.queries.AddTrackToPlaylist(ctx, queries.AddTrackToPlaylistParams{
		PlaylistID: optuuid(pid),
		TrackID:    trackID,
	})
}

// RemoveTrackFromPlaylist removes the specified track from the specified playlist.
func (l *Library) RemoveTrackFromPlaylist(ctx context.Context, playlistID, trackID string) error {
	pid, err := uuid.Parse(playlistID) // validate uuid
	if err != nil {
		return fmt.Errorf("invalid playlist id: %w", err)
	}
	return l.queries.RemoveTrackFromPlaylist(ctx, queries.RemoveTrackFromPlaylistParams{
		PlaylistID: optuuid(pid),
		TrackID:    trackID,
	})
}

// Play returns a ReadCloser for the audio file for the specified track.
// It also records the play in the database. If the file is not found in storage,
// it downloads the track before returning the ReadCloser.
func (l *Library) Play(ctx context.Context, trackID string) (io.ReadCloser, error) {
	// where older tracks may be deleted from storage for space management
	// but their metadata remains in the database so it can be played
	// the file should be re-downloaded if not found
	p := filepath.Join(l.storagePath, filepath.Clean(trackID)+".m4a")
	rd, err := os.Open(p)
	if err == nil {
		l.RecordPlay(ctx, trackID)
		return rd, nil
	}
	if !os.IsNotExist(err) {
		return nil, fmt.Errorf("open track file: %w", err)
	}

	// file not found, re-download
	if err := l.Download(ctx, []string{"https://open.spotify.com/track/" + trackID}); err != nil {
		return nil, fmt.Errorf("download track: %w", err)
	}
	return os.Open(p)
}

// RecordPlay records a play of the specified track in the database.
func (l *Library) RecordPlay(ctx context.Context, trackID string) error {
	return l.queries.RecordPlay(ctx, queries.RecordPlayParams{
		TrackID:  trackID,
		PlayedAt: opttime(time.Now()),
	})
}

// RecordSkip records that the specified track was skipped at the given second.
func (l *Library) RecordSkip(ctx context.Context, trackID string, playedAt time.Time, skippedAt int32) error {
	return l.queries.RecordSkip(ctx, queries.RecordSkipParams{
		TrackID:   trackID,
		SkippedAt: optint32(skippedAt),
		PlayedAt:  opttime(playedAt),
	})
}

func (l *Library) Search(ctx context.Context, query string) ([]queries.SearchTrackByNameRow, error) {
	tracks, err := l.queries.SearchTrackByName(ctx, queries.SearchTrackByNameParams{
		Column1: optstring(query),
		Offset:  0,
		Limit:   25,
	})
	if err != nil {
		slog.Error("search in db", "error", err)
		return nil, fmt.Errorf("search in db: %w", err)
	}
	results := tracks

	u, _ := url.Parse("https://api.spotify.com/v1/search")
	q := u.Query()
	q.Add("q", query)
	q.Add("type", "track")
	q.Add("limit", "25")
	q.Add("offset", "0")
	u.RawQuery = q.Encode()

	req, err := http.NewRequestWithContext(ctx, "GET", u.String(), nil)
	if err != nil {
		return nil, fmt.Errorf("create search request: %w", err)
	}
	tk, err := l.spotifyToken.Token(ctx)
	if err != nil {
		return nil, fmt.Errorf("get spotify token: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+tk)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("perform search request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		b, _ := io.ReadAll(resp.Body)
		slog.Error("search request failed", "status", resp.StatusCode, "body", string(b))
		return nil, fmt.Errorf("search request failed: status %d", resp.StatusCode)
	}

	var data struct {
		Tracks struct {
			Items []struct {
				Album struct {
					ID          string `json:"id"`
					Name        string `json:"name"`
					ReleaseDate string `json:"release_date"`
					Images      []struct {
						URL string `json:"url"`
					} `json:"images"`
				} `json:"album"`
				Artists []struct {
					ID   string `json:"id"`
					Name string `json:"name"`
				} `json:"artists"`
				DurationMs int    `json:"duration_ms"`
				ID         string `json:"id"`
				Name       string `json:"name"`
				Popularity int32  `json:"popularity"`
			}
		}
	}
	err = json.NewDecoder(resp.Body).Decode(&data)
	if err != nil {
		return nil, fmt.Errorf("decode search response: %w", err)
	}

	for _, item := range data.Tracks.Items {
		if slices.ContainsFunc(results, func(t queries.SearchTrackByNameRow) bool { return t.TrackID == item.ID }) {
			continue
		}
		if len(item.Artists) == 0 {
			continue
		}
		var artistNames []string
		for _, artist := range item.Artists {
			artistNames = append(artistNames, artist.Name)
		}

		var coverURL string
		if len(item.Album.Images) > 0 {
			coverURL = item.Album.Images[0].URL
		}
		rd := releaseDate(item.Album.ReleaseDate)
		t := queries.SearchTrackByNameRow{
			ArtistID:   item.Artists[0].ID,
			ArtistName: item.Artists[0].Name,
			Artists:    artistNames,

			AlbumID:          item.Album.ID,
			AlbumName:        item.Album.Name,
			AlbumReleaseDate: rd,
			CoverUrl:         coverURL,

			TrackID:          item.ID,
			TrackName:        item.Name,
			TrackReleaseDate: rd,

			Duration:   int32(item.DurationMs / 1000), // convert ms to s
			Popularity: item.Popularity,
		}
		err := l.queries.InsertTrack(ctx, insertParamsFromSearchRow(t)) // skips dupes (on conflict do nothing)
		if err != nil {
			slog.Warn("insert track from search", "error", err, "track_id", t.TrackID)
		}
		results = append(results, t)
	}

	slices.SortFunc(results, func(a, b queries.SearchTrackByNameRow) int {
		// sort by exact name match first and popularity
		weight := math.Min(math.Abs(float64(len(a.TrackName)-len(query)))-math.Abs(float64(len(b.TrackName)-len(query))), 5) // closer length to query is better
		// a is closer? negative weight, a is better
		// b is closer? positive weight, b is better
		// weight is capped at 5 to prevent popularity from being overshadowed too much

		// include popularity in the weight, higher popularity is better
		weight -= math.Min(float64(a.Popularity-b.Popularity), 50) / 10 // a is more popular? subtract from weight, making a better
		// if weight is negative, a is better than b
		// if weight is positive, b is better than a
		// popularity difference is capped at 5 to prevent it from overshadowing name length too much
		// divided by x to reduce its impact compared to name length, a 20 popularity difference is equivalent to 2 character length difference if x=10
		// this number should be tuned for best results

		return int(weight)
	})
	return results, nil
}

func releaseDate(d string) pgtype.Date {
	var track_date pgtype.Date
	if len(d) == 4 { // year only
		yr, _ := strconv.Atoi(d)
		track_date = pgtype.Date{Time: time.Date(yr, 1, 1, 0, 0, 0, 0, time.UTC), Valid: true}
	} else if len(d) == 10 { // date only
		t, err := time.Parse(time.DateOnly, d)
		if err == nil {
			track_date = pgtype.Date{Time: t, Valid: true}
		}
	} // otherwise leave as zero value (invalid - null)
	return track_date
}

func NewLibrary(storagePath string, pool *pgxpool.Pool) *Library {
	q := queries.New(pool)
	return &Library{storagePath: storagePath, pool: pool, queries: q, spotifyToken: new(spotifyToken)}
}
