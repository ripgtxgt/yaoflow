#!/usr/bin/env bash
# 10-13 防崩溃 ② (Neil: 「以后我们怎么避免这种情况」): before a new build goes live, run it once against a COPY of the live
# data and open every page that matters — the reader pages and every back-office page. On 10-13 a query took 80 s on the
# live data and milliseconds on the empty test database; this is the check that would have caught it.
#   usage (from deploy/build-swap.sh): bash deploy/predeploy-check.sh .next-build
# Exit 0 = every page answered 200 within the limit; 1 = something was slow or broken (the live site is untouched).
set -uo pipefail
DIST="${1:-.next-build}"
WEB=/home/ubuntu/yaoflow/apps/web
DATA=/home/ubuntu/yaoflow-data
SNAP=/tmp/yf-predeploy
PORT=3299
LIMIT="${PREDEPLOY_LIMIT_S:-8}"
TMO=$(awk -v l="$LIMIT" 'BEGIN{print int(l)+5}')  # curl's own cutoff, whole seconds
cd "$WEB" || exit 1
[ -f "$DIST/BUILD_ID" ] || { echo "!! predeploy: no build in $DIST"; exit 1; }

echo "-- predeploy: copying the live data (database snapshot + events)"
rm -rf "$SNAP"; mkdir -p "$SNAP"
node -e 'const {DatabaseSync}=require("node:sqlite");new DatabaseSync(process.argv[1],{readOnly:true}).exec(`VACUUM INTO '"'"'${process.argv[2]}'"'"'`)' "$DATA/yaoflow.db" "$SNAP/yaoflow.db" 2>/dev/null \
  || { echo "!! predeploy: could not snapshot the database"; exit 1; }
cp -r "$DATA/events" "$SNAP/events" 2>/dev/null || true
# 10-15 进度表 60: the event log is its own database now
[ -f "$DATA/events.db" ] && node -e 'const {DatabaseSync}=require("node:sqlite");new DatabaseSync(process.argv[1],{readOnly:true}).exec(`VACUUM INTO '"'"'${process.argv[2]}'"'"'`)' "$DATA/events.db" "$SNAP/events.db" 2>/dev/null
cp "$DATA/fx.json" "$SNAP/" 2>/dev/null || true

KEY=$(grep -E "^ADMIN_KEY=" .env.local | head -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//")
# its own process group, so cleanup stops exactly what it started (npx, next, next-server) and nothing else
NEXT_DIST_DIR="$DIST" DATA_DIR="$SNAP" PORT=$PORT setsid nice -n 10 npx next start -p $PORT > /tmp/yf-predeploy.log 2>&1 &
PID=$!
cleanup() { kill -- "-$PID" 2>/dev/null; sleep 2; kill -9 -- "-$PID" 2>/dev/null; rm -rf "$SNAP" /tmp/yf-predeploy.jar; }
trap cleanup EXIT
for i in $(seq 1 30); do
  sleep 2
  [ "$(curl -s -o /dev/null -m 5 -w '%{http_code}' "http://127.0.0.1:$PORT/api/health")" = "200" ] && break
done

B="http://127.0.0.1:$PORT"
curl -s -o /dev/null -m 20 -c /tmp/yf-predeploy.jar "$B/admin?key=$KEY"
fail=0
PAGES=(
  /zh-hant /en /zh /zh-hant/cast /zh-hant/jieqian /zh-hant/qian/guandi/23 /zh-hant/gua/1-qian
  /admin "/admin?days=live" "/admin?days=90" /admin/qian "/admin/qian?days=90" /admin/nudges /admin/finance
  /admin/customers /admin/members /admin/people /admin/retention /admin/outcomes /admin/heat /admin/inbox /admin/waitlist /admin/live
  # 10-23 进度表 105／106: the products table and its detail pages read every product's own table
  /admin/products /admin/products/liuyao /admin/products/tarot /admin/products/bazi /admin/products/tongka
)
for p in "${PAGES[@]}"; do
  r=$(curl -s -o /dev/null -m "$TMO" -b /tmp/yf-predeploy.jar -w "%{http_code} %{time_total}" "$B$p" 2>/dev/null || echo "000 99")
  code=${r%% *}; t=${r##* }
  # 10-30 (Neil: 后台冷启动 10 秒，查慢在哪里): the first /admin also loads the overview's code for the first time (~4–5 s of
  # module loading on a fresh process, measured with a CPU profile) — its own limit, ADMIN_COLD_LIMIT_S (15 s); a stuck
  # query (the 10-13 one took 80 s) still fails it. Every other page keeps LIMIT.
  lim=$LIMIT; [ "$p" = "/admin" ] && lim="${ADMIN_COLD_LIMIT_S:-15}"
  slow=$(awk -v t="$t" -v l="$lim" 'BEGIN{print (t>l)?1:0}')
  if [ "$code" != "200" ] || [ "$slow" = "1" ]; then echo "!! predeploy: $p → $code in ${t}s"; fail=1; else echo "   ok $p ${t}s"; fi
done
[ "$fail" = "0" ] && echo "-- predeploy: every page under ${LIMIT}s on the live data" || echo "!! predeploy FAILED — not going live"
exit $fail
