import { cookies } from "next/headers";
import { ADMIN_COOKIE, isAdmin } from "@/lib/admin-auth";
import { adminCases, caseCounts, OUTCOME_ZH, type CaseFilter } from "@/lib/content-admin";
import { casePath } from "@/lib/cases";
import { asLocale, LOCALES } from "@/lib/locales";
import { homeDay } from "@/lib/clock";
import { TOPIC_NAMES, type Topic } from "@/lib/topic";
import { AdminLogin, AdminShell, Legend, Section, Stat } from "../ui";

export const dynamic = "force-dynamic";

/**
 * 10-23 进度表 108 ② 公开卦例: every case readers chose to publish — 精选 (first in the case lists) and 撤下／恢复, each
 * with a reason, kept in 操作记录. The original question shows here only. What a reader withdrew is theirs: listed, not
 * restorable.
 */
const FILTERS: { id: CaseFilter; label: string }[] = [
  { id: "live", label: "在线" }, { id: "featured", label: "精选" }, { id: "hidden", label: "撤下的" }, { id: "withdrawn", label: "作者撤回的" }, { id: "all", label: "全部" },
];
const topicZh = (t: string | null) => TOPIC_NAMES[(t && t in TOPIC_NAMES ? t : "other") as Topic].zh;

function Act({ op, id, label, tone, back }: { op: string; id: string; label: string; tone: string; back: string }) {
  return (
    <details className="inline-block">
      <summary className={`cursor-pointer text-xs underline underline-offset-2 ${tone}`}>{label}</summary>
      <form method="post" action="/api/admin/content" className="mt-1 flex flex-col gap-1 w-56 text-xs">
        <input type="hidden" name="op" value={op} />
        <input type="hidden" name="public_id" value={id} />
        <input type="hidden" name="back" value={back} />
        <input name="reason" required minLength={2} placeholder="理由（进操作记录）" className="bg-transparent border border-black/20 rounded-[2px] px-2 py-1" />
        <label className="flex items-center gap-1.5"><input type="checkbox" name="confirm" value="yes" required /> 确认{label}</label>
        <button className="px-2 py-1 rounded-[2px] border border-black/30">{label}</button>
      </form>
    </details>
  );
}

export default async function CasesAdminPage({ searchParams }: { searchParams: Promise<{ key?: string; denied?: string; f?: string; l?: string; done?: string; failed?: string }> }) {
  const sp = await searchParams;
  if (!(await isAdmin((await cookies()).get(ADMIN_COOKIE)?.value, sp.key))) return <AdminLogin denied={sp.denied === "1"} back="/admin/cases" />;
  const filter = (FILTERS.find((x) => x.id === sp.f)?.id ?? "live") as CaseFilter;
  const locale = sp.l && (LOCALES as readonly string[]).includes(sp.l) ? sp.l : null;
  const counts = caseCounts();
  const rows = adminCases(filter, locale);
  const href = (f: CaseFilter, l: string | null) => `/admin/cases?${[`f=${f}`, l ? `l=${l}` : ""].filter(Boolean).join("&")}`;
  const back = href(filter, locale);
  const chip = (h: string, label: string, on: boolean) => <a key={h} href={h} className={`shrink-0 px-2.5 py-1 rounded-full border ${on ? "border-black/60" : "border-black/10 opacity-70 hover:opacity-100"}`}>{label}</a>;
  return (
    <AdminShell title="公开卦例" nav={[]}>
      {sp.done && <p className="text-sm mb-6 text-emerald-700">{sp.done}</p>}
      {sp.failed && <p className="text-sm mb-6 text-[var(--cinnabar)]">{sp.failed}</p>}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
        <Stat label="在线" value={counts.live} />
        <Stat label="精选" value={counts.featured} sub="排在卦例列表最前面" />
        <Stat label="撤下的" value={counts.hidden} />
        <Stat label="作者撤回的" value={counts.withdrawn} />
      </div>
      <Section id="list" title="卦例" sub={`${rows.length} 条 · 北京时间 · 原问只在后台出现`}>
        <div className="flex flex-wrap gap-1 text-xs mb-2">{FILTERS.map((x) => chip(href(x.id, locale), x.label, x.id === filter))}</div>
        <div className="flex flex-wrap gap-1 text-xs mb-4">{chip(href(filter, null), "所有语言", !locale)}{LOCALES.map((l) => chip(href(filter, l), l, locale === l))}</div>
        {rows.length === 0 ? <p className="text-sm opacity-50">没有。</p> : (
          <div className="space-y-2 text-sm">
            {rows.map((c) => {
              const live = !c.hiddenAt && !c.unpublishedAt;
              return (
                <div key={c.publicId} className={`border-t border-black/5 pt-2 ${c.test ? "opacity-50" : ""}`}>
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span className="opacity-50 tabular-nums text-xs">{homeDay(c.publishedAt)}</span>
                    <span className="opacity-50 text-xs">{c.locale} · {c.tier === "deep" ? "深断" : "轻解读"} · {topicZh(c.topic)}</span>
                    {c.featuredAt && <span className="text-xs text-[var(--gold-text)]">精选 · {homeDay(c.featuredAt)}</span>}
                    {live ? <a className="underline underline-offset-2" href={casePath(asLocale(c.locale), c.publicId)} target="_blank" rel="noreferrer">{c.framing ?? <span className="opacity-40">（没写公开说法）</span>}</a> : <span>{c.framing ?? <span className="opacity-40">（没写公开说法）</span>}</span>}
                    <span className={`text-xs ${c.hiddenAt ? "text-[var(--cinnabar)]" : c.unpublishedAt ? "opacity-50" : "text-emerald-700"}`}>{c.hiddenAt ? `已撤下 · ${homeDay(c.hiddenAt)}` : c.unpublishedAt ? "作者撤回" : "在线"}</span>
                    <span className="text-xs opacity-60">回访：{c.outcome ? OUTCOME_ZH[c.outcome as keyof typeof OUTCOME_ZH] ?? c.outcome : c.revisitStatus === "sent" ? "已寄未答" : c.revisitStatus ? "还没到" : "没有"}</span>
                    {c.customerId ? <a className="text-xs underline underline-offset-2 opacity-60" href={`/admin/customers/${c.customerId}`}>#{c.customerId}</a> : null}
                    {c.test && <span className="text-xs">测试</span>}
                  </div>
                  <p className="text-xs opacity-50 mt-0.5">原问：{c.question}</p>
                  <div className="flex flex-wrap gap-4 mt-1">
                    {live && !c.featuredAt && <Act op="feature" id={c.publicId} label="精选" tone="text-[var(--gold-text)]" back={back} />}
                    {live && c.featuredAt && <Act op="unfeature" id={c.publicId} label="取消精选" tone="opacity-60" back={back} />}
                    {live && <Act op="hide" id={c.publicId} label="撤下" tone="text-[var(--cinnabar)]" back={back} />}
                    {c.hiddenAt && !c.unpublishedAt && <Act op="show" id={c.publicId} label="恢复" tone="text-emerald-700" back={back} />}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <Legend>精选只改卦例列表（/cases、卦页、问法页底下的卦例）的先后：精选的排最前面；应验记录照规矩全部列、按回报时间排，不受精选影响。撤下的卦例在所有公开页上马上消失（页面每次打开都现查），应验记录、首页件数一起拿掉；读者自己的解读不受影响。作者撤回的只能由作者重新公开。</Legend>
      </Section>
    </AdminShell>
  );
}
