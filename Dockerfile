FROM golang:1.22-alpine AS builder

WORKDIR /build

# Install gcc for SQLite
RUN apk add --no-cache gcc musl-dev

# Copy go mod files
COPY go.mod go.sum ./
RUN go mod download

# Copy source
COPY . .

# Build
RUN CGO_ENABLED=1 GOOS=linux go build -o cals ./cmd/server

# Runtime image
FROM alpine:latest

WORKDIR /app

# Install SQLite and CA certificates
RUN apk add --no-cache sqlite ca-certificates tzdata

# Copy binary
COPY --from=builder /build/cals .

# Copy web files
COPY --from=builder /build/web ./web

# Create data directory
RUN mkdir -p /app/data

EXPOSE 8150

CMD ["./cals"]
