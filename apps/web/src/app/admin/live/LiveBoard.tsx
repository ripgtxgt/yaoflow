"use client";

import { useEffect, useState } from "react";
import type { LiveRow, LiveSnapshot } from "@/lib/presence";
import { eventLabel, pageLabel, spanLabel } from "@/lib/live-labels";
import { standingLabel, standingTone } from "@/lib/standing-label";

/** 11-01 (Neil: 通卡和会员一定要区分清楚): 会员 / 通卡 N 天 / 赠送会员 — never 「会员」 for a 通卡 */
function Standing({ r }: { r: { member: boolean | null; standing?: LiveRow["standing"]; passDays?: number | null } }) {
  if (r.member !== true) return null;
  const k = r.standing ?? "member";
  return <span className={`${standingTone(k)} mr-1`} title={k === "pass" ? "通卡在用" : k === "comp" ? "我们送的会员" : "在册会员（月付或年付）"}>{standingLabel(k, r.passDays)}</span>;
}

/**
 * 实时在线 (10-02): the board itself — polls /api/admin/live every 5 s and redraws. One row per open tab,
 * newest signal first; the feed on the right is the last few actions across everyone.
 */
const POLL_MS = 5_000;
const LOCALE_ZH: Record<string, string> = { zh: "简", "zh-hant": "繁", en: "英", ja: "日", ko: "韩", fr: "法", de: "德", es: "西", pt: "葡" };
const DEVICE_ZH: Record<string, string> = { phone: "手机", tablet: "平板", desktop: "电脑", bot: "爬虫", "?": "—" };

const clock = (ms: number) => new Date(ms).toLocaleTimeString("zh-CN", { hour12: false, timeZone: "Asia/Shanghai" });
const ago = (ms: number) => (ms < 5_000 ? "刚刚" : `${spanLabel(ms)}前`);

/** 10-02: what an anonymous browser's own marker cookies say — never who it is */
function Marks({ m }: { m: LiveRow["marks"] | undefined }) {
  if (!m || (!m.paid && !m.free && !m.was)) return null;
  return (
    <span className="ml-1.5 inline-flex gap-1 align-baseline">
      {m.paid && <span className="text-[10px] px-1 rounded-[2px] border border-[var(--gold)]/60 text-[var(--gold-text)]" title="这个浏览器买过深断（首单标记 cookie）">付过钱</span>}
      {m.free && <span className="text-[10px] px-1 rounded-[2px] border border-black/15 opacity-70" title="这个浏览器用过新客免费解读">领过免费</span>}
      {m.was && <span className="text-[10px] px-1 rounded-[2px] border border-black/15 opacity-70" title="这个浏览器登录过，登录已失效">登录过</span>}
    </span>
  );
}

function Who({ r }: { r: Pick<LiveRow, "customerId" | "who" | "member" | "s"> & { standing?: LiveRow["standing"]; passDays?: number | null } & { marks?: LiveRow["marks"]; recognized?: boolean; knownId?: number | null } }) {
  if (r.customerId) {
    return (
      <span className="whitespace-nowrap">
        <Standing r={r} />
        <a className="underline underline-offset-2" href={`/admin/customers/${r.customerId}`}>{r.who ?? `#${r.customerId}`}</a>
      </span>
    );
  }
  // 10-02: not signed in, but this browser paid / claimed / signed in before as this customer (yf_who mark)
  if (r.recognized && r.knownId) {
    return (
      <span className="whitespace-nowrap">
        <Standing r={r} />
        <a className="underline underline-offset-2 decoration-dotted" href={`/admin/customers/${r.knownId}`}>{r.who ?? `#${r.knownId}`}</a>
        <span className="ml-1.5 text-[10px] px-1 rounded-[2px] border border-black/15 opacity-70" title="没登录；这个浏览器付过款、领过解读或登录过，认得是这位客户（yf_who 标记）">没登录</span>
        <Marks m={r.marks} />
      </span>
    );
  }
  return <span className="whitespace-nowrap"><span className="opacity-50" title={`浏览器会话 ${r.s}`}>访客 {r.s.slice(0, 4)}</span><Marks m={r.marks} /></span>;
}

function Visit({ r }: { r: Pick<LiveRow, "vt" | "vn"> & { bstats?: LiveRow["bstats"] } }) {
  const head = r.vt === "n" ? <span className="text-emerald-700 whitespace-nowrap">新客</span>
    : r.vt === "r" ? <span className="whitespace-nowrap" title="这个浏览器第几天来">回访 · 第 {r.vn ?? "?"} 天</span>
    : <span className="opacity-40">—</span>;
  // 10-03 按人看: this browser's totals since its id — casts, and where it first came from
  if (!r.bstats) return head;
  return (
    <span className="inline-flex flex-col leading-tight">
      {head}
      <span className="text-[10px] opacity-50 whitespace-nowrap" title="这个浏览器从编号上线（10-03）起的累计">共 {r.bstats.casts} 卦 · 首次 {r.bstats.firstDay.slice(5)}{r.bstats.firstFrom ? ` ${r.bstats.firstFrom}` : ""}</span>
    </span>
  );
}

function Row({ r, now }: { r: LiveRow; now: number }) {
  const p = pageLabel(r.path);
  const dim = r.online ? "" : "opacity-40";
  // the clocks tick between polls: dwell on the page, idle, and the session's length, from the raw stamps
  const idleMs = Math.max(0, now - r.lastAt);
  const onPageMs = Math.max(0, (r.hidden ? r.lastAt : now) - r.pathSince);
  const sessionMs = Math.max(0, r.lastAt - r.firstAt);
  return (
    <details className={`border-t border-black/5 ${dim}`}>
      <summary className="grid grid-cols-[14px_minmax(0,1.1fr)_minmax(0,0.8fr)_minmax(0,1.2fr)_minmax(0,1.6fr)_170px_220px] gap-x-3 items-baseline py-2 text-sm cursor-pointer list-none [&::-webkit-details-marker]:hidden">
        <span className={`inline-block w-2 h-2 rounded-full self-center ${r.bot ? "bg-black/20" : !r.online ? "bg-black/15" : r.hidden ? "bg-amber-400" : "bg-emerald-500"}`} title={r.bot ? "爬虫" : !r.online ? "已离开" : r.hidden ? "切到后台" : "在线"} />
        <span className="truncate"><Who r={r} /></span>
        <span className="truncate text-xs"><Visit r={r} /></span>
        <span className="truncate" title={r.path ?? ""}>
          <span>{p.label}</span>
          {p.locale && <span className="opacity-40 text-xs ml-1">{LOCALE_ZH[p.locale] ?? p.locale}</span>}
          {r.pages > 1 && <span className="opacity-40 text-xs ml-1">· 第 {r.pages} 页</span>}
        </span>
        <span className="truncate text-xs" title={r.last ? clock(r.last.t) : ""}>
          {r.last ? <>{eventLabel(r.last.e, r.last.method, r.last.tier, r.last.num)} <span className="opacity-40">{ago(now - r.last.t)}</span></> : <span className="opacity-40">—</span>}
        </span>
        <span className="text-xs tabular-nums whitespace-nowrap" title="在当前页面停留 · 本次会话总长">
          {r.online ? (r.hidden ? <span className="text-amber-700">后台 {spanLabel(idleMs)}</span> : spanLabel(onPageMs)) : <span className="opacity-60">走了 {spanLabel(idleMs)}</span>}
          <span className="opacity-40"> / {spanLabel(sessionMs)}</span>
        </span>
        <span className="text-xs opacity-60 truncate" title={[r.model, DEVICE_ZH[r.device ?? "?"], r.country].filter(Boolean).join(" · ")}>{r.model ?? DEVICE_ZH[r.device ?? "?"]}{r.country ? ` · ${r.country}` : ""}</span>
      </summary>
      <div className="pb-3 pl-6 text-xs">
        <p className="opacity-60 mb-1">
          进来时在：{pageLabel(r.landing).label}{r.landing ? <span className="opacity-60 ml-1">{r.landing}</span> : null}
          {r.c ? <span className="ml-3">渠道 {r.c}</span> : null}{r.via ? <span className="ml-3">经分享 {r.via}</span> : null}{r.ab ? <span className="ml-3">分组 {r.ab}</span> : null}
          <span className="ml-3">会话 {r.s}</span>
          {r.bid && <a className="ml-3 underline underline-offset-2" href={`/admin/people/${r.bid}`}>这个人的轨迹 →</a>}
        </p>
        <ol className="space-y-0.5">
          {r.trail.map((x, i) => (
            <li key={i} className="flex gap-3">
              <span className="opacity-40 tabular-nums">{clock(x.t)}</span>
              <span>{eventLabel(x.e, x.method, x.tier, x.num)}</span>
              {x.path && x.e === "page_view" && <span className="opacity-50">{pageLabel(x.path).label} <span className="opacity-60">{x.path}</span></span>}
            </li>
          ))}
        </ol>
      </div>
    </details>
  );
}

export default function LiveBoard({ initial }: { initial: LiveSnapshot }) {
  const [snap, setSnap] = useState<LiveSnapshot>(initial);
  const [now, setNow] = useState(initial.at);
  const [err, setErr] = useState<string | null>(null);
  const [showGone, setShowGone] = useState(false);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const r = await fetch("/api/admin/live", { cache: "no-store" });
        if (!r.ok) throw new Error(String(r.status));
        const j = (await r.json()) as LiveSnapshot;
        if (alive) { setSnap(j); setNow(j.at); setErr(null); }
      } catch (e) {
        if (alive) setErr(e instanceof Error ? e.message : "?");
      }
    };
    const poll = setInterval(() => { if (document.visibilityState === "visible") void tick(); }, POLL_MS);
    const sec = setInterval(() => setNow((n) => n + 1000), 1000);
    return () => { alive = false; clearInterval(poll); clearInterval(sec); };
  }, []);

  const live = snap.rows.filter((r) => r.online && !r.bot);
  const gone = snap.rows.filter((r) => !r.online && !r.bot);
  const bots = snap.rows.filter((r) => r.bot);
  const pct = (a: number) => (snap.online ? `${Math.round((a / snap.online) * 100)}%` : "—");

  return (
    <div>
      <p className="text-xs opacity-50 mb-6">
        每 5 秒刷新 · 上次 {clock(snap.at)}{err ? <span className="text-[var(--cinnabar)] ml-2">刷新失败 {err}</span> : null}
        <span className="ml-3">「在线」= 最近 2 分钟有信号（页面每 30 秒报一次心跳）；黄点 = 标签页切到后台；灰的 = 最近 30 分钟来过、现在走了。访客后面的小标签来自这个浏览器自己的标记 cookie：付过钱 = 买过深断，领过免费 = 用过新客免费解读，登录过 = 曾登录、现已失效——只说明来过，不说明是谁。名字后面带「没登录」的：这个浏览器付过款、领过解读或登录过，认得出是这位客户（只在这块面板上，不会让他登录）。设备一栏是浏览器自己报的型号：Threads、Instagram 里打开的会写机型，iPhone 的 Safari / Chrome 只给系统版本。</span>
      </p>

      <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mb-8">
        <div className="rounded-[2px] border border-emerald-500/40 bg-emerald-500/5 p-3 md:p-4"><p className="text-xs opacity-50 mb-1">现在在线</p><p className="text-3xl tabular-nums leading-none">{snap.online}</p><p className="text-xs opacity-50 mt-1">最近 30 分钟来过 {snap.recent}</p></div>
        <div className="rounded-[2px] border border-black/10 p-3 md:p-4"><p className="text-xs opacity-50 mb-1">会员 · 通卡</p><p className="text-2xl tabular-nums leading-none">{snap.members}<span className="text-base opacity-60"> · {snap.passes ?? 0}</span></p><p className="text-xs opacity-50 mt-1">会员 {snap.members} · 通卡 {snap.passes ?? 0} · 已登录 {snap.signedIn}{snap.knownAnon > 0 ? ` · 没登录的老客户 ${snap.knownAnon}（付过钱 ${snap.knownAnonPaid}）` : ""}</p></div>
        <div className="rounded-[2px] border border-black/10 p-3 md:p-4"><p className="text-xs opacity-50 mb-1">新客</p><p className="text-2xl tabular-nums leading-none">{snap.newToday}</p><p className="text-xs opacity-50 mt-1">{pct(snap.newToday)} · 这个浏览器今天第一次来</p></div>
        <div className="rounded-[2px] border border-black/10 p-3 md:p-4"><p className="text-xs opacity-50 mb-1">回访客</p><p className="text-2xl tabular-nums leading-none">{snap.returning}</p><p className="text-xs opacity-50 mt-1">{pct(snap.returning)} · 来过别的日子</p></div>
        <div className="rounded-[2px] border border-black/10 p-3 md:p-4"><p className="text-xs opacity-50 mb-1">语言</p><p className="text-sm leading-snug mt-1">{Object.entries(snap.byLocale).sort((a, b) => b[1] - a[1]).map(([l, n]) => `${LOCALE_ZH[l] ?? l} ${n}`).join(" · ") || "—"}</p></div>
        <div className="rounded-[2px] border border-black/10 p-3 md:p-4"><p className="text-xs opacity-50 mb-1">设备</p><p className="text-sm leading-snug mt-1">{Object.entries(snap.byDevice).sort((a, b) => b[1] - a[1]).map(([d, n]) => `${DEVICE_ZH[d] ?? d} ${n}`).join(" · ") || "—"}</p></div>
      </div>

      <div className="grid lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-8">
        <section>
          <h2 className="text-sm tracking-[0.16em] mb-3">在线的人 <span className="text-xs tracking-normal opacity-50 ml-2">点一行看这个人的动作轨迹</span></h2>
          <div className="overflow-x-auto"><div className="min-w-[860px]">
          <div className="grid grid-cols-[14px_minmax(0,1.1fr)_minmax(0,0.8fr)_minmax(0,1.2fr)_minmax(0,1.6fr)_170px_220px] gap-x-3 text-xs opacity-50 pb-1">
            <span /><span>谁</span><span>新 / 回访</span><span>所在页面</span><span>最近动作</span><span>停留 / 会话</span><span>设备</span>
          </div>
          {live.length === 0 ? <p className="text-sm opacity-40 py-6">现在没有人在线。</p> : live.map((r) => <Row key={r.s} r={r} now={now} />)}
          {gone.length > 0 && (
            <div className="mt-4">
              <button className="text-xs underline underline-offset-4 opacity-60 hover:opacity-100" onClick={() => setShowGone((v) => !v)}>
                {showGone ? "收起" : "展开"}最近 30 分钟来过、现在走了的 {gone.length} 人
              </button>
              {showGone && gone.map((r) => <Row key={r.s} r={r} now={now} />)}
            </div>
          )}
          {bots.length > 0 && <p className="text-xs opacity-40 mt-3">另有 {bots.length} 个爬虫 / 链接预览，不计入在线{(() => {
            // 11-04: the ones from a server room (cloud / hosting network), by provider
            const by = new Map<string, number>();
            for (const b of bots) { const m = /^机房 · ([^·]+)/.exec(b.model ?? ""); if (m) by.set(m[1]!.trim(), (by.get(m[1]!.trim()) ?? 0) + 1); }
            return by.size ? `（其中来自机房：${[...by].map(([k, v]) => `${k} ${v}`).join("、")}）` : "";
          })()}。</p>}
          </div></div>
          {snap.byPage.length > 0 && (
            <div className="mt-8">
              <h3 className="text-xs tracking-[0.16em] opacity-70 mb-2">在线的人在哪些页面</h3>
              <ul className="text-sm space-y-1">
                {snap.byPage.map((p) => { const l = pageLabel(p.path); return <li key={p.path} className="flex gap-3"><span className="tabular-nums w-6 text-right">{p.n}</span><span>{l.label}</span>{l.locale && <span className="opacity-40 text-xs self-center">{LOCALE_ZH[l.locale] ?? l.locale}</span>}<span className="opacity-40 text-xs self-center truncate">{p.path}</span></li>; })}
              </ul>
            </div>
          )}
        </section>

        <section>
          <h2 className="text-sm tracking-[0.16em] mb-3">最近动作</h2>
          {snap.feed.length === 0 ? <p className="text-sm opacity-40">—</p> : (
            <ol className="text-xs space-y-1.5">
              {snap.feed.map((f, i) => (
                <li key={`${f.s}-${f.t}-${i}`} className="flex gap-2 items-baseline">
                  <span className="opacity-40 tabular-nums shrink-0">{clock(f.t)}</span>
                  <span className="shrink-0 whitespace-nowrap">
                    {f.who ? <><Standing r={f} />{f.who}{f.recognized ? <span className="opacity-40 text-[10px] ml-1">没登录</span> : null}</> : <span className="opacity-50">访客 {f.s.slice(0, 4)}</span>}
                  </span>
                  <span className="min-w-0 truncate">
                    {eventLabel(f.e, f.method, f.tier, f.num)}
                    {f.path && f.e === "page_view" ? <span className="opacity-50 ml-1">{pageLabel(f.path).label}</span> : null}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </div>
  );
}
