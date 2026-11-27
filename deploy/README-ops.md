# 运维：防崩溃（10-13 起）

10-13 凌晨（台北 01:22 起约 25 分钟）一条后台查询在线上数据上跑了 80 秒以上，网站只有一个进程，查询期间所有读者请求排队，全站等于挂掉。之后做了五件事：

1. **后台独立进程**：`yaoflow-admin`（端口 3201）跑 `/admin`、`/api/admin` 和所有定时任务；读者访问的网站是 `yaoflow`（端口 3200）。后台再慢也拖不住网站。例外：`/admin/live` 和 `/api/admin/live` 仍在 3200（在线名单在那个进程的内存里）。nginx 分流见 `nginx-yaoflow.conf`；定时任务走 `/home/ubuntu/bin/yaoflow-cron.sh` → 3201。两个进程共用一个 SQLite（WAL + `busy_timeout = 3000`）。
2. **上线前用线上数据跑一遍**：`build-swap.sh` 在切换前调用 `predeploy-check.sh`——复制一份线上数据库和埋点，用新版本在 3299 端口起一个临时服务，打开读者页面和全部后台页面；任何一页不是 200 或超过 8 秒，就不上线（线上不动）。紧急修复可 `PREDEPLOY=off` 跳过。
3. **看门狗 + 自动回滚 + 邮件**：`watchdog.sh`（装在 `/home/ubuntu/bin/yaoflow-watchdog.sh`，每分钟）。网站连续 2 次 8 秒内没响应：部署后 30 分钟内 → 切回 `.next-prev` 并重启两个进程；否则 → 重启网站。都会用 `alert.sh` 发一封邮件给 Neil（同一主题 30 分钟最多一封）。后台进程连续 3 分钟没响应只重启它。日志 `/home/ubuntu/backups/watchdog.log`。
4. **部署后自检**：切换后立刻用 `smoke.sh` 打开首页、起卦页、解籤页、籤页（6 秒内 200），失败就自动回滚并发邮件。
5. **构建限资源**：`stage-deploy.sh` 和 `build-swap.sh` 里的类型检查、测试、构建都用 `nice -n 19 taskset -c 1`（只用一个核、最低优先级），另一个核留给网站。

部署入口：`(setsid nohup bash ~/yaoflow/deploy/stage-deploy.sh > /dev/null 2>&1 < /dev/null &)`，看 `/tmp/stage-deploy.log`。

**新后台查询的规矩**：上线前在线上数据副本上计时（predeploy 会兜底，但写的时候就要想到）。

## 10-15 内存事故之后的规则

- 所有 ssh 会话（ubuntu 用户，含部署）合计内存上限 2.2 GB（`user-1000.slice`：MemoryHigh 1.7G、MemoryMax 2.2G、MemorySwapMax 256M，`systemctl set-property` 持久化）。超过只会杀会话里的进程，网站（OOMScoreAdjust −900）和后台（−500，`/etc/systemd/system/yaoflow-admin.service.d/oom.conf`）在后面。
- 不要在服务器上 `grep -r` 数据目录、`*.db`、字体、`.next`：二进制文件没有换行，grep 会把整个文件当一行读进内存（10-11、10-12、10-14 都有单个 grep 吃到 3 GB 被杀；10-15 整机卡死 25 分钟，要 AWS 控制台重启）。查事件只对 `~/yaoflow-data/events/*.jsonl`，或写 node 脚本逐行读。
- 同一时间只跑一个重活（部署、全量测试、tsc、批量脚本），开跑前先看 `free -m` 和有没有别的部署在跑。

## 10-15 大功能上线规矩：先预览、再开放

- 新的大功能（新页面、新付费项、新邮件）在 `apps/web/src/lib/features.ts` 的 `FEATURES` 里登记，`def: "preview"`；页面用 `canSee()`、接口用 `featureVisible()` 挡住，sitemap、定时邮件用 `featureOn()`。
- 上线后只有登录后台的浏览器看得到。告诉 Neil 去哪里点，他确认后在 `/admin/features` 点「对所有人开放」。
- 静态页（首页、解籤页、籤页）上的入口只在「开放」时显示，且要下一次部署才出现；开放后把 `def` 改成 `"on"` 随下次部署带上。

## 10-15 数据底层（进度表 60）

- 埋点存在 `~/yaoflow-data/events.db`（`lib/event-store.ts`），不再从 `events/*.jsonl` 读；jsonl 并行写到 11-15 作对照。查埋点用 node 脚本只读打开 events.db，按 `t` 范围和 `e` 查（有索引），别全表捞。
- 履约 cron 顺带做整理（`lib/data-upkeep.ts`）：旧 jsonl 导入（一次性）、每小时汇总 `event_daily`、每天 04:00（台北）把整月过期的日志搬到 `~/yaoflow-data/archive/`（先汇总、再归档、核对条数、再删），周日 ANALYZE。表和保留期见 `docs/数据表说明.md`。
- 备份脚本的源文件是 `deploy/yaoflow-backup.sh`，改完要拷到 `~/bin/yaoflow-backup.sh`；它现在也快照 events.db，并把 archive/ 同步到 S3。
- 手动留的库副本放 `~/db-copies/`，别放数据目录（predeploy、备份都会扫数据目录）。
- 本机拉备份：Windows 任务计划程序跑 `deploy/pull-backups.ps1`（注册命令在脚本开头）。
