"use client";

import { useEffect, useMemo, useState } from "react";
import { astroOf, SIGNS, type AstroView } from "@/lib/mingli/astro/chart";
import { normalizeBirth, wallToUtc } from "@/lib/mingli/birth/normalize";
import { placeById } from "@/lib/mingli/birth/places";
import { currentProfile, syncProfiles, updateInput, type Profile } from "@/lib/mingli/birth/profiles";
import type { PlanetSign } from "@/lib/mingli/astro/content";
import { insightOf, spreadGlyphs } from "@/lib/mingli/astro/insight";
import { track } from "@/lib/track";
import ShareSheet from "@/components/ShareSheet";
import type { ShareSurface } from "@/lib/share-meta";
import AstroInsight, { AspectGrid, ASP_COLOR } from "./AstroInsight";
import AstroReports from "./AstroReports";
import HepanLink from "./HepanLink";
import ChartQA from "./ChartQA";
import ChartReadingLock from "./ChartReadingLock";
import ChartReportLinks from "./ChartReportLinks";

/**
 * 10-18 进度表 74 星盤 — the chart page body: our own SVG wheel (ASC on the left), the 太陽／月亮／上升 lines, tables,
 * and the words. Worked out here; the server only gets planet, sign and house names.
 */
type Texts = { ps: Record<string, PlanetSign>; ph: Record<string, string>; rising: string | null; aspects: Record<string, string>; node: string | null };
export type AstroUi = Record<string, string>;
const VS = "︎";
const SIGN_GLYPH = ["♈", "♉", "♊", "♋", "♌", "♍", "♎", "♏", "♐", "♑", "♒", "♓"].map((g) => g + VS);
const PLANET_GLYPH = ["☉", "☽", "☿", "♀", "♂", "♃", "♄", "♅", "♆", "♇"].map((g) => g + VS);
const EL = ["#b5523b", "#9a7b45", "#5b7f9e", "#3f6386"]; // fire earth air water
const SIGN_SLUG_SHORT = ["aries", "taurus", "gemini", "cancer", "leo", "virgo", "libra", "scorpio", "sagittarius", "capricorn", "aquarius", "pisces"];
const PERSONAL = ["太陽", "月亮", "水星", "金星", "火星"];
// 10-19: "astro" is added to SHARE_SURFACES in lib/share-meta.ts (owned elsewhere); widen until then
const SURFACE: ShareSurface = "astro";

export default function AstroChart({ locale, ui, formHref, castHref, signNames }: { locale: string; ui: AstroUi; formHref: string; castHref: string; signNames: string[] }) {
  const [p, setP] = useState<Profile | null | undefined>(undefined);
  const [tx, setTx] = useState<Texts | null>(null);
  const [locked, setLocked] = useState(false); // 10-25: the plain reading needs a 通卡 or a membership
  const [sel, setSel] = useState<string | null>(null);
  useEffect(() => {
    // 10-22 生辰檔案: a profile already on this device shows at once (the account's list refreshes behind it); on a
    // new device the signed-in reader's list comes down first, so nothing has to be typed again
    const cur = currentProfile();
    if (cur) { setP(cur); void syncProfiles(); return; }
    void syncProfiles().then(() => setP(currentProfile()));
  }, []);
  const sys = p?.input.houses ?? "placidus";

  const res = useMemo((): { v: AstroView; moonSplit: [string, string] | null } | { err: true } | null => {
    if (!p) return null;
    try {
      const n = normalizeBirth(p.input);
      if (n.timeKnown && n.utcMs !== null && n.place && p.input.timeMode === "exact") return { v: astroOf(n.utcMs, n.place.lat, n.place.lon, true, sys), moonSplit: null };
      const place = n.place ?? placeById(p.input.placeId ?? "") ?? placeById("tw-tpe")!;
      const d = n.solarDate;
      const noon = wallToUtc(place.tz, { ...d, h: 12, mi: 0 });
      const v = astroOf(noon, null, null, false);
      const a = astroOf(wallToUtc(place.tz, { ...d, h: 0, mi: 0 }), null, null, false).planets[1]!.sign;
      const b = astroOf(wallToUtc(place.tz, { ...d, h: 23, mi: 59 }), null, null, false).planets[1]!.sign;
      return { v, moonSplit: a !== b ? [a, b] : null };
    } catch { return { err: true }; }
  }, [p, sys]);
  const v = res && "v" in res ? res.v : null;
  const ins = useMemo(() => (v ? insightOf(v) : null), [v]);

  useEffect(() => {
    if (!v) return;
    const ascSign = v.asc !== null ? SIGNS[Math.floor(v.asc / 30)]! : undefined;
    void fetch("/api/xingpan/text", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
      locale, ps: v.planets.map((x) => [x.name, x.sign]), ph: v.timeKnown ? v.planets.map((x) => [x.name, x.house]) : [], rising: ascSign,
      // 10-19: the words for the personal-planet pairs among the tightest aspects (insight.ts ⑤); the rest use short built-in lines
      aspects: (insightOf(v).tight.filter((a) => PERSONAL.includes(a.a) && PERSONAL.includes(a.b)).slice(0, 5)).map((a) => [a.a, a.b, a.name]), node: v.node.sign,
    }) }).then((r) => { setLocked(r.status === 402); return r.ok ? r.json() : null; }).then((j) => setTx(j as Texts | null)).catch(() => setTx(null));
    track("astro", { locale, method: `chart:${v.timeKnown ? "t" : "n"}:${p?.input.placeId?.split("-")[0] ?? "-"}:${v.houseSystem ?? "-"}` });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v?.planets.map((x) => x.lon.toFixed(2)).join(), v?.asc]);

  if (p === undefined) return <p className="t-body !text-[var(--ink-45)]">…</p>;
  if (!p) return <p className="t-body">{ui.noProfile} <a href={formHref} className="underline underline-offset-4">{ui.toForm}</a></p>;
  if (!res || "err" in res || !ins) return <p className="t-body">{ui.bad} <a href={formHref} className="underline underline-offset-4">{ui.toForm}</a></p>;
  const vv = res.v;
  const sn = (s: string) => signNames[SIGNS.indexOf(s as (typeof SIGNS)[number])] ?? s;
  const pn = (s: string) => ui.planetNames.split(",")[["太陽", "月亮", "水星", "金星", "火星", "木星", "土星", "天王星", "海王星", "冥王星"].indexOf(s)] ?? s;
  const sun = vv.planets[0]!, moon = vv.planets[1]!;
  const ascSign = vv.asc !== null ? SIGNS[Math.floor(vv.asc / 30)]! : null;
  const setSys = (s: "placidus" | "whole") => { updateInput(p.id, { houses: s }); setP({ ...p, input: { ...p.input, houses: s } }); };

  // wheel geometry: ASC on the left
  const base = vv.asc ?? 0;
  const pt = (lon: number, r: number) => { const t = ((180 + lon - base) * Math.PI) / 180; return [r * Math.cos(t), -r * Math.sin(t)] as const; };
  // 10-19 (astro-compare.md ④): glyphs closer than 8° are spread both ways, across 0° too
  const shown = spreadGlyphs(vv.planets.map((x) => x.lon), 8);
  const pick = (name: string) => { setSel((s) => (s === name ? null : name)); track("astro", { locale, method: "tap_planet" }); };
  const selP = sel ? vv.planets.find((x) => x.name === sel) ?? null : null;
  const selAsp = sel ? vv.aspects.filter((a) => a.a === sel || a.b === sel) : [];
  const an = (n: string) => ui.aspectNames.split(",")[["合", "六合", "刑", "拱", "沖"].indexOf(n)] ?? n;
  const fmtDeg = (x: { deg: number; min: number }) => `${x.deg}°${String(x.min).padStart(2, "0")}′`;
  // 10-30 进度表 128 ④: pieces join the way the page's language joins them (Chinese runs them together)
  const f = (t: string | undefined, m: Record<string, string | number>) => (t ?? "").replace(/\{(\w+)\}/g, (_, k: string) => String(m[k] ?? ""));
  const colon = ui.colon ?? "：", gap = ui.gap ?? "　";
  const aspLine = (a: { a: string; b: string; name: string; orb: number }) => f(ui.fAsp ?? "{a}{n}{b}（{o}°）", { a: pn(a.a), n: an(a.name), b: pn(a.b), o: a.orb.toFixed(1) });
  const ps = (pl: string, sg: string) => f(ui.fPS ?? "{p}{s}", { p: pn(pl), s: sn(sg) });

  return (
    <div>
      <div className="flex flex-wrap items-baseline gap-x-3">
        <h1 className="t-d2">{p.name}</h1>
        <p className="t-small !text-[var(--ink-66)]">{p.input.y}/{p.input.m}/{p.input.d}{p.input.timeMode === "exact" && p.input.h !== undefined ? ` ${String(p.input.h).padStart(2, "0")}:${String(p.input.mi ?? 0).padStart(2, "0")}` : ""}</p>
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 t-small !text-[var(--ink-66)]">
        {vv.timeKnown && (
          <span>{ui.houseSys}{colon}
            {(["placidus", "whole"] as const).map((s) => <button key={s} type="button" onClick={() => setSys(s)} className={`ml-1.5 ${vv.houseSystem === s ? "font-medium !text-[var(--ink)]" : "underline underline-offset-4"}`}>{s === "placidus" ? ui.placidus : ui.whole}</button>)}
          </span>
        )}
        <span>{ui.tropical}</span>
        {vv.timeKnown && sys === "placidus" && vv.houseSystem === "whole" && <span>{ui.highLat}</span>}
      </div>
      {/* 10-23 进度表 114 ②: this chart's report already written → straight to it, no second press of the button below */}
      <ChartReportLinks sys="astro" locale={locale} input={p.input} gender={p.gender} />

      {/* answer card */}
      <section className="mt-[var(--s-4)]">
        <svg viewBox="-180 -180 360 360" className="w-full max-w-[30rem] mx-auto block" role="img" aria-label={ui.wheel}>
          <circle r={172} fill="none" stroke="var(--ink-16)" />
          <circle r={146} fill="none" stroke="var(--ink-16)" />
          <circle r={86} fill="none" stroke="var(--ink-16)" />
          {SIGNS.map((s, i) => {
            const [x1, y1] = pt(i * 30, 146), [x2, y2] = pt(i * 30, 172), [tx0, ty0] = pt(i * 30 + 15, 159);
            return <g key={s}><line x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--ink-16)" /><text x={tx0} y={ty0} textAnchor="middle" dominantBaseline="central" fontSize={15} fill={EL[i % 4]}>{SIGN_GLYPH[i]}</text></g>;
          })}
          {vv.cusps?.map((c, i) => {
            const [x1, y1] = pt(c, 86), [x2, y2] = pt(c, 146), [nx, ny] = pt(c + 6, 94);
            const strong = i === 0 || i === 9;
            return <g key={i}><line x1={x1} y1={y1} x2={x2} y2={y2} stroke={strong ? "var(--ink)" : "var(--ink-16)"} strokeWidth={strong ? 1.4 : 1} /><text x={nx} y={ny} textAnchor="middle" dominantBaseline="central" fontSize={8} fill="var(--ink-45)">{i + 1}</text></g>;
          })}
          {vv.asc !== null && (() => { const [x, y] = pt(vv.asc, 178); return <text x={x - 2} y={y} textAnchor="end" dominantBaseline="central" fontSize={9} fill="var(--ink)">ASC</text>; })()}
          {(sel ? selAsp.filter((a) => a.name !== "合") : vv.aspects.filter((a) => a.name !== "合").slice(0, 14)).map((a) => {
            const i = vv.planets.findIndex((x) => x.name === a.a), j = vv.planets.findIndex((x) => x.name === a.b);
            const [x1, y1] = pt(vv.planets[i]!.lon, 84), [x2, y2] = pt(vv.planets[j]!.lon, 84);
            return <line key={`${a.a}${a.b}`} x1={x1} y1={y1} x2={x2} y2={y2} stroke={ASP_COLOR[a.name]} strokeWidth={sel ? 1.3 : 0.8} strokeOpacity={sel ? 0.95 : 0.7} strokeDasharray={a.name === "六合" || a.name === "拱" ? "0" : "3 2"} />;
          })}
          {vv.planets.map((x, i) => {
            const [gx, gy] = pt(shown[i]!, 122), [lx1, ly1] = pt(x.lon, 140), [lx2, ly2] = pt(shown[i]!, 132);
            const on = sel === x.name, dim = sel !== null && !on && !selAsp.some((a) => a.a === x.name || a.b === x.name);
            return (
              <g key={x.name} role="button" tabIndex={0} aria-label={pn(x.name)} onClick={() => pick(x.name)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(x.name); } }} style={{ cursor: "pointer" }} opacity={dim ? 0.35 : 1}>
                <line x1={lx1} y1={ly1} x2={lx2} y2={ly2} stroke="var(--ink-45)" strokeWidth={0.5} />
                <circle cx={gx} cy={gy} r={10} fill={on ? "var(--ink)" : "transparent"} fillOpacity={on ? 0.1 : 0} stroke={on ? "var(--ink)" : "none"} strokeWidth={0.8} />
                <text x={gx} y={gy} textAnchor="middle" dominantBaseline="central" fontSize={14} fill="var(--ink)">{PLANET_GLYPH[i]}</text>
                {x.retro && <text x={gx + 7} y={gy + 6} fontSize={6} fill="var(--cinnabar)">R</text>}
              </g>
            );
          })}
        </svg>
        <dl className="mt-[var(--s-4)] grid grid-cols-[4.5em_1fr] gap-y-1.5 t-body">
          <dt className="t-sect pt-0.5">{ui.sun}</dt><dd>{sn(sun.sign)}{ui.zuo}</dd>
          <dt className="t-sect pt-0.5">{ui.moon}</dt><dd>{res.moonSplit ? ui.moonSplit.replace("{a}", sn(res.moonSplit[0])).replace("{b}", sn(res.moonSplit[1])) : `${sn(moon.sign)}${ui.zuo}`}</dd>
          <dt className="t-sect pt-0.5">{ui.rising}</dt><dd>{ascSign ? `${sn(ascSign)}${ui.zuo}` : ui.noRising}</dd>
        </dl>

        {/* 10-19 tap a planet: its sign, house and aspects */}
        {selP ? (
          <div className="mt-[var(--s-3)] p-[var(--s-3)] border border-[var(--ink-16)] rounded-[2px]">
            <div className="flex items-baseline justify-between gap-3">
              <p className="t-sect">{PLANET_GLYPH[vv.planets.indexOf(selP)]} {pn(selP.name)} · {sn(selP.sign)}{ui.zuo} {fmtDeg(selP)}{selP.house ? ` · ${ui.houseN.replace("{n}", String(selP.house))}` : ""}{selP.retro ? ` · ${ui.retro}` : ""}</p>
              <button type="button" onClick={() => setSel(null)} className="t-small underline underline-offset-4 !text-[var(--ink-66)] shrink-0">{ui.close}</button>
            </div>
            {tx?.ps[`${selP.name}|${selP.sign}`] && <p className="t-body mt-1 leading-relaxed"><b className="font-medium">{tx.ps[`${selP.name}|${selP.sign}`]!.title}</b>{gap}{tx.ps[`${selP.name}|${selP.sign}`]!.plain}</p>}
            {selP.house && tx?.ph[`${selP.name}|${selP.house}`] && <p className="t-small mt-1 leading-relaxed !text-[var(--ink-66)]">{ui.houseN.replace("{n}", String(selP.house))}{colon}{tx.ph[`${selP.name}|${selP.house}`]}</p>}
            <p className="t-small mt-2">{ui.selAspects}{colon}{selAsp.length ? selAsp.map(aspLine).join(gap) : ui.noAspect}</p>
          </div>
        ) : <p className="t-small mt-[var(--s-3)] !text-[var(--ink-45)]">{ui.tapHint}</p>}
        <AspectGrid v={vv} ui={ui} pn={pn} glyphs={PLANET_GLYPH} sel={sel} onSel={pick} />
      </section>

      {/* tables */}
      <details className="mt-[var(--s-4)] border-t border-[var(--ink-16)] pt-[var(--s-3)]">
        <summary className="cursor-pointer t-sect">{ui.tables}</summary>
        <table className="mt-2 w-full t-small">
          <tbody>
            {vv.planets.map((x, i) => <tr key={x.name} onClick={() => pick(x.name)} className={`border-b border-[var(--ink-16)] cursor-pointer ${sel === x.name ? "bg-[var(--ink)]/[0.05]" : ""}`}><td className="py-1.5">{PLANET_GLYPH[i]} {pn(x.name)}</td><td>{sn(x.sign)} {fmtDeg(x)}{x.nearCusp ? ` ${ui.near}` : ""}</td><td>{x.house ? ui.houseN.replace("{n}", String(x.house)) : ""}</td><td className="!text-[var(--cinnabar)]">{x.retro ? ui.retro : ""}</td></tr>)}
            <tr className="border-b border-[var(--ink-16)]"><td className="py-1.5">☊{VS} {ui.node}{ui.nodeMean}</td><td>{sn(vv.node.sign)}</td><td>{vv.node.house ? ui.houseN.replace("{n}", String(vv.node.house)) : ""}</td><td /></tr>
            {vv.trueNode && <tr className="border-b border-[var(--ink-16)]"><td className="py-1.5">☊{VS} {ui.node}{ui.nodeTrue}</td><td>{sn(vv.trueNode.sign)}</td><td>{vv.trueNode.house ? ui.houseN.replace("{n}", String(vv.trueNode.house)) : ""}</td><td /></tr>}
          </tbody>
        </table>
        {vv.cusps && (
          <p className="t-small mt-3 leading-relaxed">{vv.cusps.map((c, i) => `${ui.houseN.replace("{n}", String(i + 1))} ${sn(SIGNS[Math.floor(c / 30)]!)} ${Math.floor(c % 30)}°`).join(gap)}</p>
        )}
        <p className="t-small mt-3 leading-relaxed">{vv.aspects.slice(0, 12).map(aspLine).join(gap)}</p>
      </details>

      {/* 10-19 看懂這張盤 (lib/mingli/astro/insight.ts) */}
      <section className="mt-[var(--s-5)] border-t border-[var(--ink-16)] pt-[var(--s-4)]">
        <h2 className="t-d3 mb-[var(--s-3)]">{ui.insightHead}</h2>
        <AstroInsight v={vv} ins={ins} ui={ui} sn={sn} pn={pn} moonSplit={res.moonSplit} aspTexts={tx?.aspects ?? {}} />
      </section>

      {/* 10-20 星盤②③ 付費報告 — under the free layer (astro-paid switch) */}
      {/* 10-22 命盤問答 (lib/mingli/qa.ts): 問這張盤 */}
      <ChartQA system="astro" locale={locale} input={p.input} gender={p.gender} castHref={castHref.split("?")[0]!} />
      <AstroReports locale={locale} ui={ui} input={p.input} gender={p.gender} />
      {/* 10-20 合盤 entry (hepan switch) */}
      <HepanLink locale={locale} from="astro" />

      {/* 10-19 你可能想問 + 星盤卡 (same pattern as 八字) */}
      <section className="mt-[var(--s-5)] border-t border-[var(--ink-16)] pt-[var(--s-4)]">
        <p className="t-sect">{ui.askHead}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {ui.asks.split("|").map((item) => {
            const [label, kind, arg] = item.split("~") as [string, string, string];
            const cls = "px-3.5 py-2 rounded-full border border-[var(--ink-16)] hover:border-[var(--ink)] text-[14px] text-left";
            if (kind === "jump") return <button key={label} type="button" className={cls} onClick={() => { document.getElementById(arg)?.scrollIntoView({ behavior: "smooth" }); track("astro", { locale, method: `ask_jump:${arg}` }); }}>{label}</button>;
            return <a key={label} className={cls} onClick={() => track("astro", { locale, method: "ask_cast" })} href={`${castHref}${castHref.includes("?") ? "&" : "?"}${new URLSearchParams({ q: arg, c: "astro" })}`}>{label}</a>;
          })}
        </div>
        <div className="mt-[var(--s-4)]">
          <p className="t-small mb-2 !text-[var(--ink-66)]">{ui.cardLead}</p>
          <ShareSheet locale={locale} surface={SURFACE} compact
            url={`${typeof window === "undefined" ? "https://yaoflow.com" : window.location.origin}/${locale}/xingpan?c=astro-share`}
            text={ui.cardText}
            image={`/api/astro/card?${new URLSearchParams({
              s: sun.sign, m: res.moonSplit ? res.moonSplit.join(",") : moon.sign, ...(ascSign ? { a: ascSign } : {}),
              e: ["火", "土", "風", "水"].map((k) => ins.elements[k as keyof typeof ins.elements]).join(","),
              q: ["基本", "固定", "變動"].map((k) => ins.modes[k as keyof typeof ins.modes]).join(","),
              ...(ins.dominant[0] ? { d: ins.dominant[0].planet } : {}),
              l: locale,
            })}`}
            fileName={`yaoflow-astro-${SIGN_SLUG_SHORT[SIGNS.indexOf(sun.sign as (typeof SIGNS)[number])]}.png`} />
        </div>
      </section>

      {/* words */}
      {locked && <ChartReadingLock locale={locale} />}
      {tx && (
        <section className="mt-[var(--s-6)] grid gap-[var(--s-5)]">
          {[sun, moon].map((x) => { const t = tx.ps[`${x.name}|${x.sign}`]; return t ? (
            <div key={x.name}>
              <p className="t-sect">{ps(x.name, x.sign)}</p>
              <p className="t-d3 mt-1">{t.title}</p>
              <p className="t-body mt-2 leading-relaxed">{t.plain}</p>
              <p className="t-body mt-2"><b className="font-medium">{ui.love}</b>{gap}{t.love}</p>
              <p className="t-body mt-1"><b className="font-medium">{ui.work}</b>{gap}{t.work}</p>
              <p className="t-body mt-1"><b className="font-medium !text-[var(--cinnabar)]">{ui.watch}</b>{gap}{t.watch}</p>
            </div>) : null; })}
          {tx.rising && ascSign && <div><p className="t-sect">{f(ui.fRising ?? "{r}{s}", { r: ui.rising!, s: sn(ascSign) })}</p><p className="t-body mt-2 leading-relaxed">{tx.rising}</p></div>}
          <div>
            <p className="t-sect">{ui.others}</p>
            <ul className="mt-2 grid gap-2">
              {vv.planets.slice(2).map((x) => { const t = tx.ps[`${x.name}|${x.sign}`]; return t ? <li key={x.name} className="t-body"><b className="font-medium">{ps(x.name, x.sign)}</b>{gap}{t.title}{x.house && tx.ph[`${x.name}|${x.house}`] ? <span className="block t-small mt-0.5 !text-[var(--ink-66)]">{ui.houseN.replace("{n}", String(x.house))}{colon}{tx.ph[`${x.name}|${x.house}`]}</span> : null}</li> : null; })}
            </ul>
          </div>
          {/* 10-19: the aspect words now sit in 看懂這張盤 → 最緊的幾個相位 */}
          {tx.node && <div><p className="t-sect">{ui.nodeHead.replace("{s}", sn(vv.node.sign))}</p><p className="t-body mt-2 leading-relaxed">{tx.node}</p></div>}
        </section>
      )}

      <section className="mt-[var(--s-6)] border-t border-[var(--ink-16)] pt-[var(--s-5)]">
        <p className="t-body">{ui.matter}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {ui.topics.split(",").map((t, i) => (
            <a key={t} href={`${castHref}?${new URLSearchParams({ q: ui.topicQ.split(",")[i] ?? "", c: "xingpan" })}`} onClick={() => track("astro", { locale, method: "to_cast" })} className="px-4 py-2 rounded-[2px] border border-[var(--ink-16)] hover:border-[var(--ink)] t-body !text-[15px]">{t}</a>
          ))}
        </div>
      </section>
      <p className="mt-[var(--s-5)] t-small"><a href={formHref} className="underline underline-offset-4 !text-[var(--ink-66)]">{ui.other}</a></p>
    </div>
  );
}
