#!/usr/bin/env bash
#
# Crea un repositorio Git de prácticas para la lección «Git por dentro» (Fase 1) de
# Backend desde cero: https://backenddesdecero.com/fase-1/
#
# Es la tienda de Ana y Luis: un script que calcula el precio de un pedido (precio.sh)
# y otro que lo prueba (comprobar.sh), con 18 commits de historia. En algún commit
# entre la versión v1.0 y el último se coló un fallo. La lección te enseña a
# encontrarlo con git bisect.
#
# Uso, desde tu carpeta de prácticas:
#   bash repo-tienda.sh           crea la carpeta «tienda»
#   bash repo-tienda.sh otra      la crea con otro nombre
#
# Solo escribe dentro de esa carpeta nueva, y no la toca si ya existe. No cambia tu
# configuración de Git: los ajustes que necesita los pasa en cada orden (-c).
#
# Todos los lectores obtienen los mismos commits, con los mismos hashes: los autores,
# las fechas y el formato de los objetos están fijados aquí.

set -euo pipefail

dir=${1:-tienda}

if ! command -v git >/dev/null 2>&1; then
  echo "No encuentro git. Instálalo y vuelve a intentarlo." >&2
  exit 1
fi
if [ -e "$dir" ]; then
  echo "Ya existe «${dir}». Bórrala (rm -rf $dir) o elige otro nombre: bash repo-tienda.sh otro-nombre" >&2
  exit 1
fi

# Que nada de fuera decida dónde está el repositorio.
unset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE GIT_OBJECT_DIRECTORY

# git con los ajustes que hacen falta para que los hashes no dependan de tu configuración:
# sin firmar los commits, sin hooks y sin convertir los saltos de línea.
g() {
  git -c commit.gpgsign=false -c tag.gpgsign=false -c core.hooksPath=/dev/null \
    -c core.autocrlf=false -c core.safecrlf=false "$@"
}

# commit "Autor" "fecha" "mensaje": guarda todo lo que haya cambiado.
commit() {
  case $1 in
    Ana) name='Ana García' email='ana@example.com' ;;
    Luis) name='Luis Pérez' email='luis@example.com' ;;
  esac
  # Los scripts se pueden ejecutar. Git lo apunta también a mano, para que no dependa del
  # sistema de ficheros.
  for script in precio.sh comprobar.sh; do
    if [ -e "$script" ]; then chmod +x "$script"; fi
  done
  g add -A
  for script in precio.sh comprobar.sh; do
    if [ -e "$script" ]; then g update-index --chmod=+x "$script"; fi
  done
  GIT_AUTHOR_NAME=$name GIT_AUTHOR_EMAIL=$email GIT_AUTHOR_DATE="$2 +0200" \
    GIT_COMMITTER_NAME=$name GIT_COMMITTER_EMAIL=$email GIT_COMMITTER_DATE="$2 +0200" \
    g commit -q -m "$3"
}

g init -q --object-format=sha1 -b main "$dir"
cd "$dir"

# 1
cat > README.md <<'EOF'
# Tienda

Las herramientas de la tienda de Ana y Luis.
EOF
commit Ana '2026-09-01T09:12:00' 'Añade el README'

# 2
cat > precio.sh <<'EOF'
#!/usr/bin/env bash
# Calcula el precio final de un pedido: el precio más el 21 % de IVA.
# Uso: ./precio.sh PRECIO   (en euros, sin decimales)

centimos=$(( $1 * 100 ))
iva=$(( centimos * 21 / 100 ))
total=$(( centimos + iva ))
printf 'Total: %d,%02d €\n' $(( total / 100 )) $(( total % 100 ))
EOF
commit Ana '2026-09-01T10:40:00' 'Añade precio.sh: el precio con IVA'

# 3
cat > precio.sh <<'EOF'
#!/usr/bin/env bash
# Calcula el precio final de un pedido: el precio más el 21 % de IVA, y 5 € de
# envío si el pedido no llega a 50 €.
# Uso: ./precio.sh PRECIO   (en euros, sin decimales)

centimos=$(( $1 * 100 ))
envio=0
if [ "$centimos" -lt 5000 ]; then
  envio=500
fi
iva=$(( centimos * 21 / 100 ))
total=$(( centimos + iva + envio ))
printf 'Total: %d,%02d €\n' $(( total / 100 )) $(( total % 100 ))
EOF
commit Luis '2026-09-02T11:05:00' 'Cobra 5 € de envío en los pedidos de menos de 50 €'

# 4
cat > precio.sh <<'EOF'
#!/usr/bin/env bash
# Calcula el precio final de un pedido: el precio, menos el descuento si hay código,
# más el 21 % de IVA, y 5 € de envío si el pedido no llega a 50 €.
# Uso: ./precio.sh PRECIO [CÓDIGO]   (el precio en euros, sin decimales)

centimos=$(( $1 * 100 ))
if [ "${2:-}" = "PROMO10" ]; then
  centimos=$(( centimos - centimos / 10 ))
fi
envio=0
if [ "$centimos" -lt 5000 ]; then
  envio=500
fi
iva=$(( centimos * 21 / 100 ))
total=$(( centimos + iva + envio ))
printf 'Total: %d,%02d €\n' $(( total / 100 )) $(( total % 100 ))
EOF
commit Ana '2026-09-03T16:20:00' 'Añade el código de descuento PROMO10'

# 5
cat > comprobar.sh <<'EOF'
#!/usr/bin/env bash
# Prueba precio.sh con pedidos cuyo total ya sabemos.
# Termina con 0 si todos salen bien y con 1 si alguno falla.

fallos=0

# caso TOTAL_ESPERADO ARGUMENTOS...
caso() {
  esperado="Total: $1 €"
  shift
  obtenido=$(./precio.sh "$@" | grep '^Total:')
  if [ "$obtenido" = "$esperado" ]; then
    echo "bien  ./precio.sh $*"
  else
    echo "MAL   ./precio.sh $*: esperaba «${esperado}» y salió «${obtenido}»"
    fallos=1
  fi
}

caso '17,10' 10
caso '60,50' 50
caso '121,00' 100
caso '108,90' 100 PROMO10

exit $fallos
EOF
commit Luis '2026-09-04T09:30:00' 'Añade comprobar.sh con los casos de prueba'

# 6
cat > README.md <<'EOF'
# Tienda

Las herramientas de la tienda de Ana y Luis.

## Precio de un pedido

    ./precio.sh 40
    ./precio.sh 100 PROMO10

Suma el 21 % de IVA. El envío cuesta 5 € y es gratis a partir de 50 €.

## Pruebas

    ./comprobar.sh
EOF
commit Ana '2026-09-04T12:15:00' 'Explica en el README cómo se usa'

# 7
cat > precio.sh <<'EOF'
#!/usr/bin/env bash
# Calcula el precio final de un pedido: el precio, menos el descuento si hay código,
# más el 21 % de IVA, y 5 € de envío si el pedido no llega a 50 €.
# Uso: ./precio.sh PRECIO [CÓDIGO]   (el precio en euros, sin decimales)

if [ $# -lt 1 ]; then
  echo "Uso: ./precio.sh PRECIO [CÓDIGO]" >&2
  exit 1
fi

centimos=$(( $1 * 100 ))
if [ "${2:-}" = "PROMO10" ]; then
  centimos=$(( centimos - centimos / 10 ))
fi
envio=0
if [ "$centimos" -lt 5000 ]; then
  envio=500
fi
iva=$(( centimos * 21 / 100 ))
total=$(( centimos + iva + envio ))
printf 'Total: %d,%02d €\n' $(( total / 100 )) $(( total % 100 ))
EOF
commit Luis '2026-09-07T10:02:00' 'Explica cómo se usa si falta el precio'

# 8: v1.0
cat > NOVEDADES.md <<'EOF'
# Novedades

## v1.0

- El precio con IVA, el envío y el código PROMO10.
EOF
commit Ana '2026-09-07T17:45:00' 'Prepara la versión 1.0'
g tag v1.0

# 9
cat > precio.sh <<'EOF'
#!/usr/bin/env bash
# Calcula el precio final de un pedido: el precio, menos el descuento si hay código,
# más el 21 % de IVA, y 5 € de envío si el pedido no llega a 50 €.
# Uso: ./precio.sh PRECIO [CÓDIGO]   (el precio en euros, sin decimales)

if [ $# -lt 1 ]; then
  echo "Uso: ./precio.sh PRECIO [CÓDIGO]" >&2
  exit 1
fi
case $1 in
  '' | *[!0-9]*)
    echo "El precio tiene que ser un número entero de euros, como 40." >&2
    exit 1
    ;;
esac

centimos=$(( $1 * 100 ))
if [ "${2:-}" = "PROMO10" ]; then
  centimos=$(( centimos - centimos / 10 ))
fi
envio=0
if [ "$centimos" -lt 5000 ]; then
  envio=500
fi
iva=$(( centimos * 21 / 100 ))
total=$(( centimos + iva + envio ))
printf 'Total: %d,%02d €\n' $(( total / 100 )) $(( total % 100 ))
EOF
commit Luis '2026-09-09T09:50:00' 'Rechaza los precios que no son números'

# 10
cat > .gitignore <<'EOF'
# Copias de los editores
*~
*.swp
EOF
commit Ana '2026-09-10T13:00:00' 'Ignora las copias de los editores'

# 11
cat > precio.sh <<'EOF'
#!/usr/bin/env bash
# Calcula el precio final de un pedido: el precio, menos el descuento si hay código,
# más el 21 % de IVA, y 5 € de envío si el pedido no llega a 50 €.
# Uso: ./precio.sh PRECIO [CÓDIGO]   (el precio en euros, sin decimales)

if [ $# -lt 1 ]; then
  echo "Uso: ./precio.sh PRECIO [CÓDIGO]" >&2
  exit 1
fi
case $1 in
  '' | *[!0-9]*)
    echo "El precio tiene que ser un número entero de euros, como 40." >&2
    exit 1
    ;;
esac

euros() {
  printf '%d,%02d €' $(( $1 / 100 )) $(( $1 % 100 ))
}

centimos=$(( $1 * 100 ))
if [ "${2:-}" = "PROMO10" ]; then
  centimos=$(( centimos - centimos / 10 ))
fi
envio=0
if [ "$centimos" -lt 5000 ]; then
  envio=500
fi
iva=$(( centimos * 21 / 100 ))
total=$(( centimos + iva + envio ))

echo "Pedido: $(euros "$centimos")"
echo "IVA:    $(euros "$iva")"
echo "Envío:  $(euros "$envio")"
echo "Total: $(euros "$total")"
EOF
commit Luis '2026-09-11T10:30:00' 'Muestra el desglose: pedido, IVA y envío'

# 12
cat > README.md <<'EOF'
# Tienda

Las herramientas de la tienda de Ana y Luis.

## Precio de un pedido

    ./precio.sh 40
    ./precio.sh 100 PROMO10

Suma el 21 % de IVA. El envío cuesta 5 € y es gratis a partir de 50 €.
Muestra el desglose y, en la última línea, el total.

## Pruebas

    ./comprobar.sh
EOF
commit Ana '2026-09-11T12:10:00' 'Cuenta en el README que hay desglose'

# 13
cat > precio.sh <<'EOF'
#!/usr/bin/env bash
# Calcula el precio final de un pedido.
# Uso: ./precio.sh PRECIO [CÓDIGO]   (el precio en euros, sin decimales)

# Reglas de la tienda
IVA=21          # por ciento
ENVIO=500       # céntimos
DESCUENTO=10    # por ciento, con el código PROMO10

if [ $# -lt 1 ]; then
  echo "Uso: ./precio.sh PRECIO [CÓDIGO]" >&2
  exit 1
fi
case $1 in
  '' | *[!0-9]*)
    echo "El precio tiene que ser un número entero de euros, como 40." >&2
    exit 1
    ;;
esac

# Escribe una cantidad en céntimos como euros: 1050 → «10,50 €».
euros() {
  printf '%d,%02d €' $(( $1 / 100 )) $(( $1 % 100 ))
}

# Todo se calcula en céntimos, para no perder decimales.
centimos=$(( $1 * 100 ))

# El descuento, si hay código.
if [ "${2:-}" = "PROMO10" ]; then
  centimos=$(( centimos - centimos * DESCUENTO / 100 ))
fi

# El envío es gratis a partir de 50 €.
envio=$ENVIO
if [ "$centimos" -gt 5000 ]; then
  envio=0
fi

iva=$(( centimos * IVA / 100 ))
total=$(( centimos + iva + envio ))

echo "Pedido: $(euros "$centimos")"
echo "IVA:    $(euros "$iva")"
echo "Envío:  $(euros "$envio")"
echo "Total: $(euros "$total")"
EOF
commit Luis '2026-09-14T18:25:00' 'Ordena el código y añade comentarios'

# 14
cat > NOVEDADES.md <<'EOF'
# Novedades

## Sin publicar

- precio.sh rechaza los precios que no son números.
- precio.sh muestra el desglose del pedido.

## v1.0

- El precio con IVA, el envío y el código PROMO10.
EOF
commit Ana '2026-09-15T09:40:00' 'Apunta las novedades desde la 1.0'

# 15
cat > precio.sh <<'EOF'
#!/usr/bin/env bash
# Calcula el precio final de un pedido.
# Uso: ./precio.sh PRECIO [CÓDIGO]   (el precio en euros, sin decimales)

# Reglas de la tienda
IVA=21          # por ciento
ENVIO=500       # céntimos
DESCUENTO=10    # por ciento, con el código PROMO10

ayuda() {
  echo "Uso: ./precio.sh PRECIO [CÓDIGO]"
  echo
  echo "Calcula el total de un pedido: el precio, menos el descuento si hay código,"
  echo "más el $IVA % de IVA y el envío. PRECIO va en euros, sin decimales."
}

if [ $# -lt 1 ]; then
  ayuda >&2
  exit 1
fi
if [ "$1" = "--ayuda" ]; then
  ayuda
  exit 0
fi
case $1 in
  '' | *[!0-9]*)
    echo "El precio tiene que ser un número entero de euros, como 40." >&2
    exit 1
    ;;
esac

# Escribe una cantidad en céntimos como euros: 1050 → «10,50 €».
euros() {
  printf '%d,%02d €' $(( $1 / 100 )) $(( $1 % 100 ))
}

# Todo se calcula en céntimos, para no perder decimales.
centimos=$(( $1 * 100 ))

# El descuento, si hay código.
if [ "${2:-}" = "PROMO10" ]; then
  centimos=$(( centimos - centimos * DESCUENTO / 100 ))
fi

# El envío es gratis a partir de 50 €.
envio=$ENVIO
if [ "$centimos" -gt 5000 ]; then
  envio=0
fi

iva=$(( centimos * IVA / 100 ))
total=$(( centimos + iva + envio ))

echo "Pedido: $(euros "$centimos")"
echo "IVA:    $(euros "$iva")"
echo "Envío:  $(euros "$envio")"
echo "Total: $(euros "$total")"
EOF
commit Luis '2026-09-16T11:20:00' 'Añade la opción --ayuda'

# 16
cat > README.md <<'EOF'
# Tienda

Las herramientas de la tienda de Ana y Luis.

## Precio de un pedido

    ./precio.sh 40
    ./precio.sh 100 PROMO10
    ./precio.sh --ayuda

Suma el 21 % de IVA. El envío cuesta 5 € y es gratis a partir de 50 €.
Muestra el desglose y, en la última línea, el total.

## Pruebas

    ./comprobar.sh
EOF
commit Ana '2026-09-17T10:05:00' 'Añade --ayuda al README'

# 17
cat > .gitignore <<'EOF'
# Copias de los editores
*~
*.swp

# Ficheros de macOS
.DS_Store
EOF
commit Luis '2026-09-18T15:35:00' 'Ignora también los .DS_Store de macOS'

# 18
cat > NOVEDADES.md <<'EOF'
# Novedades

## Sin publicar

- precio.sh rechaza los precios que no son números.
- precio.sh muestra el desglose del pedido.
- precio.sh --ayuda explica cómo se usa.

## v1.0

- El precio con IVA, el envío y el código PROMO10.
EOF
commit Ana '2026-09-21T09:15:00' 'Apunta la opción --ayuda en las novedades'

echo "Listo: la carpeta «${dir}» tiene un repositorio con $(g rev-list --count HEAD) commits."
echo "Entra con: cd $dir"
