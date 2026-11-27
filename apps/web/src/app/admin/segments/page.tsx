import { cookies } from "next/headers";
import { ADMIN_COOKIE, isAdmin } from "@/lib/admin-auth";
import {
  audience, campaign, campaignMail, campaigns, campaignStats, DEFAULT_SEGMENT, PRODUCTS_USED, segmentFrom, segmentLine, segmentOf,
  STANDING_ZH, STANDINGS, unknownMarks, type Campaign, type Recipient, type Segment,
} from "@/lib/campaigns";
import { CURRENCIES, type Currency } from "@/lib/money";
import { homeMinute } from "@/lib/clock";
import { AdminLogin, AdminShell, Legend, Section, Stat } from "../ui";

export const dynamic = "force-dynamic";

/**
 * 10-23 进度表 107 ③ 分群与群发 — the 10-23 announcement made into a page: 圈人 (a GET form; the count is read fresh on every
 * load, after the fixed exclusions) → 写信 (繁體, 简体 optional) → 预览 (the letter as real readers of this group get it)
 * → 先寄自己 → 排时间 → batches by the 10-minute cron. Server-rendered only, like every admin page. No address is shown.
 */
const SKIP_ZH: Record<string, string> = {
  internal_or_test: "我们自己／测试帐号", bounced_or_complained: "退信或投诉过", unsubscribed: "退订了", consent_region: "要先同意的地区、没同意", bad_address: "地址不对",
};
const STATUS_ZH: Record<Campaign["status"], string> = { draft: "草稿", scheduled: "已排，等时间", sending: "寄送中", done: "寄完", stopped: "停了" };
const STATUS_TONE: Record<Campaign["status"], string> = { draft: "opacity-60", scheduled: "text-amber-700", sending: "text-emerald-700", done: "", stopped: "text-[var(--cinnabar)]" };

type SP = { key?: string; denied?: string; id?: string; done?: string; failed?: string; standing?: string; days?: string; locale?: string; currency?: string; product?: string };

function counts<T extends string>(xs: T[]): [T, number][] {
  const m = new Map<T, number>();
  for (const x of xs) m.set(x, (m.get(x) ?? 0) + 1);
  return [...m].sort((a, b) => b[1] - a[1]);
}

/** up to four readers of different kinds, to preview the letter as each gets it (their address is not used) */
function sampleReaders(rs: Recipient[]): { label: string; r: Recipient }[] {
  const seen = new Set<string>();
  const out: { label: string; r: Recipient }[] = [];
  for (const r of rs) {
    const k = `${r.locale}|${r.member}|${r.pass}|${r.paid}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ label: [r.locale === "zh" ? "简体" : "繁体", r.member ? "会员" : null, r.pass ? "通卡在用" : null, !r.member && !r.pass ? (r.paid ? "付过钱" : "没付过钱") : null, r.currency].filter(Boolean).join(" · "), r: { ...r, email: "reader@example.com" } });
    if (out.length === 4) break;
  }
  if (out.length) return out;
  const fake = (locale: "zh-hant" | "zh", currency: Currency, member: boolean, pass: boolean, paid: boolean): Recipient => ({ email: "reader@example.com", customerId: 0, locale, currency, member, pass, paid });
  return [
    { label: "繁体 · 会员 · 通卡在用 · TWD（这一群现在没人，用样本）", r: fake("zh-hant", "TWD", true, true, true) },
    { label: "简体 · 没付过钱 · CNY（样本）", r: fake("zh", "CNY", false, false, false) },
  ];
}

export default async function SegmentsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  if (!(await isAdmin((await cookies()).get(ADMIN_COOKIE)?.value, sp.key))) return <AdminLogin denied={sp.denied === "1"} back="/admin/segments" />;
  const site = (process.env.SITE_URL ?? "https://yaoflow.com").replace(/\/$/, "");
  const c = Number(sp.id) ? campaign(Number(sp.id)) : null;
  const picked = sp.standing != null || sp.locale != null || sp.currency != null || sp.product != null;
  const seg: Segment = picked ? segmentFrom(sp as Record<string, unknown>) : c ? segmentOf(c) : DEFAULT_SEGMENT;
  const aud = audience(seg);
  const cSeg = c ? segmentOf(c) : null;
  const cAud = c && cSeg ? (JSON.stringify(cSeg) === JSON.stringify(seg) ? aud : audience(cSeg)) : null;
  const n = aud.recipients.length;
  const editable = !c || c.status === "draft";
  const marks = c ? [...new Set([...unknownMarks(c.body_hant), ...unknownMarks(c.body_hans ?? ""), ...unknownMarks(c.subject_hant)])] : [];
  const list = campaigns(50);
  const sel = "bg-transparent border border-black/20 rounded-[2px] px-2 py-1.5";
  const input = "w-full bg-transparent border border-black/20 rounded-[2px] px-3 py-2 outline-none focus:border-black/60";
  const segHidden = (s: Segment) => (
    <>
      <input type="hidden" name="standing" value={s.standing} />
      <input type="hidden" name="days" value={s.days ?? ""} />
      <input type="hidden" name="locale" value={s.locale} />
      <input type="hidden" name="currency" value={s.currency} />
      <input type="hidden" name="product" value={s.product} />
    </>
  );

  return (
    <AdminShell title="分群群发" nav={[{ href: "#who", label: "圈人" }, { href: "#write", label: "写信" }, ...(c ? [{ href: "#preview", label: "预览" }, { href: "#send", label: "寄出" }] : []), { href: "#record", label: "群发记录" }]}>
      {sp.done && <p className="text-sm mb-6 text-emerald-700">{sp.done}</p>}
      {sp.failed && <p className="text-sm mb-6 text-[var(--cinnabar)]">{sp.failed}</p>}

      <Section id="who" title="圈人" sub="每次打开现算 · 固定排除：我们自己和测试帐号、退信或投诉过的、退订的、要先同意的地区没同意的">
        <form method="get" action="/admin/segments" className="flex flex-wrap items-end gap-3 text-sm mb-5">
          {c && <input type="hidden" name="id" value={c.id} />}
          <label className="flex flex-col gap-1"><span className="text-xs opacity-50">是谁</span>
            <select name="standing" defaultValue={seg.standing} className={sel}>{STANDINGS.map((s) => <option key={s} value={s}>{STANDING_ZH[s]}</option>)}</select>
          </label>
          <label className="flex flex-col gap-1"><span className="text-xs opacity-50">N 天（到期／没回来）</span>
            <input name="days" type="number" min={1} max={365} defaultValue={seg.days ?? ""} placeholder={seg.standing === "pass_ending" ? "3" : "30"} className={`${sel} w-24`} />
          </label>
          <label className="flex flex-col gap-1"><span className="text-xs opacity-50">语言</span>
            <select name="locale" defaultValue={seg.locale} className={sel}><option value="all">全部</option><option value="zh-hant">繁体</option><option value="zh">简体</option></select>
          </label>
          <label className="flex flex-col gap-1"><span className="text-xs opacity-50">币别</span>
            <select name="currency" defaultValue={seg.currency} className={sel}><option value="all">全部</option>{CURRENCIES.map((x) => <option key={x} value={x}>{x}</option>)}</select>
          </label>
          <label className="flex flex-col gap-1"><span className="text-xs opacity-50">用过哪个产品</span>
            <select name="product" defaultValue={seg.product} className={sel}><option value="all">不限</option>{Object.entries(PRODUCTS_USED).map(([k, p]) => <option key={k} value={k}>{p.name}</option>)}</select>
          </label>
          <button className="px-3 py-1.5 rounded-[2px] border border-black/30">看人数</button>
        </form>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat label={segmentLine(seg)} value={n} sub="能寄的人（一个信箱算一次）" good={n > 0} />
          <Stat label="繁体／简体" value={`${aud.recipients.filter((r) => r.locale === "zh-hant").length} / ${aud.recipients.filter((r) => r.locale === "zh").length}`} sub="简体版不写就由繁体自动转" />
          <Stat label="会员／通卡在用" value={`${aud.recipients.filter((r) => r.member).length} / ${aud.recipients.filter((r) => r.pass).length}`} sub={`付过钱 ${aud.recipients.filter((r) => r.paid).length} · 没付过钱 ${aud.recipients.filter((r) => !r.paid).length}`} />
          <Stat label="排除掉的" value={Object.values(aud.skipped).reduce((a, b) => a + b, 0)} sub={Object.entries(aud.skipped).map(([k, v]) => `${SKIP_ZH[k] ?? k} ${v}`).join(" · ") || "—"} />
        </div>
        <p className="text-xs opacity-60 mt-3">按币别：{counts(aud.recipients.map((r) => r.currency)).map(([k, v]) => `${k} ${v}`).join(" · ") || "—"}</p>
        <Legend>币别取这个人最近一次付钱用的；没付过的按他的时区与地区猜（和结账页一样）。「只买过一次、N 天没回来」= 付过一次钱、不是会员也没有通卡在用、N 天（默认 30）没上站。「通卡 N 天内到期」不含会员（默认 3 天）。「用过哪个产品」按帐号算，没登录时用的不算。</Legend>
      </Section>

      <Section id="write" title={c ? `写信 · #${c.id}「${c.name}」` : "写信 · 新的一封"} sub={c ? `${STATUS_ZH[c.status]} · 存于 ${homeMinute(c.updated_at)}` : undefined}>
        {editable ? (
          <form method="post" action="/api/admin/campaigns" className="space-y-3 max-w-3xl">
            <input type="hidden" name="op" value="save" />
            {c && <input type="hidden" name="id" value={c.id} />}
            {segHidden(seg)}
            <p className="text-xs opacity-60">寄给：<span className="opacity-100">{segmentLine(seg)}（现在 {n} 人）</span>— 换人就改上面的条件、按「看人数」，再存一次。</p>
            <div className="flex flex-wrap gap-3">
              <label className="flex-1 min-w-[12rem]"><span className="text-xs opacity-50">名称（只在后台看得到）</span><input name="name" defaultValue={c?.name ?? ""} placeholder="例：11 月会员续订提醒" className={input} /></label>
              <label className="w-36"><span className="text-xs opacity-50">每 10 分钟最多</span><input name="per_run" type="number" min={10} max={400} defaultValue={c?.per_run ?? 150} className={input} /></label>
            </div>
            <label className="block"><span className="text-xs opacity-50">主旨（繁體）</span><input name="subject_hant" required defaultValue={c?.subject_hant ?? ""} className={input} /></label>
            <label className="block"><span className="text-xs opacity-50">正文（繁體）</span><textarea name="body_hant" required rows={16} defaultValue={c?.body_hant ?? ""} className={`${input} font-[inherit] leading-relaxed`} /></label>
            <details className="text-sm" open={!!(c?.subject_hans || c?.body_hans)}>
              <summary className="cursor-pointer text-xs opacity-60">简体版（不写就由繁体自动转）</summary>
              <label className="block mt-2"><span className="text-xs opacity-50">主旨（简体）</span><input name="subject_hans" defaultValue={c?.subject_hans ?? ""} className={input} /></label>
              <label className="block mt-2"><span className="text-xs opacity-50">正文（简体）</span><textarea name="body_hans" rows={12} defaultValue={c?.body_hans ?? ""} className={`${input} font-[inherit] leading-relaxed`} /></label>
            </details>
            <button className="px-4 py-2 rounded-[2px] bg-[var(--ink)] text-[var(--paper)] text-sm">{c ? "存（改过要再寄一次测试信）" : "存成草稿"}</button>
            <Legend>
              写法：空一行＝分段；行首「- 」＝列表；**两边两个星号**＝粗体；网址自动变连结。信尾自动加「爻流 YaoFlow 客服」署名和一键退订。<br />
              价格按读者的币别填：{"{1日通卡}"}（第二张起）{"{1日通卡首张}"} {"{7天通卡}"} {"{30天通卡}"} {"{会员月费}"} {"{会员首月}"}（繁体写法也认）。<br />
              只给某些人看的段落：【只给会员】……【/只给】，可用 会员／通卡／非会员／付过钱／没付过钱。不认得的记号会在预览上方标红，排不上。<br />
              用词照规矩：不写「準」「AI」「靈驗」「神明說」，不下吉凶断语，不说化解／改运。
            </Legend>
          </form>
        ) : (
          <div className="max-w-3xl text-sm space-y-2">
            <p className="text-xs opacity-60">已经排上或寄出的信不能改；要改就复制成新草稿。寄给：{segmentLine(cSeg!)}</p>
            <p>主旨：{c!.subject_hant}</p>
            <pre className="whitespace-pre-wrap text-sm leading-relaxed border border-black/10 rounded-[2px] p-3 font-[inherit]">{c!.body_hant}</pre>
            <form method="post" action="/api/admin/campaigns"><input type="hidden" name="op" value="copy" /><input type="hidden" name="id" value={c!.id} /><button className="px-3 py-1.5 rounded-[2px] border border-black/30 text-sm">复制成新草稿</button></form>
          </div>
        )}
      </Section>

      {c && cAud && (
        <Section id="preview" title="预览" sub="这一群里不同的人各收到什么（地址不显示；信尾的公司地址寄出时才加）">
          {marks.length > 0 && <p className="text-sm mb-4 text-[var(--cinnabar)]">看不懂的记号：{marks.join("、")} — 改掉才排得上。</p>}
          <div className="grid md:grid-cols-2 gap-4">
            {sampleReaders(cAud.recipients).map(({ label, r }) => {
              const m = campaignMail(c, r, site);
              return (
                <div key={label}>
                  <p className="text-xs opacity-60 mb-1">{label}</p>
                  <p className="text-sm mb-2">主旨：{m.subject}</p>
                  <iframe srcDoc={m.html} sandbox="" title={label} className="w-full h-[560px] border border-black/10 rounded-[2px] bg-white" />
                </div>
              );
            })}
          </div>
        </Section>
      )}

      {c && cAud && (
        <Section id="send" title="寄出" sub={`${STATUS_ZH[c.status]}${c.tested_at ? ` · 测试信 ${homeMinute(c.tested_at)} 寄过` : " · 还没寄测试信"}`}>
          {c.status === "draft" && (
            <div className="space-y-5 max-w-2xl">
              <form method="post" action="/api/admin/campaigns" className="flex flex-wrap items-center gap-3">
                <input type="hidden" name="op" value="test" /><input type="hidden" name="id" value={c.id} />
                <button className="px-3 py-1.5 rounded-[2px] border border-black/30 text-sm">先寄测试信给自己</button>
                <span className="text-xs opacity-60">两封，只寄到我们的信箱：繁体（会员＋通卡，所有段落都看得到）、简体（没付过钱）。</span>
              </form>
              <form method="post" action="/api/admin/campaigns" className="border border-black/15 rounded-[2px] p-4 space-y-3">
                <input type="hidden" name="op" value="schedule" /><input type="hidden" name="id" value={c.id} />
                <p className="text-sm">排时间寄给 <strong>{cAud.recipients.length}</strong> 人 <span className="text-xs opacity-60">（{segmentLine(cSeg!)}；每批开寄前会再算一次，期间退订的人不会收到）</span></p>
                <div className="flex flex-wrap gap-3">
                  <label className="text-xs"><span className="opacity-50 block mb-1">开始时间（北京时间，空着＝马上）</span><input name="at" type="datetime-local" className={sel} /></label>
                  <label className="text-xs"><span className="opacity-50 block mb-1">人数再打一次</span><input name="confirm_count" inputMode="numeric" required className={`${sel} w-28`} /></label>
                  <label className="text-xs flex-1 min-w-[12rem]"><span className="opacity-50 block mb-1">为什么寄（进操作记录）</span><input name="reason" required className={`${sel} w-full`} /></label>
                </div>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="confirm" value="yes" required /> 我看过测试信，确认寄出</label>
                <button className={`px-4 py-2 rounded-[2px] text-sm ${c.tested_at && !marks.length ? "bg-[var(--ink)] text-[var(--paper)]" : "border border-black/20 opacity-50"}`}>排上</button>
                {!c.tested_at && <p className="text-xs text-[var(--cinnabar)]">先寄测试信给自己，才排得上（改过信也要再寄一次）。</p>}
                <Legend>分批寄：每 10 分钟一批、每批最多 {c.per_run} 封，只在北京时间 9–21 点寄。同一个信箱这封只寄一次；失败的下一批再试。</Legend>
              </form>
            </div>
          )}
          {(c.status === "scheduled" || c.status === "sending") && (
            <div className="space-y-3 max-w-2xl">
              <p className="text-sm">{c.status === "scheduled" ? `${homeMinute(c.scheduled_at ?? c.updated_at)} 开始` : `${homeMinute(c.started_at ?? c.updated_at)} 开始寄`} · 计划 {c.planned ?? "—"} 人 · 已寄 {c.sent} · 失败 {c.failed}</p>
              <form method="post" action="/api/admin/campaigns" className="flex flex-wrap items-center gap-3">
                <input type="hidden" name="op" value="stop" /><input type="hidden" name="id" value={c.id} />
                <input name="reason" placeholder="为什么停（进操作记录）" className={`${sel} flex-1 min-w-[12rem]`} />
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" required /> 确认停止</label>
                <button className="px-3 py-1.5 rounded-[2px] border border-[var(--cinnabar)] text-[var(--cinnabar)] text-sm">停止，剩下的不寄</button>
              </form>
            </div>
          )}
          {(c.status === "done" || c.status === "stopped") && (
            <p className="text-sm">{STATUS_ZH[c.status]} · {homeMinute(c.finished_at ?? c.updated_at)} · 已寄 {c.sent} · 失败 {c.failed}</p>
          )}
        </Section>
      )}

      <Section id="record" title="群发记录" sub="最近 50 封 · 开信＝收件人打开过（有的信箱不回报）· 退订／回信＝开寄以后这批人里退订、写信给客服的">
        {list.length === 0 ? <p className="text-sm opacity-50">还没有。（10-23 的公告信走的是旧接口，见开发日志 103。）</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-xs opacity-50 text-left"><th className="py-1 pr-3 font-normal">#</th><th className="pr-3 font-normal">名称 · 哪一群</th><th className="pr-3 font-normal">状态</th><th className="pr-3 font-normal">时间</th><th className="pr-3 font-normal text-right">计划</th><th className="pr-3 font-normal text-right">已寄</th><th className="pr-3 font-normal text-right">失败</th><th className="pr-3 font-normal text-right">开信</th><th className="pr-3 font-normal text-right">退订</th><th className="font-normal text-right">回信</th></tr></thead>
              <tbody>
                {list.map((x) => {
                  const s = x.status === "draft" ? null : campaignStats(x);
                  return (
                    <tr key={x.id} className={`border-t border-black/5 align-top ${c?.id === x.id ? "bg-black/[0.03]" : ""}`}>
                      <td className="py-1.5 pr-3"><a className="underline" href={`/admin/segments?id=${x.id}`}>{x.id}</a></td>
                      <td className="pr-3"><a href={`/admin/segments?id=${x.id}`} className="hover:underline">{x.name}</a><span className="block text-xs opacity-50">{segmentLine(segmentOf(x))}</span></td>
                      <td className={`pr-3 whitespace-nowrap ${STATUS_TONE[x.status]}`}>{STATUS_ZH[x.status]}</td>
                      <td className="pr-3 whitespace-nowrap text-xs tabular-nums">{homeMinute(x.started_at ?? x.scheduled_at ?? x.created_at)}{x.finished_at ? <span className="block opacity-50">→ {homeMinute(x.finished_at)}</span> : null}</td>
                      <td className="pr-3 text-right tabular-nums">{x.planned ?? "—"}</td>
                      <td className="pr-3 text-right tabular-nums">{x.sent}</td>
                      <td className={`pr-3 text-right tabular-nums ${x.failed ? "text-[var(--cinnabar)]" : "opacity-40"}`}>{x.failed}</td>
                      <td className="pr-3 text-right tabular-nums">{s ? `${s.opened}${x.sent ? ` · ${Math.round((s.opened / x.sent) * 100)}%` : ""}` : "—"}</td>
                      <td className="pr-3 text-right tabular-nums">{s ? s.unsubs : "—"}</td>
                      <td className="text-right tabular-nums">{s ? s.replies : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <Legend>谁排的、为什么寄、什么时候停的，都在 <a className="underline" href="/admin/actions?a=campaign">操作记录 · 群发</a>。</Legend>
      </Section>
    </AdminShell>
  );
}
