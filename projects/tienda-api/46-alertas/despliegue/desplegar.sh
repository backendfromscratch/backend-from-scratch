#!/usr/bin/env bash
# El despliegue (Fase 8, lección 6, y sin cortes desde la Fase 9, lección 4): si la imagen publicada
# (IMAGEN en .env, por ejemplo ghcr.io/<tu-usuario>/tienda-api:main) es otra que la que corre, la
# despliega. Lo lanza cada dos minutos tienda-despliegue.timer; también puedes ejecutarlo a mano. Es
# el servidor quien pregunta, no GitHub quien le manda: el servidor no necesita abrir ninguna puerta
# a internet.
#
# Sin novedades no hace nada y no escribe nada: ni una línea en el diario cada dos minutos. Con una
# imagen nueva: los demás servicios al día, copia de seguridad y migraciones; después, las dos
# copias de la API, de una en una (api-b y luego api-a): mientras se cambia una, la otra atiende, y
# nginx le manda todo a ella. Cada copia nueva tiene que estar sana (/salud) antes de tocar la otra.
# Al final, el trabajador, y fuera las imágenes viejas. Si una copia nueva no llega a estar sana,
# las copias que ya ha cambiado vuelven a la imagen anterior, también de una en una, y termina con
# error (código 1).
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

# #region uno-a-la-vez
# Un solo despliegue a la vez. El descriptor 9 abre (y crea) un fichero de bloqueo, y flock -n
# intenta cogerlo sin esperar: si otro despliegue lo tiene (el temporizador y tú a la vez, o uno
# lento que aún no ha terminado), este termina sin hacer nada y sin error (0). El bloqueo lo suelta
# el sistema cuando el script termina, aunque sea por un fallo. Ejecútalo siempre con el mismo
# usuario: en /run/lock, Linux no deja a otro usuario abrir el fichero de bloqueo de alguien.
exec 9>/run/lock/tienda-despliegue.lock
flock -n 9 || exit 0
# #endregion uno-a-la-vez

compose=(docker compose -f compose.produccion.yaml)

# #region contenedores
# El contenedor de un servicio (api-a, api-b, trabajador…), y solo ese: «ps --all -q api-a» también
# listaría los de un «compose run» (un crear-admin en marcha). oneoff=False deja fuera los de «run».
# El proyecto se llama como el «name:» de compose.produccion.yaml. Vacío si no hay ninguno.
contenedor_de() {
  docker ps --all --quiet \
    --filter label=com.docker.compose.project=tienda \
    --filter "label=com.docker.compose.service=$1" \
    --filter label=com.docker.compose.oneoff=False
}
# La imagen (su ID) con la que corre el contenedor de un servicio; vacío si no hay contenedor.
imagen_de() {
  local c
  c="$(contenedor_de "$1")"
  if [ -n "$c" ]; then
    docker inspect --format '{{.Image}}' "$c"
  fi
}
# #endregion contenedores

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

# #region api-vieja
# La API de una sola copia, la de la Fase 8 y de los pasos 37 a 39: el servicio api. Solo existe si
# este servidor viene del paso 39 o de antes: el primer despliegue de este paso la cambia por api-a
# y api-b (más abajo, en «copias»). Su puerto, el 3000 o el 3001: Compose le daba el primero libre
# del rango 3000-3001, y en cada despliegue la copia nueva arrancaba antes de que la vieja soltara
# el suyo, así que iba cambiando de uno a otro. La copia que va en el puerto libre arranca primero.
api_vieja="$(contenedor_de api)"
primera_copia=api-b
segunda_copia=api-a
# Este script sabe quitar una, y nada más: con varias (docker compose up --scale api=2), o en un
# puerto que no sea ninguno de los dos, no toca nada y lo dice.
if [ "$(printf '%s\n' "$api_vieja" | grep -c .)" -gt 1 ]; then
  registrar "hay $(printf '%s\n' "$api_vieja" | grep -c .) contenedores del servicio api (de --scale): este despliegue solo sabe quitar uno. Deja uno (docker stop y docker rm de los demás) y vuelve a lanzarlo" >&2
  exit 1
fi
if [ -n "$api_vieja" ]; then
  puerto_viejo="$(docker port "$api_vieja" 3000)"
  case "$puerto_viejo" in
    127.0.0.1:3000) ;;
    127.0.0.1:3001)
      primera_copia=api-a
      segunda_copia=api-b
      ;;
    *)
      registrar "la API de una sola copia no está ni en el 3000 ni en el 3001 de 127.0.0.1 ($puerto_viejo), los puertos de api-a y api-b: no toco nada" >&2
      exit 1
      ;;
  esac
fi
# #endregion api-vieja

# Lo que corre ahora: el ID de la imagen de api-a (o, la primera vez, el de la API de una copia;
# vacío si no hay ninguna). Se compara el ID, no la etiqueta: la etiqueta main siempre se llama
# igual, y es lo que cambia de imagen. El ID es el hash de la imagen: mismo ID, misma imagen.
# Los servicios de la imagen son las dos copias y el trabajador (la primera vez, la API de una
# copia y el trabajador). Un despliegue cortado a medias (un reinicio, systemctl stop) puede
# dejarlos con imágenes distintas: las copias con la nueva y el trabajador con la vieja.
if [ -n "$api_vieja" ]; then
  contenedor="$api_vieja"
  servicios=(api trabajador)
else
  contenedor="$(contenedor_de api-a)"
  servicios=(api-a api-b trabajador)
fi
corriendo=""
if [ -n "$contenedor" ]; then
  corriendo="$(docker inspect --format '{{.Image}}' "$contenedor")"
fi
todos_igual=si
for servicio in "${servicios[@]}"; do
  if [ "$(imagen_de "$servicio")" != "$corriendo" ]; then
    todos_igual=no
  fi
done

# #region anterior
# La imagen que corre se guarda con un nombre propio (<nombre>:anterior) ANTES de preguntar al
# registro. Si main apuntara a otra imagen y la etiqueta se moviera, la vieja quedaría sin nombre y
# Docker podría borrarla: así volver atrás no depende del registro (puede estar caído) ni de que la
# imagen anterior siga con su etiqueta. Es una etiqueta nueva sobre una imagen que ya está en este
# disco: no descarga ni escribe nada más, y se repite en cada ejecución sin ruido. Solo si todos los
# servicios de la imagen corren la misma y el contenedor está sano: una imagen que no funciona no
# es una a la que merezca la pena volver, y tras un despliegue cortado a medias la que corre en
# api-a es la nueva, no la anterior. Si no, se conserva el :anterior que ya hubiera.
if [ -n "$corriendo" ] && [ "$todos_igual" = si ] &&
  [ "$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{end}}' "$contenedor")" = healthy ]; then
  docker tag "$corriendo" "$anterior"
fi
# #endregion anterior

# #region preguntar
# Pregunta al registro: si main apunta a una imagen nueva, la descarga y mueve la etiqueta local
# hacia ella. Con build e image juntas en el servicio, pull descarga la imagen, no la construye.
# Compose escribe «Pulling/Pulled» aunque se le pida --quiet: la salida se guarda y solo se enseña
# si algo falla (el registro caído, sin red): entonces el script termina con error (set -e) y la
# tienda sigue corriendo con lo que tiene, sin tocarla.
if ! salida="$("${compose[@]}" pull --quiet api-a 2>&1)"; then
  echo "$salida" >&2
  registrar "no se pudo descargar $imagen: la tienda sigue con la imagen que corre" >&2
  exit 1
fi
nueva="$(docker image inspect --format '{{.Id}}' "$imagen")"

# Sin novedades (las dos copias y el trabajador ya corren la imagen de main): en silencio.
if [ "$(imagen_de api-a)" = "$nueva" ] && [ "$(imagen_de api-b)" = "$nueva" ] &&
  [ "$(imagen_de trabajador)" = "$nueva" ]; then
  exit 0
fi
# #endregion preguntar

# #region fallida
# Una imagen que ya falló no se vuelve a intentar cada dos minutos (cada intento vuelve a parar y
# arrancar las copias): se espera a que main apunte a otra. El fichero guarda el ID de la última que
# falló.
if [ -f .despliegue-fallido ] && [ "$(cat .despliegue-fallido)" = "$nueva" ]; then
  registrar "la imagen $(corto "$nueva") ya falló: espero a una nueva (para reintentarla: rm $PWD/.despliegue-fallido)" >&2
  exit 1
fi
if [ "$corriendo" = "$nueva" ]; then
  registrar "un despliegue de $(corto "$nueva") se quedó a medias: lo termino"
else
  registrar "imagen nueva: $(corto "${corriendo:-ninguna}") -> $(corto "$nueva") (la que corre queda como $anterior)"
fi
# #endregion fallida

# #region docker-proxy
# Un aviso, sin parar nada. Si Docker pasa los puertos publicados por docker-proxy (su «userland
# proxy», encendido si no se cambia), el puerto de una copia que se apaga sigue aceptando
# conexiones y las corta: nginx ya ha mandado la petición, y un POST no lo repite en la otra copia
# (502). Sin docker-proxy, la conexión se rechaza, y nginx repite la petición en la otra, aunque sea
# un POST. Docker no dice cómo está configurado sin sudo, pero cada puerto que pasa por el proxy es
# un proceso docker-proxy a la vista de todos, con su puerto (-host-port 3000) en la línea de órdenes.
if pgrep -f 'docker-proxy.*-host-port 300[01] ' > /dev/null 2>&1; then
  registrar "aviso: los puertos de la API pasan por docker-proxy; para desplegar sin cortes, {\"userland-proxy\": false} en /etc/docker/daemon.json y sudo systemctl restart docker (README)" >&2
fi
# #endregion docker-proxy

# Si la imagen nueva no sirve, se anota para no repetirla y se termina con error (1).
fallar() {
  echo "$nueva" > .despliegue-fallido
  registrar "$1" >&2
  exit 1
}

# #region otros-servicios
# Los servicios que no son de la imagen (db, redis, cache), al día con compose.produccion.yaml: si
# uno ha cambiado (en la Fase 9, Redis guarda la cola en disco), Compose lo recrea; si es nuevo (la
# caché, en la lección 2), lo arranca; si no, no lo toca. Va antes de la copia y de las migraciones,
# que necesitan db en marcha. Recrear redis olvida los intentos de los límites, y recrear la caché
# la deja vacía: ninguna de las dos cosas importa.
registrar "los demás servicios, al día"
"${compose[@]}" up -d --no-build --no-deps db redis cache
# #endregion otros-servicios

# #region migrar
# La copia de seguridad, antes de tocar el esquema. Volver atrás cambia el código, no los datos:
# una migración mala solo se deshace con esta copia, a mano. Si la copia falla, el script se para
# aquí (set -e): sin copia no se migra, y como no se ha tocado nada, el próximo intento vuelve a
# empezar.
registrar "copia de seguridad antes de migrar"
despliegue/copia-seguridad.sh

# Las migraciones, con la imagen nueva (migrar usa IMAGEN, que ya apunta a ella). Las copias que
# corren siguen en pie mientras tanto, ya con el esquema nuevo, y durante el cambio atienden a la
# vez una copia vieja y una nueva: una migración tiene que servir a las dos versiones del código
# (expandir y contraer, Fase 8). Si fallan, la API no se toca.
registrar "migraciones"
if ! "${compose[@]}" run --rm migrar; then
  fallar "las migraciones han fallado: la API sigue con la imagen anterior"
fi
# #endregion migrar

# #region esperar-salud
# Espera a que Docker dé por sana la copia (el HEALTHCHECK del Dockerfile pregunta a /salud cada 10
# segundos): hasta 60 segundos, pero se rinde en cuanto Docker la da por mala (unhealthy: /salud ha
# fallado tres veces seguidas) o el contenedor ya no corre (el proceso ha terminado, por ejemplo por
# un error al arrancar). La salud del trabajador es su latido (compose.produccion.yaml): uno que se
# reinicia en bucle nunca se pone sano. Con un segundo argumento, «corriendo», basta con que el
# contenedor corra y Docker no lo haya dado por malo (al volver, para el trabajador: volver, más
# abajo). 0 si está sana, 1 si no. El estado se lee como «0 running healthy», «0 running starting»,
# «1 exited »…: delante, cuántas veces lo ha reiniciado Docker (RestartCount).
# Desde la Fase 10 (lección 6), sana una vez no basta: hay que verla sana dos veces, con unos 5
# segundos entre una y otra, y con el mismo número de reinicios. Un proceso que arranca, contesta un
# momento y se cae (y Docker lo vuelve a arrancar, con restart: unless-stopped) podía pillarse sano
# justo en una mirada; si entre las dos se ha reiniciado, RestartCount ha subido, y no cuenta.
# Los 60 segundos se cuentan sumando lo que se duerme (2 o 5 cada vez), no las vueltas: con vueltas
# de 5 s, 30 vueltas serían dos minutos y medio.
esperar_salud() {
  local estado reinicios vista='' esperado=0 plantilla='{{.RestartCount}} {{.State.Status}} {{if .State.Health}}{{.State.Health.Status}}{{end}}'
  while [ "$esperado" -lt 60 ]; do
    estado="$(docker inspect --format "$plantilla" "$(contenedor_de "$1")" 2> /dev/null || true)"
    reinicios="${estado%% *}"
    estado="${estado#* }"
    case "$estado" in
      'running healthy') ;;
      *unhealthy | exited* | dead* | restarting*) return 1 ;;
      running*) if [ "${2-}" != corriendo ]; then estado=''; fi ;;
      *) estado='' ;;
    esac
    if [ -z "$estado" ]; then
      # Todavía no: otra mirada dentro de 2 segundos, y la cuenta de las dos vistas, desde cero.
      vista=''
      sleep 2
      esperado=$((esperado + 2))
      continue
    fi
    # Sana. La segunda vez seguida, con los mismos reinicios que la primera: de verdad.
    if [ "$vista" = "$reinicios" ]; then return 0; fi
    vista="$reinicios"
    sleep 5
    esperado=$((esperado + 5))
  done
  return 1
}
# #endregion esperar-salud

# #region cambiar
# Cambia el contenedor de un servicio por uno con esa imagen, y espera a que esté sano (o, con
# «corriendo» como tercer argumento, a que corra). up -d recrea el contenedor: Docker le manda
# SIGTERM al viejo, que deja de aceptar conexiones, termina lo que tiene a medias y sale
# (src/apagado.ts), y arranca el nuevo. Mientras, nginx manda todo a la
# otra copia: una conexión rechazada se repite en la otra, aunque sea un POST, siempre que Docker
# no pase los puertos por docker-proxy (el aviso de arriba).
# IMAGEN en el entorno manda sobre la de .env solo en esta orden. --no-build: nunca construir (si
# faltase la imagen, Compose daría un error, no un docker build). --no-deps: las migraciones ya se
# han aplicado arriba, y nada más se toca: ni la otra copia ni el trabajador.
cambiar() {
  IMAGEN="$2" "${compose[@]}" up -d --no-build --no-deps "$1" && esperar_salud "$1" "${3-}"
}
# #endregion cambiar

# #region pausa
# nginx da una copia por caída durante 10 segundos (fail_timeout, nginx/tienda.conf) desde la última
# vez que le falló. Mientras se cambiaba, la copia nueva falló a nginx; ahora está sana, pero ese
# último fallo puede ser de hace menos de 10 segundos, y nginx aún no le mandaría nada: si la otra
# se parase ya, nginx no tendría a quién mandar las peticiones (502). Así que, antes de tocar la
# otra, 10 segundos más.
pausa_nginx() {
  sleep 10
}
# #endregion pausa

# #region volver
# No arrancó o no llegó a estar sana: las copias que se le digan, de vuelta a la imagen anterior (la
# guardada como :anterior), de una en una y en ese orden (la que ha fallado, primero), y termina con
# error. Las migraciones de la imagen nueva siguen aplicadas: volver atrás cambia el código, no los
# datos. Las copias tienen que volver a estar sanas; el trabajador, solo correr: la imagen anterior
# puede ser de antes de su latido (del paso 39 o anterior), y su trabajador nunca se pondría sano.
volver() {
  if ! docker image inspect "$anterior" > /dev/null 2>&1; then
    fallar "la imagen nueva no llegó a estar sana, y no hay imagen anterior a la que volver"
  fi
  local id primera=si basta
  id="$(docker image inspect --format '{{.Id}}' "$anterior")"
  registrar "la imagen nueva no llegó a estar sana en $1: vuelvo a $(corto "$id") ($*)" >&2
  for servicio in "$@"; do
    basta=sana
    case "$servicio" in
      api-*) if [ "$primera" = no ]; then pausa_nginx; fi && primera=no ;;
      trabajador) basta=corriendo ;;
    esac
    if ! cambiar "$servicio" "$anterior" "$basta"; then
      fallar "la imagen anterior tampoco está sana en $servicio: mira docker compose -f compose.produccion.yaml logs $servicio"
    fi
  done
  fallar "vuelta hecha, con $(corto "$id") otra vez: $*. Las migraciones de la imagen nueva siguen aplicadas"
}
# #endregion volver

# #region copias
# Primero api-b y después api-a (al revés si la API de una sola copia está en el 3001: api-vieja,
# arriba). El primer despliegue de este paso llega a un servidor con esa API vieja en uno de los dos
# puertos; la primera copia usa el otro, que está libre, así que la vieja atiende hasta que la
# primera está sana. Después, la vieja deja su puerto a la segunda: se para (SIGTERM, como cualquier
# copia, y termina lo que tiene a medias) y se borra. Solo esa vez: después ya no hay servicio api.
registrar "$primera_copia, con la imagen nueva (la otra copia sigue atendiendo)"
cambiar "$primera_copia" "$imagen" || volver "$primera_copia"
pausa_nginx
if [ -n "$api_vieja" ]; then
  registrar "la API de una sola copia deja su puerto a $segunda_copia"
  docker stop "$api_vieja" > /dev/null
  docker rm "$api_vieja" > /dev/null
fi
registrar "$segunda_copia, con la imagen nueva ($primera_copia ya atiende con ella)"
cambiar "$segunda_copia" "$imagen" || volver "$segunda_copia" "$primera_copia"
# #endregion copias

# #region trabajador
# El trabajador, cuando las dos copias ya corren la imagen nueva: no está detrás de nginx, y los
# trabajos de los pagos que lleguen mientras se cambia esperan en eventos_salientes (Fase 9,
# lección 7): el nuevo los reparte al arrancar. Al pararlo, Docker le manda SIGTERM, y termina el
# que tiene a medias (scripts/trabajador.ts).
# Si no arranca o no se pone sano (su latido), todo vuelve atrás.
registrar "el trabajador, con la imagen nueva"
cambiar trabajador "$imagen" || volver trabajador "$segunda_copia" "$primera_copia"
rm -f .despliegue-fallido
registrar "hecho: api-a, api-b y el trabajador corren con $(corto "$nueva")"
# #endregion trabajador

# #region podar
# Fuera las imágenes viejas: sin esto, cada despliegue deja una más en el disco, de cientos de MB.
# docker image prune borra las que no tienen ninguna etiqueta y ningún contenedor usa. La nueva
# tiene la suya (main) y la usan los contenedores; la anterior, :anterior, por si hay que volver.
# Las de antes perdieron su última etiqueta cuando main o :anterior pasaron a otra. Sin --all: con
# él, borraría también la anterior, que ningún contenedor usa.
registrar "imágenes viejas: $(docker image prune --force | tail -n 1)"
# #endregion podar
