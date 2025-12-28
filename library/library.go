package library

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"slices"
	"strconv"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	queries "github.com/tiredkangaroo/music/db"
)

var pathToSpotDL = os.Getenv("SPOTDL_PATH")

// Library represents a music library.
type Library struct {
	storagePath string
	conn        *pgx.Conn
	queries     *queries.Queries

	spotifyToken *spotifyToken
}

// Download downloads tracks, albums or playlists specified in things slice. A thing can be a
// link to a spotify track, album or playlist, or it can be a search query like
// "Blinding Lights - The Weeknd".
func (l *Library) Download(ctx context.Context, things []string) error {
	args := []string{"download"}
	args = append(args, things...)
	args = append(args, "--save-file", "metadata.spotdl", "--output", "{track-id}")

	logs := new(bytes.Buffer)
	cmd := exec.Command(pathToSpotDL, args...)
	cmd.Stdout = logs
	cmd.Stderr = logs
	cmd.Dir = l.storagePath

	if err := cmd.Run(); err != nil {
		return fmt.Errorf("spotdl command failed: %w\nlogs: %s", err, logs.String())
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

	tx, err := l.conn.Begin(ctx)
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

// ListPlaylistTracks returns all tracks in the specified playlist.
func (l *Library) ListPlaylistTracks(ctx context.Context, playlistID string) ([]queries.Track, error) {
	id, err := uuid.Parse(playlistID) // validate uuid
	if err != nil {
		return nil, fmt.Errorf("invalid playlist id: %w", err)
	}
	return l.queries.ListPlaylistTracks(ctx, optuuid(id))
}

// AddTrackToPlaylist adds the specified track to the specified playlist.
func (l *Library) AddTrackToPlaylist(ctx context.Context, playlistID, trackID string) error {
	pid, err := uuid.Parse(playlistID) // validate uuid
	if err != nil {
		return fmt.Errorf("invalid playlist id: %w", err)
	}
	return l.queries.AddTrackToPlaylist(ctx, queries.AddTrackToPlaylistParams{
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
	rd, err := os.Open(filepath.Join(l.storagePath, filepath.Clean(trackID)))
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
	return os.Open(filepath.Join(l.storagePath, filepath.Clean(trackID)))
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

	fmt.Println(u.String())
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
		// sort by popularity descending
		return int(b.Popularity - a.Popularity)
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

func NewLibrary(storagePath string, conn *pgx.Conn) (*Library, error) {
	if pathToSpotDL == "" {
		return nil, fmt.Errorf("SPOTDL_PATH environment variable not set")
	}
	q := queries.New(conn)

	return &Library{storagePath: storagePath, conn: conn, queries: q, spotifyToken: new(spotifyToken)}, nil
}
