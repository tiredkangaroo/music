import { useEffect, useReducer, useRef, useState } from "react";
import type { PlayerState, Playlist, PlaylistHead } from "./types";
import { createPlaylist, getPlaylist, listPlaylists, uploadImage } from "./api";
import { PlaylistHeadView } from "./components/PlaylistHead";
import { PlaylistView } from "./components/Playlist";
import { PlayerContext, SetPlayerContext } from "./PlayerContext";
import { Player } from "./components/Player";

export default function App() {
  const [playlists, setPlaylists] = useState<PlaylistHead[]>([]);
  const [selectedPlaylist, setSelectedPlaylist] = useState<Playlist | null>(
    null
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
    listPlaylists().then((data) => setPlaylists(data));
  }, []);
  function selectPlaylist(id: string) {
    getPlaylist(id).then((data) => setSelectedPlaylist(data));
  }

  return (
    <PlayerContext.Provider value={playerState}>
      <SetPlayerContext.Provider value={setPlayerState}>
        <div className="min-h-screen font-mono bg-[#edf5ff] flex flex-col md:flex-row w-full h-full">
          <Sidebar
            playlists={playlists}
            setPlaylists={setPlaylists}
            selectPlaylist={selectPlaylist}
          />
          <MainContent
            playlist={selectedPlaylist}
            setPlaylist={(p) => {
              if (p === null) {
                setSelectedPlaylist(null); // clear selected playlist
                const updatedPlaylists = [...playlists].filter(
                  // remove deleted playlist
                  (pl) => pl.id !== selectedPlaylist?.id
                );
                setPlaylists(updatedPlaylists);
                return;
              }
              // update playlist details
              setSelectedPlaylist(p);
              const updatedPlaylists = [...playlists];
              const index = updatedPlaylists.findIndex((pl) => pl.id === p.id);
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
  );
}

function Sidebar(props: {
  playlists: PlaylistHead[];
  setPlaylists: React.Dispatch<React.SetStateAction<PlaylistHead[]>>;
  selectPlaylist: (id: string) => void;
}) {
  const { playlists, setPlaylists, selectPlaylist } = props;
  const newPlaylistDialogRef = useRef<HTMLDialogElement>(null);

  return (
    <div className="md:w-[18%] w-full md:h-full h-fit bg-white md:border-r-8 md:border-t-8 md:border-r-black px-2 py-4">
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
      <div className="mt-4 flex flex-col gap-4 overflow-y-auto h-[80vh] px-6">
        {playlists.map((playlist) => (
          <div
            className="w-full"
            onClick={() => selectPlaylist(playlist.id)}
            key={playlist.id}
          >
            <PlaylistHeadView playlist={playlist} />
          </div>
        ))}
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
                        "image dimensions should be at least 300x300 pixels"
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
      </div>
    </dialog>
  );
}

function MainContent(props: {
  playlist: Playlist | null;
  setPlaylist: (playlist: Playlist) => void;
}) {
  const { playlist } = props;
  if (!playlist) {
    return (
      <div className="flex-1 flex flex-col justify-center items-center">
        <h1 className="text-4xl font-bold">hi?!</h1>
      </div>
    );
  }
  return (
    <div className="flex flex-col w-full h-screen">
      <div className="flex-1 min-h-0">
        <PlaylistView playlist={playlist} setPlaylist={props.setPlaylist} />
      </div>
      <Player />
    </div>
  );
}
