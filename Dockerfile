FROM node:22-alpine AS frontend-builder

WORKDIR /build/web/frontend
COPY web/frontend/package.json web/frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY web/frontend/ ./
RUN npm run lint && npm test && npm run build:go

FROM golang:1.22-alpine AS builder

WORKDIR /build

# Install gcc for SQLite
RUN apk add --no-cache gcc musl-dev

# Copy Go module files
COPY go.mod go.sum ./
RUN go mod download

# Copy source and the built React shell (served at /next/ during the migration)
COPY . .
COPY --from=frontend-builder /build/web/dist ./web/dist

# Build
RUN CGO_ENABLED=1 GOOS=linux go build -o cals ./cmd/server

# Runtime image
FROM alpine:latest

# Link GHCR's package page back to the source repository when the image is first published.
# This enables repository/package linking, but package visibility is still configured separately.
LABEL org.opencontainers.image.source="https://github.com/dougalbob/cals"

WORKDIR /app

# Install SQLite and CA certificates
RUN apk add --no-cache sqlite ca-certificates tzdata

# Copy binary
COPY --from=builder /build/cals .

# Copy web files
COPY --from=builder /build/web ./web

# Create data directory
RUN mkdir -p /app/data

# The app's listen port is controlled by PORT. V1 (legacy Compose deployment)
# runs on 8150; the cals-dev-v2 Unraid template sets PORT=8151 so both can run
# side by side. EXPOSE is image metadata only.
EXPOSE 8150 8151

CMD ["./cals"]
