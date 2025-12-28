package env

import (
	"errors"
	"os"
)

type Environment struct {
	PathToSpotDL        string
	SpotifyClientID     string
	SpotifyClientSecret string
}

var DefaultEnv = Environment{
	PathToSpotDL:        os.Getenv("SPOTDL_PATH"),
	SpotifyClientID:     os.Getenv("SPOTIFY_CLIENT_ID"),
	SpotifyClientSecret: os.Getenv("SPOTIFY_CLIENT_SECRET"),
}

// Init initializes the environment by checking required variables. It returns an error if any required variable is missing.
func Init() error {
	if DefaultEnv.PathToSpotDL == "" || DefaultEnv.SpotifyClientID == "" || DefaultEnv.SpotifyClientSecret == "" {
		return errors.New("one or more required environment variables are not set")
	}
	return nil
}
