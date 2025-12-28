package main

import (
	"context"

	"github.com/jackc/pgx/v5"
	"github.com/tiredkangaroo/music/env"
	"github.com/tiredkangaroo/music/library"
)

func main() {
	if err := env.Init(); err != nil {
		panic(err)
	}

	ctx := context.Background()
	conn, err := pgx.Connect(ctx, "postgres://musicer:@localhost:5432/music")
	if err != nil {
		panic(err)
	}
	defer conn.Close(ctx)

	lib := library.NewLibrary("/Users/ajiteshkumar/Documents/projects/music/experiment", conn)

	s, err := lib.Search(ctx, "dumb")
	if err != nil {
		panic(err)
	}
	for _, track := range s {
		println(track.TrackName, "by", track.ArtistName)
	}
}
