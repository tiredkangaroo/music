import { createContext } from "react";
import type { Track } from "./types";

export const PlayerTrackContext = createContext<Track | null>(null);
export const SetPlayerTrackContext = createContext<
  React.Dispatch<React.SetStateAction<Track | null>>
>(() => {});
