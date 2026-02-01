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

RUN apt-get update && apt-get install -y \
    ca-certificates \
    ffmpeg \
    wget \
    python3 \
    python3-pip \
    && rm -rf /var/lib/apt/lists/*

RUN pip3 install --no-cache-dir --break-system-packages spotdl yt-dlp

ENTRYPOINT ["./music-backend"]