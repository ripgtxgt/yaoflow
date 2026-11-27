#!/bin/bash
# Nightly consistent snapshot of the YaoFlow data. Installed as /home/ubuntu/bin/yaoflow-backup.sh, run by cron at
# 18:00 UTC (03:00 Taipei). This file is the source; copy it over after editing (deploy/README-ops.md).
# VACUUM INTO yields a clean single-file copy even mid-write (WAL mode).
#
# 09-22: every run also pushes the archive off the box (S3_BACKUP_BUCKET in /home/ubuntu/.yaoflow-backup.env). The
# upload is best-effort; backup.log says OFFSITE_OK / OFFSITE_FAIL / OFFSITE_NONE and the dashboard reads that line.
# 10-15 进度表 60: the event log has its own database (events.db) — snapshotted next to yaoflow.db. The old day files
# (events/) ride along until they stop being written (11-15). The monthly archive files (archive/, lib/archive.ts) are
# synced to S3 under archive/ — they only ever grow, so they are not packed into every nightly tarball.
set -e
TS=$(date +%F)
D=/home/ubuntu/yaoflow-data
B=/home/ubuntu/backups
AWS=/usr/local/bin/aws
[ -f /home/ubuntu/.yaoflow-backup.env ] && . /home/ubuntu/.yaoflow-backup.env

snap() { # $1 source db, $2 target file
  rm -f "$2"
  /usr/bin/node -e 'const{DatabaseSync}=require("node:sqlite");const d=new DatabaseSync(process.argv[1]);d.exec(`VACUUM INTO '"'"'${process.argv[2]}'"'"'`);d.close()' "$1" "$2"
}
snap "$D/yaoflow.db" "$B/db-snapshot.db"
PARTS="db-snapshot.db"
if [ -f "$D/events.db" ]; then snap "$D/events.db" "$B/events-snapshot.db"; PARTS="$PARTS events-snapshot.db"; fi
if [ -d "$D/events" ] && [ -n "$(ls -A "$D/events" 2>/dev/null)" ]; then
  tar czf "$B/yaoflow-$TS.tar.gz" -C "$B" $PARTS -C "$D" events
else
  tar czf "$B/yaoflow-$TS.tar.gz" -C "$B" $PARTS
fi
rm -f "$B/db-snapshot.db" "$B/events-snapshot.db"
# keep the newest 14 nightly archives locally
ls -1t "$B"/yaoflow-*.tar.gz | tail -n +15 | xargs -r rm -f

# ---- off the box ----
if [ -n "${S3_BACKUP_BUCKET:-}" ] && [ -x "$AWS" ]; then
  if $AWS s3 cp "$B/yaoflow-$TS.tar.gz" "s3://$S3_BACKUP_BUCKET/yaoflow-$TS.tar.gz" \
       --only-show-errors --storage-class STANDARD_IA 2>>"$B/backup.log"; then
    echo "$(date -Is) OFFSITE_OK 已上传 s3://$S3_BACKUP_BUCKET/yaoflow-$TS.tar.gz ($(du -h "$B/yaoflow-$TS.tar.gz" | cut -f1))"
  else
    echo "$(date -Is) OFFSITE_FAIL 上传失败，本地归档仍在：yaoflow-$TS.tar.gz"
  fi
  if [ -d "$D/archive" ] && [ -n "$(ls -A "$D/archive" 2>/dev/null)" ]; then
    if $AWS s3 sync "$D/archive" "s3://$S3_BACKUP_BUCKET/archive/" --only-show-errors --storage-class STANDARD_IA 2>>"$B/backup.log"; then
      echo "$(date -Is) ARCHIVE_OK 月归档已同步 s3://$S3_BACKUP_BUCKET/archive/ ($(ls "$D/archive" | wc -l) 个文件)"
    else
      echo "$(date -Is) ARCHIVE_FAIL 月归档同步失败"
    fi
  fi
else
  echo "$(date -Is) OFFSITE_NONE 还没配异地备份（S3_BACKUP_BUCKET 未设）——归档只存在于本机这一块盘上"
fi
