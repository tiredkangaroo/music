import { useContext, useEffect, useState, useRef } from "react";
import { PlayerContext, SetPlayerContext } from "../PlayerContext";
import { getTrackLyrics } from "../api";

interface LyricLine {
  time: number;
  text: string;
}

function parseLyrics(lyricsString: string): LyricLine[] {
  const lines = lyricsString.split("\n");
  const parsed: LyricLine[] = [];

  for (const line of lines) {
    // thank u claude for regex
    const match = line.match(/\[(\d{2}):(\d{2})\.(\d{2})\]\s*(.*)/);
    if (match) {
      const minutes = parseInt(match[1], 10);
      const seconds = parseInt(match[2], 10);
      const centiseconds = parseInt(match[3], 10);
      const time = minutes * 60 + seconds + centiseconds / 100;
      const text = match[4];
      parsed.push({ time, text });
    }
  }

  return parsed;
}

export function LyricsView(props: {
  isOpen: boolean;
  setIsOpen: (v: boolean) => void;
}) {
  const playerState = useContext(PlayerContext);
  const setPlayerState = useContext(SetPlayerContext);
  const [lyricLines, setLyricLines] = useState<LyricLine[]>([]);
  const [currentLineIndex, setCurrentLineIndex] = useState(-1);
  const currentLineRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!playerState.currentTrack) {
      setLyricLines([]);
      return;
    }
    if (playerState.currentTrack?.lyrics) {
      setLyricLines(parseLyrics(playerState.currentTrack.lyrics));
    } else {
      // fetch lyrics when not available
      getTrackLyrics(playerState.currentTrack.track_id).then((res) => {
        if (res.error) {
          setLyricLines([]);
          return;
        }
        const parsed = parseLyrics(res);
        setLyricLines(parsed);
      });
    }
  }, [playerState.currentTrack, props.isOpen]);

  useEffect(() => {
    if (lyricLines.length === 0) return;

    const currentTime = playerState.currentTime || 0;

    // Find the current line based on playback time
    let index = -1;
    for (let i = 0; i < lyricLines.length; i++) {
      if (currentTime >= lyricLines[i].time) {
        index = i;
      } else {
        break;
      }
    }

    setCurrentLineIndex(index);
  }, [playerState.currentTime, lyricLines]);

  useEffect(() => {
    // auto-scroll to current line
    if (currentLineRef.current) {
      currentLineRef.current.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }
  }, [currentLineIndex]);

  if (!props.isOpen) {
    return null;
  }

  return (
    <div className="max-w-[30vw] bg-gray-100 border-l-4 border-black p-4 overflow-y-auto">
      <div className="sticky top-0 pt-0 mb-4">
        <div className="w-full flex flex-row justify-between items-center mb-4">
          <h1 className="text-2xl font-bold">Lyrics</h1>
          <button
            onClick={() => props.setIsOpen(false)}
            aria-label="Close lyrics"
          >
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
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-4 py-8">
        {lyricLines.length === 0 ? (
          <p className="text-center text-gray-500">No lyrics available</p>
        ) : (
          lyricLines.map((line, index) => (
            <div
              key={index}
              ref={index === currentLineIndex ? currentLineRef : null} // set ref to current line (apparently this is allowed and works?! cool)
              className={`cursor-pointer text-center transition-all duration-300 ${
                // highlight current line, dim past lines, slightly dim future lines
                index === currentLineIndex
                  ? "text-lg font-bold text-black scale-105"
                  : index < currentLineIndex
                    ? "text-lg text-gray-400"
                    : "text-lg text-gray-600"
              }`}
              onClick={() => {
                // set playback time to clicked line time
                // this is probably a bad solution bc of direct DOM manipulation but wtv for now
                (
                  document.getElementById("player-audio") as HTMLAudioElement
                ).currentTime = line.time;
                setPlayerState({
                  ...playerState,
                  currentTime: line.time,
                });
              }}
            >
              {line.text || "\u00A0"}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
