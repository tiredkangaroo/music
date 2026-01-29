import type { PlaylistHead } from "../types";
export function PlaylistHeadView(props: {
  playlist: PlaylistHead;
  selected?: boolean;
}) {
  const { playlist, selected } = props;
  return (
    <div
      className="p-2 gap-4 border-r-4 border-b-4 border-l-2 border-t-2 w-full hover:opacity-80 flex flex-col content-center cursor-pointer"
      style={{
        borderColor: selected ? "#000" : "#9c9c9c",
        backgroundColor: selected ? "#00000020" : "white",
      }}
    >
      <img
        src={playlist.image_url}
        alt={playlist.name}
        className="w-full max-w-48 aspect-square object-cover"
      />
      <div>
        <h2 className="text-xl font-semibold">{playlist.name}</h2>
        <p className="font-light">{playlist.description}</p>
      </div>
    </div>
  );
}
