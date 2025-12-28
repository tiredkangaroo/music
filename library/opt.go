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
	}
}
