#!/usr/bin/env bash
# 10-13 防崩溃 ④: right after the swap, open the pages readers use on the LIVE site (and the back office on its own
# process). Any page not answering 200 within the limit → exit 1, and deploy/build-swap.sh rolls back to the previous
# build at once. Usage: bash deploy/smoke.sh
set -uo pipefail
LIMIT="${SMOKE_LIMIT_S:-6}"
TMO=$(awk -v l="$LIMIT" 'BEGIN{print int(l)+4}')  # curl's own cutoff, whole seconds
fail=0
probe() { # $1 base, $2 path
  local r code t slow
  r=$(curl -s -o /dev/null -m "$TMO" -w "%{http_code} %{time_total}" "$1$2" 2>/dev/null || echo "000 99")
  code=${r%% *}; t=${r##* }
  slow=$(awk -v t="$t" -v l="$LIMIT" 'BEGIN{print (t>l)?1:0}')
  if [ "$code" != "200" ] || [ "$slow" = "1" ]; then echo "!! smoke: $2 → $code in ${t}s"; fail=1; else echo "   ok $2 ${t}s"; fi
}
for p in /api/health /zh-hant /en /zh-hant/cast /zh-hant/jieqian /zh-hant/qian/guandi/23; do probe http://127.0.0.1:3200 "$p"; done
# 10-22: the paid report pages too — that day every member's deep report answered 500 for six hours and nothing here
# opened one. One finished deep report of each system, made by the preview tests (paid session test:…, no address, so
# opening it sends no letter and touches no reader's report).
APP="$HOME/yaoflow/apps/web"
D=$(grep -h "^DATA_DIR=" "$APP"/.env* 2>/dev/null | head -1 | cut -d= -f2); [ -z "$D" ] && D="$APP/.data"
paid=$(node --no-warnings -e '
const { DatabaseSync } = require("node:sqlite");
const d = new DatabaseSync(process.argv[1] + "/yaoflow.db", { readOnly: true });
const out = [];
for (const [t, p] of [["bazi_reports", "bazi"], ["ziwei_reports", "ziwei"], ["astro_reports", "xingpan"]]) {
  try {
    const r = d.prepare(`SELECT token, locale FROM ${t} WHERE kind = ? AND status = ? AND paid_at IS NOT NULL AND paid_session LIKE ? AND IFNULL(email, ?) = ? ORDER BY created_at DESC LIMIT 1`).get("deep", "done", "test:%", "", "");
    if (r) out.push("/" + r.locale + "/" + p + "/r/" + r.token);
  } catch { /* no such table yet */ }
}
console.log(out.join(" "));
' "$D" 2>/dev/null)
for p in $paid; do probe http://127.0.0.1:3200 "$p"; done
# 10-23 进度表 96 ②: a reading bought with a 通卡 — on 10-22 every such page drew the finished deep reading as a LIGHT one
# (upgrade panel under it, 「生成失敗」 on the tap) and nothing here opened one. The row is ours (orders.session_id
# test:pass-smoke, a test customer, no address): the page must answer 200 AND be the deep version — no upgrade panel.
probe_deep() { # $1 path
  local body code
  body=$(curl -s -m "$TMO" -A "Mozilla/5.0 (compatible; yaoflow-smoke/1.0)" -w "\n%{http_code}" "http://127.0.0.1:3200$1" 2>/dev/null || echo "000")
  code=${body##*$'\n'}
  if [ "$code" != "200" ]; then echo "!! smoke: $1 → $code"; fail=1
  elif grep -q 'id="upgrade"' <<< "$body"; then echo "!! smoke: $1 is drawn as a LIGHT reading (upgrade panel present)"; fail=1
  else echo "   ok $1 (deep)"; fi
}
passpage=$(node --no-warnings -e '
const { DatabaseSync } = require("node:sqlite");
const d = new DatabaseSync(process.argv[1] + "/yaoflow.db", { readOnly: true });
const r = d.prepare("SELECT o.session_id AS sid, c.locale FROM orders o JOIN casts c ON c.id = o.cast_id WHERE o.session_id LIKE ? AND o.tier LIKE ? ORDER BY o.id DESC LIMIT 1").get("test:pass%", "pass_%");
if (r) console.log("/" + r.locale + "/reading?sid=" + encodeURIComponent(r.sid));
' "$D" 2>/dev/null)
[ -n "$passpage" ] && probe_deep "$passpage"
# 10-23: the back office runs the crons too. A swap that landed on a :x0 minute (fulfil, campaigns and checks all hitting the
# just-started process at once) made its health answer in 6.4 s and rolled the whole site back. It cannot take the site
# down (deploy/watchdog.sh only restarts it), so it gets one more try 15 s later; failing twice still rolls back.
if systemctl is-enabled yaoflow-admin >/dev/null 2>&1; then
  site_fail=$fail; fail=0
  probe http://127.0.0.1:3201 /api/health
  if [ "$fail" = "1" ]; then echo "   … back office busy — one more try in 15s"; sleep 15; fail=0; probe http://127.0.0.1:3201 /api/health; fi
  [ "$site_fail" = "1" ] && fail=1
fi
exit $fail
