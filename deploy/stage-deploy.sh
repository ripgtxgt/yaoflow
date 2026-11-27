#!/usr/bin/env bash
# 10-13: the server's deploy entry point, kept in the repo (it used to live only in /tmp on the server).
# Type-check and tests at the lowest priority on cores 2–3 of 4 (防崩溃 ⑤; one core of 2 before the 10-23 t3.xlarge),
# then build-swap.sh (build → predeploy check on live data → swap → smoke check → automatic rollback on any failure).
# Logs: /tmp/stage-{tsc,vitest,deploy}.log
# Run detached: (setsid nohup bash ~/yaoflow/deploy/stage-deploy.sh > /dev/null 2>&1 < /dev/null &)
# 10-23 进度表 97 ③: `choom -n 500` — out of memory, the type-check / tests die first, never sshd or the site
LOW="nice -n 19 taskset -c 2,3 choom -n 500 --"
cd ~/yaoflow/apps/web
$LOW npx tsc --noEmit -p . > /tmp/stage-tsc.log 2>&1; echo "TSC_EXIT=$?" >> /tmp/stage-tsc.log
grep -q "TSC_EXIT=0" /tmp/stage-tsc.log || { echo "TSC failed" > /tmp/stage-deploy.log; exit 1; }
$LOW npx vitest run > /tmp/stage-vitest.log 2>&1; echo "VITEST_EXIT=$?" >> /tmp/stage-vitest.log
grep -q "VITEST_EXIT=0" /tmp/stage-vitest.log || { echo "VITEST failed" > /tmp/stage-deploy.log; exit 1; }
cd ~/yaoflow
if pgrep -f "[n]ode_modules/.bin/next build" >/dev/null; then echo "BUSY at build time" > /tmp/stage-deploy.log; exit 1; fi
bash deploy/build-swap.sh > /tmp/stage-deploy.log 2>&1; echo "DEPLOY_EXIT=$?" >> /tmp/stage-deploy.log
