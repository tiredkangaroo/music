import { useEffect, useRef, useState } from "react";
import type { Playlist, Track } from "../types";
import { TrackView } from "./Track";
import {
  addTrackToPlaylist,
  getPlaylist,
  removeTrackFromPlaylist,
  searchTracks,
} from "../api";

export function PlaylistView(props: {
  playlist: Playlist;
  setPlaylist: (playlist: Playlist) => void;
}) {
  const { playlist, setPlaylist } = props;
  const addTracksDialogRef = useRef<HTMLDialogElement>(null);

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
        <div className="flex gap-6 mb-8 bg-yellow-300 p-4 border-r-8 border-b-8 border-t-4 border-l-4 border-black">
          <img
            src={playlist.image_url}
            alt={playlist.name}
            className="w-48 h-48 object-cover rounded-md"
          />
          <div>
            <h1 className="text-5xl font-bold">{playlist.name}</h1>
            <p className="mt-4 text-lg">{playlist.description}</p>
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
                    }
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

  useEffect(() => {
    if (!searchInputRef.current) return;
    const handleSearchInput = async () => {
      const query = searchInputRef.current!.value;
      if (query.length === 0) {
        setSearchResults([]);
        return;
      }
      searchTracks(query).then((results) => {
        setSearchResults(results);
      });
    };
    searchInputRef.current.addEventListener("input", handleSearchInput);
    return () => {
      searchInputRef.current?.removeEventListener("input", handleSearchInput);
    };
  }, [searchInputRef.current]);
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
            />
          ))}
        </div>
      </div>
    </dialog>
  );
}
