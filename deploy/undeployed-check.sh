#!/usr/bin/env bash
# 11-06 (Neil:「每次部署时顺手检查一遍、把卡住的修复一起带上」→「要」):
# list the code files that are committed in git but differ from (or are missing on) the live server, so a deploy can
# carry fixes that were committed without being deployed — the bug patrol cannot deploy, its fixes wait in git.
#
#   SSH="ssh -i <key> ubuntu@<host>" deploy/undeployed-check.sh [days=14]
#
# Run from the repo root. Prints "DIFF <path>" / "MISSING <path>" per file, then a count. Read-only on both sides.
# A file listed here is either a fix to deploy, or something being worked on in another session — look at the
# commit (git log -1 -- <path>) before uploading it. Windows-only helpers (*.ps1) and docs are skipped.
set -euo pipefail
DAYS="${1:-14}"
: "${SSH:?set SSH to the ssh command for the server}"
REMOTE_DIR="${REMOTE_DIR:-~/yaoflow}"
list=$(git log --since="${DAYS} days ago" --name-only --format="" -- apps/web packages deploy \
  | grep -vE '\.(md|ps1)$|^deploy/keys/' | sort -u)
sums=""
for f in $list; do
  [ -f "$f" ] || continue
  sums+="$(git show "HEAD:$f" 2>/dev/null | md5sum | cut -d' ' -f1) $f"$'\n'
done
printf '%s' "$sums" | $SSH "cd $REMOTE_DIR && n=0; while read h f; do [ -z \"\$f\" ] && continue; s=\$(md5sum \"\$f\" 2>/dev/null | cut -d' ' -f1); if [ -z \"\$s\" ]; then echo \"MISSING \$f\"; n=\$((n+1)); elif [ \"\$s\" != \"\$h\" ]; then echo \"DIFF \$f\"; n=\$((n+1)); fi; done; echo \"undeployed: \$n\""
