import { useEffect, useRef, useState } from "react";
import type { PlayerState, Playlist, PlaylistHead, Track } from "./types";
import {
  createPlaylist,
  getPlaylist,
  importPlaylist,
  listPlaylists,
  searchTracks,
  uploadImage,
} from "./api";
import { PlaylistHeadView } from "./components/PlaylistHead";
import { PlaylistView } from "./components/Playlist";
import { PlayerContext, SetPlayerContext } from "./PlayerContext";
import { Player } from "./components/Player";
import {
  CriticalErrorContext,
  SetCriticalErrorContext,
} from "./CriticalErrorContext";
import { QueueView } from "./components/QueueView";
import { TrackView } from "./components/Track";
import { LyricsView } from "./components/LyricsView";
import {
  AlertMessageContext,
  SetAlertMessageContext,
} from "./AlertMessageContext";

export default function App() {
  const [playlists, setPlaylists] = useState<PlaylistHead[]>([]);
  const [criticalError, setCriticalError] = useState<string | null>(null); // full-screen critical error
  const [alertMessage, setAlertMessage] = useState<string | null>(null);
  const [selectedPlaylist, setSelectedPlaylist] = useState<Playlist | null>(
    null,
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
    playID: null,
  });

  // fetch playlists
  useEffect(() => {
    listPlaylists().then((data) => {
      if (data.error) {
        setCriticalError(data.error);
        return;
      }
      setPlaylists(data);
    });
  }, []);

  useEffect(() => {
    window.addEventListener("resize", () => {
      console.log(window.innerWidth, window.innerHeight);
      if (window.innerWidth < 850) {
        setCriticalError("window too small (850x650 minimum)");
        return;
      }
      if (window.innerHeight < 650) {
        setCriticalError("window too small (850x650 minimum)");
        return;
      }
      if (criticalError === "window too small (850x650 minimum)") {
        setCriticalError(null); // clear error if size is now ok
      }
    });
    return () => {
      window.removeEventListener("resize", () => {});
      window.removeEventListener("keydown", () => {});
    };
  }, []);

  function selectPlaylist(id: string) {
    getPlaylist(id).then((data) => setSelectedPlaylist(data));
  }

  if (criticalError !== null) {
    return (
      <div className="min-h-screen flex flex-col justify-center items-center bg-red-200 font-mono w-full p-[25%] text-center">
        <h1 className="text-4xl font-bold mb-4">Something Went Wrong</h1>
        <div className="mt-4 p-4 bg-red-100 border-2 border-red-600 text-red-800 w-full">
          {criticalError}
        </div>
        <button
          className="mt-4 px-4 py-2 bg-red-600 text-white font-bold rounded"
          onClick={() => window.location.reload()}
        >
          Reload
        </button>
      </div>
    );
  }
  return (
    <CriticalErrorContext.Provider value={criticalError}>
      <SetCriticalErrorContext.Provider value={setCriticalError}>
        <AlertMessageContext.Provider value={alertMessage}>
          <SetAlertMessageContext.Provider value={setAlertMessage}>
            <PlayerContext.Provider value={playerState}>
              <SetPlayerContext.Provider value={setPlayerState}>
                {alertMessage && (
                  <div className="fixed w-[80%] text-center top-4 left-1/2 -translate-x-1/2 bg-red-200 border-2 border-red-600 text-red-900 px-4 py-3 text-md shadow-2xl z-50 flex flex-row justify-between items-center">
                    <p>{alertMessage}</p>

                    <button
                      onClick={() => {
                        setAlertMessage(null);
                      }}
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
                )}
                <div className="min-h-screen font-mono bg-[#edf5ff] flex flex-col md:flex-row w-full h-full">
                  <Sidebar
                    playlists={playlists}
                    setPlaylists={setPlaylists}
                    selectedPlaylist={selectedPlaylist}
                    selectPlaylist={selectPlaylist}
                  />
                  <MainContent
                    playlist={selectedPlaylist}
                    setPlaylist={(p) => {
                      if (p === null) {
                        setSelectedPlaylist(null); // clear selected playlist
                        const updatedPlaylists = [...playlists].filter(
                          // remove deleted playlist
                          (pl) => pl.id !== selectedPlaylist?.id,
                        );
                        setPlaylists(updatedPlaylists);
                        return;
                      }
                      // update playlist details
                      setSelectedPlaylist(p);
                      const updatedPlaylists = [...playlists];
                      const index = updatedPlaylists.findIndex(
                        (pl) => pl.id === p.id,
                      );
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
          </SetAlertMessageContext.Provider>
        </AlertMessageContext.Provider>
      </SetCriticalErrorContext.Provider>
    </CriticalErrorContext.Provider>
  );
}

function Sidebar(props: {
  playlists: PlaylistHead[];
  setPlaylists: React.Dispatch<React.SetStateAction<PlaylistHead[]>>;
  selectedPlaylist: Playlist | null;
  selectPlaylist: (id: string) => void;
}) {
  const { playlists, setPlaylists, selectedPlaylist, selectPlaylist } = props;
  const newPlaylistDialogRef = useRef<HTMLDialogElement>(null);
  const [sidebarView, setSidebarView] = useState<"library" | "search">(
    "library",
  );

  const searchTracksInputRef = useRef<HTMLInputElement>(null);
  const [searchResults, setSearchResults] = useState<Track[]>([]);
  const [loadingSearch, setLoadingSearch] = useState<boolean>(false);
  function handleSearchInput() {
    const query = searchTracksInputRef.current!.value;
    if (query.length === 0) {
      setSearchResults([]);
      return;
    }
    setLoadingSearch(true);
    searchTracks(query).then((results) => {
      setSearchResults(results);
      setLoadingSearch(false);
    });
  }

  useEffect(() => {
    window.addEventListener("keydown", (e) => {
      const isModifierKey = e.ctrlKey || e.metaKey;
      if (isModifierKey && e.key === "k") {
        e.preventDefault();
        if (sidebarView === "library") {
          setSidebarView("search");
          setTimeout(() => {
            searchTracksInputRef.current?.focus();
          }, 100);
        }
      }
      if (isModifierKey && e.key === "j") {
        e.preventDefault();
        if (sidebarView === "search") {
          setSidebarView("library");
        }
      }
    });
    return () => {
      window.removeEventListener("keydown", () => {});
    };
  }, []);

  return (
    <div
      className="bg-white md:border-r-8 md:border-t-8 md:border-r-black px-2 pt-4 pb-1 flex flex-col justify-between h-screen"
      style={{
        width: sidebarView === "library" ? "fit-content" : "30%",
      }}
    >
      {sidebarView === "library" && (
        <div className="flex-1 flex flex-col overflow-hidden">
          <NewPlaylistDialog
            playlists={playlists}
            setPlaylists={setPlaylists}
            newPlaylistDialogRef={newPlaylistDialogRef}
            setSelectedPlaylist={props.selectPlaylist}
          />
          <div className="w-full flex md:flex-col flex-col md:justify-between gap-4">
            <h1 className="text-4xl">Library</h1>
            <button
              className="text-2xl font-bold py-1 px-3 bg-[#bfdbff] border-black border-t-2 border-l-2 border-r-4 border-4"
              onClick={() => newPlaylistDialogRef.current?.showModal()}
            >
              +
            </button>
          </div>
          <div className="mt-4 flex flex-col gap-4 overflow-y-auto flex-1 px-6">
            {playlists.map((playlist) => (
              <div
                className="w-full"
                onClick={() => selectPlaylist(playlist.id)}
                key={playlist.id}
              >
                <PlaylistHeadView
                  playlist={playlist}
                  selected={selectedPlaylist?.id === playlist.id}
                />
              </div>
            ))}
          </div>
        </div>
      )}
      {sidebarView === "search" && (
        <div className="flex-1 flex flex-col overflow-hidden">
          <h1 className="text-2xl font-bold">Search</h1>
          <div className="flex flex-row gap-2 items-center justify-center">
            <input
              className="mt-4 p-2 border border-black w-full px-4"
              placeholder="Search for tracks"
              ref={searchTracksInputRef}
              onInput={handleSearchInput}
            />
            <button
              onClick={() => {
                if (!searchTracksInputRef.current) return;
                searchTracksInputRef.current.value = "";
                setSearchResults([]);
                setLoadingSearch(false);
              }}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="24"
                height="auto"
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
          {loadingSearch ? (
            <div className="mt-4 flex-1 flex justify-center items-center">
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
                className="animate-spin"
              >
                <path d="M21 12a9 9 0 1 1-6.219-8.56" />
              </svg>
            </div>
          ) : (
            <div className="mt-4 flex-1 overflow-y-auto px-2 flex flex-col gap-2">
              {searchResults.length === 0 && (
                <p className="text-gray-600">no results</p>
              )}
              {searchResults.map((track) => (
                <TrackView track={track} key={track.track_id} compact />
              ))}
            </div>
          )}
        </div>
      )}

      <div className="flex flex-row gap-2 items-center justify-center m-0 px-2 py-2 border-l-2 border-t-2 border-r-6 border-b-6 border-black bg-transparent">
        <button
          onClick={() => {
            setSidebarView("search");
          }}
          className="bg-blue-300 p-2 border-l-2 border-t-2 border-black"
          style={{
            scale: sidebarView === "search" ? 1 : 0.95,
            borderRightWidth: sidebarView === "search" ? "4px" : "6px",
            borderBottomWidth: sidebarView === "search" ? "4px" : "6px",
          }}
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
            <path d="m21 21-4.34-4.34" />
            <circle cx="11" cy="11" r="8" />
          </svg>
        </button>
        <button
          onClick={() => {
            setSidebarView("library");
          }}
          className="bg-blue-300 p-2 border-l-2 border-t-2 border-r-6 border-b-6 border-black"
          style={{
            scale: sidebarView === "library" ? 1 : 0.95,
            borderRightWidth: sidebarView === "library" ? "4px" : "6px",
            borderBottomWidth: sidebarView === "library" ? "4px" : "6px",
            // borderWidth: sidebarView === "library" ? "6px" : "4px",
          }}
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
            <path d="m16 6 4 14" />
            <path d="M12 6v14" />
            <path d="M8 8v12" />
            <path d="M4 4v16" />
          </svg>
        </button>
      </div>
    </div>
  );
}

function NewPlaylistDialog(props: {
  newPlaylistDialogRef: React.RefObject<HTMLDialogElement | null>;
  playlists: PlaylistHead[];
  setPlaylists: React.Dispatch<React.SetStateAction<PlaylistHead[]>>;
  setSelectedPlaylist: (id: string) => void;
}) {
  const { newPlaylistDialogRef, playlists, setPlaylists, setSelectedPlaylist } =
    props;
  const newPlaylistImageRef = useRef<HTMLInputElement>(null);
  const newPlaylistImageContainerRef = useRef<HTMLDivElement>(null);
  const newPlaylistNameRef = useRef<HTMLInputElement>(null);
  const newPlaylistDescriptionRef = useRef<HTMLTextAreaElement>(null);
  const importPlaylistURLInputRef = useRef<HTMLInputElement>(null);
  const [importPlaylistLoading, setImportPlaylistLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string>("");

  async function handleCreatePlaylist() {
    const name = newPlaylistNameRef.current?.value.trim() || "";
    const description = newPlaylistDescriptionRef.current?.value.trim() || "";
    if (name === "") {
      setErrorMessage("playlist name cannot be empty");
      return;
    }
    if (description === "") {
      setErrorMessage("playlist description cannot be empty");
      return;
    }
    const imageFile = newPlaylistImageRef.current?.files?.[0];
    if (!imageFile) {
      setErrorMessage("please upload a playlist image");
      return;
    }

    // upload image as binary and get URL
    const imageURL = await uploadImage(imageFile);
    console.log("uploaded image", imageURL);

    createPlaylist(name, description, imageURL).then((resp) => {
      const newPlaylistID = resp.playlist_id as string;
      setPlaylists([
        {
          id: newPlaylistID,
          name: name,
          description: description,
          image_url: imageURL,
          created_at: new Date().toISOString(),
        },
        ...playlists,
      ]);
      newPlaylistNameRef.current!.value = "";
      newPlaylistDescriptionRef.current!.value = "";
      newPlaylistImageContainerRef.current!.style.backgroundImage = "";
      newPlaylistImageContainerRef.current!.style.border = "2px solid black";
      newPlaylistImageRef.current!.value = "";
      setErrorMessage("");
      setSelectedPlaylist(newPlaylistID);
      newPlaylistDialogRef.current?.close();
    });
  }

  async function handleImportPlaylist() {
    const url = importPlaylistURLInputRef.current?.value.trim() || "";
    if (url === "") {
      setErrorMessage("please enter a playlist URL");
      return;
    }
    setImportPlaylistLoading(true);
    importPlaylist(url).then((resp) => {
      if (resp.error) {
        setErrorMessage(resp.error);
        setImportPlaylistLoading(false);
        return;
      }
      setPlaylists([resp, ...playlists]);
      setErrorMessage("");
      setSelectedPlaylist(resp.id);
      newPlaylistDialogRef.current?.close();
      setImportPlaylistLoading(false);
    });
  }
  return (
    <dialog
      ref={newPlaylistDialogRef}
      id="new-playlist-dialog"
      className="m-auto"
    >
      <div className="md:w-[60vw] min-w-fit h-fit md:min-h-96 py-4 px-4 flex flex-col gap-4">
        <div className="flex flex-row justify-between items-center">
          <h1 className="text-3xl font-bold">New Playlist</h1>
          <button
            className="font-bold"
            onClick={() => newPlaylistDialogRef.current?.close()}
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
        {errorMessage && (
          <div className="w-full p-2 bg-red-200 border-2 border-red-600 text-red-800 flex flex-row justify-between items-center">
            <p>error: {errorMessage}</p>
            <button className="font-bold" onClick={() => setErrorMessage("")}>
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
        )}

        <div className="flex md:flex-row flex-col w-full h-full gap-6 items-center">
          {/* image upload for playlist cover         */}
          <div
            className="shrink-0 w-64 h-64 border-r-8 border-b-8 border-l-2 border-t-2 border-black text-[#00000000] hover:bg-[#c9c9c9] hover:text-black flex items-center justify-center"
            onClick={() => {
              newPlaylistImageRef.current!.click();
            }}
            ref={newPlaylistImageContainerRef}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="w-1/2 h-1/2"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M13.997 4a2 2 0 0 1 1.76 1.05l.486.9A2 2 0 0 0 18.003 7H20a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h1.997a2 2 0 0 0 1.759-1.048l.489-.904A2 2 0 0 1 10.004 4z" />
              <circle cx="12" cy="13" r="3" />
            </svg>
            <input
              type="file"
              accept="image/*"
              className="hidden"
              multiple={false}
              ref={newPlaylistImageRef}
              onInput={(event) => {
                const input = event.target as HTMLInputElement;
                if (input.files && input.files[0]) {
                  const file = input.files[0];
                  // check if image is larger than 5MB
                  if (file.size > 5 * 1024 * 1024) {
                    setErrorMessage("image size should be less than 5MB");
                    input.value = "";
                    return;
                  }
                  // check if image is square
                  const img = new Image();
                  img.src = URL.createObjectURL(file);
                  img.onload = () => {
                    if (img.width !== img.height) {
                      setErrorMessage("image should be square");
                      input.value = "";
                      return;
                    }
                    if (img.width < 300 || img.height < 300) {
                      setErrorMessage(
                        "image dimensions should be at least 300x300 pixels",
                      );
                      input.value = "";
                      return;
                    }

                    // display image preview (validations passed)
                    const reader = new FileReader();
                    reader.onload = (e) => {
                      if (newPlaylistImageContainerRef.current) {
                        newPlaylistImageContainerRef.current.style.backgroundImage = `url(${e.target?.result})`;
                        newPlaylistImageContainerRef.current.style.backgroundSize =
                          "cover";
                        newPlaylistImageContainerRef.current.style.backgroundPosition =
                          "center";
                        newPlaylistImageContainerRef.current.style.border =
                          "none";
                      }
                    };
                    reader.readAsDataURL(file);
                  };
                }
              }}
            ></input>
          </div>
          <div className="w-full pr-4">
            <input
              className="p-2 border border-black w-full"
              placeholder="Playlist Name"
              ref={newPlaylistNameRef}
            ></input>
            <textarea
              className="p-2 border border-black w-full mt-4 resize-none"
              placeholder="Playlist Description"
              rows={4}
              ref={newPlaylistDescriptionRef}
            ></textarea>
          </div>
        </div>
        <button
          className="bg-blue-500 text-white px-4 py-2 rounded"
          onClick={handleCreatePlaylist}
        >
          Create
        </button>
        <div className="flex flex-row items-center gap-2">
          <hr className="flex-1 border-t-2 border-black" />
          <span className="font-bold">OR</span>
          <hr className="flex-1 border-t-2 border-black" />
        </div>
        <div>
          <h1 className="text-3xl font-bold">Import</h1>
          <p className="text-gray-500">
            Note: importing playlists can take a long time (depending on number
            of tracks).
          </p>
          <input
            className="p-2 border border-black w-full mt-4 resize-none"
            placeholder="Spotify Playlist URL"
            id="import-playlist-url"
            type="text"
            ref={importPlaylistURLInputRef}
          ></input>
          <button
            className="bg-green-700 text-white px-4 py-2 rounded mt-4 w-full disabled:opacity-50"
            onClick={handleImportPlaylist}
            disabled={importPlaylistLoading}
          >
            {importPlaylistLoading ? (
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
                className="animate-spin mx-auto"
              >
                <path d="M12 2v4" />
                <path d="m16.2 7.8 2.9-2.9" />
                <path d="M18 12h4" />
                <path d="m16.2 16.2 2.9 2.9" />
                <path d="M12 18v4" />
                <path d="m4.9 19.1 2.9-2.9" />
                <path d="M2 12h4" />
                <path d="m4.9 4.9 2.9 2.9" />
              </svg>
            ) : (
              "Import Playlist"
            )}
          </button>
        </div>
      </div>
    </dialog>
  );
}

function MainContent(props: {
  playlist: Playlist | null;
  setPlaylist: (playlist: Playlist) => void;
}) {
  const { playlist } = props;
  const [isQueueOpen, setIsQueueOpen] = useState<boolean>(false);
  const [isLyricsOpen, setIsLyricsOpen] = useState<boolean>(false);

  if (!playlist) {
    return (
      <div className="flex flex-col w-full h-screen">
        <div className="flex-1 min-h-0 flex flex-row">
          <div className="w-full h-full flex flex-col justify-center items-center">
            <h1 className="text-4xl font-bold text-gray-600">
              select a playlist
            </h1>
          </div>
          <QueueView
            isOpen={isQueueOpen}
            setIsOpen={(v) => {
              if (v) {
                setIsLyricsOpen(false);
              }
              setIsQueueOpen(v);
            }}
          />
          <LyricsView
            isOpen={isLyricsOpen}
            setIsOpen={(v) => {
              if (v) {
                setIsQueueOpen(false);
              }
              setIsLyricsOpen(v);
            }}
          />
        </div>
        <Player
          isQueueOpen={isQueueOpen}
          setIsQueueOpen={(v) => {
            if (v) {
              setIsLyricsOpen(false);
            }
            setIsQueueOpen(v);
          }}
          isLyricsOpen={isLyricsOpen}
          setIsLyricsOpen={(v) => {
            if (v) {
              setIsQueueOpen(false);
            }
            setIsLyricsOpen(v);
          }}
        />
      </div>
    );
  }
  return (
    <div className="flex flex-col w-full h-screen">
      <div className="flex-1 min-h-0 flex flex-row">
        <PlaylistView playlist={playlist} setPlaylist={props.setPlaylist} />
        <QueueView
          isOpen={isQueueOpen}
          setIsOpen={(v) => {
            if (v) {
              setIsLyricsOpen(false);
            }
            setIsQueueOpen(v);
          }}
        />
        <LyricsView
          isOpen={isLyricsOpen}
          setIsOpen={(v) => {
            if (v) {
              setIsQueueOpen(false);
            }
            setIsLyricsOpen(v);
          }}
        />
      </div>
      <Player
        isQueueOpen={isQueueOpen}
        setIsQueueOpen={(v) => {
          if (v) {
            setIsLyricsOpen(false);
          }
          setIsQueueOpen(v);
        }}
        isLyricsOpen={isLyricsOpen}
        setIsLyricsOpen={(v) => {
          if (v) {
            setIsQueueOpen(false);
          }
          setIsLyricsOpen(v);
        }}
      />
    </div>
  );
}
