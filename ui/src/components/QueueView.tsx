import { useContext } from "react";
import { PlayerContext, SetPlayerContext } from "../PlayerContext";
import { TrackView } from "./Track";
import { recordPlay } from "../api";

export function QueueView(props: {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
}) {
  const playerState = useContext(PlayerContext);
  const setPlayerState = useContext(SetPlayerContext);

  if (!props.isOpen) {
    return null;
  }
  return (
    <div className="w-fit bg-gray-100 border-l-4 border-black p-4 overflow-y-auto">
      <div className="w-full flex flex-row justify-between items-center mb-4">
        <h1 className="text-2xl font-bold">Queue</h1>
        <button onClick={() => props.setIsOpen(false)}>
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
      <div className="">
        {playerState.currentTrack && (
          <div className="flex flex-col gap-4 mb-4">
            <h2 className="text-xl font-bold">Currently Playing: </h2>
            <TrackView track={playerState.currentTrack!} />
          </div>
        )}
        <h2 className="text-xl font-bold mb-4">Up Next</h2>
        {playerState.queuedTracks.length === 0 ? (
          <p className="text-gray-600">No tracks in the queue.</p>
        ) : (
          <div className="flex flex-col gap-4">
            {playerState.queuedTracks.map((track, index) => (
              <div className="flex flex-row gap-2">
                {/* reorder buttons */}

                <div className="flex flex-col justify-between gap-2">
                  {index > 0 && (
                    <button
                      onClick={() => {
                        // move track up
                        if (index === 0) return; // already at top
                        const newQueue = [...playerState.queuedTracks];
                        const temp = newQueue[index - 1];
                        newQueue[index - 1] = newQueue[index];
                        newQueue[index] = temp;
                        setPlayerState({
                          ...playerState,
                          queuedTracks: newQueue,
                        });
                      }}
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        className="w-6"
                      >
                        <path d="m18 15-6-6-6 6" />
                      </svg>
                    </button>
                  )}

                  {index < playerState.queuedTracks.length - 1 && (
                    <button
                      onClick={() => {
                        // move track down
                        if (index === playerState.queuedTracks.length - 1)
                          return; // already at bottom
                        const newQueue = [...playerState.queuedTracks];
                        const temp = newQueue[index + 1];
                        newQueue[index + 1] = newQueue[index];
                        newQueue[index] = temp;
                        setPlayerState({
                          ...playerState,
                          queuedTracks: newQueue,
                        });
                      }}
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        className="w-6"
                      >
                        <path d="m6 9 6 6 6-6" />
                      </svg>
                    </button>
                  )}
                </div>
                <TrackView
                  key={index}
                  track={track}
                  className="w-full"
                  customOnClick={async () => {
                    // modify queue so that all tracks before currently clicked track are appended to previous as well as the currently playing track
                    // then make the clicked track the currently playing and all the followed it in the queue to make up the rest of the queue
                    const playID = await recordPlay(track.track_id);
                    console.log(
                      "recording play as a result of clicking track in queue",
                      playID,
                    );
                    setPlayerState({
                      currentTrack: track,
                      isPlaying: true,
                      currentTime: 0,
                      duration: track.duration,
                      queuedTracks: playerState.queuedTracks.slice(index + 1),
                      repeat: "off",
                      previousTracks: playerState.previousTracks
                        .concat(
                          playerState.currentTrack
                            ? [playerState.currentTrack]
                            : [],
                        )
                        .concat(playerState.queuedTracks.slice(0, index)),
                      fromPlaylist: null,
                      shuffle: false,
                      playID: playID,
                    });
                  }}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
