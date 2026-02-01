package env

import (
	"errors"
	"os"
	"strconv"
)

type Environment struct {
	Debug                   bool
	PathToSpotDL            string
	PathToYtDL              string
	SpotifyClientID         string
	SpotifyClientSecret     string
	ServerAddress           string
	StorageURL              string
	StorageAPISecret        string
	CertPath                string
	KeyPath                 string
	PostgresURL             string
	DataPath                string
	ServerURL               string
	MaximumOngoingDownloads int
}

var DefaultEnv = Environment{
	Debug:               dv(os.Getenv("DEBUG"), "false") == "true",
	PathToSpotDL:        dv(os.Getenv("SPOTDL_PATH"), "spotdl"),
	PathToYtDL:          dv(os.Getenv("YT_DLP_PATH"), "yt-dlp"),
	SpotifyClientID:     os.Getenv("SPOTIFY_CLIENT_ID"),
	SpotifyClientSecret: os.Getenv("SPOTIFY_CLIENT_SECRET"),
	ServerAddress:       dv(os.Getenv("SERVER_ADDRESS"), ":8080"),

	StorageURL:       os.Getenv("STORAGE_URL"),
	StorageAPISecret: os.Getenv("STORAGE_API_SECRET"),
	ServerURL:        os.Getenv("SERVER_URL"),

	CertPath:    os.Getenv("CERT_PATH"),
	KeyPath:     os.Getenv("KEY_PATH"),
	PostgresURL: dv(os.Getenv("POSTGRES_URL"), "postgres://musicer:@localhost:5432/music"),
	DataPath:    dv(os.Getenv("DATA_PATH"), "/var/lib/musicer/data"),

	MaximumOngoingDownloads: dvi(os.Getenv("MAX_CONCURRENT_DOWNLOADS"), 10),
}

// Init initializes the environment by checking required variables. It returns an error if any required variable is missing.
func Init() error {
	if DefaultEnv.PathToSpotDL == "" || DefaultEnv.SpotifyClientID == "" || DefaultEnv.SpotifyClientSecret == "" {
		return errors.New("one or more required environment variables are not set")
	}
	return nil
}

func dv(value, def string) string {
	if value == "" {
		return def
	}
	return value
}

func dvi(value string, def int) int {
	if value == "" {
		return def
	}
	i, err := strconv.Atoi(value)
	if err != nil {
		return def
	}
	return i
}
