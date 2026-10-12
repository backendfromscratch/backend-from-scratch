#!/usr/bin/env bash
#
# Creates a practice Git repository for the "Git in depth" lesson (Phase 1) of
# Backend from Scratch: https://backenddesdecero.com/en/phase-1/
#
# It is Ana and Luis's shop: a script that works out an order's price (price.sh)
# and another that tests it (check.sh), with 18 commits of history. In some commit
# between version v1.0 and the last one, a bug slipped in. The lesson teaches you to
# find it with git bisect.
#
# Usage, from your practice folder:
#   bash repo-shop.sh             creates the "shop" folder
#   bash repo-shop.sh other       creates it with another name
#
# It only writes inside that new folder, and leaves it alone if it already exists. It
# doesn't change your Git configuration: the settings it needs are passed to each
# command (-c).
#
# Every reader gets the same commits, with the same hashes: the authors, the dates
# and the object format are fixed here.

set -euo pipefail

dir=${1:-shop}

if ! command -v git >/dev/null 2>&1; then
  echo "git not found. Install it and try again." >&2
  exit 1
fi
if [ -e "$dir" ]; then
  echo "\"${dir}\" already exists. Delete it (rm -rf $dir) or choose another name: bash repo-shop.sh another-name" >&2
  exit 1
fi

# Nothing from outside decides where the repository is.
unset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE GIT_OBJECT_DIRECTORY

# git with the settings that keep the hashes independent of your configuration:
# no commit signing, no hooks and no line-ending conversion.
g() {
  git -c commit.gpgsign=false -c tag.gpgsign=false -c core.hooksPath=/dev/null \
    -c core.autocrlf=false -c core.safecrlf=false "$@"
}

# commit "Author" "date" "message": saves everything that changed.
commit() {
  case $1 in
    Ana) name='Ana García' email='ana@example.com' ;;
    Luis) name='Luis Pérez' email='luis@example.com' ;;
  esac
  # The scripts can be run. Git is also told so by hand, so it doesn't depend on the
  # file system.
  for script in price.sh check.sh; do
    if [ -e "$script" ]; then chmod +x "$script"; fi
  done
  g add -A
  for script in price.sh check.sh; do
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
# Shop

The tools of Ana and Luis's shop.
EOF
commit Ana '2026-09-01T09:12:00' 'Add the README'

# 2
cat > price.sh <<'EOF'
#!/usr/bin/env bash
# Works out an order's final price: the price plus 21% VAT.
# Usage: ./price.sh PRICE   (in euros, no decimals)

cents=$(( $1 * 100 ))
vat=$(( cents * 21 / 100 ))
total=$(( cents + vat ))
printf 'Total: €%d.%02d\n' $(( total / 100 )) $(( total % 100 ))
EOF
commit Ana '2026-09-01T10:40:00' 'Add price.sh: the price with VAT'

# 3
cat > price.sh <<'EOF'
#!/usr/bin/env bash
# Works out an order's final price: the price plus 21% VAT, and €5 shipping
# if the order is under €50.
# Usage: ./price.sh PRICE   (in euros, no decimals)

cents=$(( $1 * 100 ))
shipping=0
if [ "$cents" -lt 5000 ]; then
  shipping=500
fi
vat=$(( cents * 21 / 100 ))
total=$(( cents + vat + shipping ))
printf 'Total: €%d.%02d\n' $(( total / 100 )) $(( total % 100 ))
EOF
commit Luis '2026-09-02T11:05:00' 'Charge €5 shipping on orders under €50'

# 4
cat > price.sh <<'EOF'
#!/usr/bin/env bash
# Works out an order's final price: the price, minus the discount if there is a code,
# plus 21% VAT, and €5 shipping if the order is under €50.
# Usage: ./price.sh PRICE [CODE]   (the price in euros, no decimals)

cents=$(( $1 * 100 ))
if [ "${2:-}" = "PROMO10" ]; then
  cents=$(( cents - cents / 10 ))
fi
shipping=0
if [ "$cents" -lt 5000 ]; then
  shipping=500
fi
vat=$(( cents * 21 / 100 ))
total=$(( cents + vat + shipping ))
printf 'Total: €%d.%02d\n' $(( total / 100 )) $(( total % 100 ))
EOF
commit Ana '2026-09-03T16:20:00' 'Add the PROMO10 discount code'

# 5
cat > check.sh <<'EOF'
#!/usr/bin/env bash
# Tests price.sh with orders whose total we already know.
# Exits with 0 if they all pass and with 1 if any of them fails.

failed=0

# order EXPECTED_TOTAL ARGUMENTS...
order() {
  expected="Total: €$1"
  shift
  got=$(./price.sh "$@" | grep '^Total:')
  if [ "$got" = "$expected" ]; then
    echo "ok    ./price.sh $*"
  else
    echo "FAIL  ./price.sh $*: expected \"${expected}\" and got \"${got}\""
    failed=1
  fi
}

order '17.10' 10
order '60.50' 50
order '121.00' 100
order '108.90' 100 PROMO10

exit $failed
EOF
commit Luis '2026-09-04T09:30:00' 'Add check.sh with the test cases'

# 6
cat > README.md <<'EOF'
# Shop

The tools of Ana and Luis's shop.

## An order's price

    ./price.sh 40
    ./price.sh 100 PROMO10

Adds 21% VAT. Shipping costs €5 and is free from €50.

## Tests

    ./check.sh
EOF
commit Ana '2026-09-04T12:15:00' 'Explain in the README how to use it'

# 7
cat > price.sh <<'EOF'
#!/usr/bin/env bash
# Works out an order's final price: the price, minus the discount if there is a code,
# plus 21% VAT, and €5 shipping if the order is under €50.
# Usage: ./price.sh PRICE [CODE]   (the price in euros, no decimals)

if [ $# -lt 1 ]; then
  echo "Usage: ./price.sh PRICE [CODE]" >&2
  exit 1
fi

cents=$(( $1 * 100 ))
if [ "${2:-}" = "PROMO10" ]; then
  cents=$(( cents - cents / 10 ))
fi
shipping=0
if [ "$cents" -lt 5000 ]; then
  shipping=500
fi
vat=$(( cents * 21 / 100 ))
total=$(( cents + vat + shipping ))
printf 'Total: €%d.%02d\n' $(( total / 100 )) $(( total % 100 ))
EOF
commit Luis '2026-09-07T10:02:00' 'Explain the usage when the price is missing'

# 8: v1.0
cat > CHANGELOG.md <<'EOF'
# Changelog

## v1.0

- The price with VAT, shipping and the PROMO10 code.
EOF
commit Ana '2026-09-07T17:45:00' 'Prepare version 1.0'
g tag v1.0

# 9
cat > price.sh <<'EOF'
#!/usr/bin/env bash
# Works out an order's final price: the price, minus the discount if there is a code,
# plus 21% VAT, and €5 shipping if the order is under €50.
# Usage: ./price.sh PRICE [CODE]   (the price in euros, no decimals)

if [ $# -lt 1 ]; then
  echo "Usage: ./price.sh PRICE [CODE]" >&2
  exit 1
fi
case $1 in
  '' | *[!0-9]*)
    echo "The price must be a whole number of euros, like 40." >&2
    exit 1
    ;;
esac

cents=$(( $1 * 100 ))
if [ "${2:-}" = "PROMO10" ]; then
  cents=$(( cents - cents / 10 ))
fi
shipping=0
if [ "$cents" -lt 5000 ]; then
  shipping=500
fi
vat=$(( cents * 21 / 100 ))
total=$(( cents + vat + shipping ))
printf 'Total: €%d.%02d\n' $(( total / 100 )) $(( total % 100 ))
EOF
commit Luis '2026-09-09T09:50:00' 'Reject prices that are not numbers'

# 10
cat > .gitignore <<'EOF'
# Editor backup files
*~
*.swp
EOF
commit Ana '2026-09-10T13:00:00' 'Ignore editor backup files'

# 11
cat > price.sh <<'EOF'
#!/usr/bin/env bash
# Works out an order's final price: the price, minus the discount if there is a code,
# plus 21% VAT, and €5 shipping if the order is under €50.
# Usage: ./price.sh PRICE [CODE]   (the price in euros, no decimals)

if [ $# -lt 1 ]; then
  echo "Usage: ./price.sh PRICE [CODE]" >&2
  exit 1
fi
case $1 in
  '' | *[!0-9]*)
    echo "The price must be a whole number of euros, like 40." >&2
    exit 1
    ;;
esac

euros() {
  printf '€%d.%02d' $(( $1 / 100 )) $(( $1 % 100 ))
}

cents=$(( $1 * 100 ))
if [ "${2:-}" = "PROMO10" ]; then
  cents=$(( cents - cents / 10 ))
fi
shipping=0
if [ "$cents" -lt 5000 ]; then
  shipping=500
fi
vat=$(( cents * 21 / 100 ))
total=$(( cents + vat + shipping ))

echo "Order:    $(euros "$cents")"
echo "VAT:      $(euros "$vat")"
echo "Shipping: $(euros "$shipping")"
echo "Total: $(euros "$total")"
EOF
commit Luis '2026-09-11T10:30:00' 'Show the breakdown: order, VAT and shipping'

# 12
cat > README.md <<'EOF'
# Shop

The tools of Ana and Luis's shop.

## An order's price

    ./price.sh 40
    ./price.sh 100 PROMO10

Adds 21% VAT. Shipping costs €5 and is free from €50.
Shows the breakdown and, on the last line, the total.

## Tests

    ./check.sh
EOF
commit Ana '2026-09-11T12:10:00' 'Mention the breakdown in the README'

# 13
cat > price.sh <<'EOF'
#!/usr/bin/env bash
# Works out an order's final price.
# Usage: ./price.sh PRICE [CODE]   (the price in euros, no decimals)

# The shop's rules
VAT=21          # percent
SHIPPING=500    # cents
DISCOUNT=10     # percent, with the PROMO10 code

if [ $# -lt 1 ]; then
  echo "Usage: ./price.sh PRICE [CODE]" >&2
  exit 1
fi
case $1 in
  '' | *[!0-9]*)
    echo "The price must be a whole number of euros, like 40." >&2
    exit 1
    ;;
esac

# Writes an amount in cents as euros: 1050 → "€10.50".
euros() {
  printf '€%d.%02d' $(( $1 / 100 )) $(( $1 % 100 ))
}

# Everything is worked out in cents, so no decimals are lost.
cents=$(( $1 * 100 ))

# The discount, if there is a code.
if [ "${2:-}" = "PROMO10" ]; then
  cents=$(( cents - cents * DISCOUNT / 100 ))
fi

# Shipping is free from €50.
shipping=$SHIPPING
if [ "$cents" -gt 5000 ]; then
  shipping=0
fi

vat=$(( cents * VAT / 100 ))
total=$(( cents + vat + shipping ))

echo "Order:    $(euros "$cents")"
echo "VAT:      $(euros "$vat")"
echo "Shipping: $(euros "$shipping")"
echo "Total: $(euros "$total")"
EOF
commit Luis '2026-09-14T18:25:00' 'Tidy up the code and add comments'

# 14
cat > CHANGELOG.md <<'EOF'
# Changelog

## Unreleased

- price.sh rejects prices that are not numbers.
- price.sh shows the order's breakdown.

## v1.0

- The price with VAT, shipping and the PROMO10 code.
EOF
commit Ana '2026-09-15T09:40:00' 'Note the changes since 1.0'

# 15
cat > price.sh <<'EOF'
#!/usr/bin/env bash
# Works out an order's final price.
# Usage: ./price.sh PRICE [CODE]   (the price in euros, no decimals)

# The shop's rules
VAT=21          # percent
SHIPPING=500    # cents
DISCOUNT=10     # percent, with the PROMO10 code

usage() {
  echo "Usage: ./price.sh PRICE [CODE]"
  echo
  echo "Works out an order's total: the price, minus the discount if there is a code,"
  echo "plus ${VAT}% VAT and shipping. PRICE is in euros, no decimals."
}

if [ $# -lt 1 ]; then
  usage >&2
  exit 1
fi
if [ "$1" = "--help" ]; then
  usage
  exit 0
fi
case $1 in
  '' | *[!0-9]*)
    echo "The price must be a whole number of euros, like 40." >&2
    exit 1
    ;;
esac

# Writes an amount in cents as euros: 1050 → "€10.50".
euros() {
  printf '€%d.%02d' $(( $1 / 100 )) $(( $1 % 100 ))
}

# Everything is worked out in cents, so no decimals are lost.
cents=$(( $1 * 100 ))

# The discount, if there is a code.
if [ "${2:-}" = "PROMO10" ]; then
  cents=$(( cents - cents * DISCOUNT / 100 ))
fi

# Shipping is free from €50.
shipping=$SHIPPING
if [ "$cents" -gt 5000 ]; then
  shipping=0
fi

vat=$(( cents * VAT / 100 ))
total=$(( cents + vat + shipping ))

echo "Order:    $(euros "$cents")"
echo "VAT:      $(euros "$vat")"
echo "Shipping: $(euros "$shipping")"
echo "Total: $(euros "$total")"
EOF
commit Luis '2026-09-16T11:20:00' 'Add the --help option'

# 16
cat > README.md <<'EOF'
# Shop

The tools of Ana and Luis's shop.

## An order's price

    ./price.sh 40
    ./price.sh 100 PROMO10
    ./price.sh --help

Adds 21% VAT. Shipping costs €5 and is free from €50.
Shows the breakdown and, on the last line, the total.

## Tests

    ./check.sh
EOF
commit Ana '2026-09-17T10:05:00' 'Add --help to the README'

# 17
cat > .gitignore <<'EOF'
# Editor backup files
*~
*.swp

# macOS files
.DS_Store
EOF
commit Luis '2026-09-18T15:35:00' 'Also ignore the macOS .DS_Store files'

# 18
cat > CHANGELOG.md <<'EOF'
# Changelog

## Unreleased

- price.sh rejects prices that are not numbers.
- price.sh shows the order's breakdown.
- price.sh --help explains how to use it.

## v1.0

- The price with VAT, shipping and the PROMO10 code.
EOF
commit Ana '2026-09-21T09:15:00' 'Note the --help option in the changelog'

echo "Done: the \"${dir}\" folder has a repository with $(g rev-list --count HEAD) commits."
echo "Go into it with: cd $dir"
