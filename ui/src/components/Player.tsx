import { useContext, useEffect, useRef, useState } from "react";
import { PlayerContext, SetPlayerContext } from "../PlayerContext";
import { playTrack, recordPlay, recordSkip } from "../api";
import { SetAlertMessageContext } from "../AlertMessageContext";

export function Player(props: {
  isQueueOpen: boolean;
  setIsQueueOpen: (isOpen: boolean) => void;
  isLyricsOpen: boolean;
  setIsLyricsOpen: (isOpen: boolean) => void;
}) {
  const playerState = useContext(PlayerContext);
  const setPlayerState = useContext(SetPlayerContext);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isWaiting, setIsWaiting] = useState(true);
  const { isQueueOpen, setIsQueueOpen } = props;
  const setAlertMessage = useContext(SetAlertMessageContext);

  useEffect(() => {
    if (!audioRef.current) return;

    const onWaiting = () => setIsWaiting(true);
    const onPlaying = () => setIsWaiting(false);
    const onTimeUpdate = () => {
      if (
        !playerState.isPlaying ||
        audioRef.current?.paused ||
        !audioRef.current
      )
        return;
      console.log(
        "time update",
        audioRef.current?.currentTime,
        playerState.currentTrack?.track_name,
      );
      setCurrentTime(audioRef.current?.currentTime || 0);
      setPlayerState({
        ...playerState,
        currentTime: audioRef.current?.currentTime || 0,
      });
    };

    audioRef.current.addEventListener("waiting", onWaiting);
    audioRef.current.addEventListener("playing", onPlaying);
    audioRef.current.addEventListener("canplay", onPlaying);
    audioRef.current.addEventListener("timeupdate", onTimeUpdate);

    return () => {
      audioRef.current?.removeEventListener("waiting", onWaiting);
      audioRef.current?.removeEventListener("playing", onPlaying);
      audioRef.current?.removeEventListener("canplay", onPlaying);
      audioRef.current?.removeEventListener("timeupdate", onTimeUpdate);
    };
  }, [playerState.currentTrack, audioRef.current]);

  useEffect(() => {
    if (playerState.isPlaying && currentTime === duration && duration > 0) {
      // track ended
      if (playerState.queuedTracks.length > 0) {
        const nextTrack = playerState.queuedTracks[0];
        const newQueue = playerState.queuedTracks.slice(1);
        const newPrevious = playerState.previousTracks.concat([
          playerState.currentTrack!,
        ]);
        recordPlay(nextTrack.track_id).then((id) => {
          console.log("recording play as a result of track ending", id);
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
            playID: id,
          });
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
    if ("mediaSession" in navigator) {
      // set metadata of current track
      if (playerState.currentTrack) {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: playerState.currentTrack.track_name,
          artist: playerState.currentTrack.artists.join(", "),
          album: playerState.currentTrack.album_name || "",
          artwork: [
            {
              src: playerState.currentTrack.cover_url || "",
              sizes: "640x640",
              type: "image/png",
            },
          ],
        });
      }
      // set action handlers
      navigator.mediaSession.setActionHandler("play", () => {
        audioRef.current?.play();
        setPlayerState({
          ...playerState,
          isPlaying: true,
        });
      });
      navigator.mediaSession.setActionHandler("pause", () => {
        audioRef.current?.pause();
        setPlayerState({
          ...playerState,
          isPlaying: false,
        });
      });
      navigator.mediaSession.setActionHandler("previoustrack", prev);
      navigator.mediaSession.setActionHandler("nexttrack", skip);
    }
  }, [playerState]);

  function play() {
    if (!audioRef.current) return;
    audioRef.current.play();
    recordPlay(playerState.currentTrack!.track_id).then((id) => {
      console.log("recording play as a result of play button (play())", id);
      setPlayerState({
        ...playerState,
        isPlaying: true,
        playID: id,
      });
    });
  }

  function pause() {
    if (!audioRef.current) return;
    audioRef.current.pause();
    setPlayerState({
      ...playerState,
      isPlaying: false,
    });
  }

  function prev() {
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
    const newQueue = [playerState.currentTrack!, ...playerState.queuedTracks]; // add current to front of queue
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
      playID: playerState.playID,
    });
  }

  function skip() {
    // skip
    const nextTrack = playerState.queuedTracks[0];
    const newPrevious = playerState.previousTracks.concat([
      playerState.currentTrack!,
    ]);
    const newQueue = playerState.queuedTracks.slice(1);
    recordPlay(nextTrack.track_id).then((id) => {
      console.log("recording new play as a result of skip", id);
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
        playID: playerState.playID,
      });
    });
    console.log("recording skip", playerState.playID, currentTime);
    recordSkip(playerState.playID!, currentTime);
  }

  if (!playerState.currentTrack) return <></>;
  return (
    <div
      className="relative h-[12%] min-h-fit border-t-8 border-black bg-white flex flex-row items-center px-4 py-2 gap-4 justify-between"
      inert={isWaiting}
    >
      <div className="flex flex-row items-center gap-4 w-full h-full">
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
          <h2 className="font-semibold">
            {playerState.currentTrack.track_name}
          </h2>
          <p className="font-light">
            {playerState.currentTrack.artists.join(", ")}
          </p>
        </div>
      </div>
      <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-6">
        <button className="text-2xl hover:scale-110 transition" onClick={prev}>
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
                play();
              } else {
                pause();
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
        <button className="text-2xl hover:scale-110 transition" onClick={skip}>
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
          onError={async (e) => {
            const resp = await fetch(
              playTrack(playerState.currentTrack!.track_id),
            );
            if (resp.status === 400) {
              setAlertMessage(
                "there's an issue with the way the frontend is requesting the track.",
              );
            } else if (resp.status === 401) {
              // we don't do users yet but we may do that soon
              setAlertMessage("please log in to play this track");
            } else if (resp.status === 500) {
              const data = await resp.json();
              setAlertMessage(
                `playback error: ${data.error} (playing: ${playerState.currentTrack?.track_name})`,
              );
            }
          }}
          id="player-audio"
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
      <div className="flex flex-row items-center gap-4">
        <button onClick={() => props.setIsLyricsOpen(!props.isLyricsOpen)}>
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
            <path d="m11 7.601-5.994 8.19a1 1 0 0 0 .1 1.298l.817.818a1 1 0 0 0 1.314.087L15.09 12" />
            <path d="M16.5 21.174C15.5 20.5 14.372 20 13 20c-2.058 0-3.928 2.356-6 2-2.072-.356-2.775-3.369-1.5-4.5" />
            <circle cx="16" cy="7" r="5" />
          </svg>
        </button>
        <button onClick={() => setIsQueueOpen(!isQueueOpen)}>
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
            <path d="M16 5H3" />
            <path d="M11 12H3" />
            <path d="M11 19H3" />
            <path d="M21 16V5" />
            <circle cx="18" cy="16" r="3" />
          </svg>
        </button>
      </div>
    </div>
  );
}
