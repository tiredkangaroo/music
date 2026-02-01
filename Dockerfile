# build the backend
FROM golang:1.24-alpine AS backend-builder

ARG TARGETPLATFORM
ARG TARGETOS
ARG TARGETARCH

WORKDIR /backend

# copy source code
COPY . . 

# download go modules
RUN go mod download

# build the go binary
RUN CGO_ENABLED=0 GOOS=${TARGETOS} GOARCH=${TARGETARCH} go build -o music-backend .

# build the frontend (install deps, build)
FROM node:20-alpine AS frontend-builder
WORKDIR /frontend

# copy source code
COPY ui .

# install deps
RUN npm ci

# build the project
RUN npm run build

# the actual final image
FROM debian:bookworm-slim

WORKDIR /app

# copy the backend binary and frontend build output
COPY --from=backend-builder /backend/music-backend ./music-backend
COPY --from=frontend-builder /frontend/dist ./ui/dist

# install ca-certificates
RUN apt-get update && apt-get install -y ca-certificates

# install ffmpeg
RUN apt-get install -y ffmpeg

# install wget
RUN apt-get install -y wget

# install yt-dlp
RUN wget https://github.com/yt-dlp/yt-dlp/releases/download/2026.01.31/yt-dlp -O /usr/local/bin/yt-dlp
RUN chmod a+rx /usr/local/bin/yt-dlp

# install spotdl
RUN wget https://github.com/spotDL/spotify-downloader/releases/download/v4.4.3/spotDL -O /usr/local/bin/spotdl
RUN chmod a+rx /usr/local/bin/spotdl

ENTRYPOINT ["./music-backend"]