#!/usr/bin/env bash
# Un docker de mentira para los tests de desplegar.sh (despliegue-ficheros.test.ts): contesta solo
# a las órdenes que usa el script, apunta cada una en $FALSO/ordenes y guarda su estado en ficheros
# de la carpeta $FALSO:
#   etiquetas/<nombre>      el ID de la imagen a la que apunta esa etiqueta (/ y : cambiados por _)
#   contenedores/<servicio> el ID del contenedor de ese servicio del proyecto tienda
#   c/<contenedor>          su imagen, su estado (running), su salud (healthy, unhealthy, starting)
#                           y el puerto del servidor en el que publica el 3000 (127.0.0.1:3000)
#   nueva                   el ID de la imagen que trae pull
#   salud/<imagen>          la salud de los contenedores nuevos de esa imagen (si no, healthy)
#   salud/<imagen>-<serv.>  la de los de ese servicio con esa imagen, por encima de la anterior
set -euo pipefail

d="$FALSO"
echo "${IMAGEN:+IMAGEN=$IMAGEN }docker $*" >> "$d/ordenes"

clave() { printf '%s' "$1" | tr '/:' '__'; }
# El ID de una imagen: un ID (sha256:…) es él mismo; una etiqueta, el de su fichero.
resolver() {
  case "$1" in
    sha256:*) echo "$1" ;;
    *) cat "$d/etiquetas/$(clave "$1")" 2> /dev/null || { echo "No such image: $1" >&2; return 1; } ;;
  esac
}
# El valor de una línea «nombre=valor» del fichero de un contenedor.
dato() { sed -n "s/^$2=//p" "$d/c/$1"; }
# IMAGEN: la del entorno, o la de .env (la carpeta del proyecto es la actual, como en Compose).
imagen_compose() { echo "${IMAGEN:-$(sed -n 's/^IMAGEN=//p' .env)}"; }

case "$1" in
  ps)
    # docker ps --all --quiet --filter label=…service=<servicio> …
    servicio="$(printf '%s\n' "$@" | sed -n 's/^label=com\.docker\.compose\.service=//p')"
    cat "$d/contenedores/$servicio" 2> /dev/null || true
    ;;
  inspect)
    # docker inspect --format <plantilla> <contenedor>
    formato="$3" id="$4"
    [ -f "$d/c/$id" ] || { echo "No such object: $id" >&2; exit 1; }
    case "$formato" in
      *.State.Status*) echo "$(dato "$id" estado) $(dato "$id" salud)" ;;
      *Health*) salud="$(dato "$id" salud)" && echo "${salud:-sin-comprobacion}" ;;
      *.Image*) dato "$id" imagen ;;
    esac
    ;;
  tag)
    id="$(resolver "$2")"
    echo "$id" > "$d/etiquetas/$(clave "$3")"
    ;;
  image)
    case "$2" in
      inspect)
        # docker image inspect [--format '{{.Id}}'] <imagen>
        ref="${*: -1}"
        id="$(resolver "$ref")"
        if [ "$3" = --format ]; then echo "$id"; else echo '[{}]'; fi
        ;;
      prune) ;;
    esac
    ;;
  port)
    # docker port <contenedor> 3000
    dato "$2" puerto
    ;;
  stop) ;;
  rm)
    for servicio in "$d"/contenedores/*; do
      if [ "$(cat "$servicio")" = "$2" ]; then rm "$servicio"; fi
    done
    ;;
  compose)
    shift 3 # compose -f compose.produccion.yaml
    case "$1" in
      pull)
        [ ! -f "$d/pull-falla" ] || exit 1
        cp "$d/nueva" "$d/etiquetas/$(clave "$(imagen_compose)")"
        ;;
      run)
        [ ! -f "$d/migrar-falla" ] || exit 1
        ;;
      up)
        shift # up
        servicios=()
        for palabra in "$@"; do
          case "$palabra" in -*) ;; *) servicios+=("$palabra") ;; esac
        done
        case "${servicios[0]}" in db | redis | cache) exit 0 ;; esac
        id="$(resolver "$(imagen_compose)")"
        for servicio in "${servicios[@]}"; do
          [ ! -f "$d/up-falla-$servicio" ] || exit 1
          n=$(($(cat "$d/contador" 2> /dev/null || echo 0) + 1))
          echo "$n" > "$d/contador"
          contenedor="c$n-$servicio"
          salud=""
          if [ "$servicio" != trabajador ]; then
            salud="$(cat "$d/salud/${id#sha256:}-$servicio" 2> /dev/null ||
              cat "$d/salud/${id#sha256:}" 2> /dev/null || echo healthy)"
          fi
          printf 'imagen=%s\nestado=running\nsalud=%s\n' "$id" "$salud" > "$d/c/$contenedor"
          echo "$contenedor" > "$d/contenedores/$servicio"
        done
        ;;
    esac
    ;;
esac
