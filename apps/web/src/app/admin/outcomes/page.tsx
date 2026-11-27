import { cookies } from "next/headers";
import { hexagramByNumber } from "@yaoflow/engine";
import { ADMIN_COOKIE, isAdmin } from "@/lib/admin-auth";
import { allRecords, casesWithoutWindow, outcomePreview, outcomeRecordsOn, outcomeTotals, type OutcomeRecord, type OutcomeTotals } from "@/lib/outcome-records";
import { hexName } from "@/lib/names";
import { casePath } from "@/lib/cases";
import { asLocale, LOCALES } from "@/lib/locales";
import { homeDay, homeMinute } from "@/lib/clock";
import { TOPIC_NAMES, type Topic } from "@/lib/topic";
import { AdminLogin, AdminShell, Legend, Section, Stat } from "../ui";
import { checkpointStats } from "@/lib/db";
import { eventWord, leanWord, OUTCOME_ZH, OUTCOMES, recordsToCheck } from "@/lib/content-admin";
import { OutcomeSite, publicTotals } from "../outcome-site";

export const dynamic = "force-dynamic";

/**
 * 应验记录 (进度表 28 — Neil 10-02: 「后台加一个预览页，看每一卦攒了几条应了、几条没应。我每周看一次」).
 * 10-23 (Neil: 「为什么我看到的还是这个呢」): it was still the 10-02 preview — its own 「总数」 in its own words (不算对错、
 * 未到) — while the dashboard and /outcomes had moved on. Now one record everywhere: the page opens with the whole site's
 * figures (./outcome-site.tsx — the same block as the dashboard, read by the same function as the top line of /outcomes),
 * then the public cases counted by /outcomes' own function (lib/outcome-records.ts tallyRecords) in its own words —
 * 应期已过／应了／部分／没应／不确定／还没定／未回报／已到期待问／应期未到 — per language and per hexagram alike.
 */

const topicZh = (t: string | null) => TOPIC_NAMES[(t && t in TOPIC_NAMES ? t : "other") as Topic].zh;
/** the languages with a page of their own at /outcomes; the others' records show on the 卦页, 卦例页 and /timing only */
const OUTCOMES_PAGE = new Set(["zh-hant", "zh"]);

function RecordLine({ r }: { r: OutcomeRecord }) {
  const p = hexagramByNumber(r.primary);
  const ch = r.changed ? hexagramByNumber(r.changed) : null;
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-t border-black/5 pt-2 text-sm">
      <span className={`text-xs ${r.state === "hit" ? "text-[var(--cinnabar)]" : r.state === "miss" ? "" : "opacity-40"}`}>{OUTCOME_ZH[r.state]}</span>
      <span className="opacity-50 tabular-nums text-xs">{r.reportedAt ? homeDay(r.reportedAt) : "—"}</span>
      <span className="opacity-50 text-xs">{r.locale}</span>
      <span>{hexName(p, "zh")}{ch ? ` → ${hexName(ch, "zh")}` : ""}</span>
      <span className="opacity-50 text-xs">{topicZh(r.topic)}</span>
      <a className="underline underline-offset-2" href={casePath(asLocale(r.locale), r.publicId)} target="_blank" rel="noreferrer">{r.framing ?? <span className="opacity-40">（没写公开说法）</span>}</a>
      {r.window && <span className="opacity-60 text-xs basis-full">应期：{r.window}</span>}
    </div>
  );
}

/** /outcomes' second line, word for word and in its order (app/[locale]/outcomes/page.tsx `counts`) */
const COLS: { k: keyof OutcomeTotals; zh: string }[] = [
  { k: "due", zh: "应期已过" }, { k: "hit", zh: "应了" }, { k: "partial", zh: "部分" }, { k: "miss", zh: "没应" }, { k: "unclear", zh: "不确定" },
  { k: "open", zh: "还没定" }, { k: "notReported", zh: "未回报" }, { k: "queued", zh: "已到期待问" }, { k: "waiting", zh: "应期未到" },
];

export default async function OutcomesPage({ searchParams }: { searchParams: Promise<{ key?: string; denied?: string; done?: string; failed?: string }> }) {
  const { key, denied, done, failed } = await searchParams;
  if (!(await isAdmin((await cookies()).get(ADMIN_COOKIE)?.value, key))) return <AdminLogin denied={denied === "1"} back="/admin/outcomes" />;

  const on = outcomeRecordsOn();
  const records = allRecords();
  const checks = recordsToCheck();
  const noWindow = casesWithoutWindow();
  const hexes = outcomePreview(records);
  const pub = publicTotals(records);
  const lastReport = records.reduce((m, r) => Math.max(m, r.reportedAt ?? 0), 0);
  const byLocale = LOCALES.map((l) => ({ l, t: outcomeTotals(l, records) })).filter((x) => x.t.due + x.t.waiting + x.t.reported > 0);
  const timingPreview = LOCALES.map((l) => ({
    l,
    rs: records.filter((r) => r.locale === l && r.state !== "pending").sort((a, b) => (b.reportedAt ?? 0) - (a.reportedAt ?? 0)).slice(0, 6),
  })).filter((x) => x.rs.length > 0);
  const subOf: Partial<Record<keyof OutcomeTotals, string>> = {
    due: `回来作答 ${pub.reported} 件`, notReported: "回访寄了没回，或不会再问", queued: "应期过了，回访信还在排队", waiting: "回访日子还没到",
  };

  return (
    <AdminShell
      title={on ? "应验记录" : "应验记录（开关关着：预览）"}
      nav={[{ href: "#site", label: "全站" }, { href: "#public", label: "公开卦例" }, { href: "#check", label: "逐件核对" }, { href: "#hex", label: "按卦" }, { href: "#timing", label: "/timing 列的" }]}
    >
      {done && <p className="text-sm mb-6 text-emerald-700">{done}</p>}
      {failed && <p className="text-sm mb-6 text-[var(--cinnabar)]">{failed}</p>}
      <p className={`text-sm mb-8 ${on ? "opacity-70" : "text-[var(--cinnabar)]"}`}>
        {on
          ? <>开关：开（SHOW_OUTCOME_RECORDS=1）——读者看到的是 <a href="/zh-hant/outcomes" target="_blank" rel="noreferrer" className="underline underline-offset-2">/zh-hant/outcomes</a>、<a href="/zh/outcomes" target="_blank" rel="noreferrer" className="underline underline-offset-2">/zh/outcomes</a>，公开卦例也列在卦页、卦例页和 /timing 上。这一页的数和那里同一套、同一个说法。</>
          : "开关：关——/outcomes 打不开，卦页、卦例页、/timing 上完全不输出这一块（不是藏起来）；下面是打开后会出现的内容。"}
      </p>

      <Section id="site" title="全站" sub="/outcomes 最上面那行：不公开的也算件数 · 不含测试账号 · 最多晚 5 分钟 · 和看板「应验记录」是同一块">
        <OutcomeSite withPublic={false} />
      </Section>

      <Section id="public" title="公开卦例" sub={`/outcomes 第二行：读者自己选择公开、现在仍在线的卦例，繁简两页合计 · 测试账号不算 · 每次打开都是现查的${lastReport ? ` · 最近一条回报 ${homeDay(lastReport)}` : ""}`}>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {COLS.map((c) => <Stat key={c.k} label={c.zh} value={pub[c.k]} sub={subOf[c.k]} />)}
          <Stat label="没有应期的卦例" value={noWindow} sub="轻解读，不会列入" />
        </div>
        {byLocale.length > 0 && (
          <div className="overflow-x-auto mt-4">
            <table className="text-sm tabular-nums">
              <thead><tr className="text-left text-xs opacity-50"><th className="py-1 pr-5 font-normal">语言</th>{COLS.map((c) => <th key={c.k} className="pr-5 font-normal whitespace-nowrap">{c.zh}</th>)}<th className="font-normal">读者页</th></tr></thead>
              <tbody>{byLocale.map(({ l, t }) => (
                <tr key={l} className="border-t border-black/5">
                  <td className="py-1 pr-5">{l}</td>
                  {COLS.map((c) => <td key={c.k} className="pr-5">{t[c.k]}</td>)}
                  <td className="text-xs">{OUTCOMES_PAGE.has(l) ? <a href={`/${l}/outcomes`} target="_blank" rel="noreferrer" className="underline underline-offset-2">/{l}/outcomes</a> : <span className="opacity-40">没有，只列在卦页等</span>}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
        {(() => { const c = checkpointStats(); return (
          <p className="text-xs opacity-60 mt-4">多段应期中途信（10-12 起，所有带邮箱的深断，不只公开卦例；只问那一段有没有动静，不进上面任何一个数）：排了 {c.scheduled} 封 · 已发 {c.sent} · 有动静 {c.seen} · 没动静 {c.none} · 说不准 {c.unsure}</p>
        ); })()}
        <Legend>上面一排和读者页第二行是同一个函数算的、同一套词：/zh-hant/outcomes 只算繁体的公开卦例，/zh/outcomes 只算简体的，这里把两页加在一起，表里分开列（其他语言的公开卦例没有总页，只出现在它自己语言的卦页、卦例页和 /timing 上）。读者回答了的每一条都列出——应了、部分、没应、不确定、还没定——按回报日期倒序，不出现任何百分比。读者撤回卦例，这条随之消失。</Legend>
      </Section>

      {/* 10-23 进度表 108 ②: each answered check-in read against what the reader said; one scored wrong is set right here */}
      <Section id="check" title="逐件核对" sub="公开卦例的回访，已寄出或已回答的 · 最近 150 件 · 读者答的、解读偏向、系统判的放在一起看">
        {checks.length === 0 ? <p className="text-sm opacity-40">还没有。</p> : (
          <div className="space-y-2 text-sm">
            {checks.map((c) => (
              <div key={c.revisitId} className="border-t border-black/5 pt-2">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className={`text-xs ${c.outcome === "hit" ? "text-[var(--cinnabar)]" : c.outcome ? "" : "opacity-40"}`}>{OUTCOME_ZH[c.outcome ?? "pending"]}</span>
                  <span className="opacity-50 tabular-nums text-xs">{c.outcomeAt ? homeDay(c.outcomeAt) : `到期 ${homeDay(c.dueAt)}`}</span>
                  <span className="opacity-50 text-xs">{c.locale}</span>
                  <a className="underline underline-offset-2" href={casePath(asLocale(c.locale), c.publicId)} target="_blank" rel="noreferrer">{c.framing ?? <span className="opacity-40">（没写公开说法）</span>}</a>
                  {c.customerId ? <a className="text-xs underline underline-offset-2 opacity-60" href={`/admin/customers/${c.customerId}`}>#{c.customerId}</a> : null}
                  <span className="text-xs opacity-40">回访 #{c.revisitId}</span>
                </div>
                <p className="text-xs opacity-60 mt-0.5">读者答：{eventWord(c.event) ?? (c.outcome ? "（旧版，只选了结果）" : "还没答")}{leanWord(c.lean) ? ` · ${leanWord(c.lean)}` : ""}{c.timingQuote ? ` · 应期：${c.timingQuote.slice(0, 60)}` : ""}</p>
                <p className="text-xs opacity-40">原问：{c.question}</p>
                {c.fixed && <p className="text-xs text-[var(--gold-text)]">{homeMinute(c.fixed.at)} 改过：{OUTCOME_ZH[(c.fixed.from || "pending") as keyof typeof OUTCOME_ZH] ?? c.fixed.from} → {OUTCOME_ZH[(c.fixed.to || "pending") as keyof typeof OUTCOME_ZH] ?? c.fixed.to}（{c.fixed.reason}）</p>}
                <details className="mt-1">
                  <summary className="cursor-pointer text-xs underline underline-offset-2 opacity-60">改状态</summary>
                  <form method="post" action="/api/admin/content" className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                    <input type="hidden" name="op" value="fix" />
                    <input type="hidden" name="revisit_id" value={c.revisitId} />
                    <input type="hidden" name="back" value="/admin/outcomes#check" />
                    <select name="to" defaultValue={c.outcome ?? "pending"} className="bg-transparent border border-black/20 rounded-[2px] px-2 py-1">
                      {[...OUTCOMES, "pending" as const].map((o) => <option key={o} value={o}>{OUTCOME_ZH[o]}</option>)}
                    </select>
                    <input name="reason" required minLength={2} placeholder="为什么改（进操作记录）" className="bg-transparent border border-black/20 rounded-[2px] px-2 py-1 min-w-[14rem]" />
                    <label className="flex items-center gap-1.5"><input type="checkbox" name="confirm" value="yes" required /> 确认</label>
                    <button className="px-2 py-1 rounded-[2px] border border-black/30">改</button>
                  </form>
                </details>
              </div>
            ))}
          </div>
        )}
        <Legend>系统按读者答的事实（发生了／有动静没成／没发生／还在等）对照解读的偏向打分。看到判错的（例如读者回信补充说其实成了），在这里改；改动记进操作记录（从什么改成什么、为什么），读者页、看板和首页件数马上跟着变。改回「未答」会把这件放回没有结果的状态。</Legend>
      </Section>

      <Section id="hex" title="按卦" sub={`${hexes.length} 个卦有记录 · 一条记录会同时算在本卦和之卦上 · 词和上面一样`}>
        {hexes.length === 0 ? <p className="text-sm opacity-40">还没有。</p> : (
          <div className="space-y-6">
            {hexes.map((h) => (
              <div key={h.hex}>
                <p className="text-sm">
                  <span className="tabular-nums opacity-50 mr-2">{h.hex}</span>{hexName(hexagramByNumber(h.hex), "zh")}
                  <span className="ml-4 text-xs tabular-nums">
                    <span className="text-[var(--cinnabar)]">应了 {h.hit}</span>{h.partial ? ` · 部分 ${h.partial}` : ""} · 没应 {h.miss}{h.unclear ? ` · 不确定 ${h.unclear}` : ""}{h.open ? ` · 还没定 ${h.open}` : ""}
                    <span className="opacity-50">{h.notReported ? ` · 未回报 ${h.notReported}` : ""}{h.queued ? ` · 已到期待问 ${h.queued}` : ""}{h.waiting ? ` · 应期未到 ${h.waiting}` : ""}</span>
                  </span>
                </p>
                {h.shown.length > 0
                  ? <div className="mt-1 space-y-1">{h.shown.map((r) => <RecordLine key={r.publicId} r={r} />)}</div>
                  : <p className="text-xs opacity-40 mt-1">还没有读者回答，卦页上暂时不会出现。</p>}
              </div>
            ))}
          </div>
        )}
        <Legend>每个卦下面列的就是它的卦页显示的（最近 5 条读者回答了的；按语言分别显示）。</Legend>
      </Section>

      <Section id="timing" title="/timing 列的" sub="每种语言最近 6 条读者回答了的">
        {timingPreview.length === 0 ? <p className="text-sm opacity-40">还没有。</p> : timingPreview.map((x) => (
          <div key={x.l} className="mb-4">
            <p className="text-xs opacity-50 mb-1">/{x.l}/timing</p>
            <div className="space-y-1">{x.rs.map((r) => <RecordLine key={r.publicId} r={r} />)}</div>
          </div>
        ))}
      </Section>
    </AdminShell>
  );
}
