# Bug 自动巡检记录

> 每天台北 09:40、18:40 自动巡检。每次在末尾追加：时间、看的范围、每类问题一行（真 bug / 噪音 / 待 Neil、处理、build）。
> 下次巡检从「上次时间」接着看；这里判定过的噪音不再重复处理。

## 已判定为噪音 / 已知（长期有效）
- 部署重启瞬间的零星 502（build-swap 换版本时 1 秒内；对得上 journalctl 的 yaoflow 重启时间）。
- `hy:React #418 … same-shallow` 偶发一两条：10-29 已修掉两个主因（解读页回访日期时区、GA/Cloudflare 网关注入），之后一天 ≤2 条、可自愈；除非某页突然成批出现才再查。
- `cast:Failed to fetch` 单条：请求没到 nginx（手机网络 / 从 Stripe 返回后页面恢复），CastFlow 已显示「出错可重试」，读者能继续操作。
- `ga_data_fail`：GA 报表读取超时，下一小时自愈（10-30 看板已不再挂黄）。
- `login_mail_fail` 单次超时：邮件服务商接口超时，读者几分钟后重发登录信成功。
- `teaser_fail three slips → fallback`：免费一句三次没过检查改用备用句，读者仍看到内容（一周约 12 次；属提示词范畴，不自动改）。

---

## 2026-10-30 10:05（台北）· 首次巡检，看过去 12 小时（10-29 14:00 – 10-30 02:05 UTC）
- 浏览器报错 3 条：`hy:React #418 same-shallow` 2 条（/zh-hant/reading iOS Chrome、/zh-hant/tarot Windows Chrome，各 1 人，可自愈）→ 噪音（较 10-29 修前一天约 40 条大幅下降）；`cast:Failed to fetch` 1 条（三星浏览器，第二次点深断时请求未到服务器，读者随后正常改买通卡）→ 噪音。
- 服务端 ops_events：ga_data_fail 1、login_mail_fail 1、teaser_fail 1 → 均为外部超时或已有兜底，噪音。journalctl 无 error；nginx 5xx 只有部署重启瞬间的 502（10-29 15:19、17:23、18:12、23:27、23:37，10-30 00:39）→ 噪音。
- 定时任务日志（backup/fulfill/headsup/report-mend/revisit 等）均无失败。
- 结论：过去 12 小时没有新 bug，未改代码、未部署。

## 2026-10-31 01:25（台北）· 看 10-30 02:05 – 17:25 UTC（约 15 小时）
- 【待 Neil】support_auto_llm_fail 1 次（12:58 UTC）：Anthropic 账户余额不足（400 credit balance too low），一封读者来信（f…@yahoo.com.tw，ack 已发）没被自动处理；读信步骤无 DeepSeek 回退。涉及充值与客服回信逻辑，未改。
- 浏览器报错 7 条 / 5 人：React #418（/reading text body 4 条 2 人，today-qian、account、Threads 内嵌浏览器带 facebook 注入各 1）→ 噪音，量与前日持平。
- 服务端：llm_down「ark probe fetch failed」6 次 → 噪音（近一周每天 5–9 次的基线）；journalctl 1 条 Server Reference ID 不匹配（部署后旧页面调用 server action）→ 噪音；nginx 5xx 只有 07:40 /admin/customers/825 一次 502（upstream reset，部署换版本瞬间）→ 噪音。
- 定时任务日志无新失败。未改代码、未部署。

## 2026-10-31 09:45（台北）· 看 10-30 17:25 – 10-31 01:42 UTC（约 8 小时）
- 浏览器报错 2 条 / 2 人：React #418 same-shallow 1 条（/zh-hant/qian/liushi-jiazi/41，Threads 内嵌浏览器）→ 噪音；`res:SCRIPT js.stripe.com` 1 条（/zh-hant/cast，iOS 18.6 Safari，起卦→看到免费一句与价格后离开，没点付款）→ 噪音：近三周每天 0–3 条的基线（拦截器/网络取消），未成批、无人因此付款失败。
- 服务端：ops_events 无 fail/error/down；journalctl 无 error；nginx 无 5xx。
- 定时任务：backup 18:00 OFFSITE_OK；headsup/fulfill/revisit/recover-offer/campaigns/report-mend 均 failed:0。
- 结论：过去 12 小时没有新 bug，未改代码、未部署。

## 2026-10-31 18:41（台北）· 本次未能巡检
- 连服务器只读查询（ssh 读 events.db / ops_events / journalctl / nginx / 备份日志）被本次会话的自动权限审核拦下（「生产环境读取」类），未取得任何数据。按规矩没有绕过。
- 下次巡检范围仍从 10-31 01:42 UTC 接着看。未改代码、未部署。

## 2026-11-01 09:45（台北）· 看 10-31 01:42 – 11-01 01:42 UTC（约 24 小时，含上次未能巡检的一段）
- 浏览器报错 21 条 / 15 人：React #418 共 14 条 12 人（分散在 reading、cast、share、gua、bazi/chart 等页，多为 navigator 语言与页面语言不一致或 Threads/微信内嵌浏览器，未在某页成批）→ 噪音；同一访客 /zh-hant/reading「late #418」后跟 2 条 `parentNode` null（Android Chrome，DOM 被改写，读者之前之后均正常浏览）→ 噪音；`ChunkLoadError` + 两条 SCRIPT（iOS Safari /zh-hant/cast，15:38:59，正好在 15:38:51 部署换版后 8 秒，自动重载后读者正常起卦、用会员额度看深断）→ 噪音；`boundary:Load failed` 1 条（iOS /zh/account，网络中断，读者继续追问、排八字）→ 噪音；`res:LINK css` 1 条（Linux Chrome /en）→ 噪音。
- 服务端 ops_events：astro/bazi_report_part_fail 3 次（accuracy/short/medical 检查未过）均在第 2 轮重试补齐（report_done round 2）、qian_personal_fail 1 次随后重生成成功 → 已有兜底，噪音；llm_down「ark probe fetch failed」14 次（24 小时，与每天 5–9 次基线相当；fulfill 探针 deepseek/siliconflow/ark 均 ok）→ 噪音。journalctl 无 error；nginx 无 5xx。
- 定时任务：backup 10-31 18:00 OFFSITE_OK；fulfill/recover/campaigns/report-mend/headsup/revisit 无失败（00:53 日志按周轮转属正常）。
- 结论：过去 24 小时没有新 bug，未改代码、未部署。

## 2026-11-01 21:25（台北）· 看 11-01 01:42 – 13:21 UTC（约 11.5 小时）
- 浏览器报错 10 条：React #418 HTML same-shallow 4 条「4 人」全在 /zh-hant/cases/cf431be7c7（13:15 前后数秒内）→ 噪音：nginx 对得上，是 Meta 的预览/抓取渲染器（2a03:2880:f802::，Windows Chrome 139，紧跟大量 facebookexternalhit 抓同一 fbclid 链接与 og 图），不是真人；/zh-hant/reading #418 text 2 条 1 人（iOS，nl=en-CA 语言不一致）→ 噪音；`global:Load failed` 1 条（微信内嵌 /zh/how-to-ask）、`res:IMG icon-192.png` 1 条、`res:SCRIPT js.stripe.com` 1 条（基线）→ 噪音；`res:IMG share/778688/story` 1 条（Edge /zh/cast）→ 噪音：同一访客前后两次请求该图 nginx 均 200（73KB、约 1 秒），线上复查 200 image/png。
- 服务端：ops_events 只有 llm_down「ark probe fetch failed」10 次（基线；fulfill.log 10 条 fetch failed 同源）→ 噪音。journalctl 无 error；nginx 无 5xx。
- 定时任务：fulfill/recover-offer/campaigns/report-mend/checks/revisit/headsup 无失败。
- 结论：过去 12 小时没有新 bug，未改代码、未部署。

## 2026-11-02 09:45（台北）· 看 11-01 13:21 – 11-02 01:42 UTC（约 12 小时）
- 浏览器报错 10 条：React #418 共 5 条 5 人（/zh/gua/15-qian、/zh/name、/zh/bazi、/zh/cast 的 same-shallow / body 各 1，/zh-hant/reading iOS nl=en-CA 1）→ 噪音，量与基线持平；`res:SCRIPT` 5 条 1 人（Android 10 Chrome /zh-hant/qian/liushi-jiazi/17，页面 14:10 由 IPv4 加载、14:11 报错时已换成 IPv6 网络，5 个 chunk 请求一条都没到 nginx，chunk 文件在线上存在）→ 噪音（手机换网）。
- 服务端 ops_events：hepan_report_part_fail 2 次（B accuracy、D score）第 2 轮补齐（hepan_report_done round 2）→ 已有兜底，噪音；client_error_proxy 1 条（iOS Loading chunk 3）→ 噪音；llm_down ark 2 次 + deepseek probe 超时 1 次 → 基线噪音。journalctl 无 error；nginx 无 5xx。
- 定时任务：digest/headsup/revisit failed:0；fulfill 最近探针 deepseek/siliconflow/ark 均 ok；backup 11-01 18:00 正常。
- 结论：过去 12 小时没有新 bug，未改代码、未部署。

## 2026-11-02 18:45（台北）· 看 11-02 01:42 – 10:41 UTC（约 9 小时）
- 浏览器报错 11 条：React #418 共 3 条 3 人（/zh-hant/reading text body iOS、/zh-hant/reading HTML body late Windows、/zh/gua/43-guai same-shallow）→ 噪音，基线；同一 Windows 访客 #418 后跟 2 条 `parentNode` null → 噪音（DOM 被改写，同 11-01 判定）；`res:LINK sc.css` 1 条（Android 6 微信 /zh/gua/61-zhong-fu）→ 噪音；macOS Chrome 133 /zh/cast 09:26:06 同一瞬间 5 条资源失败（2 css + 3 js，→reload）1 人 → 噪音：nginx 只见该 IP 图标 304 与 /api/track，5 个静态文件请求一条都没到服务器，文件在当前 build（iJ7QdvntVe_93qQ9DEUND，05:22 上线）中存在，属本机网络/拦截。
- 服务端 ops_events：astro_report_part_fail 1、bazi_report_part_fail 1 均有 retry 且 report_done → 已有兜底，噪音；llm_down siliconflow probe 超时 1 次 → 基线噪音。journalctl 无 error；nginx 无 5xx。
- 定时任务：backup 11-01 18:00 正常；headsup/nianshu-early（1175 封 failed:0）/fulfill/recover-offer/campaigns/report-mend/checks 无失败。
- 结论：过去 12 小时没有新 bug，未改代码、未部署。

## 2026-11-03 09:45（台北）· 看 11-02 10:41 – 11-03 01:41 UTC（约 15 小时）
- 【待 Neil】support_auto_llm_fail 2 次（11-02 11:35、11:39 UTC）：Anthropic 余额不足，同一读者（2…@qq.com）两封来信没被自动处理（ack 已发）。T-013 DeepSeek 回退仍未落地，涉及客服回信逻辑，未改。
- 浏览器报错 8 条：`cast:400` 1 条（ops 里 client_error_proxy 11 条，同一位 Android 微信读者 16:04–16:05 连点分享来的轻解读领取，服务器回 400 email_required）→ 真 bug，已由 Neil 的会话修好并上线（c1e8b4c，build tkTqG57S6rWkRNbYm_K4y，00:12 UTC；服务器 CastFlow.tsx / track/route.ts 与 HEAD 一致），本次不重复处理；`ReferenceError getAbstract/getFirstImage @reading:1` 2 条 1 人（iOS 18.7，内嵌浏览器分享脚本注入，读者前后正常浏览）→ 噪音；`res:SCRIPT js.stripe.com` 2 条 1 人（Threads 内嵌）→ 基线噪音；React #418 same-shallow 3 条 3 人（/zh/zeri、/zh-hant/cases、/zh-hant/cases/e5082b52ae）→ 噪音。
- 服务端 ops_events：astro/bazi/nianshu_report_part_fail 均 retry 后 done → 已有兜底，噪音；gen_retry 31（重写检查）→ 正常；llm_down ark probe 6 次 → 基线噪音。journalctl 无 error；nginx 无 5xx。
- 定时任务：backup 11-02 18:00 OFFSITE_OK；fulfill/recover-offer/campaigns/report-mend/checks/headsup/revisit/digest/nianshu-early 无失败（failed:0）。
- 结论：无需本次修复的新 bug，未改代码、未部署。

## 2026-11-03 18:45（台北）· 看 11-03 01:41 – 10:41 UTC（约 9 小时）
- 浏览器报错 3 条 / 3 人：全是 React #418 HTML same-shallow（/ja/gua/28-da-guo macOS Chrome、/zh/yunshi Windows Chrome、/zh-hant Threads 内嵌）→ 噪音，基线。
- 服务端 ops_events：matter_model_fail 2 次、daily_line_fail 1 次（09:55–10:30 UTC，matter_deadline / daily_line_deadline）→ 噪音：同时段 DeepSeek 回 503「Service is too busy」（llm_down 11 次），两处都已有兜底（归到哪件事改用规则、每日一句用备用），读者无感。无 support_auto_llm_fail。journalctl 无 error；nginx 无 5xx。
- 定时任务：backup 11-02 18:00 OFFSITE_OK；fulfill（仅探针报 deepseek 503/超时）/recover-offer/campaigns/report-mend/checks/headsup/revisit 无失败。
- 结论：过去 9 小时没有新 bug，未改代码、未部署。上次的【待 Neil】support_auto（Anthropic 余额 / T-013 回退）仍待定。

## 2026-11-04 09:45（台北）· 看 11-03 10:41 – 11-04 01:40 UTC（约 15 小时）
- 浏览器报错 1 条 / 1 人：`res:IMG share/968778/story`（iOS Safari /zh-hant/reading，13:05:56）→ 噪音（外部偶发）：nginx 对上同一读者 13:04:58 请求 story 图 499（自己取消）、13:05:55 带 ?q= 的 story 图 503 `font_unavailable`——Google Fonts 子集字体两次取（已有 1 次重试）都失败；同时段其他 share/og 图 89 条均 200。同一 URL 线上复查 200 image/png 129KB、0.55 秒。若以后频繁出现，可考虑字体失败时退回内嵌字体而不是 503（待观察，未改）。
- 服务端 ops_events：llm_down「ark probe fetch failed」6 次 → 基线噪音；ga_data_fail 1 次（00:20 UTC，GA 数据接口超时）→ 噪音。journalctl 无 error；nginx 5xx 仅上面那 1 条 503。
- 定时任务：backup 11-03 18:00 OFFSITE_OK；fulfill/recover-offer/campaigns/report-mend/checks/headsup/revisit/insight/promo-stats 无失败。
- 结论：过去 15 小时没有新 bug，未改代码、未部署。【待 Neil】support_auto（Anthropic 余额 / T-013 回退）仍待定。

## 2026-11-04 18:40（台北）· 看 11-04 01:40 – 10:40 UTC（约 9 小时）
- 【真 bug·已修未上线】`boundary:Load failed` 1 条 1 人（iOS Safari，/zh-hant/nianshu/r/…，03:27:36）：刚付年书的读者切到后台时 AutoRefresh 照样 router.refresh()（nginx 03:27:32 _rsc 请求），后台网络被掐断 → 错误页。改 `lib/auto-refresh.ts`（隐藏时不刷新、回前台补刷）+ 测试 4 条；服务器 tsc 0、全量 1942 绿。build-swap 被权限审查拦下 → 服务器文件已恢复原样，未上线，待部署。
- 【待 Neil】React #418 same-shallow 7 条 5 人（/zh/gua/53-jian 3 人、/zh-hant/reading 1 人 3 条、/zh/cast Threads 1 人 2 条）：卦页那类在干净无头 Chrome 里也能偶发复现（43-guai/53-jian 约 1/10），不是纯外部噪音；根因未定位，未改。reading / Threads 两条按基线噪音。
- 服务端 ops_events：bazi_report_part_fail 1、nianshu_part_fail 1 均 retry 后 done → 已有兜底，噪音；llm_down ark 4 次、ga_data_fail 2 次 → 基线噪音。journalctl 无 error；nginx 无 5xx。
- 定时任务：backup 11-03 18:00 正常；campaigns/checks/fulfill/recover-offer/report-mend/headsup/revisit 无失败。
- 【待 Neil】support_auto（Anthropic 余额）：HEAD 已有 16a9eb7「T-013 改走 DeepSeek」，是否上线未核对。

## 2026-11-05 09:40（台北）· 看 11-04 10:40 – 11-05 01:40 UTC（约 15 小时）
- 浏览器报错 17 条：React #418 same-shallow 6 条 6 人——其中 /zh/gua/43-guai 3 条（Linux Chrome 153，10:48–10:50）是上次巡检自己的无头 Chrome 复现，其余 /zh-hant/gua/7-shi 等按基线；#418 text 1 条（iOS /zh-hant/tarot/r）、#418 HTML body 3 条 3 人（/zh/cast、/zh-hant/reading ×2 Windows Chrome 156 late）+ 随后 parentNode null 6 条 2 人 → 噪音（两位读者之后继续追问、做本命卦，未受影响，同 11-01/11-02 判定）；Instagram 内嵌「Java object is gone」1 条 → 噪音。
- 服务端 ops_events：bazi_report_part_fail 1、ziwei_report_part_fail 2（medical:處方）均 retry 后 round 2 done → 已有兜底，噪音；llm_down ark probe 5 次 → 基线噪音。journalctl 无 error。nginx 5xx 1 条：01:30:19 /admin/customers/2508 502——yaoflow-admin 01:30:21 被别的会话重启，10 秒后同页 200 → 噪音。
- 定时任务：backup 11-04 18:00 正常；fulfill/recover-offer/campaigns/report-mend/checks/headsup/revisit/insight/promo-stats 无失败。
- 【待 Neil】上次的 auto-refresh 修复（0580b84）：本次在其他会话部署完（build PSPPPRn3igLgSRnXGmdLZ）后传上服务器，tsc 0、全量 1959 绿，build-swap 仍被权限审查拦下 → 服务器文件已恢复原样，未上线。
- 结论：本次没有新 bug；未上线任何东西。【待 Neil】support_auto（Anthropic 余额）、React #418 卦页偶发仍待定。

## 2026-11-05 18:45（台北）· 看 11-05 01:40 – 10:41 UTC（约 9 小时）
- 浏览器报错 6 条 / 4 人：ChunkLoadError 2 人（Windows Chrome 104 /zh/gua/61-zhong-fu 03:13；iOS Safari /zh-hant/reading 10:19，均 →reload）→ 噪音：两个 chunk 都在当前 build 里，nginx 没收到这两次请求，属本机网络；React #418 same-shallow 2 条 2 人（/ja/gua/60-jie macOS、/zh-hant/tarot/r iOS）→ 基线（卦页那类仍归【待 Neil】#418）。
- 服务端 ops_events：无 fail/error/down 类事件。journalctl 无 error。nginx 5xx 32 条：07:09:14 yaoflow 被重启（非 build-swap，BUILD_ID 未变），同一 Windows 访客的 30 个 _rsc 预取 502（导航本身 200）→ 噪音；09:40:08 重启时 SemrushBot 1 条 502、01:30 admin 1 条（上次已记）→ 噪音。可考虑：直接 restart 会有约 1 秒 502，部署/重启最好走 build-swap 的平滑切换（建议，未改）。
- 定时任务：backup 11-04 18:00 OFFSITE_OK；fulfill/recover-offer/campaigns/report-mend/checks/headsup/revisit/insight 无失败。
- 【待 Neil】auto-refresh 修复（0580b84）第三次尝试上线：传到服务器 tsc 0、全量 287 文件 1959 条绿；build-swap 仍被权限审查拦下（Production Deploy）→ 服务器文件已恢复原样，未上线。需 Neil 手动跑一次 build-swap 或放行自动部署。
- 结论：过去 9 小时没有新 bug；未上线任何东西。【待 Neil】support_auto（Anthropic 余额）、卦页 React #418 偶发仍待定。

## 2026-11-06 09:40（台北）· 看 11-05 10:41 – 11-06 01:41 UTC（约 15 小时）
- 浏览器报错 13 条：React #418 HTML same-shallow 7 条 7 人（/ja/services/daily、/zh/dream/* 等，均 nl=zh-CN 的 Chrome）→ 基线噪音；#418 HTML body 3 条 3 人（/zh/cast ×2 Windows Chrome、/zh/gua/43-guai Linux Chrome 150 late）+ #418 text body 1 条（iOS /zh-hant/reading）→ 同 11-05 判定，噪音（卦页那类仍归【待 Neil】#418）。res:LINK 2 条 1 人（Android Chrome 156 /zh-hant/reading，01:37:44，tc.css 与 6401ba9c….css）→ 噪音：两个文件都在当前 build（H3yB6xsK2SNJmQry4IHYw），nginx 没收到这两次 CSS 请求（读者刚从结账返回、IPv4→IPv6 切换），20 秒后重开页面正常，随后看事、起卦、浏览均正常。
- 服务端 ops_events：仅 llm_down「ark probe fetch failed」3 次 → 基线噪音。journalctl 无 error；nginx 无 5xx。
- 定时任务：backup 11-05 18:00 OFFSITE_OK；fulfill（仅探针 ark fetch failed）/recover-offer/campaigns/report-mend/checks/headsup/revisit/insight/promo-stats 无失败。
- 核对：auto-refresh 修复（0580b84）已由 11-06 开发会话部署上线，服务器 AutoRefresh.tsx 与 HEAD 一致——此前【待 Neil】这条结清。
- 结论：过去 15 小时没有新 bug，未改代码、未部署。【待 Neil】support_auto（Anthropic 余额，T-013 已改走 DeepSeek 兜底）、卦页 React #418 偶发仍待定。

## 2026-11-06 18:40（台北）· 看 11-06 01:41 – 10:41 UTC（约 9 小时）
- 浏览器报错 6 条：ChunkLoadError chunk 1386 2 条（08:25 /zh/reading、/zh，Windows Chrome 155）→ 噪音：IP 72.153.231.69 是 Outlook Safe Links 扫描（Azure），从回访邮件 outcome 链接进来；chunk 在当时 build 里。React #418 text body 3 条 1 人（Android Chrome 156 /zh-hant/reading，nl=zh-TW）→ 基线噪音。React #419 1 条（08:46 /zh/account?c=services，Windows Chrome 148，未登录）→ 噪音：未登录访问 account 时 redirect 发生在 Suspense 流式之后（线上复现：HTML 里有 template B:0 + NEXT_REDIRECT + meta refresh），浏览器先报 #419 再正常跳到 /zh/login（nginx 1 秒内 200）。读者无感；若想消掉，可在 middleware 对无会话的 /account 直接 307（建议，未改）。
- 服务端 ops_events：llm_down ark probe 5 次 → 基线；teaser_fail 2 次「three slips → fallback」→ 已有兜底，噪音。journalctl 无 error；yaoflow 在 02:19/07:54/09:44/10:11 被其他会话重启/部署（当前 build iBQJKk-7qQIXFTLihjpfC）。nginx 5xx：02:19:23 重启瞬间 _rsc 预取 2 条 502 → 噪音；09:30:14 /api/overview 等 4 条 502 属 taoli-dashboard 站点，不是 YaoFlow。
- 定时任务：backup 11-05 18:00 OFFSITE_OK；fulfill/recover-offer/campaigns/report-mend/checks/headsup/revisit/insight 无失败。
- 结论：过去 9 小时没有新 bug，未改代码、未部署。【待 Neil】support_auto（Anthropic 余额）、卦页 React #418 偶发仍待定。

## 2026-11-07 09:40（台北）· 看 11-06 10:41 – 11-07 01:41 UTC（约 15 小时）
- 浏览器报错 4 条 / 3 人：React #418 text body 3 条（Android Chrome 156 /zh-hant/reading nl=zh-TW 1 人 2 条；Android 微信 /zh/reading nl=zh-CN 1 条）→ 基线噪音；React #419 1 条（/ja/account，Windows Chrome 148）→ 同 11-06 判定，未登录访问 account 时流式后 redirect，读者无感，噪音。
- 服务端 ops_events：tarot_personal_fail 2 次（13:30 cust 1197「redraw:再翻」）→ 第 3 次 13:31:13 成功出结果，已有重试兜底，噪音；ziwei_report_part_fail 1（medical:处方）→ retry 后 round 2 done，噪音；llm_down ark probe 7、ga_data_fail 2（GA 接口超时）、teaser_fail 1（three slips → fallback）→ 基线噪音。journalctl 无 error；yaoflow 15:38 被其他会话重启，无 5xx。nginx 5xx：12:00:20–22 /admin 2 条 502——yaoflow-admin 12:00:22 重启，7 秒后同页 200 → 噪音。
- 定时任务：backup 11-06 18:00 OFFSITE_OK；fulfill/recover-offer/campaigns/report-mend/checks/headsup/revisit/insight/promo-stats 无失败。
- 结论：过去 15 小时没有新 bug，未改代码、未部署。【待 Neil】support_auto（Anthropic 余额）、卦页 React #418 偶发仍待定。

## 2026-11-07 19:20（台北）· 看 11-07 01:41 – 11:20 UTC（约 10 小时）
- 浏览器报错 12 条 / 4 人：React #418 text body/same-shallow 6 条 2 人（Android Chrome 156 /zh-hant/reading、/zh-hant/matter/467，nl=zh-TW）→ 基线噪音；#418 HTML body 1 条（/ja/for/exam-or-interview，nl=en-US，页面被翻译）→ 噪音；「runtime.sendMessage() Tab not found」5 条 1 人（iOS Safari /en）→ 浏览器扩展注入，噪音。
- 服务端 ops_events：llm_down 9（ark probe fetch failed 为主，deepseek 超时 1 次）、teaser_fail 1（three slips → fallback）→ 基线噪音。journalctl 无 error；nginx 今天无 5xx。
- 定时任务：backup 11-06 18:00 OFFSITE_OK；fulfill 仅探针 ark fetch failed；其余无失败。
- 结论：过去 10 小时没有新 bug，未改代码、未部署。【待 Neil】support_auto（Anthropic 余额）、卦页 React #418 偶发仍待定。

## 2026-11-08 09:40（台北）· 看 11-07 11:20 – 11-08 01:41 UTC（约 14 小时）
- 浏览器报错 11 条 / 6 人：RangeError「Maximum call stack」3 条 + Load failed 1 条（访客 scoa，iOS 27 · Chrome 156，/zh-hant/cases → 看自己）→ 已由 11-07 开发会话修（36291c5：SiteNav 2.5 秒没跳转就整页打开、global-error 遇 Load failed 自动刷新一次），服务器 SiteNav/global-error 与 HEAD 一致，build 14OV28TyKQ4Gm4vEnuBdO（18:08 UTC）已上线；该访客随后正常登录、用每日签、看自己。res:IMG share/*/story 3 条 2 人 + res:SCRIPT connect.facebook.net/pcm.js 1 条（iOS Threads 内嵌浏览器）→ 噪音：nginx 对这 3 张分享图都回 200 完整字节，报错在 200 之后 10–20 秒，读者照常追问/起卦；pcm.js 是 Meta 自己的脚本。React #418 HTML body template#B:0 2 条 2 人（/pt、/es/zeri/wedding，nl=en-US，页面被翻译）→ 基线噪音。Instagram「Java object is gone」1 条 → 噪音。
- 服务端 ops_events：bazi_report_part_fail 2（3716ed deep D short:xiyong）→ report-mend 15:05 补齐 round 3 done 并已发出，噪音；ga_data_fail 1（超时）、teaser_fail 1（three slips → fallback）→ 基线噪音。journalctl 无 error；nginx 无 5xx。
- 定时任务：fulfill/recover-offer/campaigns/report-mend/checks/headsup（failed 0）/revisit/insight/promo-stats 无失败。
- 结论：过去 14 小时没有新 bug，未改代码、未部署。【待 Neil】support_auto（Anthropic 余额）、卦页 React #418 偶发仍待定。

## 2026-11-08 18:40（台北）· 看 11-08 01:41 – 10:42 UTC（约 9 小时）
- 浏览器报错 4 条 / 3 人：ChunkLoadError huangli page-d95df9d0 1 人 2 条（05:05 /zh/huangli，Android 10 · Chrome 156，→reload）→ 噪音：从 Threads 帖子 c=threads-zh-huangli 点进，同一秒 facebookexternalhit 预抓了整页和全部 chunk，读者自己的请求没到 nginx（Meta 内嵌浏览器预抓缓存），chunk 在当时 build 里；读者 reload 后正常看到今日黄历（huangli view:today）。res:IMG share/*/story 2 条 2 人（iOS Threads 内嵌浏览器 /zh/cast、/zh/reading）→ 同 11-08 上午判定，噪音。client_error_proxy 1 条（sc.css，Chrome 105）→ proxy-hop 已过滤，噪音。
- 服务端 ops_events：ga_data_fail 1（超时）、teaser_fail 1（three slips → fallback）→ 基线噪音。journalctl 无 error；yaoflow 10:15 由其他会话 build-swap 部署（当前 build choNzOcWYiZzScjqaR833）；nginx 今天无 5xx。
- 定时任务：fulfill/recover-offer/campaigns/report-mend/checks/headsup（failed 0）/revisit 无失败。
- 结论：过去 9 小时没有新 bug，未改代码、未部署。【待 Neil】support_auto（Anthropic 余额）、卦页 React #418 偶发仍待定。

## 2026-11-09 09:40（台北）· 看 11-08 10:42 – 11-09 01:40 UTC（约 15 小时）
- 浏览器报错 6 条 / 5 人：React #418 text 3 条 2 人（Android Chrome 156 /zh-hant/reading nl=zh-TW；iOS Threads 内嵌浏览器 foreign[connect.facebook.net]）→ 基线噪音；res:SCRIPT connect.facebook.net/pcm.js 1 条（iOS Threads）→ Meta 自己的脚本，噪音。res:SCRIPT error-0c33….js →reload 1 条（17:54 /en，iOS 18.7 Safari，iCloud Private Relay）→ 噪音：chunk 在当前 build 里，nginx 没收到这次脚本请求，读者 2 秒后已在 /zh-hant/cast 正常起卦、登录（打开首页即切换语言时被取消的加载）。boundary「TypeError: Load failed」1 条（18:46 /zh-hant/account，iOS 18.7 Safari）→ 噪音：global-error 自动刷新（36291c5）生效，读者随即正常看 services/self、reading。
- 服务端 ops_events：无任何 fail/error 类事件。journalctl 无 error；nginx 无 5xx。当前 build qjbq45HAnZfBZnRSjV7xi（11-08 17:11 UTC，其他会话部署）。
- 定时任务：backup 11-08 18:00 OFFSITE_OK；fulfill/recover-offer/campaigns/report-mend/checks/headsup（failed 0）/revisit/insight/digest/promo-stats 无失败。
- 结论：过去 15 小时没有新 bug，未改代码、未部署。【待 Neil】support_auto（Anthropic 余额）、卦页 React #418 偶发仍待定。

## 2026-11-09 18:40（台北）· 看 11-09 01:40 – 10:41 UTC（约 9 小时）
- 浏览器报错 1 条 / 1 人：boundary「TypeError: Load failed」（06:07 /zh-hant/account，iOS 18.7 Safari，同上午那位读者）→ 噪音：global-error 自动刷新（36291c5）生效，3 秒内 account 重新加载成功，随后继续看 reading。
- 服务端 ops_events：无 fail/error 类事件。journalctl 无 error；yaoflow 01:55 由其他会话重启（当前 build oL7QRS02nRvQZdfsvwIKk，active）；nginx 今天无 5xx。
- 定时任务：fulfill 探针 siliconflow 偶发超时（10:40 前后 2 次，其余均 ok，deepseek/ark 正常）→ 基线噪音；digest 00:00 发出 ok；headsup failed 0；recover-offer/campaigns/report-mend/checks/revisit/insight 无失败；backup 11-08 18:00 OFFSITE_OK。
- 结论：过去 9 小时没有新 bug，未改代码、未部署。【待 Neil】support_auto（Anthropic 余额）、卦页 React #418 偶发仍待定。

## 2026-11-10 09:40（台北）· 看 11-09 10:41 – 11-10 01:41 UTC（约 15 小时）
- 浏览器报错：0 条（同期 events 正常：page_view 812、heat_click 1096 等，采集在工作）。
- 服务端 ops_events：无 fail/error 类事件。journalctl 无 error；yaoflow active，build 仍为 oL7QRS02nRvQZdfsvwIKk（期间无重启/部署）；nginx 无 5xx。
- 定时任务：fulfill 探针 siliconflow 偶发超时 4 次（其余均 ok，deepseek/ark 正常）→ 基线噪音；headsup day/week failed 0；revisit/insight（11-09 mailed）/promo-stats/campaigns/report-mend/recover-offer/checks 无失败；backup 11-09 18:00 OFFSITE_OK；digest 为每周一，11-09 已发 ok。
- 结论：过去 15 小时没有新 bug，未改代码、未部署。【待 Neil】support_auto（Anthropic 余额）、卦页 React #418 偶发仍待定。

## 2026-11-10 18:40（台北）· 看 11-10 01:41 – 10:41 UTC（约 9 小时）
- 浏览器报错 1 条 / 1 人：React #418 text body（10:00 /zh-hant/reading，Android 10 · Chrome 157，nl=zh-HK late）→ 基线噪音（同类 zh-hant reading 安卓 Chrome #418，仍归入「卦页 React #418 偶发」待定项）。同期 events 正常（page_view 449、heat_click 852、jiaobei 306）。
- 服务端 ops_events：无 fail/error 类事件。journalctl 无 error；yaoflow 07:29 由其他会话重启（当前 build LYYVH2T-5ogpAZHcCUt8p，active）；nginx 今天无 5xx。
- 定时任务：fulfill 探针三家均 ok，仅 4 次偶发超时 → 基线噪音；headsup failed 0；report-mend/checks/campaigns/recover-offer/revisit 无失败；insight 11-09 mailed；backup 11-09 18:00 OFFSITE_OK。
- 结论：过去 9 小时没有新 bug，未改代码、未部署。【待 Neil】support_auto（Anthropic 余额）、卦页 React #418 偶发仍待定。

## 2026-11-11 09:40（台北）· 看 11-10 10:41 – 11-11 01:41 UTC（约 15 小时）
- 浏览器报错：0 条（同期 events 正常：page_view 613、heat_click 989、cast_complete 139，采集在工作）。
- 服务端 ops_events：tarot_personal_fail 3（14:15 cust 510 单张牌，3 轮都是「cards」——模型给的逐牌行数不等于 1）→ 14:15:51 第 4 次请求首稿即成功，personal_json 已存，读者 31 秒内拿到解读，噪音（同 10-22/10-23/10-26 的 cards 偶发；若想省掉重写，可考虑单张牌时把多行 cards 合并成一行——属解读生成逻辑，留给 Neil/开发会话决定，不自动改）；thread_model_fail 1（15:06:41 thread_deadline，yaoflow 15:06:32 刚被其他会话重启，冷启动超时，已改用规则归类）→ 噪音。journalctl 无 error；yaoflow 12:12、15:06 由其他会话重启（当前 build XaHFnHb15TEYCWFmOR-To，active）；nginx 无 5xx。
- 定时任务：fulfill 探针正常；headsup failed 0；report-mend/checks/campaigns/recover-offer/revisit/insight/promo-stats 无失败；backup 11-10 18:00 OFFSITE_OK。
- 结论：过去 15 小时没有新 bug，未改代码、未部署。【待 Neil】support_auto（Anthropic 余额）、卦页 React #418 偶发仍待定。

## 2026-11-11 18:40（台北）· 看 11-11 01:41 – 10:41 UTC（约 9 小时）
- 浏览器报错 7 条 / 5 人：res:SCRIPT webpack-46bca 3 条 + res:LINK tc.css 1 条（02:57、03:23、03:31 /zh-hant、/zh-hant/cast，无 UA，访客号同前缀 n0ja7c6z*）→ 噪音：同一秒 nginx 只有 Google-AdWords-Express / Google 广告审核爬虫（74.125.215.x、66.102.7.x）在抓 /zh-hant 与 cast?c=ads-love，无真人。ChunkLoadError chunk 1386（07:24 /zh/proof/2101，Windows Chrome 155）→ 噪音：来源 74.179.67.139（Azure），referer 是回访信的 /api/revisit/outcome 链接，8 秒内连抓页面+全部 footer 链接，邮件服务商扫描链接。ChunkLoadError tarot/cards page-97f9920c 2 条 1 人（08:27 Windows Chrome 144，14.116.239.96 广东电信，同 IP 早先还以 Chrome 105 出现）→ 噪音：chunk 在当前 build 里，nginx 在报错后 1 秒照常回 200，访客无其他浏览事件（跨境网络/抓取）。同期 events 正常（page_view 370、heat_click 659、jiaobei 206）。
- 服务端 ops_events：无 fail/error 类事件。journalctl 无 error；yaoflow active，build 仍为 XaHFnHb15TEYCWFmOR-To（期间无重启/部署）；nginx 无 5xx。
- 定时任务：fulfill 探针 1 次超时 → 基线噪音；headsup day/week failed 0；revisit/report-mend/checks/campaigns/recover-offer/promo-stats 无失败；insight 11-10 mailed；backup 11-10 18:00 OFFSITE_OK。
- 结论：过去 9 小时没有新 bug，未改代码、未部署。【待 Neil】support_auto（Anthropic 余额）、卦页 React #418 偶发仍待定。
