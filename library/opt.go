package library

import (
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	queries "github.com/tiredkangaroo/music/db"
)

func optuuid(id uuid.UUID) pgtype.UUID {
	return pgtype.UUID{
		Bytes: id,
		Valid: true,
	}
}
func opttime(t time.Time) pgtype.Timestamp {
	return pgtype.Timestamp{
		Time:  t,
		Valid: true,
	}
}
func optint32(i int32) pgtype.Int4 {
	return pgtype.Int4{
		Int32: i,
		Valid: true,
	}
}

func optstring(s string) pgtype.Text {
	return pgtype.Text{
		String: s,
		Valid:  true,
	}
}
func optdate(d time.Time) pgtype.Date {
	return pgtype.Date{
		Time:  d,
		Valid: true,
	}
}

func insertParamsFromSearchRow(t queries.SearchTrackByNameRow) queries.InsertTrackParams {
	return queries.InsertTrackParams{
		ArtistID:   t.ArtistID,
		ArtistName: t.ArtistName,
		Artists:    t.Artists,

		AlbumID:          t.AlbumID,
		AlbumName:        t.AlbumName,
		AlbumReleaseDate: t.AlbumReleaseDate,
		CoverUrl:         t.CoverUrl,

		TrackID:          t.TrackID,
		TrackName:        t.TrackName,
		TrackReleaseDate: t.TrackReleaseDate,

		Duration:   t.Duration,
		Popularity: t.Popularity,

		Downloaded: false, // leave as false (we're just copying data from search)
	}
}

func insertParamsFromItem(item spotifyItem) queries.InsertTrackParams {
	if len(item.Artists) == 0 {
		return queries.InsertTrackParams{}
	}
	var artistNames []string
	for _, artist := range item.Artists {
		artistNames = append(artistNames, artist.Name)
	}
	var coverURL string
	if len(item.Album.Images) > 0 {
		coverURL = item.Album.Images[0].URL
	}
	rd := releaseDate(item.Album.ReleaseDate)
	return queries.InsertTrackParams{
		ArtistID:   item.Artists[0].ID,
		ArtistName: item.Artists[0].Name,
		Artists:    artistNames,

		AlbumID:          item.Album.ID,
		AlbumName:        item.Album.Name,
		AlbumReleaseDate: rd,
		CoverUrl:         coverURL,

		TrackID:          item.ID,
		TrackName:        item.Name,
		TrackReleaseDate: rd,

		Duration:   int32(item.DurationMs / 1000), // convert ms to s
		Popularity: item.Popularity,
	}
}

func filter[T any](slice []T, predicate func(T) bool) []T {
	result := make([]T, len(slice))
	i := 0
	for _, item := range slice {
		if predicate(item) {
			result[i] = item
			i++
		}
	}
	return result[:i]
}

func maxLengthString(s string, max int) string {
	if len(s) <= max {
		return s
	}
	if max <= 12 {
		return s[:max]
	}
	return s[:max-12] + " [truncated]"
}
