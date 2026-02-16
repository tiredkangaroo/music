import { useContext, useEffect, useState, useRef } from "react";
import { PlayerContext, SetPlayerContext } from "../PlayerContext";
import { getTrackLyrics } from "../api";

interface LyricLine {
  time: number;
  text: string;
}

function parseLyrics(lyricsString: string, songDuration: number): Lyrics {
  const lines = lyricsString.split("\n");
  const parsed: LyricLine[] = [];

  for (const line of lines) {
    const match = line.match(/\[(\d{2}):(\d{2})\.(\d{2,3})\]\s*(.*)/);

    // console.log("parsing line", line, "match", match);
    if (!match) continue;

    const minutes = parseInt(match[1], 10);
    const seconds = parseInt(match[2], 10);
    const fractionStr = match[3]; // 2 or 3 digits

    const fraction = parseInt(fractionStr, 10);

    // 2 digits is cs so divide by 100
    // 3 digits is ms so divide by 1000
    const divisor = fractionStr.length === 3 ? 1000 : 100;

    const time = minutes * 60 + seconds + fraction / divisor;
    const text = match[4];

    parsed.push({ time, text });
  }

  if (parsed.length === 0) {
    // see if we cn find a line that starts with a Lbracket and then just return the text without timestamps starting from that line
    const startIndex = lines.findIndex((line) => line.startsWith("["));
    if (startIndex !== -1) {
      // if we find a line that starts with a [, we assume the lyrics start from there and just return the text without timestamps
      return {
        lines: lines.slice(startIndex).map((line, i) => ({
          time: (songDuration / lines.length) * i,
          text: line,
        })),
        notTimeSynced: true,
      }; // assign arbitrary time values
    }
    // if we cant' find a line that starts w "[" just return all lines as text with time 0
    return {
      lines: lines.map((line) => ({ time: 0, text: line })),
      notTimeSynced: true,
    };
  }

  return {
    lines: parsed,
    notTimeSynced: false,
  };
}

interface Lyrics {
  lines: LyricLine[];
  notTimeSynced: boolean; // whether the lyrics were notTimeSynced (i.e. no timestamps found)
}

export function LyricsView(props: {
  isOpen: boolean;
  setIsOpen: (v: boolean) => void;
}) {
  const playerState = useContext(PlayerContext);
  const setPlayerState = useContext(SetPlayerContext);
  const [lyrics, setLyrics] = useState<Lyrics | null>(null);
  const [currentLineIndex, setCurrentLineIndex] = useState(-1);
  const currentLineRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!playerState.currentTrack) {
      setLyrics(null);
      return;
    }
    if (playerState.currentTrack?.lyrics) {
      setLyrics(
        parseLyrics(
          playerState.currentTrack.lyrics,
          playerState.currentTrack.duration,
        ),
      );
    } else {
      // fetch lyrics when not available
      getTrackLyrics(playerState.currentTrack.track_id).then((res) => {
        if (res.error) {
          setLyrics(null);
          // note: we should show this error
          return;
        }
        setLyrics(parseLyrics(res, playerState.currentTrack?.duration!));
      });
    }
  }, [playerState.currentTrack, props.isOpen]);

  useEffect(() => {
    if (!lyrics || lyrics.lines.length === 0 || lyrics.notTimeSynced) return;

    const currentTime = playerState.currentTime || 0;

    // Find the current line based on playback time
    let index = -1;
    for (let i = 0; i < lyrics.lines.length; i++) {
      if (currentTime >= lyrics.lines[i].time) {
        index = i;
      } else {
        break;
      }
    }

    setCurrentLineIndex(index);
  }, [playerState.currentTime, lyrics]);

  useEffect(() => {
    // auto-scroll to current line
    if (currentLineRef.current && lyrics && !lyrics.notTimeSynced) {
      currentLineRef.current.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }
  }, [currentLineIndex, lyrics, currentLineRef.current, lyrics?.notTimeSynced]);

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

      {lyrics && lyrics.notTimeSynced && (
        <p className="text-center text-gray-500">
          These lyrics are not time-synced.
        </p>
      )}
      <div className="flex flex-col gap-4 py-8">
        {!lyrics || lyrics.lines.length === 0 ? (
          <p className="text-center text-gray-500">No lyrics available</p>
        ) : (
          lyrics.lines.map((line, index) => (
            <div
              key={index}
              ref={index === currentLineIndex ? currentLineRef : null} // set ref to current line (apparently this is allowed and works?! cool)
              className={`text-center transition-all duration-300 ${
                // highlight current line, dim past lines, slightly dim future lines
                // turnary hell 😔✌️
                index === currentLineIndex && !lyrics.notTimeSynced
                  ? "text-lg font-bold text-black scale-105 cursor-pointer"
                  : lyrics.notTimeSynced
                    ? "text-lg text-black cursor-auto" // if not time-synced, just show all lines the same, and no pointer cursor since we can't click to seek
                    : index < currentLineIndex
                      ? "text-lg text-gray-400 cursor-pointer"
                      : "text-lg text-gray-600 cursor-pointer"
              }`}
              onClick={() => {
                // set playback time to clicked line time
                // this is probably a bad solution bc of direct DOM manipulation but wtv for now
                if (!lyrics || lyrics.notTimeSynced) return;
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
