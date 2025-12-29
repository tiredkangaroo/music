package main

import (
	"context"
	"log/slog"

	"github.com/jackc/pgx/v5/pgxpool"
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
	pool, err := pgxpool.New(ctx, "postgres://musicer:@localhost:5432/music")
	if err != nil {
		panic(err)
	}
	defer pool.Close()

	lib := library.NewLibrary("/Users/ajiteshkumar/Documents/projects/music/experiment", pool)

	srv := server.NewServer(lib)
	if err := srv.Serve(); err != nil {
		panic(err)
	}
}
