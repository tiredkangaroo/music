package main

import (
	"context"

	"github.com/jackc/pgx/v5"
	"github.com/tiredkangaroo/music/library"
)

func main() {
	ctx := context.Background()
	conn, err := pgx.Connect(ctx, "postgres://musicer:@localhost:5432/music")
	if err != nil {
		panic(err)
	}
	defer conn.Close(ctx)

	lib, err := library.NewLibrary("[path to storage]", conn)
	if err != nil {
		panic(err)
	}

	err = lib.Download(ctx, []string{"download item 1", "download item 2"})
	if err != nil {
		panic(err)
	}

	s, err := lib.Search(ctx, "song name")
	if err != nil {
		panic(err)
	}
	for _, track := range s {
		println(track.TrackName)
	}
}
