"use client";

import { useEffect, useMemo, useState } from "react";
import { LunarDay, SolarDay } from "tyme4ts";
import { astrolabeOf, GRID, layerOf, opposite, palaceLabel, sanFang, viewOf, type ZLayer, type ZPalace } from "@/lib/mingli/ziwei/chart";
import { normalizeBirth, fmt, type BirthInput } from "@/lib/mingli/birth/normalize";
import { baziOf } from "@/lib/mingli/bazi/chart";
import { currentProfile, syncProfiles, updateInput, type Profile } from "@/lib/mingli/birth/profiles";
import type { StarPalace } from "@/lib/mingli/ziwei/content";
import { track } from "@/lib/track";
import { cardQuery, flyOf, selfMutOf, topGeju } from "@/lib/mingli/ziwei/insight";
import ShareSheet from "@/components/ShareSheet";
import { hzOf, MUT_COLOR, ZiweiCompare, ZiweiFlyList, ZiweiSummary } from "./ZiweiInsight";
import ZiweiReports from "./ZiweiReports";
import HepanLink from "./HepanLink";
import ChartQA from "./ChartQA";
import ChartReadingLock from "./ChartReadingLock";
import ChartReportLinks from "./ChartReportLinks";
import { zwNameOf, type ZiweiNames, type ZwLang, type ZwName } from "@/lib/mingli/ziwei/names-fmt";
import type { BaziNames } from "@/lib/mingli/bazi/names-fmt";

/**
 * 10-18 进度表 71 紫微斗數 — the chart page body: the 4×4 board (巳 top-left), a palace opens its stars and words,
 * 三方四正 drawn on the board, 本命／大限／流年／流月 switch. Worked out here; the server only gets star and palace names.
 * 10-19 看懂這張盤 (ZiweiInsight): summary card + 格局 on top, 宮干四化 for the open palace (lines on the board, 自化
 * marks in every palace), 前後時辰 table, 你可能想問 and the 命盤卡.
 * 10-30 进度表 128 ④: a page in another language hands its names (`names`: lib/mingli/ziwei/names.ts with the 八字 names
 * for the stems, branches, hours and lunar dates) — every chart word on the board and in the text is said in them; the
 * 雜曜 are left out; a legend under the board spells out the brightness marks and the transformation badges.
 */
type Texts = {
  pairs: Record<string, StarPalace>; empty: Record<string, string>; mutagen: Record<string, { plain: string; palace: string }>;
  minor: Record<string, string>; yearly: { plain: string; ask_next: string } | null; monthly: string | null;
};
export type ZiweiUi = Record<string, string>;
type Mode = "natal" | "decadal" | "yearly" | "monthly";
const MUT_CLS: Record<string, string> = { 祿: "bg-[#5b7f4e]", 權: "bg-[#9a7b45]", 科: "bg-[#3f6386]", 忌: "bg-[var(--cinnabar)]" };

export default function ZiweiChart({ locale, ui, formHref, baziHref, castHref, starsHref, names = null }: { locale: string; ui: ZiweiUi; formHref: string; baziHref: string | null; castHref: string; starsHref: string; names?: { zw: ZiweiNames; bz: BaziNames } | null }) {
  const Z: ZwName | null = useMemo(() => (names ? zwNameOf(names.zw, names.bz, locale as ZwLang) : null), [names, locale]);
  const [p, setP] = useState<Profile | null | undefined>(undefined);
  const [override, setOverride] = useState<Partial<BirthInput> | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("natal");
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(1);
  const [dec, setDec] = useState<number | null>(null);
  const [tx, setTx] = useState<Texts | null>(null);
  const [locked, setLocked] = useState(false); // 10-25: the plain reading needs a 通卡 or a membership
  useEffect(() => {
    // 10-22 生辰檔案: a profile already on this device shows at once (the account's list refreshes behind it); on a
    // new device the signed-in reader's list comes down first, so nothing has to be typed again
    const cur = currentProfile();
    if (cur) { setP(cur); void syncProfiles(); return; }
    void syncProfiles().then(() => setP(currentProfile()));
  }, []);

  const res = useMemo(() => {
    if (!p || !p.gender) return null;
    try {
      const n = normalizeBirth({ ...p.input, ...(override ?? {}) });
      if (!n.timeKnown) return { kind: "need" as const, n };
      const aTw = astrolabeOf(n, p.gender, "zh-TW");
      const aShow = locale === "zh" ? astrolabeOf(n, p.gender, "zh-CN") : aTw;
      // 10-19 (對照): iztro's 干支 line takes the month from the 農曆 month; the centre shows the same 八字 as our 八字 page
      let bz: string | null = null;
      try { bz = baziOf(n, p.gender, new Date().getFullYear(), locale === "zh").pillars.map((x) => x.gz).join(" "); } catch { /* keep iztro's */ }
      return { kind: "ok" as const, n, aTw, keys: viewOf(aTw), view: viewOf(aShow), aShow, bz };
    } catch { return { kind: "err" as const }; }
  }, [p, override, locale]);

  const ok = res && res.kind === "ok" ? res : null;
  const hz = useMemo(() => (ok ? hzOf(ok.keys, ok.view, locale === "zh") : (s: string) => s), [ok, locale]);
  const gj = useMemo(() => (ok ? topGeju(ok.keys) : null), [ok]);
  const selfMuts = useMemo(() => (ok ? selfMutOf(ok.keys) : {}), [ok]);
  // 10-30: a self-transformation on a Latin-language board is ↺ (the legend says so) — "SelfQuan" read as one word
  const selfMk = Z && Z.N.bright[0] === "+3" ? "↺" : ui.selfMark;
  // the layer for the chosen mode
  const layer: ZLayer | null = useMemo(() => {
    if (!ok || mode === "natal") return null;
    const by = ok.n.solarDate.y;
    let when: Date;
    if (mode === "decadal") { const pal = ok.view.palaces[dec ?? 0]!; when = new Date(by + pal.decadal[0] - 1, 6, 1); }
    else if (mode === "yearly") when = new Date(year, 6, 1);
    else { const sd = LunarDay.fromYmd(year, month, 15).getSolarDay(); when = new Date(sd.getYear(), sd.getMonth() - 1, sd.getDay()); }
    try { return layerOf(ok.aShow, when, mode); } catch { return null; }
  }, [ok, mode, year, month, dec]);

  // words: every palace's main stars (or the stars across for an empty palace), 四化, the minor stars, this year's palace
  useEffect(() => {
    if (!ok) return;
    const k = ok.keys;
    const pairs: [string, string][] = [], empty: string[] = [], mut: [string, string][] = [], minor = new Set<string>();
    for (const pal of k.palaces) {
      const stars = pal.major.map((s) => s.name);
      if (stars.length) stars.forEach((s) => pairs.push([s, pal.name]));
      else { empty.push(pal.name); k.palaces.find((x) => x.branch === opposite(pal.branch))?.major.forEach((s) => pairs.push([s.name, pal.name])); }
      for (const s of [...pal.major, ...pal.minor]) if (s.mut) mut.push([s.mut, pal.name]);
      pal.minor.forEach((s) => minor.add(s.name));
    }
    let yearly: string | undefined;
    try { const ly = layerOf(ok.aTw, new Date(), "yearly"); yearly = k.palaces.find((x) => x.branch === ly.palaceBranch)?.name; } catch { /* */ }
    void fetch("/api/ziwei/text", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ locale, pairs, empty, mutagen: mut, minor: [...minor], yearly }) })
      .then((r) => { setLocked(r.status === 402); return r.ok ? r.json() : null; }).then((j) => setTx(j as Texts | null)).catch(() => setTx(null));
    track("ziwei", { locale, method: `chart:${p?.input.timeMode}:${p?.input.placeId?.split("-")[0] ?? "-"}` });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ok?.keys.soulBranch, ok?.keys.chineseDate, ok?.keys.time]);

  if (p === undefined) return <p className="t-body !text-[var(--ink-45)]">…</p>;
  if (!p || !p.gender) return <p className="t-body">{ui.noProfile} <a href={formHref} className="underline underline-offset-4">{ui.toForm}</a></p>;
  if (!res || res.kind === "err") return <p className="t-body">{ui.bad} <a href={formHref} className="underline underline-offset-4">{ui.toForm}</a></p>;
  if (res.kind === "need") {
    return (
      <div className="grid gap-3">
        <h1 className="t-d2">{p.name}</h1>
        <p className="t-body">{ui.needTime}</p>
        <div className="flex flex-wrap gap-1.5">{ui.branchNames.split(",").map((b, i) => <button key={b} type="button" onClick={() => setOverride({ timeMode: "branch", branch: i })} className="px-3 py-1.5 rounded-[2px] border border-[var(--ink-16)] t-small">{b}</button>)}</div>
        {baziHref && <a href={baziHref} className="t-body underline underline-offset-4">{ui.toBazi}</a>}
      </div>
    );
  }
  const { n, view, keys } = res;
  const setOpt = (patch: Partial<BirthInput>) => { updateInput(p.id, patch); setP({ ...p, input: { ...p.input, ...patch } }); setOverride(null); };
  const byBranch = (b: string) => view.palaces.find((x) => x.branch === b)!;
  const keyOf = (pal: ZPalace) => keys.palaces[view.palaces.indexOf(pal)]!;
  const hi = sel ? sanFang(sel) : [];
  const flies = sel ? flyOf(keys, sel) : [];
  const pl = (x: string) => (Z ? Z.palaceFull(x) : palaceLabel(x, locale === "zh"));
  /** the words a page in another language uses for the chart's own characters */
  const gap = Z ? (Z.l === "ja" ? "　" : Z.colon) : "　";
  const sn = (s: string) => (Z ? Z.star(s) : s);
  const mb = (m: string) => (Z ? Z.mut(m) : m);
  const lunarOf = () => { try { const d = SolarDay.fromYmd(n.chartDate.y, n.chartDate.m, n.chartDate.d).getLunarDay(); const mo = d.getLunarMonth(); return Z!.lunar(mo.getLunarYear().getYear(), Math.abs(mo.getMonthWithLeap()), mo.isLeap(), d.getDay()); } catch { return view.lunarDate; } };
  const layerName = (pal: ZPalace) => (layer ? layer.names[view.palaces.indexOf(pal)] : null);
  const soul = byBranch(view.soulBranch), body = byBranch(view.bodyBranch);
  const center = (b: string) => { const [r, c] = GRID[b]!; return [c + 0.5, r + 0.5]; };

  const palaceText = (pal: ZPalace) => {
    if (!tx) return null;
    const k = keyOf(pal);
    const stars = k.major.length ? k.major.map((s) => s.name) : (keys.palaces.find((x) => x.branch === opposite(k.branch))?.major.map((s) => s.name) ?? []);
    return (
      <div className="grid gap-3">
        {!k.major.length && tx.empty[k.name] && <p className="t-body leading-relaxed !text-[var(--ink-66)]">{tx.empty[k.name]}</p>}
        {stars.map((s, i) => { const t = tx.pairs[`${s}|${k.name}`]; return t ? (
          <div key={s}>
            <p className="t-sect">{Z ? Z.star(s) : (view.palaces.find((x) => x.branch === (k.major.length ? k.branch : opposite(k.branch)))?.major[i]?.name) ?? s}</p>
            <p className="t-d3 mt-1">{t.title}</p>
            <p className="t-body mt-1.5 leading-relaxed">{t.plain}</p>
            <p className="t-body mt-1.5"><b className="font-medium">{ui.strength}</b>{gap}{t.strength}</p>
            <p className="t-body mt-1"><b className="font-medium !text-[var(--cinnabar)]">{ui.watch}</b>{gap}{t.watch}</p>
          </div>) : null; })}
      </div>
    );
  };

  return (
    <div>
      {/* 1. head */}
      <div className="flex flex-wrap items-baseline gap-x-3">
        <h1 className="t-d2">{p.name}</h1>
        <p className="t-small !text-[var(--ink-66)]">{p.input.calendar === "lunar" ? ui.lunar : ui.solar} {p.input.y}/{p.input.m}/{p.input.d} · {Z && n.hourBranch !== null ? Z.hour(n.hourBranch) : view.time}</p>
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 t-small !text-[var(--ink-66)]">
        {n.clock && n.chartTime && <button type="button" onClick={() => setOpt({ trueSolar: !n.trueSolar })} className="underline underline-offset-4">{n.trueSolar ? ui.tsOn.replace("{t}", fmt(n.chartTime).slice(11)) : ui.tsOff}</button>}
        <button type="button" onClick={() => setOpt({ zi: n.zi === "next" ? "same" : "next" })} className="underline underline-offset-4">{n.zi === "next" ? ui.ziNext : ui.ziSame}</button>
        <span>{ui.basisLine}</span>
      </div>
      {n.dst && <p className="t-small mt-1 !text-[var(--ink-66)]">{ui.dst}</p>}
      {p.input.timeMode !== "exact" && <p className="t-small mt-1 !text-[var(--ink-66)]">{override ? ui.timeGuess : ""}</p>}
      {n.nearBoundary && n.hourBranch !== null && !override && (
        <p className="t-small mt-2">{ui.near}{" "}
          {[-1, 1].map((k) => { const b = (n.hourBranch! + k + 12) % 12; return <button key={k} type="button" onClick={() => setOverride({ timeMode: "branch", branch: b })} className="underline underline-offset-4 mx-1">{ui.branchNames.split(",")[b]}</button>; })}
        </p>
      )}
      {override && p.input.timeMode === "exact" && <p className="t-small mt-2">{ui.alt} <button type="button" onClick={() => setOverride(null)} className="underline underline-offset-4">{ui.back}</button></p>}
      {/* 10-23 进度表 114 ② (#838 「深入紫微每次要再點」): this chart's report already written → straight to it */}
      <ChartReportLinks sys="ziwei" locale={locale} input={{ ...p.input, ...(override ?? {}) } as BirthInput} gender={p.gender} />

      {p.input.timeMode !== "exact" || n.nearBoundary ? <ZiweiCompare input={{ ...p.input, ...(override ?? {}) } as BirthInput} n={n} gender={p.gender} ui={ui} locale={locale} onOpen={(i) => setOverride(i)} Z={Z} /> : null}


      {/* layer switch */}
      <div className="mt-[var(--s-4)] flex flex-wrap items-center gap-2 t-small">
        {(["natal", "decadal", "yearly", "monthly"] as const).map((m) => (
          <button key={m} type="button" onClick={() => { setMode(m); if (m === "decadal" && dec === null) setDec(view.palaces.indexOf(view.palaces.find((x) => { const age = new Date().getFullYear() - n.solarDate.y + 1; return age >= x.decadal[0] && age <= x.decadal[1]; }) ?? soul)); }}
            className={`px-3 py-1.5 rounded-[2px] border ${mode === m ? "border-[var(--ink)] bg-[var(--ink)] !text-[var(--paper)]" : "border-[var(--ink-16)]"}`}>{ui[m]}</button>
        ))}
        {mode === "decadal" && dec !== null && (
          <span className="inline-flex items-center gap-2 ml-1">
            <button type="button" onClick={() => setDec((dec + 11) % 12)} aria-label="prev">‹</button>
            <span className="tabular-nums">{view.palaces[dec]!.decadal[0]}–{view.palaces[dec]!.decadal[1]}{ui.age}</span>
            <button type="button" onClick={() => setDec((dec + 1) % 12)} aria-label="next">›</button>
          </span>
        )}
        {(mode === "yearly" || mode === "monthly") && (
          <span className="inline-flex items-center gap-2 ml-1">
            <button type="button" onClick={() => setYear(year - 1)} aria-label="prev">‹</button><span className="tabular-nums">{year}</span><button type="button" onClick={() => setYear(year + 1)} aria-label="next">›</button>
          </span>
        )}
        {mode === "monthly" && (
          <select value={month} onChange={(e) => setMonth(+e.target.value)} className="border border-[var(--ink-16)] rounded-[2px] px-1.5 py-1 bg-transparent">{Array.from({ length: 12 }, (_, i) => <option key={i} value={i + 1}>{ui.lunarMonth.replace("{m}", String(i + 1))}</option>)}</select>
        )}
      </div>

      {/* 2. the board */}
      <section className="mt-[var(--s-3)] relative">
        <div className="grid grid-cols-4 grid-rows-4 border-l border-t border-[var(--ink-16)] relative">
          {Object.entries(GRID).map(([b, [r, c]]) => {
            const pal = byBranch(b);
            const on = hi.includes(b), main = sel === b;
            const ln = layerName(pal);
            return (
              <button key={b} type="button" onClick={() => { setSel(main ? null : b); track("ziwei", { locale, method: `palace:${keyOf(pal).name}` }); }}
                style={{ gridRow: r + 1, gridColumn: c + 1 }}
                className={`relative text-left p-1 sm:p-1.5 min-h-[92px] sm:min-h-[128px] border-r border-b border-[var(--ink-16)] ${main ? "bg-[var(--gold)]/[0.16]" : on ? "bg-[var(--gold)]/[0.07]" : ""}`}>
                <span className="flex flex-wrap gap-x-1">
                  {pal.major.map((s) => (
                    <span key={s.name} className={`${Z && Z.l !== "ja" ? "text-[11px] sm:text-[13px]" : "text-[13px] sm:text-[15px]"} leading-tight font-medium`}>{sn(s.name)}
                      {s.bright && <span className="text-[9px] sm:text-[10px] font-normal !text-[var(--ink-45)] ml-px">{Z ? Z.bright(s.bright) : s.bright}</span>}
                      {s.mut && <span className={`text-[9px] text-white px-0.5 ml-px rounded-[1px] ${MUT_CLS[s.mut] ?? ""}`}>{mb(s.mut)}</span>}
                      {layer?.mutagen[s.name] && <span className={`text-[9px] text-white px-0.5 ml-px rounded-[1px] opacity-70 ${MUT_CLS[layer.mutagen[s.name]!] ?? ""}`}>{mb(layer.mutagen[s.name]!)}</span>}
                    </span>
                  ))}
                </span>
                <span className="hidden sm:flex flex-wrap gap-x-1 mt-0.5 text-[11px] !text-[var(--ink-66)]">
                  {pal.minor.map((s) => <span key={s.name}>{sn(s.name)}{s.mut && <span className={`text-[9px] text-white px-0.5 ml-px rounded-[1px] ${MUT_CLS[s.mut] ?? ""}`}>{mb(s.mut)}</span>}{layer?.mutagen[s.name] && <span className={`text-[9px] text-white px-0.5 ml-px rounded-[1px] opacity-70 ${MUT_CLS[layer.mutagen[s.name]!] ?? ""}`}>{mb(layer.mutagen[s.name]!)}</span>}</span>)}
                </span>
                {(flies.some((f) => f.to === b) || (selfMuts[b]?.length ?? 0) > 0) && (
                  <span className="absolute right-1 top-1 flex flex-col items-end gap-px">
                    {flies.filter((f) => f.to === b).map((f) => <span key={`f${f.m}`} className={`text-[9px] text-white px-0.5 rounded-[1px] ${MUT_CLS[f.m] ?? ""}`}>{f.self ? selfMk : "→"}{Z ? Z.mut(f.m) : hz(f.m)}</span>)}
                    {!main && selfMuts[b]?.map((x) => <span key={`s${x.m}`} className="text-[9px] leading-none !text-[var(--ink-45)]">{selfMk}{Z ? Z.mut(x.m) : hz(x.m)}</span>)}
                  </span>
                )}
                <span className="absolute left-1 right-1 bottom-1 flex items-end justify-between">
                  <span className="text-[11px] sm:text-[12px] font-medium">{Z ? Z.palace(pal.name) : pal.name.replace(/[宮宫]$/, "")}{pal.isBody && <span className={`${Z && Z.l !== "ja" ? "block text-[9px] font-normal" : "ml-0.5"} !text-[var(--gold-text)]`}>{ui.bodyMark}</span>}
                    {ln && <span className="block text-[10px] font-normal !text-[var(--gold-text)]">{Z ? `${Z.N.layer[layer!.kind]}·${Z.palace(ln)}` : `${layer!.label.slice(0, 1)}${ln.replace("宮", "")}`}</span>}
                  </span>
                  <span className="text-[10px] !text-[var(--ink-45)] text-right leading-tight">{Z ? Z.gz(`${pal.stem}${pal.branch}`) : `${pal.stem}${pal.branch}`}<span className="block tabular-nums">{pal.decadal[0]}–{pal.decadal[1]}</span></span>
                </span>
              </button>
            );
          })}
          {/* center */}
          <div style={{ gridRow: "2 / span 2", gridColumn: "2 / span 2" }} className="border-r border-b border-[var(--ink-16)] p-2 sm:p-3 flex flex-col justify-center text-center">
            <p className="text-[12px] sm:t-small">{Z ? (res.bz ?? view.chineseDate).split(" ").map((x) => Z.gz(x)).join(" · ") : res.bz ?? view.chineseDate}</p>
            <p className="text-[11px] sm:text-[12px] mt-1 !text-[var(--ink-66)]">{Z ? ui.lunarLine!.replace("{l}", lunarOf()) : view.lunarDate}</p>
            <p className="text-[11px] sm:text-[12px] mt-1">{Z ? Z.five(view.fiveClass) : view.fiveClass} · {Z ? Z.josa(ui.soulAt.replace("{b}", Z.branch(view.soulBranch))) : ui.soulAt.replace("{b}", view.soulBranch)} · {Z ? Z.josa(ui.bodyAt.replace("{b}", Z.branch(view.bodyBranch))) : ui.bodyAt.replace("{b}", view.bodyBranch)}</p>
            <p className="text-[11px] sm:text-[12px] mt-1 !text-[var(--ink-66)]">{ui.soulStar} {sn(view.soulStar)} · {ui.bodyStar} {sn(view.bodyStar)}</p>
            {layer && <p className="text-[11px] sm:text-[12px] mt-1 !text-[var(--gold-text)]">{Z ? `${ui[mode]} ${Z.gz(`${layer.stem}${layer.palaceBranch}`)}` : `${layer.label} ${layer.stem}${layer.palaceBranch}`}</p>}
          </div>
        </div>
        {sel && (
          <svg className="pointer-events-none absolute inset-0 w-full h-full" viewBox="0 0 4 4" preserveAspectRatio="none">
            {hi.slice(1).map((b) => { const [x1, y1] = center(sel); const [x2, y2] = center(b); return <line key={b} x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--gold)" strokeWidth={0.02} strokeDasharray="0.06 0.04" />; })}
            {flies.filter((f) => f.to && !f.self).map((f, i) => {
              const [x1, y1] = center(sel); const [x2, y2] = center(f.to!);
              // stop short of the centre and fan the four lines a little so two landing in one palace stay apart
              const dx = x2! - x1!, dy = y2! - y1!, len = Math.hypot(dx, dy) || 1, k = (len - 0.32) / len, o = (i - 1.5) * 0.035;
              const ex = x1! + dx * k - (dy / len) * o, ey = y1! + dy * k + (dx / len) * o;
              return <g key={f.m}><line x1={x1! - (dy / len) * o} y1={y1! + (dx / len) * o} x2={ex} y2={ey} stroke={MUT_COLOR[f.m]} strokeWidth={0.025} /><circle cx={ex} cy={ey} r={0.04} fill={MUT_COLOR[f.m]} /></g>;
            })}
          </svg>
        )}
      </section>
      <p className="t-small mt-2 !text-[var(--ink-45)]">{ui.tap}</p>
      {Z && Z.N.bright[0] === "+3" && (
        <p className="mt-1 text-[11px] leading-relaxed !text-[var(--ink-45)]">
          {ui.legendBright}{Z.colon}{Z.N.bright.map((b, i) => `${b} ${Z.N.brightWord[i]}`).join(" · ")}<br />
          {ui.legendMut}{Z.colon}{Z.N.mut.map((m, i) => `${m} = ${Z.N.mutFull[i]} (${Z.N.mutGloss[i]})`).join(" · ")} · ↺ = {ui.flySelf}
        </p>
      )}

      {/* the open palace */}
      {sel && (() => { const pal = byBranch(sel); return (
        <section className="mt-[var(--s-4)] rounded-[2px] border border-[var(--gold)] px-[var(--s-4)] py-[var(--s-4)]">
          <h2 className="t-d3">{pl(pal.name)}<span className="t-small ml-2 !text-[var(--ink-66)]">{Z ? Z.gz(`${pal.stem}${pal.branch}`) : `${pal.stem}${pal.branch}`} · {ui.dec} {pal.decadal[0]}–{pal.decadal[1]}{ui.age}</span></h2>
          <p className="t-small mt-2">{(Z
            ? [...pal.major.map((s) => `${Z.starBright(s.name, s.bright)}${s.mut ? ` ${Z.mutFull(s.mut)}` : ""}`), ...pal.minor.map((s) => `${Z.star(s.name)}${s.mut ? ` ${Z.mutFull(s.mut)}` : ""}`)].join(Z.list)
            : [...pal.major.map((s) => `${s.name}${s.bright ? `（${s.bright}）` : ""}${s.mut ? `化${s.mut}` : ""}`), ...pal.minor.map((s) => `${s.name}${s.mut ? `化${s.mut}` : ""}`)].join("、")) || ui.emptyPalace}</p>
          {pal.adj.length > 0 && !Z && <p className="t-small mt-1 !text-[var(--ink-45)]">{pal.adj.join("、")}</p>}
          <ZiweiFlyList keys={keys} branch={sel} ui={ui} hz={hz} hans={locale === "zh"} Z={Z} />
          <div className="mt-3">{palaceText(pal)}</div>
          {tx && keyOf(pal).minor.filter((s) => tx.minor[s.name]).length > 0 && (
            <ul className="mt-3 grid gap-1 t-small">{keyOf(pal).minor.filter((s) => tx.minor[s.name]).map((s, i) => <li key={s.name}><b className="font-medium">{Z ? Z.star(s.name) : pal.minor[i]?.name ?? s.name}</b>{gap}{tx.minor[s.name]}</li>)}</ul>
          )}
        </section>
      ); })()}

      {/* 看懂這張盤 — under the board (as on 八字: the chart first, then the reading of it) */}
      {gj && <section className="mt-[var(--s-5)]"><ZiweiSummary keys={keys} a={res.aTw} ui={ui} hz={hz} hans={locale === "zh"} gj={gj} Z={Z} /></section>}

      {/* 10-20 紫微②③ 付費報告 — under the free layer (ziwei-paid switch) */}
      {/* 10-22 命盤問答 (lib/mingli/qa.ts): 問這張盤 */}
      <ChartQA system="ziwei" locale={locale} input={{ ...p.input, ...(override ?? {}) } as BirthInput} gender={p.gender} castHref={castHref.split("?")[0]!} />
      <ZiweiReports locale={locale} ui={ui} input={{ ...p.input, ...(override ?? {}) } as BirthInput} gender={p.gender} />
      {/* 10-20 合盤 entry (hepan switch) */}
      <HepanLink locale={locale} from="ziwei" />

      {/* 你可能想問 + 命盤卡 */}
      <section className="mt-[var(--s-5)] border-t border-[var(--ink-16)] pt-[var(--s-4)]">
        <p className="t-sect">{ui.askHead}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {ui.asks.split("|").map((item) => {
            const [label, kind, arg] = item.split("~") as [string, string, string];
            const cls = "px-3.5 py-2 rounded-full border border-[var(--ink-16)] hover:border-[var(--ink)] text-[14px] text-left";
            if (kind === "jump") return <button key={label} type="button" className={cls} onClick={() => { document.getElementById(arg)?.scrollIntoView({ behavior: "smooth" }); track("ziwei", { locale, method: `ask_jump:${arg}` }); }}>{label}</button>;
            return <a key={label} className={cls} onClick={() => track("ziwei", { locale, method: "ask_cast" })} href={`${castHref}${castHref.includes("?") ? "&" : "?"}${new URLSearchParams({ q: arg, c: "ziwei" })}`}>{label}</a>;
          })}
        </div>
        <div className="mt-[var(--s-4)]">
          <p className="t-small mb-2 !text-[var(--ink-66)]">{ui.cardLead}</p>
          <ShareSheet locale={locale} surface="ziwei" compact
            url={`${typeof window === "undefined" ? "https://yaoflow.com" : window.location.origin}/${locale}/ziwei?c=ziwei-share`}
            text={ui.cardText}
            image={`/api/ziwei/card?${cardQuery(keys, gj?.top ?? null, locale === "zh" ? "zh" : Z ? locale : "zh-hant")}`}
            fileName={`yaoflow-ziwei-${keys.soulBranch}.png`} />
        </div>
      </section>

      {/* 3. reading */}
      {locked && <ChartReadingLock locale={locale} />}
      {tx && (
        <section className="mt-[var(--s-6)] grid gap-[var(--s-5)]">
          <div><p className="t-sect">{ui.soulHead}</p><div className="mt-2">{palaceText(soul)}</div></div>
          {body !== soul && <div><p className="t-sect">{ui.bodyHead.replace("{p}", pl(body.name))}</p><div className="mt-2">{palaceText(body)}</div></div>}
          {Object.keys(tx.mutagen).length > 0 && (
            <div>
              <p className="t-sect">{ui.mutHead}</p>
              <ul className="mt-2 grid gap-3">
                {Object.entries(tx.mutagen).map(([k, v]) => { const [m, pal] = k.split("|"); return (
                  <li key={k} className="t-body leading-relaxed">{!Z && v.palace.startsWith(`化${m}`) ? v.palace : <><b className="font-medium">{Z ? Z.josa(ui.mutIn.replace("{m}", Z.mutFull(m!)).replace("{p}", pl(pal!))) : ui.mutIn.replace("{m}", m!).replace("{p}", pl(pal!))}</b>{gap}{v.palace}</>}</li>
                ); })}
              </ul>
            </div>
          )}
          {tx.yearly && <div><p className="t-sect">{ui.yearHead.replace("{y}", String(new Date().getFullYear()))}</p><p className="t-body mt-2 leading-relaxed">{tx.yearly.plain}</p><p className="t-body mt-2 border-l-2 border-[var(--gold)] pl-3">{tx.yearly.ask_next}</p></div>}
          <details>
            <summary className="cursor-pointer t-sect">{ui.allPalaces}</summary>
            <div className="mt-3 grid gap-[var(--s-4)]">
              {view.palaces.filter((x) => x !== soul && x !== body).map((x) => <div key={x.branch}><p className="t-sect">{pl(x.name)}</p><div className="mt-1">{palaceText(x)}</div></div>)}
            </div>
          </details>
        </section>
      )}

      {/* 5. back to the matter */}
      <section className="mt-[var(--s-6)] border-t border-[var(--ink-16)] pt-[var(--s-5)]">
        <p className="t-body">{ui.matter}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {ui.topics.split(",").map((t, i) => (
            <a key={t} href={`${castHref}?${new URLSearchParams({ q: ui.topicQ.split(",")[i] ?? "", c: "ziwei" })}`} onClick={() => track("ziwei", { locale, method: "to_cast" })} className="px-4 py-2 rounded-[2px] border border-[var(--ink-16)] hover:border-[var(--ink)] t-body !text-[15px]">{t}</a>
          ))}
        </div>
      </section>
      <section className="mt-[var(--s-5)] grid gap-2 t-small">
        <a href={starsHref} className="underline underline-offset-4">{ui.allStars}</a>
        <a href={formHref} className="underline underline-offset-4 !text-[var(--ink-66)]">{ui.other}</a>
      </section>
    </div>
  );
}
