package server

import (
	"mime"
	"net/http"

	"github.com/labstack/echo/v4"
	"github.com/labstack/echo/v4/middleware"
	"github.com/tiredkangaroo/music/db"
	"github.com/tiredkangaroo/music/env"
	"github.com/tiredkangaroo/music/library"
)

type Server struct {
	lib *library.Library
}

func (s *Server) Serve() error {
	e := echo.New()
	e.Use(middleware.RequestLogger())

	e.GET("/search", func(c echo.Context) error {
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

	e.GET("/play/:trackID", func(c echo.Context) error {
		trackID := c.Param("trackID")
		if trackID == "" {
			return c.JSON(400, errormap("trackID parameter is required"))
		}
		data, err := s.lib.Play(c.Request().Context(), trackID)
		if err != nil {
			return c.JSON(500, errormap(err.Error()))
		}
		defer data.Close()
		return c.Stream(http.StatusOK, mime.TypeByExtension(".m4a"), data)
	})

	e.GET("/playlists", func(c echo.Context) error {
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
	e.POST("/playlists", bindreq(func(c echo.Context, req struct {
		Name        string `json:"name"`
		Description string `json:"description"`
		ImageURL    string `json:"image_url"`
	}) error {
		playlistID, err := s.lib.CreatePlaylist(c.Request().Context(), req.Name, req.Description, req.ImageURL)
		if err != nil {
			return c.JSON(500, errormap(err.Error()))
		}
		return c.JSON(200, map[string]string{"playlist_id": playlistID})
	}))

	// delete playlist
	e.DELETE("/playlists/:playlistID", func(c echo.Context) error {
		playlistID := c.Param("playlistID")
		err := s.lib.DeletePlaylist(c.Request().Context(), playlistID)
		if err != nil {
			return c.JSON(500, errormap(err.Error()))
		}
		return c.JSON(200, nil)
	})

	// get playlist details
	e.GET("/playlists/:playlistID", func(c echo.Context) error {
		playlistID := c.Param("playlistID")
		data, err := s.lib.GetPlaylist(c.Request().Context(), playlistID)
		if err != nil {
			return c.JSON(500, errormap(err.Error()))
		}
		return c.JSON(200, data)
	})

	// add track to playlist
	e.POST("/playlists/:playlistID/tracks", bindreq(func(c echo.Context, req struct {
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
	e.DELETE("/playlists/:playlistID/tracks/:trackID", func(c echo.Context) error {
		playlistID := c.Param("playlistID")
		trackID := c.Param("trackID")
		err := s.lib.RemoveTrackFromPlaylist(c.Request().Context(), playlistID, trackID)
		if err != nil {
			return c.JSON(500, errormap(err.Error()))
		}
		return c.JSON(200, nil)
	})

	return e.Start(env.DefaultEnv.ServerAddress)
}

func NewServer(lib *library.Library) *Server {
	return &Server{lib: lib}
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
