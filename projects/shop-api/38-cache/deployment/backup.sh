#!/usr/bin/env bash
# The database backup (Phase 8, lesson 3): a compressed pg_dump in backups/, with the date in the
# name, and backups 7 days old or more are deleted. It runs by hand or every night with the
# shop-backup.timer timer. From any folder: it works in the project's.
#   BACKUP_DAYS=14 deployment/backup.sh    keeps 14 days instead of 7
set -euo pipefail

# #region backup
# Only your user can read what's created here (permissions 600 on the files, 700 on the folder): a
# backup is the whole database, with the emails, the password hashes and the sessions.
umask 077

# The project's folder: this script's, one level up.
cd "$(dirname "$0")/.."

days="${BACKUP_DAYS:-7}"
mkdir -p backups
# A folder created by another user (a sudo, say) can't be closed by this one: say how to fix it
# instead of failing on chmod with a bare error.
if [ ! -O backups ]; then
  echo "backups/ belongs to another user (did a sudo create it?): sudo chown -R \"\$(id -un)\": backups" >&2
  exit 1
fi
# If the folder already existed with other permissions, it's closed too.
chmod 700 backups
final="backups/shop-$(date +%Y-%m-%d-%H%M%S).sql.gz"

# The dump is written to a .tmp file, and only gets its real name if everything went well. If
# something fails (the database stopped, the disk full), the trap deletes the .tmp: there's never a
# half backup that looks good, and because of set -e the script stops before deleting the old ones.
trap 'rm -f "$final.tmp"' EXIT

# pg_dump, inside the db container (-T: no terminal, so it can be chained), is compressed with gzip
# outside. With pipefail, if pg_dump fails, the whole line fails, even if gzip ends well.
docker compose -f compose.production.yaml exec -T db pg_dump -U shop shop | gzip > "$final.tmp"
mv "$final.tmp" "$final"
echo "Backup made: $final ($(du -h "$final" | cut -f1))"
# #endregion backup

# #region prune
# Only now, with a good new backup, are the ones that are $days days old or more deleted. find counts
# whole days and rounds down: "-mtime +6" is "7 days or more" (+7 would let 8 days through).
find backups -name 'shop-*.sql.gz' -mtime +"$((days - 1))" -print -delete
# And the .tmp files that were left behind (a kill -9 doesn't let the trap act), from over an hour ago.
find backups -name 'shop-*.sql.gz.tmp' -mmin +60 -print -delete
# #endregion prune
