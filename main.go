package main

import (
	"context"
	"log/slog"
	"path/filepath"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/tiredkangaroo/music/db"
	"github.com/tiredkangaroo/music/env"
	"github.com/tiredkangaroo/music/library"
	"github.com/tiredkangaroo/music/server"
	"github.com/tiredkangaroo/music/storage"
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
	pool, err := pgxpool.New(ctx, env.DefaultEnv.PostgresURL)
	if err != nil {
		panic(err)
	}
	defer pool.Close()

	lib := library.NewLibrary(env.DefaultEnv.DataPath, pool)

	var s storage.Storage
	if env.DefaultEnv.StorageURL != "" && env.DefaultEnv.StorageAPISecret != "" {
		s = &storage.RemoteStorage{
			StorageURL:       env.DefaultEnv.StorageURL,
			StorageAPISecret: env.DefaultEnv.StorageAPISecret,
		}
	} else {
		s = &storage.LocalStorage{DataPath: filepath.Join(env.DefaultEnv.DataPath, "storage")}
	}

	srv := server.NewServer(lib, db.New(pool), s)
	if err := srv.Serve(); err != nil {
		panic(err)
	}
}
