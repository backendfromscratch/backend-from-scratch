#!/usr/bin/env bash
# El despliegue (Fase 8, lección 6): si la imagen publicada (IMAGEN en .env, por ejemplo
# ghcr.io/<tu-usuario>/tienda-api:main) es otra que la que corre, la despliega. Lo lanza cada dos
# minutos tienda-despliegue.timer; también puedes ejecutarlo a mano. Es el servidor quien pregunta,
# no GitHub quien le manda: el servidor no necesita abrir ninguna puerta a internet.
#
# Sin novedades no hace nada y no escribe nada: ni una línea en el diario cada dos minutos. Con una
# imagen nueva: copia de seguridad, migraciones, la API nueva, y espera a que /salud la dé por
# buena. Si no llega a estarlo, vuelve a la imagen anterior y termina con error (código 1).
#
# Cada paso escribe una línea (el diario de systemd la guarda: journalctl -u tienda-despliegue).
# Nunca escribe ningún secreto: ni el .env ni las contraseñas de la base de datos.
set -euo pipefail

# La carpeta del proyecto: la de este script, un nivel más arriba. Compose y .env se buscan aquí.
cd "$(dirname "$0")/.."

# Una línea de registro: va a la salida, y systemd la guarda en el diario con su hora.
registrar() { echo "despliegue: $*"; }
# Un ID de imagen es largo (sha256:…): para leerlo, sus 12 primeras letras.
corto() { local id="${1#sha256:}"; echo "${id:0:12}"; }

# Un solo despliegue a la vez. El descriptor 9 abre (y crea) un fichero de bloqueo, y flock -n
# intenta cogerlo sin esperar: si otro despliegue lo tiene (el temporizador y tú a la vez, o uno
# lento que aún no ha terminado), este termina sin hacer nada y sin error (0). El bloqueo lo suelta
# el sistema cuando el script termina, aunque sea por un fallo. Ejecútalo siempre con el mismo
# usuario: en /run/lock, Linux no deja a otro usuario abrir el fichero de bloqueo de alguien.
exec 9>/run/lock/tienda-despliegue.lock
flock -n 9 || exit 0

compose=(docker compose -f compose.produccion.yaml)

# La imagen que sigue el servidor: IMAGEN del entorno, o la de .env (grep, no source: .env es para
# Compose, y un valor con espacios o comillas rompería el script).
imagen="${IMAGEN:-$(grep -E '^IMAGEN=' .env | tail -n 1 | cut -d= -f2- || true)}"
# Compose acepta IMAGEN="…" con comillas (las quita al leer .env); aquí se quitan a mano.
imagen="${imagen#[\"\']}"
imagen="${imagen%[\"\']}"
if [ -z "$imagen" ]; then
  registrar "falta IMAGEN en .env: este script sigue una imagen publicada (ghcr.io/<tu-usuario>/tienda-api:main)" >&2
  exit 1
fi
# La imagen anterior se guarda como <nombre>:anterior, y para eso hay que separar el nombre de la
# etiqueta. localhost:5000/tienda-api:main tiene dos «:»: la etiqueta es lo que va detrás del
# último, y solo cuenta si está después de la última «/».
if [[ "${imagen##*/}" != *:* ]]; then
  registrar "IMAGEN ($imagen) debe llevar una etiqueta, como :main o :sha-1a2b3c4" >&2
  exit 1
fi
nombre="${imagen%:*}"
anterior="$nombre:anterior"

# Lo que corre ahora: el ID de la imagen del contenedor de la API (vacío si no hay contenedor). Se
# compara el ID, no la etiqueta: la etiqueta main siempre se llama igual, y es lo que cambia de
# imagen. El ID es el hash de la imagen: mismo ID, misma imagen.
contenedor="$("${compose[@]}" ps --all --quiet api)"
# Este script cuenta con una sola copia de la API. Con dos (docker compose up --scale api=2) no
# sabría con cuál comparar ni cuál recrear: no toca nada y lo dice.
if [ "$(printf '%s\n' "$contenedor" | grep -c .)" -gt 1 ]; then
  registrar "el despliegue espera una sola copia de la API y hay más: no toco nada (docker compose up -d --scale api=1)" >&2
  exit 1
fi
corriendo=""
if [ -n "$contenedor" ]; then
  corriendo="$(docker inspect --format '{{.Image}}' "$contenedor")"
fi

# La imagen que corre se guarda con un nombre propio (<nombre>:anterior) ANTES de preguntar al
# registro. Si main apuntara a otra imagen y la etiqueta se moviera, la vieja quedaría sin nombre y
# Docker podría borrarla: así volver atrás no depende del registro (puede estar caído) ni de que la
# imagen anterior siga con su etiqueta. Es una etiqueta nueva sobre una imagen que ya está en este
# disco: no descarga ni escribe nada más, y se repite en cada ejecución sin ruido. Solo si el
# contenedor está sano: una imagen que no funciona no es una a la que merezca la pena volver, y se
# conserva el :anterior que ya hubiera.
if [ -n "$corriendo" ] &&
  [ "$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{end}}' "$contenedor")" = healthy ]; then
  docker tag "$corriendo" "$anterior"
fi

# Pregunta al registro: si main apunta a una imagen nueva, la descarga y mueve la etiqueta local
# hacia ella. Con build e image juntas en el servicio, pull descarga la imagen, no la construye.
# Compose escribe «Pulling/Pulled» aunque se le pida --quiet: la salida se guarda y solo se enseña
# si algo falla (el registro caído, sin red): entonces el script termina con error (set -e) y la
# tienda sigue corriendo con lo que tiene, sin tocarla.
if ! salida="$("${compose[@]}" pull --quiet api 2>&1)"; then
  echo "$salida" >&2
  registrar "no se pudo descargar $imagen: la tienda sigue con la imagen que corre" >&2
  exit 1
fi
nueva="$(docker image inspect --format '{{.Id}}' "$imagen")"

# Sin novedades: en silencio.
if [ "$nueva" = "$corriendo" ]; then
  exit 0
fi

# Una imagen que ya falló no se vuelve a intentar cada dos minutos (cada intento son segundos sin
# API): se espera a que main apunte a otra. El fichero guarda el ID de la última que falló.
if [ -f .despliegue-fallido ] && [ "$(cat .despliegue-fallido)" = "$nueva" ]; then
  registrar "la imagen $(corto "$nueva") ya falló: espero a una nueva (para reintentarla: rm $PWD/.despliegue-fallido)" >&2
  exit 1
fi
registrar "imagen nueva: $(corto "${corriendo:-ninguna}") -> $(corto "$nueva") (la que corre queda como $anterior)"

# Si la imagen nueva no sirve, se anota para no repetirla y se termina con error (1).
fallar() {
  echo "$nueva" > .despliegue-fallido
  registrar "$1" >&2
  exit 1
}

# La copia de seguridad, antes de tocar el esquema. Volver atrás cambia el código, no los datos:
# una migración mala solo se deshace con esta copia, a mano. Si la copia falla, el script se para
# aquí (set -e): sin copia no se migra, y como no se ha tocado nada, el próximo intento vuelve a
# empezar.
registrar "copia de seguridad antes de migrar"
despliegue/copia-seguridad.sh

# Las migraciones, con la imagen nueva (migrar usa IMAGEN, que ya apunta a ella). La API que corre
# sigue en pie mientras tanto. Si fallan, la API no se toca.
registrar "migraciones"
if ! "${compose[@]}" run --rm migrar; then
  fallar "las migraciones han fallado: la API sigue con la imagen anterior"
fi

# --no-build: nunca construir. Si faltase la imagen, Compose daría un error, no un docker build.
# --no-deps: las migraciones ya se han aplicado arriba; sin esto, Compose volvería a ejecutar migrar
# dentro de los segundos sin API.
registrar "arrancando la API con la imagen nueva"

# Espera hasta 60 segundos a que Docker dé la API por sana (el HEALTHCHECK del Dockerfile pregunta a
# /salud cada 10 segundos). Devuelve 0 si lo está y 1 si no.
esperar_salud() {
  local c estado
  for _ in $(seq 30); do
    c="$("${compose[@]}" ps --all --quiet api)"
    estado="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}sin-comprobacion{{end}}' "$c" 2>/dev/null || true)"
    if [ "$estado" = healthy ]; then
      return 0
    fi
    sleep 2
  done
  return 1
}

# Compose borra el contenedor viejo antes de arrancar el nuevo: si up falla (la imagen no arranca),
# la API puede estar parada. Por eso un fallo de up lleva al mismo camino que una API que no se pone
# sana: volver a la imagen anterior.
sana=no
if "${compose[@]}" up -d --no-build --no-deps api; then
  registrar "esperando a /salud (hasta 60 s)"
  if esperar_salud; then
    sana=si
  fi
fi
if [ "$sana" = si ]; then
  rm -f .despliegue-fallido
  registrar "hecho: la API corre con $(corto "$nueva")"
  exit 0
fi

# No arrancó o no llegó a estar sana: de vuelta a la imagen anterior (la guardada como :anterior).
# IMAGEN en el entorno manda sobre la de .env solo en este comando, y --no-deps evita volver a
# ejecutar las migraciones con el código viejo.
if ! docker image inspect "$anterior" > /dev/null 2>&1; then
  fallar "la imagen nueva no arrancó o no llegó a estar sana, y no hay imagen anterior a la que volver"
fi
volver="$(docker image inspect --format '{{.Id}}' "$anterior")"
registrar "la imagen nueva no arrancó o no llegó a estar sana: vuelvo a $(corto "$volver")" >&2
if IMAGEN="$anterior" "${compose[@]}" up -d --no-build --no-deps api && esperar_salud; then
  fallar "vuelta hecha: la API corre otra vez con $(corto "$volver"). Las migraciones de la imagen nueva siguen aplicadas"
fi
fallar "la imagen anterior tampoco está sana: mira docker compose logs api"
