#!/usr/bin/env bash
# YaoFlow 看门狗. 09-15 first version: every 5 minutes, 20 s timeout, restart after two misses (10 minutes).
# 10-13 防崩溃 ③ (Neil: 「以后我们怎么避免这种情况」): on 10-13 the site was frozen for ~25 minutes and this never fired.
# Now: every minute, 8 s timeout, two misses in a row (2 minutes) →
#   - within 30 minutes of a deploy (deploy/build-swap.sh writes /tmp/yaoflow-last-deploy): roll back to the previous
#     build (.next-prev) and restart both processes — the new build is the likely cause;
#   - otherwise: restart the process that stopped answering;
#   - either way: one email to the owner (deploy/alert.sh).
# The back-office process (port 3201) is watched too, but only restarted — it cannot take the site down.
# Install: cp deploy/watchdog.sh /home/ubuntu/bin/yaoflow-watchdog.sh; crontab: * * * * * /home/ubuntu/bin/yaoflow-watchdog.sh
LOG=/home/ubuntu/backups/watchdog.log
WEB=/home/ubuntu/yaoflow/apps/web
ALERT=/home/ubuntu/yaoflow/deploy/alert.sh
now() { date -u +%FT%TZ; }

check() { # $1 port, $2 state file → echoes the new miss count
  local code n
  code=$(curl -s -o /dev/null -m 8 -w "%{http_code}" "http://127.0.0.1:$1/api/health" 2>/dev/null || echo 000)
  if [ "$code" = "000" ]; then n=$(( $(cat "$2" 2>/dev/null || echo 0) + 1 )); else n=0; fi
  echo "$n" > "$2"; echo "$n"
}

# --- 10-23 进度表 97 ②: a deploy is building or swapping (deploy/build-swap.sh writes /tmp/yaoflow-building with its
# start time) — health may be slow and the processes restart on purpose; only log, never restart or roll back.
# A marker older than 60 minutes is a build that died without cleaning up: ignore it and carry on as usual.
MARK=/tmp/yaoflow-building
if [ -f "$MARK" ]; then
  age=$(( $(date +%s) - $(cat "$MARK" 2>/dev/null || echo 0) ))
  if [ "$age" -lt 3600 ]; then
    code=$(curl -s -o /dev/null -m 8 -w "%{http_code}" "http://127.0.0.1:3200/api/health" 2>/dev/null || echo 000)
    [ "$code" = "000" ] && echo "$(now) site miss during a build (${age}s in) -> standing by" >> "$LOG"
    echo 0 > /tmp/yaoflow-watchdog.fails; echo 0 > /tmp/yaoflow-watchdog-admin.fails
    exit 0
  fi
  echo "$(now) build marker is ${age}s old (no build running?) -> ignoring it" >> "$LOG"
  rm -f "$MARK"
fi

# --- the site readers use ---
n=$(check 3200 /tmp/yaoflow-watchdog.fails)
if [ "$n" -ge 2 ]; then
  echo 0 > /tmp/yaoflow-watchdog.fails
  last=$(cat /tmp/yaoflow-last-deploy 2>/dev/null || echo 0)
  if [ $(( $(date +%s) - last )) -lt 1800 ] && [ -d "$WEB/.next-prev" ]; then
    echo "$(now) site unresponsive x$n within 30 min of a deploy -> ROLLBACK to .next-prev + restart" >> "$LOG"
    cd "$WEB" && rm -rf .next-failed && mv .next .next-failed && mv .next-prev .next
    sudo systemctl restart yaoflow yaoflow-admin
    echo 0 > /tmp/yaoflow-last-deploy
    bash "$ALERT" "网站无响应，已自动回滚到上一个版本" "$(now)：yaoflow.com 连续 2 分钟没有响应（部署后 30 分钟内），看门狗已把网站切回上一个版本（.next-prev）并重启。出问题的版本保存在 apps/web/.next-failed。请让开发查原因后再部署。"
  else
    echo "$(now) site unresponsive x$n -> systemctl restart yaoflow" >> "$LOG"
    sudo systemctl restart yaoflow
    bash "$ALERT" "网站无响应，已自动重启" "$(now)：yaoflow.com 连续 2 分钟没有响应，看门狗已重启网站进程。如果反复出现，请让开发查原因。"
  fi
fi

# --- the back office (only if it is installed) ---
if systemctl is-enabled yaoflow-admin >/dev/null 2>&1; then
  m=$(check 3201 /tmp/yaoflow-watchdog-admin.fails)
  if [ "$m" -ge 3 ]; then
    echo 0 > /tmp/yaoflow-watchdog-admin.fails
    echo "$(now) back office unresponsive x$m -> systemctl restart yaoflow-admin" >> "$LOG"
    sudo systemctl restart yaoflow-admin
    bash "$ALERT" "后台进程无响应，已重启" "$(now)：后台进程（/admin 和定时任务，端口 3201）连续 3 分钟没有响应，已重启。读者访问的网站不受影响。"
  fi
fi
