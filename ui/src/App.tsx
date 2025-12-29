import { useContext, useEffect, useRef, useState } from "react";
import type { PlayerState, Playlist, PlaylistHead, Track } from "./types";
import { getPlaylist, listPlaylists, playTrack } from "./api";
import { PlaylistHeadView } from "./components/PlaylistHead";
import { PlaylistView } from "./components/Playlist";
import { PlayerContext, SetPlayerContext } from "./PlayerContext";

export default function App() {
  const [playlists, setPlaylists] = useState<PlaylistHead[]>([]);
  const [selectedPlaylist, setSelectedPlaylist] = useState<Playlist | null>(
    null
  );
  const [playerState, setPlayerState] = useState<PlayerState>({
    currentTrack: null,
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    queuedTracks: [],
    repeat: "off",
    previousTracks: [],
    fromPlaylist: null,
    shuffle: false,
  });

  // fetch playlists
  useEffect(() => {
    listPlaylists().then((data) => setPlaylists(data));
  }, []);
  function selectPlaylist(id: string) {
    getPlaylist(id).then((data) => setSelectedPlaylist(data));
  }

  return (
    <PlayerContext.Provider value={playerState}>
      <SetPlayerContext.Provider value={setPlayerState}>
        <div className="min-h-screen font-mono bg-[#edf5ff] flex flex-col md:flex-row w-full h-full">
          {/* the sidebar thing */}
          <div className="md:w-[25%] w-full md:h-full h-fit bg-white md:border-r-8 md:border-t-8 md:border-r-black px-2 py-4">
            <div className="w-full flex md:flex-row flex-col md:justify-between gap-4">
              <h1 className="text-4xl">Library</h1>
              <button className="text-2xl font-bold py-1 px-3 bg-[#bfdbff] border-black border-t-2 border-l-2 border-r-4 border-4">
                +
              </button>
            </div>
            <div className="mt-4 flex flex-row gap-4">
              {playlists.map((playlist) => (
                <div
                  className="w-full"
                  onClick={() => selectPlaylist(playlist.id)}
                  key={playlist.id}
                >
                  <PlaylistHeadView playlist={playlist} />
                </div>
              ))}
            </div>
          </div>

          {/* main content area */}
          <MainContent
            playlist={selectedPlaylist}
            setPlaylist={(p) => {
              setSelectedPlaylist(p);
              const updatedPlaylists = [...playlists];
              const index = updatedPlaylists.findIndex((pl) => pl.id === p.id);
              if (index !== -1) {
                updatedPlaylists[index] = {
                  id: p.id,
                  name: p.name,
                  description: p.description,
                  image_url: p.image_url,
                  created_at: p.created_at,
                };
                setPlaylists(updatedPlaylists);
              }
            }}
          />
        </div>
      </SetPlayerContext.Provider>
    </PlayerContext.Provider>
  );
}

function MainContent(props: {
  playlist: Playlist | null;
  setPlaylist: (playlist: Playlist) => void;
}) {
  const { playlist } = props;
  if (!playlist) {
    return <></>;
  }
  return (
    <div className="flex flex-col w-full h-screen">
      <div className="flex-1 min-h-0">
        <PlaylistView playlist={playlist} setPlaylist={props.setPlaylist} />
      </div>
      <Player />
    </div>
  );
}

function Player() {
  const playerState = useContext(PlayerContext);
  const setPlayerState = useContext(SetPlayerContext);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isWaiting, setIsWaiting] = useState(true);

  useEffect(() => {
    if (!audioRef.current) return;

    const onWaiting = () => setIsWaiting(true);
    const onPlaying = () => setIsWaiting(false);

    audioRef.current.addEventListener("waiting", onWaiting);
    audioRef.current.addEventListener("playing", onPlaying);
    audioRef.current.addEventListener("canplay", onPlaying);

    return () => {
      audioRef.current?.removeEventListener("waiting", onWaiting);
      audioRef.current?.removeEventListener("playing", onPlaying);
      audioRef.current?.removeEventListener("canplay", onPlaying);
    };
  }, [audioRef.current]);

  useEffect(() => {
    console.log(playing, currentTime, duration);
    if (playerState.isPlaying && currentTime === duration && duration > 0) {
      // track ended
      if (playerState.queuedTracks.length > 0) {
        const nextTrack = playerState.queuedTracks[0];
        const newQueue = playerState.queuedTracks.slice(1);
        const newPrevious = playerState.previousTracks.concat([
          playerState.currentTrack!,
        ]);
        setPlayerState({
          currentTrack: nextTrack,
          isPlaying: true,
          currentTime: 0,
          duration: nextTrack.duration,
          queuedTracks: newQueue,
          previousTracks: newPrevious,
          repeat: playerState.repeat,
          fromPlaylist: playerState.fromPlaylist,
          shuffle: playerState.shuffle,
        });
      }
    }
  }, [playing, currentTime, duration]);

  useEffect(() => {
    if (playerState.isPlaying) {
      audioRef.current?.play();
    } else {
      audioRef.current?.pause();
    }
  }, [playerState]);

  if (!playerState.currentTrack) return <></>;
  return (
    <div
      className="relative h-[12%] min-h-fit border-t-8 border-black bg-white flex flex-row items-center px-4 py-2 gap-4"
      inert={isWaiting}
    >
      <div className="h-full">
        <img
          src={playerState.currentTrack.cover_url}
          className="h-full w-full object-cover"
        />
        {isWaiting && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/80 pointer-events-auto">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-white/30 border-t-white" />
          </div>
        )}
      </div>
      <div className="w-[20%] wrap-break-word">
        <h2 className="font-semibold">{playerState.currentTrack.track_name}</h2>
        <p className="font-light">
          {playerState.currentTrack.artists.join(", ")}
        </p>
      </div>
      <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-6">
        <button
          className="text-2xl hover:scale-110 transition"
          onClick={() => {
            // prev
            if (currentTime > 3) {
              // restart track
              if (audioRef.current) {
                audioRef.current.currentTime = 0;
                setCurrentTime(0);
              }
              return;
            }
            const nextTrack = playerState.previousTracks.at(-1);
            if (!nextTrack) {
              if (audioRef.current) {
                audioRef.current.currentTime = 0;
                setCurrentTime(0);
              }
              return;
            }
            const newPrevious = playerState.previousTracks.slice(0, -1); // remove last
            const newQueue = [
              playerState.currentTrack!,
              ...playerState.queuedTracks,
            ]; // add current to front of queue
            setPlayerState({
              currentTrack: nextTrack,
              isPlaying: true,
              currentTime: 0,
              duration: nextTrack.duration,
              queuedTracks: newQueue,
              previousTracks: newPrevious,
              repeat: playerState.repeat,
              fromPlaylist: playerState.fromPlaylist,
              shuffle: playerState.shuffle,
            });
          }}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#000000"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M17.971 4.285A2 2 0 0 1 21 6v12a2 2 0 0 1-3.029 1.715l-9.997-5.998a2 2 0 0 1-.003-3.432z" />
            <path d="M3 20V4" />
          </svg>
        </button>
        <button
          className="text-3xl hover:scale-110 transition"
          onClick={() => {
            if (audioRef.current) {
              if (audioRef.current.paused) {
                audioRef.current.play();
                setPlayerState({
                  ...playerState,
                  isPlaying: true,
                });
              } else {
                audioRef.current.pause();
                setPlayerState({
                  ...playerState,
                  isPlaying: false,
                });
              }
            }
          }}
        >
          {playing ? (
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
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z" />
            </svg>
          )}
        </button>
        <button
          className="text-2xl hover:scale-110 transition"
          onClick={() => {
            // skip
            const nextTrack = playerState.queuedTracks[0];
            const newPrevious = playerState.previousTracks.concat([
              playerState.currentTrack!,
            ]);
            const newQueue = playerState.queuedTracks.slice(1);
            setPlayerState({
              currentTrack: nextTrack,
              isPlaying: true,
              currentTime: 0,
              duration: nextTrack.duration,
              queuedTracks: newQueue,
              previousTracks: newPrevious,
              repeat: playerState.repeat,
              fromPlaylist: playerState.fromPlaylist,
              shuffle: playerState.shuffle,
            });
          }}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#000000"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M21 4v16" />
            <path d="M6.029 4.285A2 2 0 0 0 3 6v12a2 2 0 0 0 3.029 1.715l9.997-5.998a2 2 0 0 0 .003-3.432z" />
          </svg>
        </button>
        <audio
          src={playTrack(playerState.currentTrack.track_id)}
          className="hidden"
          ref={audioRef}
          autoPlay
          onPause={() => setPlaying(false)}
          onPlay={() => setPlaying(true)}
          onTimeUpdate={(e) => {
            setCurrentTime(e.currentTarget.currentTime);
          }}
          onLoadedMetadata={(e) => {
            setDuration(e.currentTarget.duration);
          }}
        />
      </div>
      <div className="absolute bottom-2 left-1/2 -translate-x-1/2 w-[45%] flex items-center gap-2">
        <span className="text-xs w-10 text-right">
          {Math.floor(currentTime / 60)}:
          {String(Math.floor(currentTime % 60)).padStart(2, "0")}
        </span>

        <input
          type="range"
          min={0}
          max={duration || 0}
          value={currentTime}
          onChange={(e) => {
            const time = Number(e.target.value);
            if (audioRef.current) {
              audioRef.current.currentTime = time;
              setCurrentTime(time);
            }
          }}
          className="flex-1 h-1 accent-black cursor-pointer"
        />

        <span className="text-xs w-10">
          {Math.floor(duration / 60)}:
          {String(Math.floor(duration % 60)).padStart(2, "0")}
        </span>
      </div>
    </div>
  );
}
