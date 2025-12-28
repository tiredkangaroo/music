package env

import (
	"errors"
	"os"
)

type Environment struct {
	Debug               bool
	PathToSpotDL        string
	SpotifyClientID     string
	SpotifyClientSecret string
	ServerAddress       string
}

var DefaultEnv = Environment{
	Debug:               dv(os.Getenv("DEBUG"), "false") == "true",
	PathToSpotDL:        os.Getenv("SPOTDL_PATH"),
	SpotifyClientID:     os.Getenv("SPOTIFY_CLIENT_ID"),
	SpotifyClientSecret: os.Getenv("SPOTIFY_CLIENT_SECRET"),
	ServerAddress:       dv(os.Getenv("SERVER_ADDRESS"), ":8080"),
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
