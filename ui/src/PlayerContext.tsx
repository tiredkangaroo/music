import { createContext } from "react";
import type { PlayerState } from "./types";

export const PlayerContext = createContext<PlayerState>({
  repeat: "off",
  currentTrack: null,
  isPlaying: false,
  currentTime: 0,
  duration: 0,
  queuedTracks: [],
  previousTracks: [],
  fromPlaylist: null,
  shuffle: false,
  playID: null,
});
export const SetPlayerContext = createContext<
  React.Dispatch<React.SetStateAction<PlayerState>>
>(() => {});
