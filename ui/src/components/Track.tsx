import { useContext } from "react";
import type { Track } from "../types.ts";
import { SetPlayerTrackContext } from "../PlayerContext.tsx";
export function TrackView(props: {
  track: Track;
  addTrack?: () => void;
  removeTrack?: () => void;
}) {
  const setPlayerTrack = useContext(SetPlayerTrackContext);
  const { track } = props;
  return (
    <div
      className="p-4 border-t-3 border-l-3 border-r-6 border-b-6 border-gray-300 rounded-sm cursor-pointer"
      onClick={() => setPlayerTrack(track)}
    >
      <div className="flex flex-row justify-between items-center">
        <div className="flex flex-row gap-4 ">
          <img src={track.cover_url} className="w-12" />
          <div>
            <h3 className="text-xl font-medium">{track.track_name}</h3>
            <p className="text-sm text-gray-600">{track.artists.join(", ")}</p>
          </div>
        </div>
        <div className="flex flex-col gap-2 items-end justify-center">
          <span className="text-sm text-gray-500">
            {formatDuration(track.duration)}
          </span>
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
