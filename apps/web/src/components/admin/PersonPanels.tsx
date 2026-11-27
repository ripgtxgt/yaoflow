import { netOf, twinsOf } from "@/lib/browser-net";
import { personProfile, type Count } from "@/lib/person-profile";
import { homeMinute } from "@/lib/clock";

/**
 * 10-31 进度表 130 ②③: the 「网络与设备」 and 「客户画像」 blocks, shared by the visitor page (/admin/people/<bid>) and the
 * customer page (/admin/customers/<id>). Server components; read-only.
 */
const regionName = (cc: string | null) => { if (!cc) return ""; try { return new Intl.DisplayNames(["zh-CN"], { type: "region" }).of(cc) ?? cc; } catch { return cc; } };
const list = (c: Count, unit = "") => (c.length ? c.map(([k, n]) => `${k}${unit ? `（${n}${unit}）` : ""}`).join("、") : "—");

export function NetPanel({ bids }: { bids: string[] }) {
  const rows = netOf(bids);
  const twins = twinsOf(bids);
  const last = rows[0];
  return (
    <section className="mb-10" id="net">
      <h2 className="text-sm tracking-[0.15em] mb-1">网络与设备</h2>
      <p className="text-xs opacity-50 mb-3">IP、地区、设备、浏览器（10-31 起记；地区由 Cloudflare 判定；180 天后只留城市和设备）</p>
      {!last ? <p className="text-sm opacity-50">还没有记录（10-31 之后再来访才会有）。</p> : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4 text-sm">
            <div className="border border-black/10 p-3"><p className="text-xs opacity-50">最近 IP</p><p className="tabular-nums break-all">{last.ip || "（已抹去）"}</p></div>
            <div className="border border-black/10 p-3"><p className="text-xs opacity-50">国家／地区</p><p>{[regionName(last.country), last.region, last.city].filter(Boolean).join(" · ") || "—"}</p>{last.tz && <p className="text-xs opacity-50">{last.tz}</p>}</div>
            <div className="border border-black/10 p-3"><p className="text-xs opacity-50">设备</p><p>{last.model?.split(" · ")[0] ?? last.device ?? "—"}</p><p className="text-xs opacity-50">{last.os ?? ""}</p></div>
            <div className="border border-black/10 p-3"><p className="text-xs opacity-50">浏览器／App</p><p>{last.app ?? "—"}</p>{last.lang && <p className="text-xs opacity-50">语言 {last.lang}</p>}</div>
          </div>
          <div className="overflow-x-auto -mx-4 px-4 mb-4">
            <table className="w-full text-xs min-w-[44rem]">
              <thead><tr className="opacity-50 text-left">
                <th className="py-1 pr-3 font-normal">IP</th><th className="py-1 pr-3 font-normal">地区</th><th className="py-1 pr-3 font-normal">设备 · 系统 · 浏览器</th>
                <th className="py-1 pr-3 font-normal">浏览器编号</th><th className="py-1 pr-3 font-normal">首次</th><th className="py-1 pr-3 font-normal">最近</th><th className="py-1 font-normal">次数</th>
              </tr></thead>
              <tbody>{rows.map((r, i) => (
                <tr key={i} className="border-t border-black/5" title={r.ua ?? ""}>
                  <td className="py-1 pr-3 tabular-nums">{r.ip || <span className="opacity-40">已抹去</span>}</td>
                  <td className="py-1 pr-3">{[regionName(r.country), r.region, r.city].filter(Boolean).join(" · ") || "—"}</td>
                  <td className="py-1 pr-3">{r.model ?? [r.os, r.app].filter(Boolean).join(" · ")}</td>
                  <td className="py-1 pr-3 opacity-60">{r.bid.slice(0, 6)}</td>
                  <td className="py-1 pr-3 tabular-nums opacity-70">{homeMinute(r.first_at).slice(5, 16)}</td>
                  <td className="py-1 pr-3 tabular-nums opacity-70">{homeMinute(r.last_at).slice(5, 16)}</td>
                  <td className="py-1 tabular-nums">{r.hits}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </>
      )}
      <p className="text-xs opacity-60 mb-1">相似痕迹（同一个 IP，或同网段同型号设备的其他浏览器）</p>
      {twins.length === 0 ? <p className="text-sm opacity-50">没有。</p> : (
        <ul className="text-sm space-y-1">{twins.map((t) => (
          <li key={t.bid}>
            <a className="underline underline-offset-2" href={`/admin/people/${t.bid}`}>浏览器 {t.bid.slice(0, 6)}</a>
            {t.customer_id ? <> · <a className="underline underline-offset-2" href={`/admin/customers/${t.customer_id}`}>{t.email ?? `#${t.customer_id}`}</a></> : <span className="opacity-50"> · 没登录</span>}
            <span className="opacity-60"> · 起卦 {t.casts} · {t.why} · 最近 {homeMinute(t.last_at).slice(5, 16)}</span>
          </li>
        ))}</ul>
      )}
      <p className="text-xs opacity-40 mt-2">同一个 IP 可能是同一个人换了浏览器或 App（例如先在 Threads 里开、再到 Safari），也可能是同一个家里、公司或手机网络的别人；同型号同网段更像同一台手机。</p>
    </section>
  );
}

const WEEK = ["日", "一", "二", "三", "四", "五", "六"];
function Bars({ v, labels }: { v: number[]; labels: (i: number) => string }) {
  const max = Math.max(1, ...v);
  return (
    <div className="flex items-end gap-[2px] h-12">
      {v.map((n, i) => (
        <div key={i} className="flex-1 flex flex-col items-center justify-end" title={`${labels(i)}：${n}`}>
          <div className="w-full bg-[var(--gold,#b8963e)]/70" style={{ height: `${(n / max) * 100}%`, minHeight: n ? 2 : 0 }} />
        </div>
      ))}
    </div>
  );
}

export function ProfilePanel({ bids, customerId }: { bids: string[]; customerId: number | null }) {
  const p = personProfile(bids, customerId);
  const row = (k: string, v: React.ReactNode) => (<div className="flex gap-3 py-1 border-t border-black/5"><span className="opacity-50 w-24 shrink-0">{k}</span><span className="min-w-0">{v}</span></div>);
  const pct = (x: number) => `${Math.round(x * 100)}%`;
  return (
    <section className="mb-10" id="profile">
      <h2 className="text-sm tracking-[0.15em] mb-1">客户画像</h2>
      <p className="text-xs opacity-50 mb-3">把这个人的来源、设备、时段、问什么、付不付钱合成一页，供投放时定受众；只在后台看，不传给任何广告平台。</p>
      {p.tags.length > 0 && <p className="mb-3 flex flex-wrap gap-1.5">{p.tags.map((t) => <span key={t} className="text-xs px-2 py-0.5 rounded-full bg-black/5">{t}</span>)}</p>}
      <div className="text-sm">
        {row("地区", <>{list(p.where.countries)}{p.where.cities.length ? ` · 城市 ${list(p.where.cities)}` : ""}{p.where.cardCountry.length ? ` · 银行卡 ${list(p.where.cardCountry)}` : ""}</>)}
        {row("时区／语言", `${list(p.where.tz)} · ${list(p.where.langs)}`)}
        {row("设备", `${list(p.device.classes)} · ${list(p.device.models)} · ${list(p.device.os)}`)}
        {row("在哪打开", list(p.device.apps))}
        {row("怎么来的", <>{p.source.firstRef ?? "直接打开／未知"}{p.source.firstCampaign ? ` · 推广标签 ${p.source.firstCampaign}` : ""}{p.source.firstPath ? ` · 落地 ${p.source.firstPath}` : ""}{p.source.firstAt ? ` · ${homeMinute(p.source.firstAt).slice(0, 10)}` : ""}</>)}
        {row("年龄／性别", p.who.band ? `${p.who.gender ?? "性别未知"} · ${p.who.age} 岁（${p.who.band}）· 属${p.who.zodiac}` : p.who.profiles ? "存了生辰档案，但没有标「自己」" : "没有生辰档案")}
        {p.who.forOthers.length > 0 && row("替谁排盘", list(p.who.forOthers, " 份"))}
        {row("活跃", `来了 ${p.when.days} 天 · 起卦 ${p.asks.casts} 卦 · 有起卦的日子平均 ${p.when.castsPerDay} 卦/天${p.when.firstAt ? ` · ${homeMinute(p.when.firstAt).slice(0, 10)} → ${p.when.lastAt ? homeMinute(p.when.lastAt).slice(0, 10) : ""}` : ""}`)}
        {row("问什么", `${list(p.asks.topics, " 卦")} · 问的是：${list(p.asks.about, " 卦")}`)}
        {row("怎么问", `${p.asks.matters} 件事，同一件最多问 ${p.asks.maxPerMatter} 卦 · 问对方会不会联络/复合 ${pct(p.asks.contactShare)} · 免费一句偏顺 ${p.asks.leanGood} / 偏不顺 ${p.asks.leanBad}${p.asks.capped ? ` · 问满被挡 ${p.asks.capped} 次` : ""}${p.asks.sensitive ? ` · 敏感类 ${p.asks.sensitive}` : ""}`)}
        {p.asks.samples.length > 0 && row("问题举例", <span className="opacity-80">{p.asks.samples.map((s) => `「${s}」`).join(" ")}</span>)}
        {row("付费", <>看到免费一句 {p.money.teased} · 点价格 {p.money.clicks} · 去付款 {p.money.checkouts} · 付款 {p.money.paidOrders} 单{p.money.spend.length ? ` · 共 ${p.money.spend.map(([c, n]) => `${c} ${(n / 100).toFixed(2)}`).join("、")}` : ""}{p.money.products.length ? ` · 买过 ${list(p.money.products, " 次")}` : ""}{p.money.member ? " · 会员中" : ""}</>)}
      </div>
      {p.asks.casts > 0 && (
        <div className="grid md:grid-cols-2 gap-6 mt-4">
          <div><p className="text-xs opacity-50 mb-1">几点起卦（他自己的时区，{pct(p.when.nightShare)} 在 23–4 点）</p><Bars v={p.when.hours} labels={(i) => `${i} 点`} /><p className="flex justify-between text-[10px] opacity-40"><span>0</span><span>6</span><span>12</span><span>18</span><span>23</span></p></div>
          <div><p className="text-xs opacity-50 mb-1">星期几起卦</p><Bars v={p.when.weekdays} labels={(i) => `周${WEEK[i]}`} /><p className="flex justify-between text-[10px] opacity-40">{WEEK.map((w) => <span key={w}>{w}</span>)}</p></div>
        </div>
      )}
    </section>
  );
}
