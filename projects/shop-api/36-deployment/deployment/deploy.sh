#!/usr/bin/env bash
# The deployment (Phase 8, lesson 6): if the published image (IMAGE in .env, for example
# ghcr.io/<your-user>/shop-api:main) is not the one that is running, it deploys it. The
# shop-deploy.timer timer launches it every two minutes; you can also run it by hand. The server is
# the one that asks, not GitHub that sends to it: the server doesn't need to open any door to the
# internet.
#
# With nothing new it does nothing and writes nothing: not a line in the journal every two minutes.
# With a new image: backup, migrations, the new API, and it waits for /health to approve it. If it
# never gets healthy, it goes back to the previous image and ends with an error (code 1).
#
# Every step writes one line (systemd's journal keeps it: journalctl -u shop-deploy). It never
# writes any secret: not the .env and not the database's passwords.
set -euo pipefail

# The project's folder: the script's, one level up. Compose and .env are looked up here.
cd "$(dirname "$0")/.."

# A log line: it goes to the output, and systemd keeps it in the journal with its time.
log() { echo "deploy: $*"; }
# An image ID is long (sha256:…): to read it, its first 12 letters.
short() { local id="${1#sha256:}"; echo "${id:0:12}"; }

# One deployment at a time. File descriptor 9 opens (and creates) a lock file, and flock -n tries
# to take it without waiting: if another deployment holds it (the timer and you at once, or a slow
# one that hasn't finished yet), this one ends doing nothing and without an error (0). The system
# releases the lock when the script ends, even if it's from a failure. Always run it as the same
# user: in /run/lock, Linux doesn't let another user open somebody else's lock file.
exec 9>/run/lock/shop-deploy.lock
flock -n 9 || exit 0

compose=(docker compose -f compose.production.yaml)

# The image the server follows: IMAGE from the environment, or the one in .env (grep, not source:
# .env is for Compose, and a value with spaces or quotes would break the script).
image="${IMAGE:-$(grep -E '^IMAGE=' .env | tail -n 1 | cut -d= -f2- || true)}"
if [ -z "$image" ]; then
  log "IMAGE is missing in .env: this script follows a published image (ghcr.io/<your-user>/shop-api:main)" >&2
  exit 1
fi
# The previous image is kept as <name>:previous, and for that the name has to be split from the tag.
# localhost:5000/shop-api:main has two ":": the tag is what comes after the last one, and it only
# counts if it is after the last "/".
if [[ "${image##*/}" != *:* ]]; then
  log "IMAGE ($image) must have a tag, like :main or :sha-1a2b3c4" >&2
  exit 1
fi
name="${image%:*}"
previous="$name:previous"

# What is running now: the ID of the API container's image (empty if there is no container). The ID
# is compared, not the tag: the main tag is always called the same, and it is what changes image.
# The ID is the image's hash: same ID, same image.
container="$("${compose[@]}" ps --all --quiet api)"
running=""
if [ -n "$container" ]; then
  running="$(docker inspect --format '{{.Image}}' "$container")"
fi

# The image that is running is kept under a name of its own (<name>:previous) BEFORE asking the
# registry. If main pointed to another image and the tag moved, the old one would be left without a
# name and Docker could delete it: this way going back depends neither on the registry (it may be
# down) nor on the previous image still having its tag. It's a new tag on an image that is already
# on this disk: it downloads and writes nothing else, and it repeats on every run without noise.
if [ -n "$running" ]; then
  docker tag "$running" "$previous"
fi

# Asks the registry: if main points to a new image, it downloads it and moves the local tag to it.
# With build and image together in the service, pull downloads the image, it doesn't build it.
# Compose writes "Pulling/Pulled" even when asked for --quiet: the output is kept and only shown if
# something fails (the registry down, no network): then the script ends with an error (set -e) and
# the shop keeps running with what it has, untouched.
if ! output="$("${compose[@]}" pull --quiet api 2>&1)"; then
  echo "$output" >&2
  log "could not download $image: the shop keeps the image that is running" >&2
  exit 1
fi
new="$(docker image inspect --format '{{.Id}}' "$image")"

# Nothing new: silence.
if [ "$new" = "$running" ]; then
  exit 0
fi

# An image that already failed is not tried again every two minutes (every attempt is seconds
# without an API): it waits for main to point to another one. The file holds the ID of the last one
# that failed.
if [ -f .deploy-failed ] && [ "$(cat .deploy-failed)" = "$new" ]; then
  log "image $(short "$new") already failed: waiting for a new one" >&2
  exit 1
fi
log "new image: $(short "${running:-none}") -> $(short "$new") (the one running is kept as $previous)"

# If the new image is no good, it is noted so it isn't repeated, and the script ends with an error (1).
fail() {
  echo "$new" > .deploy-failed
  log "$1" >&2
  exit 1
}

# The backup, before touching the schema. Going back changes the code, not the data: a bad migration
# is only undone with this backup, by hand. If the backup fails, the script stops here (set -e):
# without a backup it doesn't migrate, and as nothing has been touched, the next attempt starts
# over.
log "backup before migrating"
deployment/backup.sh

# The migrations, with the new image (migrate uses IMAGE, which already points to it). The API that
# is running stays up meanwhile. If they fail, the API is not touched.
log "migrations"
if ! "${compose[@]}" run --rm migrate; then
  fail "the migrations failed: the API stays on the previous image"
fi

# --no-build: never build. If the image were missing, Compose would give an error, not a docker build.
log "starting the API with the new image"
"${compose[@]}" up -d --no-build api

# Waits up to 60 seconds for Docker to consider the API healthy (the Dockerfile's HEALTHCHECK asks
# /health every 10 seconds). Returns 0 if it is and 1 if it isn't.
wait_for_health() {
  local c status
  for _ in $(seq 30); do
    c="$("${compose[@]}" ps --all --quiet api)"
    status="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}no-check{{end}}' "$c" 2>/dev/null || true)"
    if [ "$status" = healthy ]; then
      return 0
    fi
    sleep 2
  done
  return 1
}

log "waiting for /health (up to 60 s)"
if wait_for_health; then
  rm -f .deploy-failed
  log "done: the API is running $(short "$new")"
  exit 0
fi

# It never got healthy: back to the previous image. IMAGE in the environment overrides the one in
# .env for this command only, and --no-deps avoids running the migrations again with the old code.
if [ -z "$running" ]; then
  fail "the new image never got healthy and there is no previous image to go back to"
fi
log "the new image did not get healthy in 60 s: going back to $(short "$running")" >&2
IMAGE="$previous" "${compose[@]}" up -d --no-build --no-deps api
if wait_for_health; then
  fail "back done: the API is running $(short "$running") again. The new image's migrations are still applied"
fi
fail "the previous image is not healthy either: look at docker compose logs api"
