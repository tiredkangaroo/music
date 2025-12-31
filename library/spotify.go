package library

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/tiredkangaroo/music/env"
)

type spotifyToken struct {
	tk        string
	expiresAt time.Time
}

// isExpired checks if the token is expired or will not be valid in 3 minutes.
func (t *spotifyToken) isExpired() bool {
	return time.Until(t.expiresAt) < time.Minute*3
}

func (t *spotifyToken) Token(ctx context.Context) (string, error) {
	if t.tk == "" || t.isExpired() {
		err := t.getToken(ctx)
		if err != nil {
			return "", err
		}
	}
	return t.tk, nil
}

func (t *spotifyToken) getToken(ctx context.Context) error {
	f := url.Values{}
	f.Set("grant_type", "client_credentials")

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, "https://accounts.spotify.com/api/token", strings.NewReader(f.Encode()))
	if err != nil {
		return err
	}
	req.SetBasicAuth(env.DefaultEnv.SpotifyClientID, env.DefaultEnv.SpotifyClientSecret)
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("status %d", resp.StatusCode)
	}

	var data struct {
		AccessToken string `json:"access_token"`
		TokenType   string `json:"token_type"`
		ExpiresIn   int    `json:"expires_in"`
	}
	err = json.NewDecoder(resp.Body).Decode(&data)
	if err != nil {
		return err
	}

	t.tk = data.AccessToken
	t.expiresAt = time.Now().Add(time.Duration(data.ExpiresIn) * time.Second)
	return nil
}

type spotifyItems []spotifyItem
type spotifyItem struct {
	Album struct {
		ID          string `json:"id"`
		Name        string `json:"name"`
		ReleaseDate string `json:"release_date"`
		Images      []struct {
			URL string `json:"url"`
		} `json:"images"`
	} `json:"album"`
	Artists []struct {
		ID   string `json:"id"`
		Name string `json:"name"`
	} `json:"artists"`
	DurationMs int    `json:"duration_ms"`
	ID         string `json:"id"`
	Name       string `json:"name"`
	Popularity int32  `json:"popularity"`
}
