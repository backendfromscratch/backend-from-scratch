#!/usr/bin/env bash
# La copia de seguridad de la base de datos (Fase 8, lección 4): un pg_dump comprimido en copias/,
# con la fecha en el nombre, y fuera las de más de 7 días. Se ejecuta a mano o cada noche con el
# temporizador tienda-copia.timer. Desde cualquier carpeta: trabaja en la del proyecto.
#   COPIAS_DIAS=14 despliegue/copia-seguridad.sh    guarda 14 días en lugar de 7
set -euo pipefail

# La carpeta del proyecto: la de este script, un nivel más arriba.
cd "$(dirname "$0")/.."

dias="${COPIAS_DIAS:-7}"
mkdir -p copias
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

# Solo ahora, con una copia nueva buena, se borran las de más de $dias días.
find copias -name 'tienda-*.sql.gz' -mtime +"$dias" -print -delete
