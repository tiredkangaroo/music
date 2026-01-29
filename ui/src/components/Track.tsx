import { useContext } from "react";
import type { Track } from "../types.ts";
import { PlayerContext, SetPlayerContext } from "../PlayerContext.tsx";
import { recordPlay, recordSkip, requestDownload } from "../api.ts";
export function TrackView(props: {
  track: Track;
  addTrack?: () => void;
  removeTrack?: () => void;
  customOnClick?: () => void;
  className?: string;
  compact?: boolean;
}) {
  const playerState = useContext(PlayerContext);
  const setPlayerState = useContext(SetPlayerContext);
  const { track, compact } = props;

  function shortText(text: string, maxLength: number): string {
    if (text.length <= maxLength) {
      return text;
    }
    return text.slice(0, maxLength - 3) + "...";
  }

  return (
    <div
      style={{
        padding: compact ? "8px" : "16px",
        borderLeft: compact ? "1px solid gray" : "3px solid gray",
        borderRight: compact ? "2px solid gray" : "6px solid gray",
        borderTop: compact ? "1px solid gray" : "3px solid gray",
        borderBottom: compact ? "2px solid gray" : "6px solid gray",
      }}
      className={"cursor-pointer " + (props.className ?? "")}
      // play track on click (resetting the queue)
      onClick={async () => {
        if (props.customOnClick) {
          props.customOnClick();
          return;
        }
        if (playerState.currentTrack?.track_id === track.track_id) {
          return;
        } else if (playerState.currentTrack?.track_id !== null) {
          console.log("recording skip before playing new track");
          recordSkip(playerState.playID!, playerState.currentTime);
        }
        const playID = await recordPlay(track.track_id);
        console.log("recording play as a result of clicking track", playID);
        setPlayerState({
          currentTrack: track,
          isPlaying: true,
          currentTime: 0,
          duration: track.duration,
          queuedTracks: playerState.queuedTracks,
          repeat: "off",
          previousTracks: [],
          fromPlaylist: null,
          shuffle: false,
          playID: playID,
        });
      }}
    >
      <div className="flex flex-row justify-between items-center">
        <div className="flex flex-row gap-4">
          <img src={track.cover_url} className="w-12 object-contain" />
          <div>
            <h3
              style={{
                fontSize: compact ? "1rem" : "1.25rem",
              }}
              className="font-medium"
              title={track.track_name}
            >
              {shortText(track.track_name, compact ? 15 : 30)}
            </h3>
            <p className="text-sm text-gray-600">{track.artists.join(", ")}</p>
          </div>
        </div>
        <div className="flex flex-col gap-2 items-end justify-center">
          <div className="flex flex-row gap-2 items-center">
            {!compact && (
              <div
                title={props.track.downloaded ? "Downloaded" : "Not Downloaded"}
                onClick={(e) => {
                  e.stopPropagation();
                  if (!props.track.downloaded) {
                    // request download
                    requestDownload(props.track.track_id).catch((err) => {
                      console.error("failed to request download:", err);
                    });
                  }
                }}
              >
                {props.track.downloaded !== undefined && (
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke={props.track.downloaded ? "#28ed53" : "#363636"}
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  >
                    <path d="M12 17V3" />
                    <path d="m6 11 6 6 6-6" />
                    <path d="M19 21H5" />
                  </svg>
                )}
              </div>
            )}
            <span className="text-sm text-gray-500">
              {formatDuration(track.duration)}
            </span>
          </div>
          {props.addTrack && (
            <button
              className="text-sm font-bold bg-green-300 h-fit py-1 px-3 border-r-2 border-b-2 border-black"
              onClick={(e) => {
                e.stopPropagation();
                props.addTrack!();
              }}
            >
              Add
            </button>
          )}
          {props.removeTrack && (
            <button
              className="text-sm font-bold bg-red-300 py-1 h-fit px-3 border-r-2 border-b-2 border-black"
              onClick={(e) => {
                e.stopPropagation();
                props.removeTrack!();
              }}
            >
              Remove
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function formatDuration(duration: number): string {
  if (duration < 0) return "0:00";
  if (duration < 60) {
    return `0:${duration.toString().padStart(2, "0")}`;
  }
  if (duration < 3600) {
    const minutes = Math.floor(duration / 60);
    const seconds = duration % 60;
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  }
  const hours = Math.floor(duration / 3600);
  const minutes = Math.floor((duration % 3600) / 60);
  const seconds = duration % 60;
  return `${hours}:${minutes.toString().padStart(2, "0")}:${seconds
    .toString()
    .padStart(2, "0")}`;
}
