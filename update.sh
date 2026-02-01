#!/bin/bash

set -e

require_env() {
    local var="$1"
    if [[ -z "${!var}" ]]; then
        echo "required env var '$var' is not set (fatal)."
        exit 1
    fi
}

warn_env() {
    local var="$1"
    if [[ -z "${!var}" ]]; then
        echo "warning: env var '$var' is not set."
    fi
}


require_env SPOTIFY_CLIENT_ID
require_env SPOTIFY_CLIENT_SECRET
require_env SERVER_URL


warn_env STORAGE_URL
warn_env STORAGE_API_SECRET
warn_env CERT_PATH
warn_env KEY_PATH

# wow look so fancy, asking for confirmation 🥹✌️
echo -n "Do you wish to proceed? [y/N] "
read -r CONFIRM

if [[ ! "$CONFIRM" =~ ^[Yy]$ ]]; then
    echo "Aborted."
    exit 0
fi

if [[ ! -v PORT ]]; then
    echo -n "What port should the server run on? "
    read -r PORT
    echo -e ""
    export PORT
fi

# docker compose down
echo "** docker compose down **"
docker compose down

# update the repo
echo "** git pull **"
git pull


# build and start the containers in detached mode and force rebuild
echo "** docker compose up -d --build **"
docker compose up -d --build

# show the status of the containers
docker compose ps