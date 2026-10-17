#!/usr/bin/env bash
# La copia de seguridad de la base de datos (Fase 8, lección 3): un pg_dump comprimido en copias/,
# con la fecha en el nombre, y fuera las de 7 días o más. Se ejecuta a mano o cada noche con el
# temporizador tienda-copia.timer. Desde cualquier carpeta: trabaja en la del proyecto.
#   COPIAS_DIAS=14 despliegue/copia-seguridad.sh    guarda 14 días en lugar de 7
set -euo pipefail

# #region copia
# Solo tu usuario puede leer lo que se crea aquí (permisos 600 en los ficheros, 700 en la carpeta):
# una copia es la base de datos entera, con los emails, los hash de las contraseñas y las sesiones.
umask 077

# La carpeta del proyecto: la de este script, un nivel más arriba.
cd "$(dirname "$0")/.."

dias="${COPIAS_DIAS:-7}"
mkdir -p copias
# Si la carpeta ya existía con otros permisos, también se cierra.
chmod 700 copias
final="copias/tienda-$(date +%Y-%m-%d-%H%M%S).sql.gz"

# El volcado se escribe en un fichero .tmp, y solo recibe su nombre de verdad si todo ha ido bien.
# Si algo falla (la base de datos parada, el disco lleno), el trap borra el .tmp: no queda nunca una
# copia a medias que parezca buena, y por el set -e el script se para antes de borrar las viejas.
trap 'rm -f "$final.tmp"' EXIT

# pg_dump, dentro del contenedor db (-T: sin terminal, para poder encadenarlo), se comprime con gzip
# fuera. Con pipefail, si pg_dump falla, falla toda la línea, aunque gzip termine bien.
docker compose -f compose.produccion.yaml exec -T db pg_dump -U tienda tienda | gzip > "$final.tmp"
mv "$final.tmp" "$final"
echo "Copia hecha: $final ($(du -h "$final" | cut -f1))"
# #endregion copia

# #region poda
# Solo ahora, con una copia nueva buena, se borran las que tienen $dias días o más. find cuenta días
# enteros y redondea hacia abajo: «-mtime +6» es «de 7 días o más» (+7 dejaría pasar 8 días).
find copias -name 'tienda-*.sql.gz' -mtime +"$((dias - 1))" -print -delete
# Y los .tmp que se quedaron sin borrar (un kill -9 no deja actuar al trap), de hace más de una hora.
find copias -name 'tienda-*.sql.gz.tmp' -mmin +60 -print -delete
# #endregion poda
