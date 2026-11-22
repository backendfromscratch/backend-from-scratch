#!/usr/bin/env bash
# The deployment (Phase 8, lesson 6, and without downtime since Phase 9, lesson 4): if the
# published image (IMAGE in .env, for example ghcr.io/<your-user>/shop-api:main) is not the one
# that is running, it deploys it. The shop-deploy.timer timer launches it every two minutes; you can
# also run it by hand. The server is the one that asks, not GitHub that sends to it: the server
# doesn't need to open any door to the internet.
#
# With nothing new it does nothing and writes nothing: not a line in the journal every two minutes.
# With a new image: the other services up to date, backup and migrations; then, the two copies of
# the API, one at a time (api-b and then api-a): while one is being changed, the other one answers,
# and nginx sends everything to it. Each new copy has to be healthy (/health) before touching the
# other one. At the end, the worker, and out go the old images. If a new copy never gets healthy,
# the copies it has already changed go back to the previous image, also one at a time, and it ends
# with an error (code 1).
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

# #region one-at-a-time
# One deployment at a time. File descriptor 9 opens (and creates) a lock file, and flock -n tries
# to take it without waiting: if another deployment holds it (the timer and you at once, or a slow
# one that hasn't finished yet), this one ends doing nothing and without an error (0). The system
# releases the lock when the script ends, even if it's from a failure. Always run it as the same
# user: in /run/lock, Linux doesn't let another user open somebody else's lock file.
exec 9>/run/lock/shop-deploy.lock
flock -n 9 || exit 0
# #endregion one-at-a-time

compose=(docker compose -f compose.production.yaml)

# #region containers
# The container of a service (api-a, api-b, worker…), and only that one: "ps --all -q api-a" would
# also list the ones from a "compose run" (a create-admin that is running). oneoff=False leaves out
# the "run" ones. The project is named like the "name:" in compose.production.yaml. Empty if there
# is none.
container_of() {
  docker ps --all --quiet \
    --filter label=com.docker.compose.project=shop \
    --filter "label=com.docker.compose.service=$1" \
    --filter label=com.docker.compose.oneoff=False
}
# The image (its ID) a service's container is running; empty if there is no container.
image_of() {
  local c
  c="$(container_of "$1")"
  if [ -n "$c" ]; then
    docker inspect --format '{{.Image}}' "$c"
  fi
}
# #endregion containers

# The image the server follows: IMAGE from the environment, or the one in .env (grep, not source:
# .env is for Compose, and a value with spaces or quotes would break the script).
image="${IMAGE:-$(grep -E '^IMAGE=' .env | tail -n 1 | cut -d= -f2- || true)}"
# Compose accepts IMAGE="…" with quotes (it removes them when reading .env); here they are removed by hand.
image="${image#[\"\']}"
image="${image%[\"\']}"
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

# #region old-api
# The single-copy API, the one from Phase 8 and steps 37 to 39: the api service. It only exists if
# this server comes from step 39 or earlier: the first deployment of this step replaces it with
# api-a and api-b (further down, in "copies"). Its port, 3000 or 3001: Compose gave it the first
# free one in the 3000-3001 range, and on every deployment the new copy started before the old one
# let go of its port, so it kept switching from one to the other. The copy that goes on the free
# port starts first.
old_api="$(container_of api)"
first_copy=api-b
second_copy=api-a
# This script knows how to remove one, and nothing more: with several (docker compose up --scale
# api=2), or on a port that is neither of the two, it touches nothing and says so.
if [ "$(printf '%s\n' "$old_api" | grep -c .)" -gt 1 ]; then
  log "there are $(printf '%s\n' "$old_api" | grep -c .) containers of the api service (from --scale): this deployment only knows how to remove one. Leave one (docker stop and docker rm the others) and launch it again" >&2
  exit 1
fi
if [ -n "$old_api" ]; then
  old_port="$(docker port "$old_api" 3000)"
  case "$old_port" in
    127.0.0.1:3000) ;;
    127.0.0.1:3001)
      first_copy=api-a
      second_copy=api-b
      ;;
    *)
      log "the single-copy API is on neither port 3000 nor 3001 of 127.0.0.1 ($old_port), the ports of api-a and api-b: I touch nothing" >&2
      exit 1
      ;;
  esac
fi
# #endregion old-api

# What is running now: the ID of api-a's image (or, the first time, the single-copy API's; empty if
# there is none). The ID is compared, not the tag: the main tag is always called the same, and it
# is what changes image. The ID is the image's hash: same ID, same image.
# The image's services are the two copies and the worker (the first time, the single-copy API and
# the worker). A deployment cut halfway (a restart, systemctl stop) can leave them with different
# images: the copies with the new one and the worker with the old one.
if [ -n "$old_api" ]; then
  container="$old_api"
  services=(api worker)
else
  container="$(container_of api-a)"
  services=(api-a api-b worker)
fi
running=""
if [ -n "$container" ]; then
  running="$(docker inspect --format '{{.Image}}' "$container")"
fi
all_same=yes
for service in "${services[@]}"; do
  if [ "$(image_of "$service")" != "$running" ]; then
    all_same=no
  fi
done

# #region previous
# The image that is running is kept under a name of its own (<name>:previous) BEFORE asking the
# registry. If main pointed to another image and the tag moved, the old one would be left without a
# name and Docker could delete it: this way going back depends neither on the registry (it may be
# down) nor on the previous image still having its tag. It's a new tag on an image that is already
# on this disk: it downloads and writes nothing else, and it repeats on every run without noise.
# Only if all the image's services run the same one and the container is healthy: an image that
# doesn't work isn't one worth going back to, and after a deployment cut halfway the one running in
# api-a is the new one, not the previous one. If not, the :previous that already existed is kept.
if [ -n "$running" ] && [ "$all_same" = yes ] &&
  [ "$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{end}}' "$container")" = healthy ]; then
  docker tag "$running" "$previous"
fi
# #endregion previous

# #region ask
# Asks the registry: if main points to a new image, it downloads it and moves the local tag to it.
# With build and image together in the service, pull downloads the image, it doesn't build it.
# Compose writes "Pulling/Pulled" even when asked for --quiet: the output is kept and only shown if
# something fails (the registry down, no network): then the script ends with an error (set -e) and
# the shop keeps running with what it has, untouched.
if ! output="$("${compose[@]}" pull --quiet api-a 2>&1)"; then
  echo "$output" >&2
  log "could not download $image: the shop keeps the image that is running" >&2
  exit 1
fi
new="$(docker image inspect --format '{{.Id}}' "$image")"

# Nothing new (both copies and the worker already run main's image): silence.
if [ "$(image_of api-a)" = "$new" ] && [ "$(image_of api-b)" = "$new" ] &&
  [ "$(image_of worker)" = "$new" ]; then
  exit 0
fi
# #endregion ask

# #region failed
# An image that already failed is not tried again every two minutes (every attempt stops and starts
# the copies again): it waits for main to point to another one. The file holds the ID of the last
# one that failed.
if [ -f .deploy-failed ] && [ "$(cat .deploy-failed)" = "$new" ]; then
  log "image $(short "$new") already failed: waiting for a new one (to retry it: rm $PWD/.deploy-failed)" >&2
  exit 1
fi
if [ "$running" = "$new" ]; then
  log "a deployment of $(short "$new") was left halfway: I finish it"
else
  log "new image: $(short "${running:-none}") -> $(short "$new") (the one running is kept as $previous)"
fi
# #endregion failed

# #region docker-proxy
# A warning, stopping nothing. If Docker passes the published ports through docker-proxy (its
# "userland proxy", on unless changed), the port of a copy that is shutting down keeps accepting
# connections and cuts them: nginx has already sent the request, and it doesn't repeat a POST on the
# other copy (502). Without docker-proxy, the connection is refused, and nginx repeats the request
# on the other one, even if it's a POST. Docker doesn't say how it is configured without sudo, but
# every port that goes through the proxy is a docker-proxy process in plain sight, with its port
# (-host-port 3000) on the command line.
if pgrep -f 'docker-proxy.*-host-port 300[01] ' > /dev/null 2>&1; then
  log "warning: the API's ports go through docker-proxy; to deploy without downtime, {\"userland-proxy\": false} in /etc/docker/daemon.json and sudo systemctl restart docker (README)" >&2
fi
# #endregion docker-proxy

# If the new image is no good, it is noted so it isn't repeated, and the script ends with an error (1).
fail() {
  echo "$new" > .deploy-failed
  log "$1" >&2
  exit 1
}

# #region other-services
# The services that aren't from the image (db, redis, cache), up to date with
# compose.production.yaml: if one has changed (in Phase 9, Redis keeps the queue on disk), Compose
# recreates it; if it is new (the cache, in lesson 2), it starts it; if not, it doesn't touch it. It
# goes before the backup and the migrations, which need db running. Recreating redis forgets the
# limits' attempts, and recreating the cache leaves it empty: neither matters.
log "the other services, up to date"
"${compose[@]}" up -d --no-build --no-deps db redis cache
# #endregion other-services

# #region migrate
# The backup, before touching the schema. Going back changes the code, not the data: a bad migration
# is only undone with this backup, by hand. If the backup fails, the script stops here (set -e):
# without a backup it doesn't migrate, and as nothing has been touched, the next attempt starts
# over.
log "backup before migrating"
deployment/backup.sh

# The migrations, with the new image (migrate uses IMAGE, which already points to it). The copies
# that are running stay up meanwhile, already with the new schema, and during the change an old copy
# and a new one answer at once: a migration has to serve both versions of the code (expand and
# contract, Phase 8). If they fail, the API is not touched.
log "migrations"
if ! "${compose[@]}" run --rm migrate; then
  fail "the migrations failed: the API stays on the previous image"
fi
# #endregion migrate

# #region wait-for-health
# Waits for Docker to consider the copy healthy (the Dockerfile's HEALTHCHECK asks /health every 10
# seconds): up to 60 seconds, but it gives up as soon as Docker considers it bad (unhealthy:
# /health failed three times in a row) or the container is no longer running (the process ended, for
# example from an error when starting). The worker's health is its heartbeat
# (compose.production.yaml): one that restarts in a loop never gets healthy. With a second
# argument, "running", it is enough that the container runs and Docker hasn't considered it bad
# (going back, for the worker: roll-back, further down). 0 if it's healthy, 1 if not. The status
# is read as "0 running healthy", "0 running starting", "1 exited "…: in front, how many times
# Docker has restarted it (RestartCount).
# Since Phase 10 (lesson 6), healthy once is not enough: it has to be seen healthy twice, about 5
# seconds apart, and with the same number of restarts. A process that starts, answers for a moment
# and goes down (and Docker starts it again, with restart: unless-stopped) could be caught healthy
# right in one look; if it has restarted between the two, RestartCount has gone up, and it doesn't
# count. The 60 seconds are counted by adding up what is slept (2 or 5 each time), not the rounds:
# with rounds of 5 s, 30 rounds would be two and a half minutes.
wait_for_health() {
  local status restarts seen='' waited=0 template='{{.RestartCount}} {{.State.Status}} {{if .State.Health}}{{.State.Health.Status}}{{end}}'
  while [ "$waited" -lt 60 ]; do
    status="$(docker inspect --format "$template" "$(container_of "$1")" 2> /dev/null || true)"
    restarts="${status%% *}"
    status="${status#* }"
    case "$status" in
      'running healthy') ;;
      *unhealthy | exited* | dead* | restarting*) return 1 ;;
      running*) if [ "${2-}" != running ]; then status=''; fi ;;
      *) status='' ;;
    esac
    if [ -z "$status" ]; then
      # Not yet: another look in 2 seconds, and the count of the two sightings, from zero.
      seen=''
      sleep 2
      waited=$((waited + 2))
      continue
    fi
    # Healthy. The second time in a row, with the same restarts as the first: for real.
    if [ "$seen" = "$restarts" ]; then return 0; fi
    seen="$restarts"
    sleep 5
    waited=$((waited + 5))
  done
  return 1
}
# #endregion wait-for-health

# #region change
# Changes a service's container for one with that image, and waits for it to be healthy (or, with
# "running" as a third argument, to run). up -d recreates the container: Docker sends SIGTERM to
# the old one, which stops accepting connections, finishes what it has half done and exits
# (src/shutdown.ts), and starts the new one. Meanwhile,
# nginx sends everything to the other copy: a refused connection is repeated on the other one, even
# if it's a POST, as long as Docker doesn't pass the ports through docker-proxy (the warning above).
# IMAGE in the environment overrides the one in .env for this command only. --no-build: never build
# (if the image were missing, Compose would give an error, not a docker build). --no-deps: the
# migrations were already applied above, and nothing else is touched: not the other copy and not the
# worker.
change() {
  IMAGE="$2" "${compose[@]}" up -d --no-build --no-deps "$1" && wait_for_health "$1" "${3-}"
}
# #endregion change

# #region pause
# nginx gives a copy one failure for 10 seconds (fail_timeout, nginx/shop.conf) from the last time
# it failed. While it was being changed, the new copy failed for nginx; now it is healthy, but that
# last failure may be less than 10 seconds old, and nginx wouldn't send it anything yet: if the other
# one stopped now, nginx would have nowhere to send the requests (502). So, before touching the
# other one, 10 seconds more.
nginx_pause() {
  sleep 10
}
# #endregion pause

# #region roll-back
# It didn't start or never got healthy: the copies it is told, back to the previous image (the one
# kept as :previous), one at a time and in that order (the one that failed, first), and it ends with
# an error. The new image's migrations are still applied: going back changes the code, not the data.
# The copies have to be healthy again; the worker, only to run: the previous image may come from
# before its heartbeat (step 39 or earlier), and its worker would never get healthy.
roll_back() {
  if ! docker image inspect "$previous" > /dev/null 2>&1; then
    fail "the new image never got healthy, and there is no previous image to go back to"
  fi
  local id first=yes enough
  id="$(docker image inspect --format '{{.Id}}' "$previous")"
  log "the new image never got healthy on $1: going back to $(short "$id") ($*)" >&2
  for service in "$@"; do
    enough=healthy
    case "$service" in
      api-*) if [ "$first" = no ]; then nginx_pause; fi && first=no ;;
      worker) enough=running ;;
    esac
    if ! change "$service" "$previous" "$enough"; then
      fail "the previous image is not healthy either on $service: look at docker compose -f compose.production.yaml logs $service"
    fi
  done
  fail "back done, with $(short "$id") again: $*. The new image's migrations are still applied"
}
# #endregion roll-back

# #region copies
# First api-b and then api-a (the other way round if the single-copy API is on 3001: old-api, above).
# The first deployment of this step arrives at a server with that old API on one of the two ports;
# the first copy uses the other one, which is free, so the old one keeps answering until the first
# is healthy. Then, the old one leaves its port to the second: it is stopped (SIGTERM, like any
# copy, and it finishes what it has half done) and removed. Only that time: afterwards there is no
# api service any more.
log "$first_copy, with the new image (the other copy keeps answering)"
change "$first_copy" "$image" || roll_back "$first_copy"
nginx_pause
if [ -n "$old_api" ]; then
  log "the single-copy API leaves its port to $second_copy"
  docker stop "$old_api" > /dev/null
  docker rm "$old_api" > /dev/null
fi
log "$second_copy, with the new image ($first_copy already answers with it)"
change "$second_copy" "$image" || roll_back "$second_copy" "$first_copy"
# #endregion copies

# #region worker
# The worker, when both copies already run the new image: it isn't behind nginx, and the jobs of the
# payments that arrive while it is changed wait in outbox_events (Phase 9, lesson 7): the new one
# relays them when it starts. When it's stopped, Docker sends it SIGTERM, and it finishes the one it
# has half done (scripts/worker.ts).
# If it doesn't start or never gets healthy (its heartbeat), everything goes back.
log "the worker, with the new image"
change worker "$image" || roll_back worker "$second_copy" "$first_copy"
rm -f .deploy-failed
log "done: api-a, api-b and the worker are running $(short "$new")"
# #endregion worker

# #region prune
# Out go the old images: without this, every deployment leaves one more on the disk, hundreds of MB.
# docker image prune deletes the ones with no tag that no container uses. The new one has its own
# (main) and the containers use it; the previous one, :previous, in case it's needed to go back. The
# earlier ones lost their last tag when main or :previous moved to another one. Without --all: with
# it, it would also delete the previous one, which no container uses.
log "old images: $(docker image prune --force | tail -n 1)"
# #endregion prune
