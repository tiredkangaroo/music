package main

import (
	"context"
	"log/slog"

	"github.com/jackc/pgx/v5"
	"github.com/tiredkangaroo/music/env"
	"github.com/tiredkangaroo/music/library"
	"github.com/tiredkangaroo/music/server"
)

func main() {
	if err := env.Init(); err != nil {
		panic(err)
	}
	if env.DefaultEnv.Debug {
		slog.SetLogLoggerLevel(slog.LevelDebug)
	} else {
		slog.SetLogLoggerLevel(slog.LevelInfo)
	}

	ctx := context.Background()
	conn, err := pgx.Connect(ctx, "postgres://musicer:@localhost:5432/music")
	if err != nil {
		panic(err)
	}
	defer conn.Close(ctx)

	lib := library.NewLibrary("/Users/ajiteshkumar/Documents/projects/music/experiment", conn)

	srv := server.NewServer(lib)
	if err := srv.Serve(); err != nil {
		panic(err)
	}
}
