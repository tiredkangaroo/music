import type { PlaylistHead, Playlist, Track, WithError } from "./types.ts";

const API_BASE = import.meta.env.VITE_API_BASE || "/api/v1";

export async function searchTracks(q: string): Promise<WithError<Track[]>> {
  const res = await fetch(`${API_BASE}/search?q=${encodeURIComponent(q)}`);
  if (!res.ok) throw new Error("Search failed");
  return res.json();
}

export function playTrack(trackID: string): string {
  return `${API_BASE}/play/${trackID}`;
}

export async function listPlaylists(): Promise<WithError<PlaylistHead[]>> {
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
  image_url: string,
): Promise<WithError<{ playlist_id: string }>> {
  const res = await fetch(`${API_BASE}/playlists`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, description, image_url }),
  });
  return res.json();
}

export async function importPlaylist(
  playlistURL: string,
): Promise<WithError<PlaylistHead>> {
  const res = await fetch(`${API_BASE}/playlists/import`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ spotify_playlist_url: playlistURL }),
  });
  return res.json();
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
  trackID: string,
) {
  await fetch(`${API_BASE}/playlists/${playlistID}/tracks/${trackID}`, {
    method: "DELETE",
  });
}

export async function uploadImage(file: File): Promise<string> {
  // file is uploaded as a form in the body named image
  const res = await fetch(`${API_BASE}/images`, {
    method: "POST",
    body: (() => {
      const formData = new FormData();
      formData.append("image", file);
      return formData;
    })(),
  });
  if (!res.ok) throw new Error("image upload failed");
  const data = await res.json();
  return data.image_url as string;
}

export async function recordPlay(trackID: string): Promise<string> {
  const res = await fetch(`${API_BASE}/record/play/${trackID}`, {
    method: "POST",
  });
  if (!res.ok) throw new Error("record play failed");
  const data = await res.json();
  return data.play_id as string;
}
export async function recordSkip(playID: string, skippedAt: number) {
  const res = await fetch(`${API_BASE}/record/skip/${playID}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ skipped_at: skippedAt }),
  });
  if (!res.ok) throw new Error("record skip failed");
}

export async function requestDownload(
  trackID: string,
): Promise<WithError<void>> {
  const res = await fetch(`${API_BASE}/download/${trackID}`, {
    method: "POST",
  });
  return res.json();
}

export async function getTrackLyrics(
  trackID: string,
): Promise<WithError<string>> {
  const res = await fetch(`${API_BASE}/lyrics/${trackID}`);
  if (!res.ok) throw new Error("get lyrics failed");
  const data = await res.json();
  return data.lyrics as string;
}
