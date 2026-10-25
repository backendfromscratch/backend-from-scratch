#!/usr/bin/env bash
# A fake docker for deploy.sh's tests (deployment-files.test.ts): it only answers the commands the
# script uses, writes each one down in $FAKE/orders and keeps its state in files in the $FAKE
# folder:
#   tags/<name>           the ID of the image that tag points to (/ and : changed to _)
#   containers/<service>  the ID of that service's container in the shop project
#   c/<container>         its image, its status (running), its health (healthy, unhealthy, starting)
#                         and the server port it publishes 3000 on (127.0.0.1:3000)
#   new                   the ID of the image pull brings
#   health/<image>        the health of the new containers of that image (if not, healthy)
#   health/<image>-<svc>  the one for that service's containers with that image, above the previous
#   restarts/<image>      "rise": the new containers of that image restart between one look
#                         (inspect) and the next; their RestartCount goes up each time (if not, 0)
set -euo pipefail

d="$FAKE"
echo "${IMAGE:+IMAGE=$IMAGE }docker $*" >> "$d/orders"

key() { printf '%s' "$1" | tr '/:' '__'; }
# An image's ID: an ID (sha256:…) is itself; a tag, the one in its file.
resolve() {
  case "$1" in
    sha256:*) echo "$1" ;;
    *) cat "$d/tags/$(key "$1")" 2> /dev/null || { echo "No such image: $1" >&2; return 1; } ;;
  esac
}
# The value of a "name=value" line in a container's file.
field() { sed -n "s/^$2=//p" "$d/c/$1"; }
# IMAGE: the one in the environment, or the one in .env (the project folder is the current one, as in Compose).
compose_image() { echo "${IMAGE:-$(sed -n 's/^IMAGE=//p' .env)}"; }

case "$1" in
  ps)
    # docker ps --all --quiet --filter label=…service=<service> …
    service="$(printf '%s\n' "$@" | sed -n 's/^label=com\.docker\.compose\.service=//p')"
    cat "$d/containers/$service" 2> /dev/null || true
    ;;
  inspect)
    # docker inspect --format <template> <container>
    format="$3" id="$4"
    [ -f "$d/c/$id" ] || { echo "No such object: $id" >&2; exit 1; }
    case "$format" in
      *.RestartCount*.State.Status*)
        restarts="$(field "$id" restarts)"
        restarts="${restarts:-0}"
        if [ "$(field "$id" rise)" = yes ]; then
          sed "s/^restarts=.*/restarts=$((restarts + 1))/" "$d/c/$id" > "$d/c/$id.new"
          mv "$d/c/$id.new" "$d/c/$id"
        fi
        echo "$restarts $(field "$id" status) $(field "$id" health)"
        ;;
      *.State.Status*) echo "$(field "$id" status) $(field "$id" health)" ;;
      *Health*) health="$(field "$id" health)" && echo "${health:-no-check}" ;;
      *.Image*) field "$id" image ;;
    esac
    ;;
  tag)
    id="$(resolve "$2")"
    echo "$id" > "$d/tags/$(key "$3")"
    ;;
  image)
    case "$2" in
      inspect)
        # docker image inspect [--format '{{.Id}}'] <image>
        ref="${*: -1}"
        id="$(resolve "$ref")"
        if [ "$3" = --format ]; then echo "$id"; else echo '[{}]'; fi
        ;;
      prune) ;;
    esac
    ;;
  port)
    # docker port <container> 3000
    field "$2" port
    ;;
  stop) ;;
  rm)
    for service in "$d"/containers/*; do
      if [ "$(cat "$service")" = "$2" ]; then rm "$service"; fi
    done
    ;;
  compose)
    shift 3 # compose -f compose.production.yaml
    case "$1" in
      pull)
        [ ! -f "$d/pull-fails" ] || exit 1
        cp "$d/new" "$d/tags/$(key "$(compose_image)")"
        ;;
      run)
        [ ! -f "$d/migrate-fails" ] || exit 1
        ;;
      up)
        shift # up
        services=()
        for word in "$@"; do
          case "$word" in -*) ;; *) services+=("$word") ;; esac
        done
        case "${services[0]}" in db | redis | cache) exit 0 ;; esac
        id="$(resolve "$(compose_image)")"
        for service in "${services[@]}"; do
          [ ! -f "$d/up-fails-$service" ] || exit 1
          n=$(($(cat "$d/counter" 2> /dev/null || echo 0) + 1))
          echo "$n" > "$d/counter"
          container="c$n-$service"
          health="$(cat "$d/health/${id#sha256:}-$service" 2> /dev/null ||
            cat "$d/health/${id#sha256:}" 2> /dev/null || echo healthy)"
          printf 'image=%s\nstatus=running\nhealth=%s\nrestarts=0\n' "$id" "$health" > "$d/c/$container"
          if [ "$(cat "$d/restarts/${id#sha256:}" 2> /dev/null)" = rise ]; then
            echo 'rise=yes' >> "$d/c/$container"
          fi
          echo "$container" > "$d/containers/$service"
        done
        ;;
    esac
    ;;
esac
