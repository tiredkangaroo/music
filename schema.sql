CREATE TABLE IF NOT EXISTS artists (
    artist_id text PRIMARY KEY,
    artist_name text NOT NULL
);
CREATE TABLE IF NOT EXISTS albums (
    album_id text PRIMARY KEY,
    album_name text NOT NULL,
    artist_id text REFERENCES artists(artist_id) NOT NULL,
    cover_url text NOT NULL,
    album_release_date date
);
CREATE TABLE IF NOT EXISTS tracks (
    track_id text PRIMARY KEY,
    track_name text NOT NULL,
    duration integer NOT NULL,
    popularity integer NOT NULL,
    album_id text REFERENCES albums(album_id) NOT NULL,
    artist_id text REFERENCES artists(artist_id) NOT NULL,
    artists text[] NOT NULL,
    track_release_date date NOT NULL,
    downloaded boolean NOT NULL DEFAULT FALSE
);
CREATE TABLE IF NOT EXISTS playlists (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    description text NOT NULL DEFAULT '',
    image_url text NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS playlist_tracks (
    playlist_id uuid NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
    track_id text NOT NULL REFERENCES tracks(track_id) ON DELETE CASCADE,
    PRIMARY KEY (playlist_id, track_id)
);

CREATE TABLE IF NOT EXISTS plays (
    play_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    track_id text NOT NULL REFERENCES tracks(track_id) ON DELETE CASCADE,
    played_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    skipped_at integer -- can be NULL if not skipped, x second into the track when skipped
);