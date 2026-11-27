#!/usr/bin/env bash
# 10-13 防崩溃 ③: one email to the owner when the site needed saving. Usage: alert.sh "<subject>" "<body>"
# Uses the site's own Resend key (.env.local); at most one alert per subject per 30 minutes, so a flapping site does
# not flood the inbox. Never fails the caller.
set -u
ENV=/home/ubuntu/yaoflow/apps/web/.env.local
SUBJ="${1:-YaoFlow alert}"; BODY="${2:-}"
STAMP="/tmp/yf-alert-$(printf '%s' "$SUBJ" | md5sum | cut -c1-8)"
if [ -f "$STAMP" ] && [ $(( $(date +%s) - $(stat -c %Y "$STAMP") )) -lt 1800 ]; then exit 0; fi
touch "$STAMP"
get() { grep -E "^$1=" "$ENV" 2>/dev/null | head -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//"; }
KEY=$(get RESEND_API_KEY); FROM=$(get EMAIL_FROM); TO=$(get DIGEST_TO)
[ -n "$FROM" ] || FROM="YaoFlow <noreply@yaoflow.com>"
[ -n "$TO" ] || TO="ripgtxgt@gmail.com"
TO=${TO%%,*}
[ -n "$KEY" ] || exit 0
python3 - "$KEY" "$FROM" "$TO" "$SUBJ" "$BODY" <<'PY' >/dev/null 2>&1
import json, sys, urllib.request
key, frm, to, subj, body = sys.argv[1:6]
req = urllib.request.Request("https://api.resend.com/emails", method="POST",
  # 10-13: Resend's Cloudflare refuses Python's default User-Agent (403, "error code: 1010") — the first test alert never went out
  headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json", "User-Agent": "yaoflow-ops/1.0 (+https://yaoflow.com)"},
  data=json.dumps({"from": frm, "to": [to], "subject": f"[YaoFlow 运维] {subj}", "text": body}).encode())
urllib.request.urlopen(req, timeout=15).read()
PY
[ $? -eq 0 ] || echo "$(date -u +%FT%TZ) alert NOT sent: $SUBJ" >> /home/ubuntu/backups/watchdog.log
exit 0
