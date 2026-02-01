package main

import (
	"context"
	"log/slog"
	"path/filepath"

	"github.com/jackc/pgx/v5/pgxpool"
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
		slog.Info("using remote storage", "url", env.DefaultEnv.StorageURL)
		s = storage.NewRemoteStorage(env.DefaultEnv.StorageURL, env.DefaultEnv.StorageAPISecret)
	} else {
		slog.Info("using local storage", "path", filepath.Join(env.DefaultEnv.DataPath, "storage"))
		s = storage.NewLocalStorage(filepath.Join(env.DefaultEnv.DataPath, "storage"))
	}

	srv := server.NewServer(lib, s)
	if err := srv.Serve(); err != nil {
		panic(err)
	}
}
