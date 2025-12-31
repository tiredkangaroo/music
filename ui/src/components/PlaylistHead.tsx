import type { PlaylistHead } from "../types";
export function PlaylistHeadView(props: { playlist: PlaylistHead }) {
  const { playlist } = props;
  return (
    <div className="p-2 gap-4 border-2 border-black w-full bg-white hover:bg-gray-100 flex flex-col content-center cursor-pointer">
      <img
        src={playlist.image_url}
        alt={playlist.name}
        className="w-full aspect-square object-cover"
      />
      <div>
        <h2 className="text-xl font-semibold">{playlist.name}</h2>
        <p className="font-light">{playlist.description}</p>
      </div>
    </div>
  );
}
