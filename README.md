# how do i run this?

## docker compose

set the [environment variables](#environment-variables) necessary to run this app.

run the docker compose:
`docker-compose up`

## environment variables

| name                  | specify when?                                                                                                  | default                                  | description                                                                                                                                                                                                                                                                                           |
| --------------------- | -------------------------------------------------------------------------------------------------------------- | ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DEBUG                 | always                                                                                                         | false                                    | `true` or `false`. enables debug mode. insecure if true.                                                                                                                                                                                                                                              |
| SPOTDL_PATH           | never in docker-compose. otherwise, only if `spotdl` binary is not in $PATH.                                   | spotdl                                   | path to the `spotdl` binary.                                                                                                                                                                                                                                                                          |
| YT_DLP_PATH           | never in docker-compose. otherwise, only if `yt-dlp` binary is not in $PATH.                                   | yt-dlp                                   | path to the `yt-dlp` binary.                                                                                                                                                                                                                                                                          |
| SPOTIFY_CLIENT_ID     | always                                                                                                         | --                                       | spotify application client id (find this in the spotify dev dashboard)                                                                                                                                                                                                                                |
| SPOTIFY_CLIENT_SECRET | always                                                                                                         | --                                       | spotify application client secret (find this in the spotify dev dashboard)                                                                                                                                                                                                                            |
| SERVER_ADDRESS        | not required, never with docker-compose (see PORT).                                                            | :8080                                    | the address for the server to bind to.                                                                                                                                                                                                                                                                |
| PORT                  | always with docker-compose, never otherwise.                                                                   | --                                       | the port for the container to expose on the host.                                                                                                                                                                                                                                                     |
| SERVER_URL            | always                                                                                                         | --                                       | the accessible base URL of the backend. (e.g. `http://localhost:8080` or `http://192.168.1.67:7000` or `https://example.com`)                                                                                                                                                                         |
| STORAGE_URL           | not required unless you're using a [tiredkangaroo/storage](https://github.com/tiredkangaroo/storage) instance. | --                                       | if you want to use a [tiredkangaroo/storage](https://github.com/tiredkangaroo/storage) instance to store user images, specify the base url (e.g. `https://storage.mechanicaldinosaurs.net`). this app will otherwise store and serve images locally (see DATA_PATH).                                  |
| STORAGE_API_SECRET    | not required unless you're using a [tiredkangaroo/storage](https://github.com/tiredkangaroo/storage) instance. | --                                       | if you want to use a [tiredkangaroo/storage](https://github.com/tiredkangaroo/storage) instance to store user images, specify the api secret. this app will otherwise store and serve images locally (see DATA_PATH).                                                                                 |
| CERT_PATH             | not required.                                                                                                  | --                                       | if you want to use TLS, specify the path to the PEM-encoded certificate. when using docker-compose, your certificate MUST be in the same folder (or a subfolder) as your Dockerfile and docker-compose.yml (that you will run docker-compose in) and the CERT_PATH should be relative to this folder. |
| KEY_PATH              | not required.                                                                                                  | --                                       | if you want to use TLS, specify the path to the PEM-encoded key. when using docker-compose, your key MUST be in the same folder (or a subfolder) as your Dockerfile and docker-compose.yml (that you will run docker-compose in) and the KEY_PATH should be relative to this folder.                  |
| POSTGRES_URL          | required, never if using docker-compose.                                                                       | postgres://musicer:@localhost:5432/music | postgres connection string. docker compose provisions postgres so this should never be specified when using compose.                                                                                                                                                                                  |
| DATA_PATH             | not required.                                                                                                  | /var/lib/musicer/data                    | directory to store downloaded music and temporary files of metadata. also used as storage if not using [tiredkangaroo/storage](https://github.com/tiredkangaroo/storage) instance.                                                                                                                    |

## things i got to do or should do

### high priority (doesn't mean i'll do them though 😝)

- make direct calls to spotify instead of using spotdl for metadata? (only use spotdl for yt url, which means we can move spotdl and yt-dlp into download and have direct metadata calls for predownload, should speed things up as we won't be using cli calls, but i would need to find a way to get lyrics or still keep spotdl for lyrics)

### medium priority

- get around youtube age restriction without using cookies? (ex. can't download from surfer rosa bc album cover)
- playlist image chooser to pick square out of the image

### low priority (things still work or not too important feature):

- compact mode?
- api for what the user is listening to?? maybe.
- mobile ui
- maybe not direct dom manipulation when lyric is clicked?
