# Multi-stage Dockerfile for the Phaze production image.
# Build context: the repo root. Production runs it as a Cloudflare Container
# (cloudflare/wrangler.jsonc points here); it also runs anywhere Docker does.
#
# Multi-arch: docker.yml builds linux/amd64 and linux/arm64. The Go and web
# stages run on the build machine's own platform ($BUILDPLATFORM) and
# cross-compile for $TARGETARCH, so an arm64 image never builds under QEMU.
# Only the final stage is target-platform.

# -----------------------------------------------------------------------
# 1) Build the Go binaries (nexus-server + admin CLIs + Nova bot).
# -----------------------------------------------------------------------
FROM --platform=$BUILDPLATFORM golang:1.26-alpine AS go-build
ARG TARGETOS=linux
ARG TARGETARCH
WORKDIR /src
# Bring in just the Go modules first so the dependency download caches well.
COPY nexus_server/go.mod nexus_server/go.sum ./nexus_server/
COPY nova_bot/go.mod nova_bot/go.sum ./nova_bot/
WORKDIR /src/nexus_server
RUN go mod download
WORKDIR /src/nova_bot
RUN go mod download
WORKDIR /src
# VERSION is the repo-root single source of truth; stamp it into the binary.
COPY VERSION ./VERSION
COPY nexus_server/ ./nexus_server/
COPY nova_bot/ ./nova_bot/
ENV CGO_ENABLED=0
RUN test -n "$TARGETARCH" || { echo "TARGETARCH is unset: build with BuildKit (docker buildx / DOCKER_BUILDKIT=1)"; exit 1; } \
 && export GOOS="$TARGETOS" GOARCH="$TARGETARCH" \
 && VER="$(cat /src/VERSION)" \
 && go -C nexus_server build -trimpath -ldflags="-s -w -X main.Version=$VER" -o /out/nexus-server . \
 && go -C nexus_server build -trimpath -ldflags="-s -w" -o /out/seed-admin ./cmd/seed-admin \
 && go -C nexus_server build -trimpath -ldflags="-s -w" -o /out/grant-supporter ./cmd/grant-supporter \
 && go -C nexus_server build -trimpath -ldflags="-s -w" -o /out/fetch-seed ./cmd/fetch-seed \
 && go -C nova_bot build -trimpath -ldflags="-s -w" -o /out/nova-bot .


# -----------------------------------------------------------------------
# 2) Build the React/Vite web client (platform-independent output).
#    Emits a static SPA at /src/web/dist that the Go server mounts at /web.
# -----------------------------------------------------------------------
FROM --platform=$BUILDPLATFORM node:22-alpine AS web-build
WORKDIR /src/web
COPY web/package.json web/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY web/ ./
RUN npm run build

# -----------------------------------------------------------------------
# 3) Pull a pinned, checksum-verified Litestream binary for $TARGETARCH.
#    Stays on 0.3.x: 0.5 switched to a new replica format (LTX) that
#    cannot restore the existing 0.3 replica in R2.
#    The checksums are the SHA-256 of the upstream release tarballs (upstream
#    publishes none for 0.3.13); update them together with the version.
# -----------------------------------------------------------------------
FROM --platform=$BUILDPLATFORM alpine:3.24 AS litestream-dl
# Unpinned apk packages are intentional: Alpine drops old package versions
# from its mirrors, so pins would break rebuilds. The base tag pins the release.
ARG TARGETARCH
ARG LITESTREAM_VERSION=0.3.13
ARG LITESTREAM_SHA256_AMD64=eb75a3de5cab03875cdae9f5f539e6aedadd66607003d9b1e7a9077948818ba0
ARG LITESTREAM_SHA256_ARM64=9585f5a508516bd66af2b2376bab4de256a5ef8e2b73ec760559e679628f2d59
# hadolint ignore=DL3018
RUN apk add --no-cache curl \
 && case "$TARGETARCH" in \
      amd64) SUM="$LITESTREAM_SHA256_AMD64" ;; \
      arm64) SUM="$LITESTREAM_SHA256_ARM64" ;; \
      *) echo "no pinned Litestream checksum for TARGETARCH='$TARGETARCH'"; exit 1 ;; \
    esac \
 && TGZ="litestream-v${LITESTREAM_VERSION}-linux-${TARGETARCH}.tar.gz" \
 && curl -fsSL -o "/tmp/$TGZ" "https://github.com/benbjohnson/litestream/releases/download/v${LITESTREAM_VERSION}/$TGZ" \
 && printf '%s  %s\n' "$SUM" "/tmp/$TGZ" > /tmp/litestream.sha256 \
 && sha256sum -c /tmp/litestream.sha256 \
 && tar -xzf "/tmp/$TGZ" -C /usr/local/bin litestream \
 && rm "/tmp/$TGZ" /tmp/litestream.sha256

# -----------------------------------------------------------------------
# 4) Runtime image. Slim: only the binaries, the templates/public assets,
#    and the compiled web SPA. Runs as an unprivileged user that owns /data.
# -----------------------------------------------------------------------
FROM alpine:3.24
# hadolint ignore=DL3018
RUN apk add --no-cache ca-certificates \
 && addgroup -S -g 10001 phaze \
 && adduser -S -D -H -u 10001 -G phaze -h /data -s /sbin/nologin phaze
WORKDIR /app
COPY --from=go-build      /out/nexus-server                    /app/nexus-server
COPY --from=go-build      /out/seed-admin                      /app/seed-admin
COPY --from=go-build      /out/grant-supporter                 /app/grant-supporter
COPY --from=go-build      /out/fetch-seed                      /app/fetch-seed
COPY --from=go-build      /out/nova-bot                        /app/nova-bot
COPY --from=litestream-dl /usr/local/bin/litestream            /usr/local/bin/litestream
COPY --from=web-build     /src/web/dist                        /app/web
COPY nexus_server/templates                                    /app/templates
# public/ includes downloads/Phaze.apk: download.html links /downloads/Phaze.apk
# directly (and uses it as the fallback when the GitHub API is unreachable),
# and fileDownloadHandler serves it from here.
COPY nexus_server/public                                       /app/public
COPY nexus_server/litestream.yml                               /app/litestream.yml
COPY --chmod=0755 nexus_server/entrypoint.sh                   /app/entrypoint.sh
# Everything the server writes lives under /data (the volume, or the
# Cloudflare Container's disk): the SQLite DB + Litestream's shadow WAL,
# chat uploads (PHAZE_UPLOAD_DIR) and, with the disk blob store, avatars
# (written to ./avatars relative to /app, linked into /data).
RUN mkdir -p /data/uploads /data/avatars \
 && ln -s /data/avatars /app/avatars \
 && chown -R phaze:phaze /data

ENV PORT=8080 \
    DB_PATH=/data/nexus.db \
    PHAZE_UPLOAD_DIR=/data/uploads
EXPOSE 8080
USER phaze:phaze

# Generous start period: on Cloudflare (and with a bucket set) the DB is
# restored from the replica before the server listens.
HEALTHCHECK --interval=30s --timeout=5s --start-period=90s --retries=3 \
  CMD wget -q -O /dev/null "http://127.0.0.1:${PORT}/health" || exit 1

CMD ["/app/entrypoint.sh"]
