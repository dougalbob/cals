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
