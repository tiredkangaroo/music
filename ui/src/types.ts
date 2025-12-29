export interface Track {
  track_id: string;
  track_name: string;
  duration: number;
  popularity: number;
  album_id: string;
  artist_id: string;
  artists: string[];
  track_release_date: string;
  album_name?: string;
  cover_url?: string;
  album_release_date?: string;
  artist_name?: string;
}

export interface PlaylistHead {
  id: string;
  name: string;
  description: string;
  image_url: string;
  created_at: string;
}

export interface Playlist extends PlaylistHead {
  tracks: Track[];
}
