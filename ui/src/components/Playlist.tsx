import { useContext, useEffect, useRef, useState } from "react";
import type { Playlist, Track } from "../types";
import { TrackView } from "./Track";
import {
  addTrackToPlaylist,
  deletePlaylist,
  getPlaylist,
  recordPlay,
  recordSkip,
  removeTrackFromPlaylist,
  requestDownload,
  searchTracks,
} from "../api";
import { PlayerContext, SetPlayerContext } from "../PlayerContext.tsx";
import { SetAlertMessageContext } from "../AlertMessageContext.tsx";
export function PlaylistView(props: {
  playlist: Playlist;
  setPlaylist: (playlist: Playlist) => void;
}) {
  const { playlist, setPlaylist } = props;
  const [shuffle, setShuffle] = useState(false);
  const playerState = useContext(PlayerContext);
  const setPlayerState = useContext(SetPlayerContext);
  const addTracksDialogRef = useRef<HTMLDialogElement>(null);

  const setAlertMessage = useContext(SetAlertMessageContext);
  const [downloading, setDownloading] = useState(false);

  return (
    <div className="w-full h-full flex flex-col">
      <SearchDialog
        playlist={playlist}
        setPlaylist={setPlaylist}
        addTracksDialogRef={addTracksDialogRef}
      />

      {/* header + list wrapper */}
      <div className="p-8 flex flex-col flex-1 min-h-0">
        {/* playlist header */}
        <div className="mb-8 flex gap-6 bg-yellow-300 p-4 border-r-8 border-b-8 border-t-4 border-l-4 border-black">
          <img
            src={playlist.image_url}
            alt={playlist.name}
            className="w-48 h-48 object-cover"
          />
          <div className="flex flex-col w-full justify-between">
            <div className="w-full wrap-break-word">
              <h1 className="text-5xl font-bold">{playlist.name}</h1>
              <p className="mt-4 text-lg">{playlist.description}</p>
            </div>
            <p className="text-sm text-gray-600">
              {playlist.tracks.length} tracks • {getPlaylistDuration(playlist)}
            </p>
            <div className="flex flex-row gap-4 items-center">
              <div className="flex flex-col justify-center items-center">
                <button
                  onClick={() => {
                    setShuffle(!shuffle);
                    if (
                      !shuffle &&
                      playerState.fromPlaylist?.id === playlist.id
                    ) {
                      // reshuffle current queue
                      const newQueue = shuffleTracks([
                        ...playerState.queuedTracks,
                      ]);
                      setPlayerState({
                        ...playerState,
                        queuedTracks: newQueue,
                        shuffle: true,
                      });
                    }
                  }}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke={shuffle ? "#2b7fff" : "#000"}
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  >
                    <path d="m18 14 4 4-4 4" />
                    <path d="m18 2 4 4-4 4" />
                    <path d="M2 18h1.973a4 4 0 0 0 3.3-1.7l5.454-8.6a4 4 0 0 1 3.3-1.7H22" />
                    <path d="M2 6h1.972a4 4 0 0 1 3.6 2.2" />
                    <path d="M22 18h-6.041a4 4 0 0 1-3.3-1.8l-.359-.45" />
                  </svg>
                </button>
                {/* la indicator dot */}
                {shuffle && (
                  <div className="w-0 px-0.5 py-0.5 bg-[#2b7fff] rounded-full"></div>
                )}
              </div>
              <button
                className="bg-[#bfdbff] px-2 py-2 rounded-full border-t-2 border-l-2 border-r-6 border-b-6 border-black font-bold"
                onClick={async () => {
                  if (playlist.tracks.length === 0) return;
                  if (playerState.fromPlaylist?.id === playlist.id) {
                    if (!playerState.isPlaying) {
                      // if paused, play
                      const queue = playerState.queuedTracks.concat(
                        playlist.tracks.filter(
                          (track) =>
                            !playerState.queuedTracks.includes(track) &&
                            track.track_id !==
                              playerState.currentTrack?.track_id,
                        ),
                      ); // add rest of tracks to queue
                      setPlayerState({
                        ...playerState,
                        isPlaying: true,
                        queuedTracks: shuffle ? shuffleTracks(queue) : queue,
                      });
                    } else {
                      // if playing, pause
                      setPlayerState({
                        ...playerState,
                        isPlaying: false,
                      });
                    }
                    return;
                  }
                  if (playerState.currentTrack?.track_id !== null) {
                    console.log("recording skip before playing new playlist");
                    recordSkip(playerState.playID!, playerState.currentTime);
                  }
                  const queue = shuffle
                    ? shuffleTracks(playlist.tracks)
                    : playlist.tracks;
                  const playID = await recordPlay(queue[0].track_id);
                  console.log(
                    "recording play as a result of clicking play playlist",
                    playID,
                  );
                  setPlayerState({
                    currentTrack: queue[0],
                    isPlaying: true,
                    currentTime: 0,
                    duration: queue[0].duration,
                    queuedTracks: queue.slice(1),
                    repeat: "off",
                    previousTracks: [],
                    fromPlaylist: playlist,
                    shuffle: shuffle,
                    playID: null,
                  });
                }}
              >
                {playerState.isPlaying &&
                playerState.fromPlaylist?.id === playlist.id ? (
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#000"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  >
                    <rect x="14" y="3" width="5" height="18" rx="1" />
                    <rect x="5" y="3" width="5" height="18" rx="1" />
                  </svg>
                ) : (
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#000"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  >
                    <path d="M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z" />
                  </svg>
                )}
              </button>
              <button
                onClick={() => {
                  //  ask are you sure?
                  const confirmed = confirm(
                    "Are you sure you want to delete this playlist? This action cannot be undone.",
                  );
                  if (!confirmed) return;
                  // user confirmed, delete playlist
                  deletePlaylist(playlist.id);
                  setPlaylist(null as unknown as Playlist);
                  // note: i wonder what happens to the player if the playlist being played is deleted.
                  // the queue should remain intact, but fromPlaylist will reference a deleted playlist.
                }}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#ff0000"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <path d="M10 11v6" />
                  <path d="M14 11v6" />
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                  <path d="M3 6h18" />
                  <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                </svg>
              </button>
              <button
                onClick={() => {
                  setDownloading(true);
                  let wg = playlist.tracks.length;
                  function doneTrack() {
                    wg -= 1;
                    if (wg === 0) {
                      setDownloading(false);
                    }
                  }
                  for (let i = 0; i < playlist.tracks.length; i++) {
                    requestDownload(playlist.tracks[i].track_id).then(
                      (resp) => {
                        doneTrack();
                        if (resp.error) {
                          setAlertMessage(
                            `Downloading "${playlist.tracks[i].track_name}": ${resp.error}`,
                          );
                        }
                      },
                    );
                  }
                }}
              >
                {downloading ? (
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="animate-spin animate-spin-slow"
                  >
                    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                  </svg>
                ) : (
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#4d2db5"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M12 17V3" />
                    <path d="m6 11 6 6 6-6" />
                    <path d="M19 21H5" />
                  </svg>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* tracks section */}
        <div className="flex flex-col flex-1 min-h-0">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-3xl font-semibold">Tracks</h2>
            <button
              className="text-sm font-bold bg-[#bfdbff] py-1 px-3 border-r-2 border-b-2 border-black"
              onClick={() => addTracksDialogRef.current?.showModal()}
            >
              Add Tracks
            </button>
          </div>

          <ul className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-2">
            {playlist.tracks.map((track) => (
              <TrackView
                key={track.track_id}
                track={track}
                removeTrack={() => {
                  removeTrackFromPlaylist(playlist.id, track.track_id).then(
                    () => {
                      getPlaylist(playlist.id).then((updatedPlaylist) => {
                        setPlaylist(updatedPlaylist);
                      });
                    },
                  );
                }}
              ></TrackView>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function SearchDialog(props: {
  playlist: Playlist;
  addTracksDialogRef: React.RefObject<HTMLDialogElement | null>;
  setPlaylist: (playlist: Playlist) => void;
}) {
  const { playlist, addTracksDialogRef, setPlaylist } = props;
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [searchResults, setSearchResults] = useState<Array<Track>>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  useEffect(() => {
    if (!searchInputRef.current) return;
    const handleSearchInput = async () => {
      const query = searchInputRef.current!.value;
      if (query.length === 0) {
        setSearchResults([]);
        return;
      }
      setSearchLoading(true);
      searchTracks(query).then((results) => {
        setSearchLoading(false);
        if (results.error) {
          setSearchResults([]);
          setSearchError(results.error);
          return;
        }
        setSearchResults(results);
      });
    };
    searchInputRef.current.addEventListener("input", handleSearchInput);
    return () => {
      searchInputRef.current?.removeEventListener("input", handleSearchInput);
    };
  }, [searchInputRef.current]);

  function DisplaySearchMainContent() {
    if (searchInputRef.current && searchInputRef.current.value.length === 0) {
      return (
        <div className="w-full h-full flex flex-col items-center justify-center">
          <p className="text-gray-500">
            Search for tracks to add to the playlist
          </p>
        </div>
      );
    }
    if (searchLoading) {
      return (
        <div className="w-full h-full flex flex-col items-center gap-4 justify-center">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            className="animate-spin"
          >
            <path d="M12 2v4" />
            <path d="m16.2 7.8 2.9-2.9" />
            <path d="M18 12h4" />
            <path d="m16.2 16.2 2.9 2.9" />
            <path d="M12 18v4" />
            <path d="m4.9 19.1 2.9-2.9" />
            <path d="M2 12h4" />
            <path d="m4.9 4.9 2.9 2.9" />
          </svg>
        </div>
      );
    }
    return (
      <div className="flex flex-col gap-4 overflow-y-auto px-6">
        {searchResults.map((track) => (
          <TrackView
            key={track.track_id}
            track={track}
            addTrack={() => {
              addTrackToPlaylist(playlist.id, track.track_id).then(() => {
                getPlaylist(playlist.id).then((updatedPlaylist) => {
                  setPlaylist(updatedPlaylist);
                });
              });
            }}
            compact
          />
        ))}
      </div>
    );
  }
  return (
    <dialog ref={addTracksDialogRef} className="m-auto">
      <div className="min-w-fit w-[45vw] h-[80vh] p-4 border-r-10 border-b-10 border-t-4 border-l-4 border-black bg-white flex flex-col gap-4">
        <div className="flex flex-row justify-between items-center">
          <h1 className="text-3xl font-light">
            Add tracks to <span className="font-bold">{playlist.name}</span>
          </h1>
          <button
            className="text-3xl"
            onClick={() => addTracksDialogRef.current?.close()}
          >
            x
          </button>
        </div>
        <input
          className="w-full border-2 border-black h-10 text-md px-2 py-1"
          placeholder="Search for a track"
          ref={searchInputRef}
        ></input>
        {searchError && (
          <div className="bg-red-100 p-2 border-r-6 border-b-6 border-l-2 border-t-2 border-red-700">
            <p className="text-red-500 text-sm">Search Error: {searchError}</p>
          </div>
        )}
        <DisplaySearchMainContent></DisplaySearchMainContent>
      </div>
    </dialog>
  );
}

function shuffleTracks<T>(array: T[]): T[] {
  const shuffledArray = array.slice(); // create a copy of the original array
  for (let i = shuffledArray.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffledArray[i], shuffledArray[j]] = [shuffledArray[j], shuffledArray[i]];
  }
  return shuffledArray;
}

function formatDuration(duration: number): string {
  // days, hours, minutes, seconds
  const days = Math.floor(duration / 86400);
  const hours = Math.floor((duration % 86400) / 3600);
  const minutes = Math.floor((duration % 3600) / 60);
  const seconds = duration % 60;

  let result = [];
  if (days > 0) {
    result.push(`${days} days`);
  }
  if (hours > 0) {
    result.push(`${hours} hours`);
  }
  if (minutes > 0) {
    result.push(`${minutes} minutes`);
  }
  if (seconds > 0 || result.length === 0) {
    result.push(`${seconds} seconds`);
  }
  return result.join(" ");
}
function getPlaylistDuration(playlist: Playlist): string {
  const totalDuration = playlist.tracks.reduce(
    (acc, track) => acc + track.duration,
    0,
  );
  return formatDuration(totalDuration);
}
