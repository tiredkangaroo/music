package library

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"slices"
	"strconv"
	"strings"
	"sync"
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

	// mini thing abt no dupe: importing playlists does not use dlNoDuplicate
	dlNoDuplicate *noDuplicate[error]
	// we're using maximum ongoing downloads now because i think the # of 403 from yt increases and is related to too many concurrent download (only really happens when importing and not single track downloads)
	ongoingDownloads        *slots
	maximumOngoingDownloads int

	youtubeURLRegexp *regexp.Regexp
}

// Download downloads tracks, albums or playlists specified in things slice. A thing can be a
// link to a spotify track, album or playlist, or it can be a search query like
// "Blinding Lights - The Weeknd".
func (l *Library) Download(ctx context.Context, thing string) error {
	slog.Info("starting download", "thing", thing)

	if !l.dlNoDuplicate.Add(thing) { // make sure we only do the preDownload() -> download() flow once
		slog.Info("download already in progress, skipping", "thing", thing)
		return l.dlNoDuplicate.Wait(thing)
	}
	slog.Info("acquired download lock", "thing", thing)

	trackID, youtubeURL, err := l.preDownload(thing)
	if err != nil {
		slog.Info("pre-download failed (releasing lock)", "thing", thing, "error", err)
		l.dlNoDuplicate.Remove(thing, err)
		return err
	}
	slog.Info("pre-download completed", "thing", thing, "track_id", trackID, "youtube_url", youtubeURL)
	err = l.download(ctx, trackID, youtubeURL)
	slog.Info("download completed (releasing lock)", "thing", thing, "error", err)
	l.dlNoDuplicate.Remove(thing, err)
	return err
}

func (l *Library) DownloadPlaylist(ctx context.Context, playlistID string) error {
	// gets all the tracks from the playlist not downloaded
	// then downloads them all
	tracks, err := l.queries.GetPlaylistTracksNotDownloaded(ctx, optuuid(uuid.MustParse(playlistID)))
	if err != nil {
		return fmt.Errorf("get playlist: %w", err)
	}
	slog.Info("got tracks for playlist bulk dl", "playlist_id", playlistID, "total_tracks", len(tracks))
	wg := sync.WaitGroup{}
	for _, track := range tracks {
		wg.Add(1)
		slog.Info("queuing track for download from playlist", "track_id", track.TrackID, "track_name", track.TrackName, "playlist_id", playlistID)
		go func(trackID string) {
			defer wg.Done()
			if err := l.Download(ctx, "https://open.spotify.com/track/"+trackID); err != nil {
				slog.Error("download track from playlist", "error", err, "track_id", trackID, "track_name", track.TrackName, "playlist_id", playlistID)
			} else {
				slog.Info("downloaded track from playlist", "track_id", trackID, "track_name", track.TrackName, "playlist_id", playlistID)
			}
			slog.Info("finished processing track for playlist download", "track_id", trackID, "track_name", track.TrackName, "playlist_id", playlistID)
		}(track.TrackID)
	}
	wg.Wait()
	slog.Info("completed downloading tracks for playlist", "playlist_id", playlistID)
	return nil
}

// CreateSkeletonTrack creates a skeleton track entry with the track ID (to avoid fkey errors
// when adding to playlists) but with no metadata. the metadata can be filled in later bc the insert
// track is upsert.
func (l *Library) createSkeletonTrack(ctx context.Context, trackID string) error {
	return l.queries.InsertTrack(ctx, queries.InsertTrackParams{
		TrackID:          trackID,
		Artists:          []string{},
		AlbumReleaseDate: optdate(time.Time{}),
		TrackReleaseDate: optdate(time.Time{}),
	})
}

func (l *Library) download(ctx context.Context, trackID, youtubeURL string) error {
	// acquire a slot to perform downloading
	l.ongoingDownloads.Acquire()
	defer l.ongoingDownloads.Release()

	// download audio using yt-dlp
	ydlArgs := []string{
		"-x",
		"--audio-format", "m4a",
		"--output", filepath.Join(l.storagePath, fmt.Sprintf("%s.m4a", trackID)),
		"--extractor-args", "youtube:player_client=default,ios,-android_sdkless;formats=missing_pot",
		"--format", "bv[protocol=m3u8_native]+ba[protocol=m3u8_native]/b[protocol=m3u8_native]",
	}
	ydlArgs = append(ydlArgs, youtubeURL)

	ydlLogs := new(bytes.Buffer)
	ydlCmd := exec.CommandContext(ctx, "yt-dlp", ydlArgs...)
	ydlCmd.Stdout = ydlLogs
	ydlCmd.Stderr = ydlLogs
	ydlCmd.Dir = l.storagePath

	if err := ydlCmd.Run(); err != nil {
		if strings.Contains(ydlLogs.String(), "This video is age-restricted") {
			err = fmt.Errorf("track is age-restricted")
			return err
		}
		slog.Error("yt-dlp command failed", "error", err, "logs", maxLengthString(ydlLogs.String(), 30))
		return fmt.Errorf("yt-dlp command failed: %w", err)
	}
	slog.Info("downloaded", "track_id", trackID)
	// see if there's any mp4 files and delete them (yt-dlp creates audioless mp4 files?? idk what the option is to stop that)
	files, err := os.ReadDir(l.storagePath)
	if err != nil {
		return fmt.Errorf("read storage directory: %w", err)
	}
	for _, file := range files {
		if strings.HasSuffix(file.Name(), ".mp4") {
			os.Remove(filepath.Join(l.storagePath, file.Name()))
		}
	}
	l.queries.MarkTrackAsDownloaded(context.Background(), trackID)
	return nil
}

// downloadIfNotExists checks if the track with the specified ID exists in storage,
// and downloads it if it is missing.
func (l *Library) downloadIfNotExists(ctx context.Context, trackID, youtubeURL string) error {
	p := filepath.Join(l.storagePath, filepath.Clean(trackID)+".m4a")
	if _, err := os.Stat(p); os.IsNotExist(err) {
		for range 3 { // try downloading 3 times
			if err := l.download(ctx, trackID, youtubeURL); err != nil {
				if strings.Contains(err.Error(), "age-restricted") {
					return err
				}
			} else {
				return nil
			}
		}
	} else {
		slog.Info("track already exists, skipping download", "track_id", trackID)
		l.queries.MarkTrackAsDownloaded(ctx, trackID)
	}
	return nil
}

// preDownload performs the steps before downloading (metadata & youtube url extraction).
// returns the track ID, youtube URL and any error encountered. note: do we need a preDownloadIfNotExists?
// also note: do we need a noDupeDl here?
func (l *Library) preDownload(thing string) (string, string, error) {
	slog.Info("pre-downloading", "thing", thing)

	u, err := url.Parse(thing)
	if u.Scheme == "https" && u.Host == "open.spotify.com" && len(u.Path) > 6 && strings.HasPrefix(u.Path, "/track/") {
		trackID := strings.TrimPrefix(u.Path, "/track/")
		if trackID[len(trackID)-1] == '/' { // omit trailing slash if it exists
			trackID = trackID[:len(trackID)-1]
		}
		if youtubeURL, err := l.queries.GetYoutubeURLByTrackID(context.Background(), trackID); err == nil && youtubeURL != "" {
			slog.Info("found youtube url in db, skipping spotdl", "track_id", trackID, "youtube_url", youtubeURL)
			return trackID, youtubeURL, nil
		}
	}

	// steps: spotdl url and metadata download
	// read youtube url (split by \n, idx 1) then read metadata and insert into db
	// then use yt-dlp to download audio files
	// spotdl url [thing] --save-file metadata.spotdl --client-id [client id] --client-secret [client secret]
	safeThingName := sha256.Sum256([]byte(uuid.New().String())) // use hashed random to avoid issues with special characters in filenames & using different names for different things bc multiple downloads can happen simultaneously
	args := []string{"url"}
	args = append(args, thing)
	args = append(args, "--save-file", filepath.Join(l.storagePath, fmt.Sprintf("%x-metadata.spotdl", safeThingName)))
	args = append(args, "--client-id", env.DefaultEnv.SpotifyClientID)
	args = append(args, "--client-secret", env.DefaultEnv.SpotifyClientSecret)

	logs := new(bytes.Buffer)
	cmd := exec.Command(env.DefaultEnv.PathToSpotDL, args...)
	cmd.Stdout = logs
	cmd.Stderr = logs
	cmd.Dir = l.storagePath

	if err := cmd.Run(); err != nil {
		return "", "", fmt.Errorf("spotdl command failed: %w\nlogs: %s", err, logs.String())
	}
	ytURLmatches := l.youtubeURLRegexp.FindAllString(logs.String(), -1)
	if len(ytURLmatches) == 0 {
		slog.Error("could not find youtube url in spotdl output", "logs", logs.String())
		return "", "", fmt.Errorf("could not find youtube url in spotdl output")
	}
	youtubeURL := ytURLmatches[0]
	slog.Debug("found youtube url", "url", youtubeURL)

	args[0] = "save"
	args = append(args, "--lyrics", "synced", "--generate-lrc")
	if err := exec.Command(env.DefaultEnv.PathToSpotDL, args...).Run(); err != nil {
		return "", "", fmt.Errorf("spotdl save command failed: %w", err)
	}

	mdfile := filepath.Join(l.storagePath, fmt.Sprintf("%x-metadata.spotdl", safeThingName))
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
		Lyrics      string   `json:"lyrics"`
	}
	var metadataList []trackMetadata
	metadata, err := os.ReadFile(mdfile)
	if err != nil {
		return "", "", err
	}
	err = json.Unmarshal(metadata, &metadataList)
	if err != nil {
		return "", "", err
	}
	if len(metadataList) == 0 {
		return "", "", fmt.Errorf("no metadata found in spotdl output")
	}

	m := metadataList[0]

	slog.Info("downloaded metadata for track", "id", m.ID, "name", m.Name, "artist", m.Artist, "album", m.AlbumName, "lyrics_length", len(m.Lyrics))
	if env.DefaultEnv.Debug && m.Lyrics == "" {
		slog.Warn("no lyrics found for track", "track_id", m.ID)
	}

	track_date := releaseDate(m.Date)
	err = l.queries.InsertTrack(context.Background(), queries.InsertTrackParams{
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
		Lyrics:           m.Lyrics,
		YoutubeUrl:       youtubeURL,
	})
	if err != nil {
		return "", "", fmt.Errorf("insert track: %w", err)
	}
	return m.ID, youtubeURL, nil
}

// DownloadIfNotExists checks if the track with the specified ID exists in storage,
// and downloads it if it is missing. It is intended to be slightly cheaper than Download
// because it does not run spotdl and does not update the database and extract metadata if
// the track already exists.
func (l *Library) DownloadIfNotExists(ctx context.Context, trackIDs ...string) error {
	// using ctx.Background() in this function since download if not exists is called
	// in a goroutine and we shouldn't pass down a request context to pass down

	for i, trackID := range trackIDs {
		p := filepath.Join(l.storagePath, filepath.Clean(trackID)+".m4a")
		if _, err := os.Stat(p); os.IsNotExist(err) {
			if err := l.Download(ctx, "https://open.spotify.com/track/"+trackID); err != nil {
				slog.Error("download track", "error", err, "track_id", trackID, "index", i, "total", len(trackIDs))
				return err
			}
		}
	}
	for _, id := range trackIDs {
		if err := l.queries.MarkTrackAsDownloaded(ctx, id); err != nil {
			slog.Error("mark track as downloaded", "error", err, "track_id", id)
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
	exists, err := l.queries.PlaylistWithNameExists(ctx, name)
	if err != nil {
		return "", fmt.Errorf("check if playlist with name exists: %w", err)
	}
	if exists {
		return "", fmt.Errorf("playlist names must be unique")
	}
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
	go l.DownloadIfNotExists(context.TODO(), trackID) // best effort download, ignore error, work in a seperate goroutine
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
// It does NOT record the play in the database. If the file is not found in storage,
// it downloads the track before returning the ReadCloser.
func (l *Library) Play(ctx context.Context, trackID string) (io.ReadCloser, error) {
	// where older tracks may be deleted from storage for space management
	// but their metadata remains in the database so it can be played
	// the file should be re-downloaded if not found
	p := l.PathToTrackFile(trackID)
	rd, err := os.Open(p)
	if err == nil {
		return rd, nil
	}
	if !os.IsNotExist(err) {
		return nil, fmt.Errorf("open track file: %w", err)
	}
	if env.DefaultEnv.Debug {
		slog.Info("track file not found, re-downloading", "track_id", trackID)
	}

	// file not found, re-download
	if err := l.Download(ctx, "https://open.spotify.com/track/"+trackID); err != nil {
		slog.Error("download track", "error", err, "track_id", trackID)
		return nil, err
	}
	return os.Open(p)
}

func (l *Library) PathToTrackFile(trackID string) string {
	return filepath.Join(l.storagePath, filepath.Clean(trackID)+".m4a")
}

// RecordPlay records a play of the specified track in the database.
func (l *Library) RecordPlay(ctx context.Context, trackID string) (string, error) {
	id, err := l.queries.RecordPlay(ctx, queries.RecordPlayParams{
		TrackID:  trackID,
		PlayedAt: opttime(time.Now()),
	})
	return id.String(), err
}

// RecordSkip records that the specified track was skipped at the given second.
func (l *Library) RecordSkip(ctx context.Context, playID string, skippedAt int32) error {
	return l.queries.RecordSkip(ctx, queries.RecordSkipParams{
		PlayID:    optuuid(uuid.MustParse(playID)),
		SkippedAt: optint32(skippedAt),
	})
}

func (l *Library) Search(ctx context.Context, query string) ([]queries.SearchTrackByNameRow, error) {
	// var t time.Time
	// if env.DefaultEnv.Debug {
	// 	t = time.Now()
	// 	defer func() {
	// 		slog.Debug("search completed", "query", query, "duration_ms", time.Since(t).Milliseconds())
	// 	}()
	// }

	tracks, err := l.queries.SearchTrackByName(ctx, queries.SearchTrackByNameParams{
		Column1: optstring(query),
		Offset:  0,
		Limit:   75,
	})
	if err != nil {
		slog.Error("search in db", "error", err)
		return nil, fmt.Errorf("search in db: %w", err)
	}
	results := tracks

	if len(results) >= 75 {
		results = reorderSearchResults(results, query)
		// slog.Debug("search found enough results in database", "query", query, "count", len(results))
		return results, nil
	}

	u, _ := url.Parse("https://api.spotify.com/v1/search")
	q := u.Query()
	q.Add("q", query)
	q.Add("type", "track")
	q.Add("limit", "50")
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
			Items spotifyItems `json:"items"`
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
		if !rd.Valid {
			rd = optdate(time.Now())
		}
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

			Lyrics: "", // we don't get lyrics from spotify
		}
		err := l.queries.InsertTrack(ctx, insertParamsFromSearchRow(t)) // skips dupes (on conflict do nothing)
		if err != nil {
			slog.Warn("insert track from search", "error", err, "track_id", t.TrackID)
		}
		results = append(results, t)
	}
	results = reorderSearchResults(results, query)
	return results, nil
}

func reorderSearchResults(results []queries.SearchTrackByNameRow, query string) []queries.SearchTrackByNameRow {
	slices.SortFunc(results, func(a, b queries.SearchTrackByNameRow) int {
		// exact matches
		// on a side note: i love you go for having a built in equal function that does unicode case folding
		// to the go devs, i sincerely hope you live happy and fulfilling lives
		// - aj
		aExactMatch := strings.EqualFold(a.TrackName, query)
		bExactMatch := strings.EqualFold(b.TrackName, query)
		if aExactMatch != bExactMatch {
			if aExactMatch {
				return -1
			}
			return 1
		}

		// where the query appears at the start
		aStartsWith := strings.HasPrefix(strings.ToLower(a.TrackName), strings.ToLower(query))
		bStartsWith := strings.HasPrefix(strings.ToLower(b.TrackName), strings.ToLower(query))
		if aStartsWith != bStartsWith {
			if aStartsWith {
				return -1
			}
			return 1
		}

		// popularity
		if a.Popularity != b.Popularity {
			return int(b.Popularity - a.Popularity)
		}

		// recency
		if a.TrackReleaseDate.Valid && b.TrackReleaseDate.Valid {
			aTime := a.TrackReleaseDate.Time
			bTime := b.TrackReleaseDate.Time
			if !aTime.Equal(bTime) {
				if aTime.After(bTime) {
					return -1
				}
				return 1
			}
		}

		// alphabetical by track name (will almost never reach here)
		return strings.Compare(a.TrackName, b.TrackName)
	})
	return results
}

// Import imports a playlist from Spotify given its playlist ID. It returns the created playlist ID in the local library
// as well as any error encountered.
func (l *Library) Import(ctx context.Context, spotifyPlaylistID string) (queries.Playlist, error) {
	// we need two things: get playlist name, description, cover image
	// and get playlist tracks

	// there's actually a chance this token expires during the requests, haha
	tk, err := l.spotifyToken.Token(ctx)
	if err != nil {
		return queries.Playlist{}, fmt.Errorf("get spotify token: %w", err)
	}
	playlistsBaseAPIUrl := "https://api.spotify.com/v1/playlists/" + spotifyPlaylistID

	// get cover image
	playlistReq, err := http.NewRequestWithContext(ctx, http.MethodGet, playlistsBaseAPIUrl, nil)
	if err != nil {
		return queries.Playlist{}, fmt.Errorf("create get playlist request: %w", err)
	}
	playlistReq.Header.Set("Authorization", "Bearer "+tk)
	playlistResp, err := http.DefaultClient.Do(playlistReq)
	if err != nil {
		return queries.Playlist{}, fmt.Errorf("perform get playlist request: %w", err)
	}
	defer playlistResp.Body.Close()
	if playlistResp.StatusCode != http.StatusOK {
		b, _ := io.ReadAll(playlistResp.Body)
		slog.Error("get playlist request failed", "status", playlistResp.StatusCode, "body", string(b))
		if playlistResp.StatusCode == http.StatusNotFound {
			return queries.Playlist{}, fmt.Errorf("playlist not found: make sure the playlist is public and the URL is correct")
		}
		return queries.Playlist{}, fmt.Errorf("get playlist request failed: status %d", playlistResp.StatusCode)
	}

	var playlistData struct {
		Images []struct {
			Url string `json:"url"`
		} `json:"images"`
		Name        string `json:"name"`
		Description string `json:"description"`
	}
	err = json.NewDecoder(playlistResp.Body).Decode(&playlistData)
	if err != nil {
		return queries.Playlist{}, fmt.Errorf("decode playlist images response: %w", err)
	}

	coverURL := playlistData.Images[0].Url // use the first image

	// get playlist tracks
	tracks := []queries.InsertTrackParams{}

	offset := 0
	for {
		tracksReq, err := http.NewRequestWithContext(ctx, http.MethodGet, playlistsBaseAPIUrl+"/tracks?offset="+strconv.Itoa(offset), nil)
		if err != nil {
			return queries.Playlist{}, fmt.Errorf("create playlist tracks request: %w", err)
		}
		tracksReq.Header.Set("Authorization", "Bearer "+tk)
		tracksResp, err := http.DefaultClient.Do(tracksReq)
		if err != nil {
			return queries.Playlist{}, fmt.Errorf("perform playlist tracks request: %w", err)
		}
		defer tracksResp.Body.Close()

		if tracksResp.StatusCode != http.StatusOK {
			b, _ := io.ReadAll(tracksResp.Body)
			slog.Error("playlist tracks request failed", "status", tracksResp.StatusCode, "body", string(b))
			return queries.Playlist{}, fmt.Errorf("playlist tracks request failed: status %d", tracksResp.StatusCode)
		}
		var tracksData struct {
			Next  *string `json:"next"`
			Items []struct {
				Track spotifyItem `json:"track"`
			} `json:"items"`
		}
		err = json.NewDecoder(tracksResp.Body).Decode(&tracksData)
		if err != nil {
			return queries.Playlist{}, fmt.Errorf("decode playlist tracks response: %w", err)
		}
		for _, item := range tracksData.Items {
			tracks = append(tracks, insertParamsFromItem(item.Track))
		}

		if tracksData.Next == nil {
			break
		}
		offset += len(tracksData.Items) // next page
	}

	playlistID, err := l.CreatePlaylist(ctx, playlistData.Name, playlistData.Description, coverURL)
	if err != nil {
		return queries.Playlist{}, fmt.Errorf("create playlist in library: %w", err)
	}

	wg := sync.WaitGroup{}
	for _, ctrack := range tracks {
		wg.Add(1)
		go func(track queries.InsertTrackParams) {
			defer wg.Done()
			// avoid fkey errors by doing predownload which also inserts the track metadata
			trackURL := "https://open.spotify.com/track/" + track.TrackID

			_, youtube_url, err := l.preDownload(trackURL)
			if err != nil {
				slog.Warn("pre-download track for imported playlist", "error", err, "track_id", track.TrackID)
				return
			}

			go l.downloadIfNotExists(context.Background(), track.TrackID, youtube_url)
			err = l.queries.AddTrackToPlaylist(ctx, queries.AddTrackToPlaylistParams{
				PlaylistID: optuuid(uuid.MustParse(playlistID)),
				TrackID:    track.TrackID,
			})
		}(ctrack)
	}
	wg.Wait()

	return queries.Playlist{
		ID:          optuuid(uuid.MustParse(playlistID)),
		Name:        playlistData.Name,
		Description: playlistData.Description,
		ImageUrl:    coverURL,
		CreatedAt:   opttime(time.Now()),
	}, nil
}

// lyrics returns lyrics for the track with the specified ID + an error if exists.
func (l *Library) Lyrics(ctx context.Context, trackID string) (string, error) {
	lyrics, err := l.queries.GetTrackLyrics(ctx, trackID)
	if err != nil {
		return "", fmt.Errorf("get track lyrics: %w", err)
	}
	return lyrics, nil
}

func releaseDate(d string) pgtype.Date {
	var track_date pgtype.Date
	yr, _ := strconv.Atoi(d)
	if len(d) == 4 { // year only
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
	os.MkdirAll(storagePath, 0755) // especially needed if not using local storage
	return &Library{
		storagePath:             storagePath,
		pool:                    pool,
		queries:                 q,
		spotifyToken:            new(spotifyToken),
		dlNoDuplicate:           newNoDuplicate[error](),
		youtubeURLRegexp:        regexp.MustCompile(`https://(?:(?:www|m|music)\.)?youtube\.com/[^\s]+`),
		ongoingDownloads:        newSlots(env.DefaultEnv.MaximumOngoingDownloads),
		maximumOngoingDownloads: env.DefaultEnv.MaximumOngoingDownloads,
	}
}
