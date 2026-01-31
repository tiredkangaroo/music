-- name: InsertTrack :exec
WITH upsert_artist AS (
    INSERT INTO artists (artist_id, artist_name)
    VALUES ($1, $2)
    ON CONFLICT (artist_id) DO NOTHING
),
upsert_album AS (
    INSERT INTO albums (album_id, album_name, artist_id, cover_url, album_release_date)
    VALUES ($3, $4, $1, $5, $6)
    ON CONFLICT (album_id) DO NOTHING
)
INSERT INTO tracks (
    track_id,
    track_name,
    duration,
    popularity,
    album_id,
    artist_id,
    artists,
    track_release_date,
    downloaded,
    lyrics
)
VALUES (
    $7,
    $8,
    $9,
    $10,
    $3,
    $1,
    $11,
    $12,
    $13,
    $14
)
ON CONFLICT (track_id) DO UPDATE
SET
    track_name = EXCLUDED.track_name,
    duration = EXCLUDED.duration,
    popularity = EXCLUDED.popularity,
    album_id = EXCLUDED.album_id,
    artist_id = EXCLUDED.artist_id,
    artists = EXCLUDED.artists,
    track_release_date = EXCLUDED.track_release_date,
    lyrics = CASE
    WHEN EXCLUDED.lyrics = '' THEN tracks.lyrics
    ELSE EXCLUDED.lyrics
END;

-- name: GetTrackByID :one
SELECT * FROM tracks WHERE track_id = $1;

-- name: GetTrackLyrics :one
SELECT lyrics FROM tracks WHERE track_id = $1;

-- name: SearchTrackByName :many
SELECT * FROM tracks
JOIN albums ON tracks.album_id = albums.album_id
JOIN artists ON tracks.artist_id = artists.artist_id
WHERE track_name ILIKE '%' || $1 || '%'
LIMIT $2 OFFSET $3;

-- name: ListPlaylists :many
SELECT * FROM playlists ORDER BY created_at DESC;

-- name: CreatePlaylist :one
INSERT INTO playlists (name, description, image_url)
VALUES ($1, $2, $3)
RETURNING id;

-- name: DeletePlaylist :exec
DELETE FROM playlists WHERE id = $1;

-- name: AddTrackToPlaylist :exec
INSERT INTO playlist_tracks (playlist_id, track_id)
VALUES ($1, $2);

-- name: GetPlaylist :one
SELECT
    p.id,
    p.name,
    p.description,
    p.image_url,
    p.created_at,
    COALESCE(
        json_agg(
            json_build_object(
                'track_id', t.track_id,
                'track_name', t.track_name,
                'duration', t.duration,
                'popularity', t.popularity,
                'album_id', t.album_id,
                'artist_id', t.artist_id,
                'artists', t.artists,
                'cover_url', a.cover_url,
                'downloaded', t.downloaded,
                'track_release_date', t.track_release_date,
                'lyrics', t.lyrics
            )
        ) FILTER (WHERE t.track_id IS NOT NULL),
        '[]'::json
    ) AS tracks
FROM playlists p
LEFT JOIN playlist_tracks pt ON pt.playlist_id = p.id
LEFT JOIN tracks t ON t.track_id = pt.track_id
LEFT JOIN albums a ON t.album_id = a.album_id
WHERE p.id = $1
GROUP BY p.id;



-- name: RemoveTrackFromPlaylist :exec
DELETE FROM playlist_tracks
WHERE playlist_id = $1 AND track_id = $2;

-- name: RecordPlay :one
INSERT INTO plays (track_id, played_at, skipped_at)
VALUES ($1, $2, $3)
ON CONFLICT (track_id, played_at) DO NOTHING
RETURNING play_id;

-- name: RecordSkip :exec
UPDATE plays
SET skipped_at = $1
WHERE play_id = $2;

-- name: MarkTrackAsDownloaded :exec
UPDATE tracks
SET downloaded = TRUE
WHERE track_id = $1;

-- name: MarkTrackAsNotDownloaded :exec
UPDATE tracks
SET downloaded = FALSE
WHERE track_id = $1;