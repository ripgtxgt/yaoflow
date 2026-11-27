#!/usr/bin/env bash
# 10-01: build beside the live site, then swap and restart — the live .next is never half-written.
# Usage on the server:  bash ~/yaoflow/deploy/build-swap.sh [--no-restart]
# Before this, `next build` rewrote ~/yaoflow/apps/web/.next while the server was reading from it:
# a minute of 502s and missing chunks on every deploy.
set -eo pipefail
cd ~/yaoflow/apps/web
# 10-23 进度表 97 ②: while this runs, the watchdog stands by — on 10-22 a build pushed /api/health to 8 s and the watchdog
# was one miss from restarting (or rolling back) in the middle of it. The marker carries the start time; the watchdog
# ignores one older than 60 minutes (a build that died without cleaning up). Removed on ANY exit — success, failure, kill.
MARK=/tmp/yaoflow-building
date +%s > "$MARK"
trap 'rm -f "$MARK"' EXIT
rm -rf .next-build
# 10-13 防崩溃 ⑤: the build runs at the lowest priority and never on every core — the site keeps its own
# (during the 10-13 builds readers saw timeouts while next build took both cores).
# 10-23 t3.xlarge (4 cores, 16 GB): the build takes cores 2–3, the site keeps 0–1 (was core 1 of 2).
# 10-23 进度表 97 ③: `choom -n 500` — when memory runs out, the build is the first thing killed, never sshd or the site.
LOW="nice -n 19 taskset -c 2,3 choom -n 500 --"
echo "-- next build (into .next-build, cores 2-3, low priority)"
NEXT_DIST_DIR=.next-build $LOW npm run build 2>&1 | tail -15 || true
# a build can fail on a passing network hiccup (next/font fetching EB Garamond from Google did, 10-01) — once more
if [ ! -f .next-build/BUILD_ID ]; then
  echo "-- build failed, retrying once"
  rm -rf .next-build
  NEXT_DIST_DIR=.next-build $LOW npm run build 2>&1 | tail -15 || true
fi
[ -f .next-build/BUILD_ID ] || { echo "!! build produced no BUILD_ID — live site untouched"; exit 1; }

# 10-02: no regex lookbehind in anything the browser gets. Safari before 16.4 (iOS 16.2 in the Threads browser, 10-01)
# cannot build `(?<=…)` / `(?<!…)` — the chunk throws on load and the page is Next's blank 「Application error」.
# Server code may use lookbehind freely; client code may not. Refuse to ship a build that has one.
if grep -rlE '\(\?<[!=]' .next-build/static >/dev/null 2>&1; then
  echo "!! regex lookbehind in browser code — old Safari would crash on it. Live site untouched. Offending chunks:"
  for f in $(grep -rlE '\(\?<[!=]' .next-build/static | head -5); do echo "   $f"; grep -oE '.{50}\(\?<[!=].{40}' "$f" | head -2 | sed 's/^/      /'; done
  exit 1
fi

# 10-02: a page opened before the swap still asks for the old build's scripts when the reader taps on — keep them
# (file names are content hashes, so old and new never collide). Kept for a week, then pruned.
if [ -d .next/static ]; then
  cp -rnp .next/static/. .next-build/static/ 2>/dev/null || true
  find .next-build/static -type f -mtime +7 -delete 2>/dev/null || true
fi

# 10-13 防崩溃 ②: the new build, once, against a copy of the live data — every reader page and every back-office page
# must answer within the limit, or nothing goes live (PREDEPLOY=off skips it, for an emergency fix only)
if [ "${PREDEPLOY:-on}" != "off" ]; then
  bash ~/yaoflow/deploy/predeploy-check.sh .next-build || { echo "!! predeploy check failed — live site untouched (.next-build kept for a look)"; exit 1; }
fi

if [ "${1:-}" = "--no-restart" ]; then echo "-- built in .next-build, NOT swapped (as requested)"; exit 0; fi
echo "-- swap + restart"
rm -rf .next-prev
[ -d .next ] && mv .next .next-prev
mv .next-build .next
# 10-13 防崩溃 ①: the back office (yaoflow-admin) runs the same build — both restart together
restart_all() { sudo systemctl restart yaoflow; systemctl is-enabled yaoflow-admin >/dev/null 2>&1 && sudo systemctl restart yaoflow-admin; true; }
restart_all
for i in 1 2 3 4 5 6 7 8 9 10; do
  sleep 2
  code=$(curl -s -o /dev/null -w "%{http_code}" localhost:3200/api/health || true)
  [ "$code" = "200" ] && break
done
if [ "$code" != "200" ]; then
  echo "!! health $code after swap — rolling back to the previous build"
  rm -rf .next-failed; mv .next .next-failed; mv .next-prev .next
  restart_all
  bash ~/yaoflow/deploy/alert.sh "部署后健康检查失败，已回滚" "$(date -u +%FT%TZ)：新版本上线后 /api/health 返回 $code，已自动切回上一个版本。"
  exit 1
fi
# 10-13 防崩溃 ③④: the watchdog rolls back on its own for 30 minutes after this moment; and the reader pages are opened
# now, on the live site — any of them failing or slow sends it back at once
date +%s > /tmp/yaoflow-last-deploy
sleep 3
if ! bash ~/yaoflow/deploy/smoke.sh; then
  echo "!! smoke check failed after swap — rolling back to the previous build"
  rm -rf .next-failed; mv .next .next-failed; mv .next-prev .next
  restart_all
  echo 0 > /tmp/yaoflow-last-deploy
  bash ~/yaoflow/deploy/alert.sh "部署后页面自检失败，已回滚" "$(date -u +%FT%TZ)：新版本上线后读者页面打不开或太慢，已自动切回上一个版本。出问题的版本在 apps/web/.next-failed。"
  exit 1
fi
# 10-30 (Neil: 后台冷启动 10 秒): open /admin once on the back office (:3201) right after the restart, so its code is loaded and
# its readings cached before anyone clicks — the first visit after a deploy used to take ~10 s. Never fails the deploy.
(
  WKEY=$(grep -E "^ADMIN_KEY=" .env.local | head -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//")
  for i in $(seq 1 20); do [ "$(curl -s -o /dev/null -m 3 -w '%{http_code}' localhost:3201/api/health)" = "200" ] && break; sleep 2; done
  curl -s -o /dev/null -m 60 -c /tmp/yf-warm.jar "http://127.0.0.1:3201/admin?key=$WKEY" || true
  curl -s -o /dev/null -m 60 -b /tmp/yf-warm.jar -w "admin warm %{http_code} %{time_total}s\n" "http://127.0.0.1:3201/admin" || true
  rm -f /tmp/yf-warm.jar
) || true
echo "health 200 · smoke ok · build $(cat .next/BUILD_ID)"
systemctl is-active yaoflow
