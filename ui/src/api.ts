import type { PlaylistHead, Playlist, Track } from "./types.ts";

const API_BASE = "http://localhost:8080";

export async function searchTracks(q: string): Promise<Track[]> {
  const res = await fetch(`${API_BASE}/search?q=${encodeURIComponent(q)}`);
  if (!res.ok) throw new Error("Search failed");
  return res.json();
}

export function playTrack(trackID: string) {
  return `${API_BASE}/play/${trackID}`;
}

export async function listPlaylists(): Promise<PlaylistHead[]> {
  const res = await fetch(`${API_BASE}/playlists`);
  return res.json();
}

export async function getPlaylist(id: string): Promise<Playlist> {
  const res = await fetch(`${API_BASE}/playlists/${id}`);
  return res.json();
}

export async function createPlaylist(
  name: string,
  description: string,
  image_url: string
) {
  await fetch(`${API_BASE}/playlists`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, description, image_url }),
  });
}

export async function deletePlaylist(id: string) {
  await fetch(`${API_BASE}/playlists/${id}`, { method: "DELETE" });
}

export async function addTrackToPlaylist(playlistID: string, trackID: string) {
  await fetch(`${API_BASE}/playlists/${playlistID}/tracks`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ track_id: trackID }),
  });
}

export async function removeTrackFromPlaylist(
  playlistID: string,
  trackID: string
) {
  await fetch(`${API_BASE}/playlists/${playlistID}/tracks/${trackID}`, {
    method: "DELETE",
  });
}
