#!/usr/bin/env bash

# print the counts before resetting
# psql -U musicer -c "SELECT COUNT(*) FROM tracks;" -d music
# psql -U musicer -c "SELECT COUNT(*) FROM playlists;" -d music

dropdb music --if-exists -f
createdb music -O musicer
psql -U musicer -d music -a -f schema.sql

# if $DATA_PATH is set, delete all files in it (using -n bc -v doesn't work on my mac?)
if [[ -n DATA_PATH ]]; then
    echo "** deleting all files in $DATA_PATH and recreating the directory **"
    rm -rf "$DATA_PATH"
    mkdir -p "$DATA_PATH"
else
    echo "** DATA_PATH not set, skipping file deletion **"
fi