package server

import (
	"crypto/hmac"
	"crypto/sha256"
	"fmt"
	"io"
	"log/slog"
	"mime"
	"net/http"
	"strconv"
	"time"

	"github.com/google/uuid"
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

	if env.DefaultEnv.Debug {
		slog.Info("debug mode enabled")
		e.Use(middleware.CORS())
	}

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

	e.POST("/record/play/:trackID", func(c echo.Context) error {
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
	e.POST("/record/skip/:playID", func(c echo.Context) error {
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

	// store an image
	e.POST("/images", func(c echo.Context) error {
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

		// call the storage api
		req, err := http.NewRequestWithContext(c.Request().Context(), "POST", env.DefaultEnv.StorageURL+"/push", src)
		if err != nil {
			return c.JSON(500, errormap("internal server error"))
		}
		req.Header.Set("Content-Type", file.Header.Get("Content-Type"))
		signRequest(req)

		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			return c.JSON(500, errormap("internal server error"))
		}
		defer resp.Body.Close()

		if resp.StatusCode != http.StatusCreated {
			slog.Error("store image", "status", resp.StatusCode)
			return c.JSON(500, errormap("internal server error"))
		}
		data, err := io.ReadAll(resp.Body) // the body is the image key
		if err != nil {
			return c.JSON(500, errormap("internal server error"))
		}
		return c.JSON(200, map[string]string{"image_url": env.DefaultEnv.StorageURL + "/pull/" + string(data)})

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
func signRequest(req *http.Request) {
	uploadID := uuid.New().String()
	timestamp := strconv.FormatInt(time.Now().UTC().Unix(), 10)

	cs := uploadID + "\n" + timestamp
	csh := hmac.New(sha256.New, []byte(env.DefaultEnv.StorageAPISecret))
	csh.Write([]byte(cs))
	csb := csh.Sum(nil)
	csb_hex := fmt.Sprintf("%x", csb)

	req.Header.Set("X-Upload-ID", uploadID)
	req.Header.Set("X-Timestamp", timestamp)
	req.Header.Set("X-Signature", csb_hex)
}
