# what is this?

it's a music downloader and player app. this is not a streaming app! this is also not a social app or an app for podcasts.

## features

- search for tracks on spotify & play them
- create & delete playlists
- add & remove tracks from playlists
- play music from a playlist either in order or with shuffle
- view & modify the queue
- see time-synced lyrics as the track plays
- download individual tracks or all tracks in a playlist

### features i thought were cool and deserved to be said even though they don't usually belong in features lists

- errors get properly sent back to the ui and displayed (new playlist, import playlist, playing a track error)
- you can send multiple downloads for a track and only one download will occur (and if there's an error in that one download, the responses to all requests will show that error).
- the search is ordered effectively and results get cached in the psql db so it can be faster
- the update.sh script is so useful
- it updates the browser's mediaSession API so it'll be more integrated with your system.

## download process

- it uses [spotdl](https://github.com/spotDL/spotify-downloader) to retrieve metadata about tracks and links to their corresponding music tracks on youtube.
- this metadata is saved into the database.
- [yt-dlp](https://github.com/yt-dlp/yt-dlp) is then used to download the music track from youtube.

## searching

the search is done using the spotify search api. it's taken a [recent hit](https://developer.spotify.com/documentation/web-api/tutorials/february-2026-migration-guide) with the loss of the popularity field, while i was making this app.

# demo?

yeah! it's [here](https://bigmusic.mechanicaldinosaurs.net).

# screenshots

view [this folder](https://github.com/tiredkangaroo/music/tree/main/screenshots).

# how do i run this?

**notes**

1. you're going to need to create a Web SDK app on the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard). make sure to have the client id and client secret ready when setting environment varaibles.

## easy: docker compose

### env vars for docker compose

| name                  | specify when? | default | description                                                                                                                                                                                                                                                                                           |
| --------------------- | ------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DEBUG                 | always        | false   | `true` or `false`. enables debug mode. insecure if true.                                                                                                                                                                                                                                              |
| SPOTIFY_CLIENT_ID     | always        | --      | spotify application client id (find this in the spotify dev dashboard)                                                                                                                                                                                                                                |
| SPOTIFY_CLIENT_SECRET | always        | --      | spotify application client secret (find this in the spotify dev dashboard)                                                                                                                                                                                                                            |
| PORT                  | always        | --      | the port for the container to expose on the host.                                                                                                                                                                                                                                                     |
| SERVER_URL            | always        | --      | the accessible base URL of the backend. (e.g. `http://localhost:8080` or `http://192.168.1.67:7000` or `https://example.com`)                                                                                                                                                                         |
| STORAGE_URL           | optional      | --      | if you want to use a [tiredkangaroo/storage](https://github.com/tiredkangaroo/storage) instance to store user images, specify the base url (e.g. `https://storage.mechanicaldinosaurs.net`). this app will otherwise store and serve images locally (see DATA_PATH).                                  |
| STORAGE_API_SECRET    | optional      | --      | if you want to use a [tiredkangaroo/storage](https://github.com/tiredkangaroo/storage) instance to store user images, specify the api secret. this app will otherwise store and serve images locally (see DATA_PATH).                                                                                 |
| CERT_PATH             | optional      | --      | if you want to use TLS, specify the path to the PEM-encoded certificate. when using docker-compose, your certificate MUST be in the same folder (or a subfolder) as your Dockerfile and docker-compose.yml (that you will run docker-compose in) and the CERT_PATH should be relative to this folder. |
| KEY_PATH              | optional      | --      | if you want to use TLS, specify the path to the PEM-encoded key. when using docker-compose, your key MUST be in the same folder (or a subfolder) as your Dockerfile and docker-compose.yml (that you will run docker-compose in) and the KEY_PATH should be relative to this folder.                  |

### steps to run

1. set the [environment variables] necessary to run this app.
2. run with docker compose:
   `docker-compose up`

## hard: run this manually (painful, only few make it out alive)

it's not actually that bad, i hope.

### notes

1. you're going to need a database in [postgres](https://www.postgresql.org) to connect to. make sure you've already run [schema.sql](https://github.com/tiredkangaroo/music/blob/main/schema.sql) on it. if your postgres is local on port 5432, you can just run the `./resetdb.sh` script.
2. you're going to need to download [spotdl with ffmpeg](https://spotdl.readthedocs.io/en/latest/installation) and [yt-dlp](https://github.com/ytdl-org/youtube-dl?tab=readme-ov-file#installation) (and preferably have them in `$PATH`).

### env vars for manual

| name                  | specify when? | default                                  | description                                                                                                                                                                                                                                                                                                                                                 |
| --------------------- | ------------- | ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DEBUG                 | always        | false                                    | `true` or `false`. enables debug mode. insecure if true.                                                                                                                                                                                                                                                                                                    |
| SPOTIFY_CLIENT_ID     | always        | --                                       | spotify application client id (find this in the spotify dev dashboard)                                                                                                                                                                                                                                                                                      |
| SPOTIFY_CLIENT_SECRET | always        | --                                       | spotify application client secret (find this in the spotify dev dashboard)                                                                                                                                                                                                                                                                                  |
| POSTGRES_URL          | always        | postgres://musicer:@localhost:5432/music | postgres connection string. docker compose provisions postgres so this should never be specified when using compose. it should link to a database that has the [schema](https://github.com/tiredkangaroo/music/blob/main/schema.sql) already on it. see [this](https://stackoverflow.com/a/20722229/16467184) to help you format a postgres connection url. |
| SERVER_URL            | always        | --                                       | the accessible base URL of the backend. (e.g. `http://localhost:8080` or `http://192.168.1.67:7000` or `https://example.com`)                                                                                                                                                                                                                               |
| SERVER_ADDRESS        | optional      | :8080                                    | the address for the server to bind to.                                                                                                                                                                                                                                                                                                                      |
| DATA_PATH             | optional      | /var/lib/musicer/data                    | directory to store downloaded music and temporary files of metadata. also used as storage if not using [tiredkangaroo/storage](https://github.com/tiredkangaroo/storage) instance.                                                                                                                                                                          |
| STORAGE_URL           | optional      | --                                       | if you want to use a [tiredkangaroo/storage](https://github.com/tiredkangaroo/storage) instance to store user images, specify the base url (e.g. `https://storage.mechanicaldinosaurs.net`). this app will otherwise store and serve images locally (see DATA_PATH).                                                                                        |
| STORAGE_API_SECRET    | optional      | --                                       | if you want to use a [tiredkangaroo/storage](https://github.com/tiredkangaroo/storage) instance to store user images, specify the api secret. this app will otherwise store and serve images locally (see DATA_PATH).                                                                                                                                       |
| CERT_PATH             | optional      | --                                       | if you want to use TLS, specify the path to the PEM-encoded certificate.                                                                                                                                                                                                                                                                                    |
| KEY_PATH              | optional      | --                                       | if you want to use TLS, specify the path to the PEM-encoded key.                                                                                                                                                                                                                                                                                            |

### steps

1. clone this project

```
git clone https://github.com/tiredkangaroo/music
```

2. change your working directory to the frontend (`ui`), install dependencies, and build.

```
cd ui
npm i
npm run build
```

3. download the binary from [the latest release page](https://github.com/tiredkangaroo/music/releases/tag/latest). choose the one that corresponds with your operating system and cpu architecture. note: you'll need postgres.

4. set the environment variables necessary. run the binary you just downloaded.

5. done! visit the url shown in the terminal.
