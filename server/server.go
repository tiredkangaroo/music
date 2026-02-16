package server

import (
	"bytes"
	"io"
	"log/slog"
	"mime"
	"net/http"
	"net/url"
	"path/filepath"
	"time"

	"github.com/labstack/echo/v4"
	"github.com/labstack/echo/v4/middleware"
	"github.com/tiredkangaroo/music/db"
	"github.com/tiredkangaroo/music/env"
	"github.com/tiredkangaroo/music/library"
	"github.com/tiredkangaroo/music/storage"
)

type Server struct {
	lib     *library.Library
	storage storage.Storage
}

func (s *Server) Serve() error {
	e := echo.New()

	if env.DefaultEnv.Debug {
		slog.Info("debug mode enabled")
		e.Use(middleware.CORS())
	}

	api := e.Group("/api/v1")

	api.GET("/search", func(c echo.Context) error {
		query := c.QueryParam("q")
		if query == "" {
			return c.JSON(400, errormap("query parameter 'q' is required"))
		}
		res, err := s.lib.Search(c.Request().Context(), query)
		if err != nil {
			return c.JSON(500, errormap(err.Error()))
		}
		return c.JSON(200, res)
	})

	api.GET("/play/:trackID", func(c echo.Context) error {
		trackID := c.Param("trackID")
		if trackID == "" {
			return c.JSON(400, errormap("trackID parameter is required"))
		}
		rd, err := s.lib.Play(c.Request().Context(), trackID)
		if err != nil {
			return c.JSON(500, errormap(err.Error()))
		}
		data, err := io.ReadAll(rd) // drain the reader to a buffer
		if err != nil {
			return c.JSON(500, errormap(err.Error()))
		}
		defer rd.Close()

		// serve the content
		http.ServeContent(c.Response().Writer, c.Request(), s.lib.PathToTrackFile(trackID), time.Time{}, bytes.NewReader(data))
		return nil
	})

	api.GET("/lyrics/:trackID", func(c echo.Context) error {
		trackID := c.Param("trackID")
		if trackID == "" {
			return c.JSON(400, errormap("trackID parameter is required"))
		}
		lyrics, err := s.lib.Lyrics(c.Request().Context(), trackID)
		if err != nil {
			return c.JSON(500, errormap(err.Error()))
		}
		return c.JSON(200, map[string]string{"lyrics": lyrics})
	})

	api.POST("/record/play/:trackID", func(c echo.Context) error {
		return c.JSON(200, map[string]string{
			"play_id": "not-implemented",
		})
		// trackID := c.Param("trackID")
		// if trackID == "" {
		// 	return c.JSON(400, errormap("trackID parameter is required"))
		// }
		// id, err := s.lib.RecordPlay(c.Request().Context(), trackID)
		// if err != nil {
		// 	return c.JSON(500, errormap(err.Error()))
		// }
		// return c.JSON(200, map[string]string{"play_id": id})
	})
	api.POST("/record/skip/:playID", func(c echo.Context) error {
		// playID := c.Param("playID")
		// if playID == "" {
		// 	return c.JSON(400, errormap("playID parameter is required"))
		// }
		// atStr := c.QueryParam("at")
		// at, err := strconv.Atoi(atStr)
		// if err != nil {
		// 	return c.JSON(400, errormap("invalid 'at' parameter"))
		// }
		// if err := s.lib.RecordSkip(c.Request().Context(), playID, int32(at)); err != nil {
		// 	return c.JSON(500, errormap(err.Error()))
		// }
		return c.JSON(200, nil)
	})

	api.GET("/playlists", func(c echo.Context) error {
		playlists, err := s.lib.ListPlaylists(c.Request().Context())
		if err != nil {
			return c.JSON(500, errormap(err.Error()))
		}
		if len(playlists) == 0 {
			return c.JSON(200, []db.Playlist{})
		}
		return c.JSON(200, playlists)
	})

	// create playlist
	api.POST("/playlists", bindreq(func(c echo.Context, req struct {
		Name        string `json:"name"`
		Description string `json:"description"`
		ImageURL    string `json:"image_url"`
	}) error {
		// validations (this was made so i can return errors to test error handling in the frontend lol)
		if req.Name == "" {
			return c.JSON(400, errormap("name is required"))
		}
		if req.Description == "" {
			return c.JSON(400, errormap("description is required"))
		}
		if req.ImageURL == "" {
			return c.JSON(400, errormap("image is required"))
		}
		if len(req.Name) > 30 {
			return c.JSON(400, errormap("name may be at most 30 characters"))
		}
		if len(req.Description) > 60 {
			return c.JSON(400, errormap("description may be at most 60 characters"))
		}
		playlistID, err := s.lib.CreatePlaylist(c.Request().Context(), req.Name, req.Description, req.ImageURL)
		if err != nil {
			return c.JSON(500, errormap(err.Error()))
		}
		return c.JSON(200, map[string]string{"playlist_id": playlistID})
	}))

	api.POST("/playlists/import", bindreq(func(c echo.Context, req struct {
		SpotifyPlaylistURL string `json:"spotify_playlist_url"`
	}) error {
		u, err := url.Parse(req.SpotifyPlaylistURL)
		if err != nil {
			return c.JSON(400, errormap("invalid spotify url"))
		}
		if u.Host != "open.spotify.com" {
			return c.JSON(400, errormap("invalid spotify url"))
		}
		if u.Path[:10] != "/playlist/" {
			return c.JSON(400, errormap("invalid spotify url"))
		}
		spotifyPlaylistID := u.Path[10:]

		playlist, err := s.lib.Import(c.Request().Context(), spotifyPlaylistID)
		if err != nil {
			return c.JSON(500, errormap(err.Error()))
		}
		return c.JSON(200, playlist)
	}))

	// delete playlist
	api.DELETE("/playlists/:playlistID", func(c echo.Context) error {
		playlistID := c.Param("playlistID")
		err := s.lib.DeletePlaylist(c.Request().Context(), playlistID)
		if err != nil {
			return c.JSON(500, errormap(err.Error()))
		}
		return c.JSON(200, nil)
	})

	// get playlist details
	api.GET("/playlists/:playlistID", func(c echo.Context) error {
		playlistID := c.Param("playlistID")
		data, err := s.lib.GetPlaylist(c.Request().Context(), playlistID)
		if err != nil {
			return c.JSON(500, errormap(err.Error()))
		}
		return c.JSON(200, data)
	})

	// add track to playlist
	api.POST("/playlists/:playlistID/tracks", bindreq(func(c echo.Context, req struct {
		TrackID string `json:"track_id"`
	}) error {
		playlistID := c.Param("playlistID")
		err := s.lib.AddTrackToPlaylist(c.Request().Context(), playlistID, req.TrackID)
		if err != nil {
			return c.JSON(500, errormap(err.Error()))
		}
		return c.JSON(200, nil)
	}))

	// remove track from playlist
	api.DELETE("/playlists/:playlistID/tracks/:trackID", func(c echo.Context) error {
		playlistID := c.Param("playlistID")
		trackID := c.Param("trackID")
		err := s.lib.RemoveTrackFromPlaylist(c.Request().Context(), playlistID, trackID)
		if err != nil {
			return c.JSON(500, errormap(err.Error()))
		}
		return c.JSON(200, nil)
	})

	// request download of a track
	api.POST("/download/:trackID", func(c echo.Context) error {
		trackID := c.Param("trackID")
		if trackID == "" {
			return c.JSON(400, errormap("trackID parameter is required"))
		}
		err := s.lib.DownloadIfNotExists(trackID)
		if err != nil {
			return c.JSON(500, errormap(err.Error()))
		}
		return c.JSON(200, nil) // should this be a 204?
	})

	// store an image into storage
	api.POST("/images", func(c echo.Context) error {
		file, err := c.FormFile("image")
		if err != nil {
			return c.JSON(400, errormap("image file is required"))
		}
		if file.Size > 5*1024*1024 { // 5 MB limit
			return c.JSON(400, errormap("image file size exceeds 5 MB"))
		}
		switch file.Header.Get("Content-Type") {
		case "image/jpeg", "image/png", "image/gif", "image/webp":
		default:
			return c.JSON(400, errormap("unsupported image format"))
		}
		src, err := file.Open()
		if err != nil {
			return c.JSON(500, errormap("internal server error"))
		}
		defer src.Close()

		u, err := s.storage.Store(c.Request().Context(), src, file.Header.Get("Content-Type"))
		if err != nil {
			return c.JSON(500, errormap(err.Error()))
		}
		return c.JSON(200, map[string]string{
			"image_url": u,
		})
	})

	api.GET("/data/:id", func(c echo.Context) error {
		if _, ok := s.storage.(*storage.RemoteStorage); ok {
			return c.JSON(400, errormap("data endpoint is only available for local storage"))
		}
		key := c.Param("id")

		localStorage := s.storage.(*storage.LocalStorage)
		rd, err := localStorage.Load(key)
		if err != nil {
			slog.Error("load data", "key", key, "error", err)
			return c.JSON(404, errormap("file not found"))
		}
		defer rd.Close()

		// serve the content
		c.Response().Writer.WriteHeader(http.StatusOK)
		c.Response().Header().Set("Content-Type", mime.TypeByExtension(filepath.Ext(key)))
		if _, err := io.Copy(c.Response().Writer, rd); err != nil {
			slog.Error("serve data", "key", key, "error", err)
			return c.JSON(500, errormap("internal server error"))
		}
		return nil
	})

	// catch all (GET) route to serve frontend
	e.GET("/*", func(c echo.Context) error {
		p := c.Request().URL.Path
		if p == "/" {
			p = "/index.html"
		}
		return c.File(filepath.Join("ui/dist", p))
	})

	if env.DefaultEnv.CertPath != "" && env.DefaultEnv.KeyPath != "" {
		slog.Info("starting server with TLS", "address", env.DefaultEnv.ServerAddress)
		return e.StartTLS(env.DefaultEnv.ServerAddress, env.DefaultEnv.CertPath, env.DefaultEnv.KeyPath)
	} else {
		slog.Info("starting server without TLS", "address", env.DefaultEnv.ServerAddress)
		return e.Start(env.DefaultEnv.ServerAddress)
	}
}

func NewServer(lib *library.Library, storage storage.Storage) *Server {
	return &Server{lib: lib, storage: storage}
}

func errormap(err string) map[string]string {
	return map[string]string{"error": err}
}
func bindreq[T any](handler func(c echo.Context, req T) error) echo.HandlerFunc {
	return func(c echo.Context) error {
		var req T
		if err := c.Bind(&req); err != nil {
			return c.JSON(400, errormap(err.Error()))
		}
		return handler(c, req)
	}
}
