import type { ReactNode } from "react";
import { inboxOpenCount } from "@/lib/inbound";

/**
 * The dashboard's frame (09-18, Neil: "整个 admin 面板有点乱 … 做一下手机的适配").
 * One sticky bar — title, section pills that scroll sideways on a phone, and
 * whatever the page puts on the right (the time window, a link to the other
 * page). Sections are anchored so the pills jump. Everything is server-rendered;
 * there is no client code on these pages at all.
 */
/**
 * 10-14 (Neil: 「这个后台的导航功能版块组合一下吧，显示得太多了，不好按」): the twelve page links that sat in one row on
 * the overview are now one menu on every admin page, in five groups that open on a tap (plain <details>, no client
 * code; 10-15: they share one `name`, so opening one closes the other — before, two stayed open on top of each other). The page's own controls (time window …) move to the second row with the section pills.
 */
/**
 * 10-23 进度表 107 ① (规划《后台修正与运营后台规划-1023》第四节): the groups follow what there is to do — 今天／人／分群与消息／
 * 产品／内容／钱／回访／设置与记录. The pages that were there moved into them; a group shows only once it has a page.
 */
const MENU: { label: string; items: { href: string; label: string }[] }[] = [
  // 今天 (/admin/today), 看板 (/admin) and 实时 are one tap each — rendered as links below
  { label: "人", items: [{ href: "/admin/people", label: "按人看" }, { href: "/admin/people/anon", label: "没登录的回头客" }, { href: "/admin/customers", label: "客户档案" }, { href: "/admin/audience", label: "受众画像" }, { href: "/admin/inbox", label: "客服来信" }] },
  { label: "分群与消息", items: [{ href: "/admin/segments", label: "分群群发" }, { href: "/admin/letters", label: "自动寄的信" }, { href: "/admin/waitlist", label: "预约名单（2027 年卦）" }] },
  // 10-22 进度表 94: the seventeen products; what used to be 「转化」 is about how they sell
  { label: "产品", items: [{ href: "/admin/products", label: "全部产品" }, { href: "/admin/qian", label: "解籤" }, { href: "/admin/nudges", label: "付费话术学习" }, { href: "/admin/heat", label: "热区 · 对照测试" }, { href: "/admin/traffic", label: "流量来源（Google Analytics）" }, { href: "/admin/review-links", label: "评测试用链接" }] },
  // 10-23 进度表 108 ②
  { label: "内容", items: [{ href: "/admin/cases", label: "公开卦例（精选／撤下）" }, { href: "/admin/outcomes", label: "应验记录（件数、逐件核对）" }, { href: "/admin/today-qian", label: "今日一籤（每天抽到哪支）" }] },
  { label: "钱", items: [{ href: "/admin/finance", label: "流水" }, { href: "/admin/members", label: "会员与通卡" }, { href: "/admin/checkout", label: "结账" }, { href: "/admin/promos", label: "优惠码与活动连结" }] },
  { label: "回访", items: [{ href: "/admin/revisits", label: "到期回访" }, { href: "/admin/retention", label: "留存" }] },
  { label: "设置与记录", items: [{ href: "/admin/features", label: "功能开关（预览／开放）" }, { href: "/admin/limits", label: "上限与权益" }, { href: "/admin/prices", label: "价格表" }, { href: "/admin/actions", label: "操作记录" }] },
];

function inboxBadge(): number {
  try {
    return inboxOpenCount();
  } catch { return 0; }
}

function SiteMenu() {
  const inbox = inboxBadge();
  return (
    <nav className="text-sm flex flex-wrap items-center justify-end gap-x-1 gap-y-1 flex-1 min-w-0">
      {/* 10-23 进度表 108 ③: 今天 is the day's to-do and alarms; 看板 keeps every number */}
      <a href="/admin/today" className="px-2.5 py-1 rounded-[2px] hover:bg-black/5">今天</a>
      <a href="/admin" className="px-2.5 py-1 rounded-[2px] hover:bg-black/5">看板</a>
      <a href="/admin/live" className="px-2 py-1 rounded-[2px] hover:bg-black/5 text-emerald-700 text-xs">实时</a>
      {MENU.filter((g) => g.items.length > 0).map((g) => {
        const badge = g.label === "人" && inbox > 0 ? inbox : 0;
        return (
          <details key={g.label} className="relative group" {...{ name: "admin-menu" }}>
            <summary className={`list-none cursor-pointer select-none px-2.5 py-1 rounded-[2px] hover:bg-black/5 group-open:bg-black/5 [&::-webkit-details-marker]:hidden ${badge ? "text-[var(--cinnabar)]" : ""}`}>
              {g.label}{badge ? ` ${badge}` : ""} <span className="opacity-40 text-xs">▾</span>
            </summary>
            <div className="absolute right-0 md:left-0 md:right-auto mt-1 min-w-[10rem] bg-[var(--paper)] border border-black/15 rounded-[2px] shadow-sm py-1 z-20">
              {g.items.map((it) => (
                <a key={it.href} href={it.href} className="block px-3 py-2 whitespace-nowrap hover:bg-black/5">
                  {it.label}{it.href === "/admin/inbox" && inbox > 0 ? <span className="text-[var(--cinnabar)]"> {inbox}</span> : null}
                </a>
              ))}
            </div>
          </details>
        );
      })}
      {/* 09-18: the cookie session needs a way out on a shared or borrowed device */}
      <form method="post" action="/api/admin/logout" className="inline ml-1">
        <button className="px-2 py-1 text-xs opacity-40 hover:opacity-100" title="清掉这台浏览器的登录">退出</button>
      </form>
    </nav>
  );
}

export function AdminShell(
  { title, nav, right, children }: { title: string; nav: { href: string; label: string }[]; right?: ReactNode; children: ReactNode },
) {
  return (
    <main className="min-h-screen bg-[var(--paper)] text-[var(--ink)]">
      <div className="sticky top-0 z-10 bg-[var(--paper)]/95 backdrop-blur border-b border-black/10">
        <div className="max-w-5xl mx-auto px-4 md:px-6">
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2.5">
            <h1 className="text-base tracking-[0.12em] whitespace-nowrap shrink-0">YaoFlow · {title}</h1>
            <SiteMenu />
          </div>
          {(right || nav.length > 0) && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pb-2">
              {right && <div className="text-xs flex flex-wrap items-baseline gap-x-1 gap-y-1 [&>*]:whitespace-nowrap">{right}</div>}
              {nav.length > 0 && (
                <nav className="flex gap-1 overflow-x-auto max-w-full text-xs [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  {nav.map((n) => (
                    <a key={n.href} href={n.href} className="shrink-0 px-2.5 py-1 rounded-full border border-black/10 opacity-70 hover:opacity-100 hover:border-black/40">{n.label}</a>
                  ))}
                </nav>
              )}
            </div>
          )}
        </div>
      </div>
      <div className="max-w-5xl mx-auto px-4 md:px-6 py-6">{children}</div>
    </main>
  );
}

export function Section(
  { id, title, sub, right, children }: { id: string; title: string; sub?: string; right?: ReactNode; children: ReactNode },
) {
  return (
    <section id={id} className="mb-12 scroll-mt-24">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 mb-4">
        <h2 className="text-sm tracking-[0.16em]">
          {title}
          {sub && <span className="ml-3 text-xs tracking-normal opacity-50">{sub}</span>}
        </h2>
        {right && <div className="text-xs flex gap-3">{right}</div>}
      </div>
      {children}
    </section>
  );
}

export function Card({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <div className="rounded-[2px] border border-black/10 p-4">
      {title && <p className="text-xs opacity-50 mb-2">{title}</p>}
      {children}
    </div>
  );
}

/**
 * A number card. `prev` is the same number for the window just before this
 * one (09-18): the card then shows the change as ▲ / ▼ with the old value on
 * hover, so a trend reads off the overview without the daily table.
 */
/** 10-13: `split` — the same box for non-members and members, side by side (Neil: 「在这些框里面去显示出来会员和非会员的数据」) */
export function Stat({ label, value, sub, good, prev, split }: { label: string; value: number | string; sub?: string; good?: boolean; prev?: number; split?: { non: string; member: string; from?: string } }) {
  const delta = typeof value === "number" && prev !== undefined ? deltaLabel(value, prev) : null;
  return (
    <div className={`rounded-[2px] border p-3 md:p-4 ${good === undefined ? "border-black/10" : good ? "border-emerald-500/40 bg-emerald-500/5" : "border-black/10"}`}>
      <p className="text-xs opacity-50 mb-1">{label}</p>
      <p className="text-2xl tabular-nums leading-none flex items-baseline gap-2 flex-wrap">
        <span>{typeof value === "number" ? value.toLocaleString() : value}</span>
        {delta && (
          <span className={`text-xs ${delta.tone === "up" ? "text-emerald-700" : delta.tone === "down" ? "text-[var(--cinnabar)]" : "opacity-40"}`} title={`上一个同长区间：${prev!.toLocaleString()}`}>
            {delta.text}
          </span>
        )}
      </p>
      {sub && <p className="text-[11px] opacity-50 mt-1.5 leading-snug">{sub}</p>}
      {split && (
        <div className="mt-2 pt-2 border-t border-black/10 grid grid-cols-2 gap-2 text-[11px] leading-snug">
          <p><span className="block opacity-50">非会员{split.from ? ` · ${split.from} 起` : ""}</span><span className="tabular-nums">{split.non}</span></p>
          <p><span className="block text-[var(--gold-text)]">会员</span><span className="tabular-nums">{split.member}</span></p>
        </div>
      )}
    </div>
  );
}

/** "▲ 12%" against the previous window; a multiple ("▲ 26×") once it is past triple; "新" when there was nothing before; "—" when neither has anything. */
export function deltaLabel(now: number, prev: number): { text: string; tone: "up" | "down" | "flat" } {
  if (prev === 0 && now === 0) return { text: "—", tone: "flat" };
  if (prev === 0) return { text: "新", tone: "up" };
  if (now >= prev * 3) return { text: `▲ ${Math.round((now / prev) * 10) / 10}×`, tone: "up" };
  const r = Math.round(((now - prev) / prev) * 100);
  if (r === 0) return { text: "持平", tone: "flat" };
  return r > 0 ? { text: `▲ ${r}%`, tone: "up" } : { text: `▼ ${Math.abs(r)}%`, tone: "down" };
}

/** The small print under a table: what the columns mean. */
export function Legend({ children }: { children: ReactNode }) {
  return <p className="text-xs opacity-40 mt-3 leading-relaxed">{children}</p>;
}

export function AdminLogin({ denied, back }: { denied?: boolean; back: string }) {
  return (
    <main className="min-h-screen grid place-items-center bg-[var(--paper)] text-[var(--ink)] p-6">
      <form method="post" action="/api/admin/login" className="w-full max-w-xs">
        <p className="text-sm opacity-60 mb-3">YaoFlow · 后台</p>
        <input type="hidden" name="back" value={back} />
        <input
          name="key"
          type="password"
          placeholder="access key"
          autoFocus
          autoComplete="current-password"
          className="w-full bg-transparent border border-black/20 rounded-[2px] px-3 py-2 outline-none focus:border-black/60"
        />
        {denied && <p className="text-xs text-[var(--cinnabar)] mt-2">不对，再试一次。</p>}
        <button className="mt-3 w-full py-2 rounded-[2px] bg-[var(--ink)] text-[var(--paper)] text-sm">进入</button>
        <p className="text-[11px] opacity-40 mt-3">登录一次记住 30 天（这台浏览器）。</p>
      </form>
    </main>
  );
}
