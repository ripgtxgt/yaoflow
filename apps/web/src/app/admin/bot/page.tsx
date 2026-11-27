import { cookies } from "next/headers";
import { ADMIN_COOKIE, isAdmin } from "@/lib/admin-auth";
import { homeMinute } from "@/lib/clock";
import { featureState } from "@/lib/features";
import {
  autoOn, autoSchedule, botActivity, lastBotCall, listPosts, listTasks, notesFor, PLATFORM_ZH, recentReplies, REPLY_DAILY_CAP, repliesToday, STATUS_ZH,
  type BotPost, type BotPlatform,
} from "@/lib/ops-bot";
import { AdminLogin, AdminShell, Legend, Section } from "../ui";

export const dynamic = "force-dynamic";

/**
 * 11-27 社媒运营 bot：bot 交来的稿件在这里批准（定发布时间）、退回或写批注；派任务给它；看它发了什么、回了几条帖、汇报了什么。
 * 回帖不逐条审（按 bot 规范自动回，check_reply 把关），这里只看记录。
 */
const LANG_ZH = { "zh-hant": "繁體", zh: "简体" } as const;
/** 给 datetime-local 的台北时间默认值 */
const local = (ms: number) => new Date(ms + 8 * 3_600_000).toISOString().slice(0, 16);

export default async function BotPage({ searchParams }: { searchParams: Promise<{ key?: string; denied?: string; done?: string; failed?: string }> }) {
  const sp = await searchParams;
  if (!(await isAdmin((await cookies()).get(ADMIN_COOKIE)?.value, sp.key))) return <AdminLogin denied={sp.denied === "1"} back="/admin/bot" />;
  const now = Date.now();
  autoSchedule(now); // 页面打开时也扫一遍待审，之前交的稿一样自动排
  const review = listPosts(["review", "rejected"], 100);
  const approved = listPosts("approved", 100);
  const recent = listPosts(["posted", "failed"], 40);
  const tasks = listTasks(undefined, 40);
  const today = repliesToday(now);
  const replies = recentReplies(60);
  const activity = botActivity(300);
  const reports = activity.filter((a) => a.action.startsWith("report")).slice(0, 20);
  // 11-27：叫醒 bot 的结果（成功／401 等）要在后台直接看得到
  const wakes = activity.filter((a) => a.action.startsWith("wake"));
  const wakeOf = (ref: string) => wakes.find((w) => w.ref === ref);
  const wakeText = (w: { action: string; detail: string } | undefined) => {
    if (!w) return null;
    let d: { status?: number; error?: string; reason?: string } = {};
    try { d = JSON.parse(w.detail); } catch { /* raw */ }
    return w.action === "wake" ? { ok: true, text: `已叫醒（${d.status ?? "ok"}）` } : { ok: false, text: `没叫醒：${d.error ?? d.reason ?? w.detail}` };
  };
  const last = lastBotCall();
  const configured = { mcp: (process.env.BOT_MCP_TOKEN ?? "").length >= 32, webhook: !!process.env.BOT_WEBHOOK_URL };
  const input = "bg-transparent border border-black/20 rounded-[2px] px-2 py-1.5";
  const btn = "px-2 py-1 rounded-[2px] border border-black/30";
  const head = (p: BotPost) => (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <span className="font-medium">{p.title}</span>
      <span className="text-xs opacity-60">{PLATFORM_ZH[p.platform]} · {LANG_ZH[p.lang]}</span>
      <span className={`text-xs ${p.status === "failed" || p.status === "rejected" ? "text-[var(--cinnabar)]" : "opacity-60"}`}>{STATUS_ZH[p.status]}</span>
    </div>
  );

  return (
    <AdminShell title="社媒运营 bot" nav={[{ href: "#review", label: `待审 ${review.filter((p) => p.status === "review").length}` }, { href: "#approved", label: `待发 ${approved.length}` }, { href: "#recent", label: "已发" }, { href: "#tasks", label: "派任务" }, { href: "#replies", label: "回帖" }, { href: "#reports", label: "bot 汇报" }]}>
      {sp.done && <p className="text-sm mb-6 text-emerald-700">{sp.done}</p>}
      {sp.failed && <p className="text-sm mb-6 text-[var(--cinnabar)]">{sp.failed}</p>}
      <p className="text-xs opacity-70 mb-8">
        bot 入口 {featureState("ops-bot") === "off" ? "已关（功能开关 ops-bot）" : "开着"} · 令牌 {configured.mcp ? "已配" : "未配（BOT_MCP_TOKEN）"} · 唤醒网址 {configured.webhook ? "已配" : "未配（BOT_WEBHOOK_URL，派任务后 bot 要等下次例行运行才看到）"} · bot 最近一次来 {last ? homeMinute(last) : "还没来过"}
      </p>

      <Section id="review" title="待审" sub="批准时定发布时间（台北时间）；退回或写批注叫它改">
        {review.length === 0 ? <p className="text-sm opacity-50">没有。</p> : (
          <div className="space-y-4">
            {review.map((p) => {
              const notes = notesFor(p.id);
              return (
                <div key={p.id} className="border border-black/10 rounded-[2px] p-3 text-sm">
                  {head(p)}
                  <pre className="whitespace-pre-wrap font-[inherit] mt-2 leading-relaxed">{p.body}</pre>
                  {p.media_notes && <p className="text-xs opacity-60 mt-2 whitespace-pre-wrap">配图：{p.media_notes}</p>}
                  {p.rationale && <p className="text-xs opacity-60 mt-1">依据：{p.rationale}</p>}
                  {p.status === "review" && p.decided_reason && <p className="text-xs text-[var(--cinnabar)] mt-1">{p.decided_reason}</p>}
                  <p className="text-xs opacity-50 mt-1">交于 {homeMinute(p.created_at)}{p.suggested_at ? ` · 建议 ${homeMinute(p.suggested_at)}` : ""}{p.text_version > 1 ? ` · 第 ${p.text_version} 版` : ""}</p>
                  {notes.length > 0 && <ul className="text-xs mt-2 space-y-0.5">{notes.map((n) => <li key={n.id} className={n.resolved ? "opacity-50" : ""}>{n.author === "bot" ? "bot：" : "批注："}{n.body}</li>)}</ul>}
                  <div className="flex flex-wrap gap-4 mt-3 text-xs">
                    <form method="post" action="/api/admin/bot" className="flex flex-wrap items-center gap-2">
                      <input type="hidden" name="op" value="approve" /><input type="hidden" name="id" value={p.id} />
                      <input type="datetime-local" name="when" required defaultValue={local(Math.max(p.suggested_at ?? 0, now + 15 * 60_000))} className={input} />
                      <button className={`${btn} border-[var(--cinnabar)] text-[var(--cinnabar)]`}>批准</button>
                    </form>
                    <details>
                      <summary className="cursor-pointer underline underline-offset-2 opacity-60">批注／退回</summary>
                      <form method="post" action="/api/admin/bot" className="mt-2 flex flex-col gap-2 max-w-md">
                        <input type="hidden" name="op" value="note" /><input type="hidden" name="id" value={p.id} />
                        <textarea name="body" required rows={3} placeholder="哪里要改" className={input} />
                        <label className="flex items-center gap-1.5"><input type="checkbox" name="ask" value="yes" defaultChecked /> 退回并叫 bot 改</label>
                        <button className={btn}>写批注</button>
                      </form>
                      <form method="post" action="/api/admin/bot" className="mt-2 flex flex-wrap items-center gap-2">
                        <input type="hidden" name="op" value="reject" /><input type="hidden" name="id" value={p.id} />
                        <input name="reason" required minLength={2} placeholder="不要了的理由" className={input} />
                        <button className={btn}>直接退回（不用改）</button>
                      </form>
                    </details>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Section>

      <Section id="approved" title="已批准，等着发" sub={autoOn() ? "自动放行开着：检查全过的稿自动排进空档，标「自动放行」的发出前随时可以撤回" : "到点前 10 分钟 bot 就能领到"}>
        {approved.length === 0 ? <p className="text-sm opacity-50">没有。</p> : (
          <div className="space-y-2">
            {approved.map((p) => (
              <div key={p.id} className="border border-black/10 rounded-[2px] p-3 text-sm">
                {head(p)}
                <p className="text-xs mt-1"><span className="text-[var(--gold)]">{homeMinute(p.scheduled_at!)}</span> 发{p.decided_reason === "自动放行" ? " · 自动放行" : ""} · {p.body.slice(0, 80)}{p.body.length > 80 ? "…" : ""}</p>
                <form method="post" action="/api/admin/bot" className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                  <input type="hidden" name="op" value="unschedule" /><input type="hidden" name="id" value={p.id} />
                  <input name="reason" required minLength={2} placeholder="撤回的理由" className={input} />
                  <button className={btn}>撤回到待审</button>
                </form>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section id="recent" title="最近发出／没发出去的">
        {recent.length === 0 ? <p className="text-sm opacity-50">还没有。</p> : (
          <table className="w-full text-xs">
            <tbody>
              {recent.map((p) => (
                <tr key={p.id} className="border-t border-black/5 align-top">
                  <td className="py-1.5 pr-3 whitespace-nowrap">{homeMinute(p.posted_at ?? p.updated_at)}</td>
                  <td className="pr-3 whitespace-nowrap">{p.platform} · {LANG_ZH[p.lang]}</td>
                  <td className="pr-3">{p.external_url ? <a href={p.external_url} className="underline underline-offset-2" target="_blank" rel="noreferrer">{p.title}</a> : p.title}</td>
                  <td className={p.status === "failed" ? "text-[var(--cinnabar)]" : ""}>{p.status === "failed" ? `没发出去：${p.error ?? ""}` : "已发"}</td>
                  {p.status === "failed" && (
                    <td>
                      <form method="post" action="/api/admin/bot" className="flex gap-1">
                        <input type="hidden" name="op" value="approve" /><input type="hidden" name="id" value={p.id} />
                        <input type="datetime-local" name="when" required defaultValue={local(now + 15 * 60_000)} className={input} />
                        <button className={btn}>再排一次</button>
                      </form>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      <Section id="tasks" title="派任务" sub="派出去会马上叫醒 bot（唤醒网址配了的话）">
        <form method="post" action="/api/admin/bot" className="flex flex-col gap-2 max-w-xl text-sm mb-6">
          <input type="hidden" name="op" value="task" />
          <input name="title" required minLength={2} placeholder="标题，例：12 月第一周 Threads 繁簡各 14 条" className={input} />
          <textarea name="brief" required minLength={5} rows={4} placeholder="要写什么、给谁看、要注意什么" className={input} />
          <div className="flex flex-wrap gap-3 text-xs">
            {(Object.keys(PLATFORM_ZH) as BotPlatform[]).map((x) => <label key={x} className="flex items-center gap-1.5"><input type="checkbox" name="platforms" value={x} defaultChecked={x === "threads"} /> {PLATFORM_ZH[x]}</label>)}
          </div>
          <label className="text-xs flex items-center gap-2">截止（可不填） <input type="datetime-local" name="due" className={input} /></label>
          <button className={`${btn} self-start`}>派给 bot</button>
        </form>
        {tasks.length > 0 && (
          <table className="w-full text-xs">
            <tbody>
              {tasks.map((t) => (
                <tr key={t.id} className="border-t border-black/5 align-top">
                  <td className="py-1.5 pr-3 whitespace-nowrap">{homeMinute(t.created_at)}</td>
                  <td className="pr-3">{t.title}<span className="block opacity-50">{t.brief.slice(0, 120)}</span></td>
                  <td className="pr-3 whitespace-nowrap">{{ open: "待做", in_progress: "在做", submitted: "已交稿", done: "完成", cancelled: "取消" }[t.status]}{(() => { const w = wakeText(wakeOf(t.id)); return w && <span className={`block text-xs ${w.ok ? "opacity-50" : "text-[var(--cinnabar)]"}`}>{w.text}</span>; })()}</td>
                  <td>
                    {t.status !== "done" && t.status !== "cancelled" && (
                      <form method="post" action="/api/admin/bot" className="flex gap-1">
                        <input type="hidden" name="op" value="task_status" /><input type="hidden" name="id" value={t.id} />
                        <select name="status" className={input}><option value="done">完成</option><option value="cancelled">取消</option></select>
                        <button className={btn}>改</button>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      <Section id="replies" title="回帖" sub={`今天：${(Object.keys(today) as BotPlatform[]).map((p) => `${p} ${today[p]}／${REPLY_DAILY_CAP[p]}`).join(" · ")}`}>
        {replies.length === 0 ? <p className="text-sm opacity-50">还没有。</p> : (
          <table className="w-full text-xs">
            <tbody>
              {replies.map((r, i) => (
                <tr key={i} className="border-t border-black/5 align-top">
                  <td className="py-1.5 pr-3 whitespace-nowrap">{homeMinute(r.created_at)}</td>
                  <td className="pr-3 whitespace-nowrap">{r.platform} · {LANG_ZH[r.lang]}{r.has_link ? " · 带链接" : ""}</td>
                  <td className="pr-3"><a href={r.target_url} className="underline underline-offset-2 opacity-60" target="_blank" rel="noreferrer">{r.target_excerpt || "原帖"}</a><span className="block">{r.body}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <Legend>回帖不逐条审：bot 每条先过检查（不放链接、不提站名、不提 AI、不碰生死疾病投资赌博、对方有轻生字眼就跳过、每天名额、同一帖 24 小时最多两次），过了才发，发了才登记在这里。看到不妥的，在「派任务」里写一条规矩给它，或者关掉功能开关 ops-bot 让它整个停下。</Legend>
      </Section>

      <Section id="reports" title="bot 汇报" sub={(() => { const w = wakes[0]; const t = wakeText(w); return w && t ? `最近一次叫醒 ${homeMinute(w.at)}：${t.text}` : "还没叫醒过"; })()}>
        {reports.length === 0 ? <p className="text-sm opacity-50">还没有。</p> : (
          <ul className="text-sm space-y-2">
            {reports.map((r, i) => {
              let body = r.detail;
              try { body = String((JSON.parse(r.detail) as { body?: string }).body ?? r.detail); } catch { /* raw */ }
              return <li key={i} className={r.action === "report_problem" ? "text-[var(--cinnabar)]" : ""}><span className="text-xs opacity-50 mr-2">{homeMinute(r.at)}</span>{body}</li>;
            })}
          </ul>
        )}
      </Section>
    </AdminShell>
  );
}
