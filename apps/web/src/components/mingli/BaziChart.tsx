"use client";

import { useEffect, useMemo, useState } from "react";
import { SolarTerm } from "tyme4ts";
import { baziOf, type BaziView } from "@/lib/mingli/bazi/chart";
import { fmt, normalizeBirth, type BirthInput, type Normalized } from "@/lib/mingli/birth/normalize";
import { currentProfile, syncProfiles, updateInput, type Profile } from "@/lib/mingli/birth/profiles";
import type { Rizhu } from "@/lib/mingli/bazi/content";
import { track } from "@/lib/track";
import { baziInfo } from "@/lib/mingli/bazi/info";
import BaziPro from "./BaziPro";
import BaziInsight from "./BaziInsight";
import ShareSheet from "@/components/ShareSheet";
import BaziReports from "./BaziReports";
import HepanLink from "./HepanLink";
import ChartQA from "./ChartQA";
import ChartReadingLock from "./ChartReadingLock";
import ChartReportLinks from "./ChartReportLinks";
import { bzNameOf, branchIndex, type BaziNames, type BzName } from "@/lib/mingli/bazi/names-fmt";

/**
 * 10-18 进度表 72 八字排盤 — the chart page body. Reads the current profile on this device, works the chart out here,
 * and asks the server only for the words that go with the result (by 日柱／十神 names).
 */
type Texts = {
  rizhu: Rizhu | null; stem: { plain: string } | null; strength: { plain: string; tips: string } | null;
  elements: Record<string, { plain: string }>; dayun: string | null; liunian: Record<string, { plain: string; ask_next: string }>;
  nayin: Record<string, string>; gods: Record<string, { plain: string; in_month: string; in_hour: string }>; howto: string;
};
export type BaziUi = Record<string, string>;


function thisChartYear(): number {
  const now = new Date(), y = now.getFullYear();
  const lc = SolarTerm.fromName(y, "立春").getJulianDay().getSolarDay();
  const before = now.getMonth() + 1 < lc.getMonth() || (now.getMonth() + 1 === lc.getMonth() && now.getDate() < lc.getDay());
  return before ? y - 1 : y;
}

/**
 * 10-30 进度表 128 ④: on a page in another language the server hands the names of that language (names.ts) — every
 * stem, branch, ten god, life stage, 納音, star and relation is then said with them; the characters themselves stay
 * on the chart as its glyphs (lang="zh-Hant"), with their reading under them.
 */
export default function BaziChart({ locale, ui, formHref, rizhuHref, castHref, yunshiHref, names = null }: { locale: string; ui: BaziUi; formHref: string; rizhuHref: string; castHref: string; yunshiHref: string | null; names?: BaziNames | null }) {
  const F = useMemo(() => (names ? bzNameOf(names) : null), [names]);
  const [p, setP] = useState<Profile | null | undefined>(undefined);
  const [override, setOverride] = useState<Partial<BirthInput> | null>(null);
  const [tx, setTx] = useState<Texts | null>(null);
  const [locked, setLocked] = useState(false); // 10-25: the plain reading needs a 通卡 or a membership
  const [tab, setTab] = useState<"info" | "pro">("pro");
  useEffect(() => {
    // 10-22 生辰檔案: a profile already on this device shows at once (the account's list refreshes behind it); on a
    // new device the signed-in reader's list comes down first, so nothing has to be typed again
    const cur = currentProfile();
    if (cur) { setP(cur); void syncProfiles(); return; }
    void syncProfiles().then(() => setP(currentProfile()));
  }, []);

  const res = useMemo((): { n: Normalized; v: BaziView; k: BaziView } | { err: string } | null => {
    if (!p) return null;
    try {
      const n = normalizeBirth({ ...p.input, ...(override ?? {}) });
      const k = baziOf(n, p.gender ?? "male", thisChartYear(), false);
      return { n, k, v: locale === "zh" ? baziOf(n, p.gender ?? "male", thisChartYear(), true) : k };
    } catch { return { err: "bad" }; }
  }, [p, override, locale]);

  const v = res && "v" in res ? res.k : null;
  useEffect(() => {
    if (!v) return;
    const day = v.pillars[2]!;
    const thisYear = thisChartYear();
    const cur = v.decades.find((d) => thisYear >= d.startYear && thisYear < d.startYear + 10);
    const gods = [v.pillars[1]!.ten, v.hasHour ? v.pillars[3]!.ten : ""].filter(Boolean);
    void fetch("/api/bazi/text", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ locale, day: day.gz, stem: v.dayMaster, level: v.strength.level, favour: v.favour.slice(0, 1), decade: cur?.ten, years: [v.years[0]!.ten], nayin: [day.nayin], gods }) })
      .then((r) => { setLocked(r.status === 402); return r.ok ? r.json() : null; }).then((j) => setTx(j as Texts | null)).catch(() => setTx(null));
    track("bazi", { locale, method: `chart:${v.hasHour ? "h" : "3"}:${p?.input.placeId?.split("-")[0] ?? "-"}:${override ? "alt" : "base"}` });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v?.pillars.map((x) => x.gz).join(), v?.strength.level]);

  if (p === undefined) return <p className="t-body !text-[var(--ink-45)]">…</p>;
  if (!p || !p.gender) return <p className="t-body">{ui.noProfile} <a href={formHref} className="underline underline-offset-4">{ui.toForm}</a></p>;
  if (!res || "err" in res) return <p className="t-body">{ui.bad} <a href={formHref} className="underline underline-offset-4">{ui.toForm}</a></p>;
  const { n } = res;
  const vv = res.v, kk = res.k;
  const setOpt = (patch: Partial<BirthInput>) => { updateInput(p.id, patch); setP({ ...p, input: { ...p.input, ...patch } }); setOverride(null); };
  const thisYear = thisChartYear();
  const curDecade = vv.decades.find((d) => thisYear >= d.startYear && thisYear < d.startYear + 10);
  const dmName = F ? F.dm(vv.dayMaster) : `${vv.dayMaster}${vv.dmEl}`;
  const fav = vv.favour[0];
  /** a 干支 / 十神 / level / element in the page's words (Chinese: as the chart prints it) */
  const gzW = (gz: string) => (F ? F.gz(gz) : gz), tenW = (t: string) => (F ? F.ten(t) : t);

  return (
    <div>
      {/* 1. head */}
      <div className="flex flex-wrap items-baseline gap-x-3">
        <h1 className="t-d2">{p.name}</h1>
        <p className="t-small !text-[var(--ink-66)]">{p.input.calendar === "lunar" ? ui.lunar : ui.solar} {p.input.y}/{p.input.m}/{p.input.d}{p.input.leap ? ` ${ui.leap}` : ""}{n.clock ? ` ${String(n.clock.h).padStart(2, "0")}:${String(n.clock.mi).padStart(2, "0")}` : ""}</p>
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 t-small !text-[var(--ink-66)]">
        {n.clock && n.chartTime && (
          <button type="button" onClick={() => setOpt({ trueSolar: !n.trueSolar })} className="underline underline-offset-4">
            {n.trueSolar ? ui.tsOn.replace("{t}", fmt(n.chartTime).slice(11)) : ui.tsOff}
          </button>
        )}
        {n.timeKnown && <button type="button" onClick={() => setOpt({ zi: n.zi === "next" ? "same" : "next" })} className="underline underline-offset-4">{n.zi === "next" ? ui.ziNext : ui.ziSame}</button>}
        <span>{ui.lichun}</span>
      </div>
      {n.dst && <p className="t-small mt-1 !text-[var(--ink-66)]">{ui.dst}</p>}
      {n.nearBoundary && n.hourBranch !== null && !override && (
        <p className="t-small mt-2">{ui.near}{" "}
          {[-1, 1].map((k) => { const b = (n.hourBranch! + k + 12) % 12; return <button key={k} type="button" onClick={() => setOverride({ timeMode: "branch", branch: b })} className="underline underline-offset-4 mx-1">{ui.branchNames.split(",")[b]}</button>; })}
        </p>
      )}
      {override && <p className="t-small mt-2">{ui.alt} <button type="button" onClick={() => setOverride(null)} className="underline underline-offset-4">{ui.back}</button></p>}
      {/* 10-23 进度表 114 ②: this chart's report already written → straight to it, no second press of the button below */}
      <ChartReportLinks sys="bazi" locale={locale} input={{ ...p.input, ...(override ?? {}) }} gender={p.gender} />

      {/* 2. the professional chart (10-18 Neil: 参考问真八字, 盤面要跟問真一樣) — 基本信息 · 專業細盤 (Neil 10-18: 斷事筆記不要) */}
      <p className="mt-[var(--s-3)] t-small !text-[var(--ink-66)]">{ui.lunarLine.replace("{l}", F ? lunarIn(F, vv) : vv.lunarText)} · {vv.gender === "male" ? ui.qian : ui.kun}</p>
      <div className="mt-[var(--s-3)] flex border-b border-[var(--ink-16)]">
        {(["info", "pro"] as const).map((k) => (
          <button key={k} type="button" onClick={() => setTab(k)} className={`flex-1 py-2 text-[14px] -mb-px border-b-2 ${tab === k ? "border-[var(--ink)]" : "border-transparent !text-[var(--ink-45)]"}`}>{ui[`tab_${k}`]}</button>
        ))}
      </div>
      <section className="mt-[var(--s-4)]">
        {tab === "pro" && <BaziPro v={vv} ui={ui} thisYear={thisYear} hans={locale === "zh"} F={F} locale={locale} />}
        {tab === "info" && <Info n={n} v={vv} ui={ui} thisYear={thisYear} hans={locale === "zh"} F={F} />}
      </section>

      {/* 3. 看懂這張盤 (10-18 Neil): 格局、五行能量、十神、強弱、喜忌、神煞、關係圖 */}
      <section className="mt-[var(--s-5)] border-t border-[var(--ink-16)] pt-[var(--s-4)]">
        <h2 className="t-d3 mb-[var(--s-3)]">{ui.insightHead}</h2>
        <BaziInsight v={vv} ui={ui} hans={locale === "zh"} F={F} />
        <details className="mt-3">
          <summary className="cursor-pointer t-small !text-[var(--ink-66)]">{ui.basis}</summary>
          <ul className="mt-2 t-body space-y-1">
            <li>{ui.deLing}{F ? F.colon : "："}{vv.strength.deLing ? ui.yes : ui.no}</li>
            <li>{ui.deDi}{F ? F.colon : "："}{vv.strength.deDi >= 0.5 ? ui.more : ui.less}</li>
            <li>{ui.deShi}{F ? F.colon : "："}{vv.strength.deShi >= 0.5 ? ui.more : ui.less}</li>
          </ul>
          {tx?.howto && <p className="t-small mt-2 leading-relaxed !text-[var(--ink-66)]">{tx.howto}</p>}
        </details>
      </section>

      {/* 10-18 (Neil: 學順時給建議問題，點下去是起卦或看對應段落；加一張能分享的命盤卡) */}
      <section className="mt-[var(--s-5)] border-t border-[var(--ink-16)] pt-[var(--s-4)]">
        <p className="t-sect">{ui.askHead}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {ui.asks.split("|").map((item) => {
            const [label, kind, arg] = item.split("~") as [string, string, string];
            const cls = "px-3.5 py-2 rounded-full border border-[var(--ink-16)] hover:border-[var(--ink)] text-[14px] text-left";
            if (kind === "jump") return <button key={label} type="button" className={cls} onClick={() => { document.getElementById(arg)?.scrollIntoView({ behavior: "smooth" }); track("bazi", { locale, method: `ask_jump:${arg}` }); }}>{label}</button>;
            return <a key={label} className={cls} onClick={() => track("bazi", { locale, method: "ask_cast" })} href={`${castHref}${castHref.includes("?") ? "&" : "?"}${new URLSearchParams({ q: arg, c: "bazi" })}`}>{label}</a>;
          })}
        </div>
        <div className="mt-[var(--s-4)]">
          <p className="t-small mb-2 !text-[var(--ink-66)]">{ui.cardLead}</p>
          <ShareSheet locale={locale} surface="bazi" compact
            url={`${typeof window === "undefined" ? "https://yaoflow.com" : window.location.origin}/${locale}/bazi?c=bazi-share`}
            text={ui.cardText}
            image={`/api/bazi/card?${new URLSearchParams({ p: vv.pillars.map((x) => x.gz).join(","), g: vv.gender === "female" ? "f" : "m", l: locale === "zh" ? "zh" : F ? locale : "zh-hant" })}`}
            fileName={`yaoflow-bazi-${vv.pillars[2]!.gz}.png`} />
        </div>
      </section>

      {/* 10-22 命盤問答 (lib/mingli/qa.ts): 問這張盤 */}
      <ChartQA system="bazi" locale={locale} input={{ ...p.input, ...(override ?? {}) }} gender={p.gender} castHref={castHref.split("?")[0]!} />
      <BaziReports locale={locale} ui={ui} input={{ ...p.input, ...(override ?? {}) }} gender={p.gender} />
      {/* 10-20 合盤 entry (hepan switch) */}
      <HepanLink locale={locale} from="bazi" />

      {/* 4. free reading */}
      {locked && <ChartReadingLock locale={locale} />}
      {tx && (
        <section className="mt-[var(--s-6)] grid gap-[var(--s-5)]">
          {tx.rizhu && (
            <div>
              <p className="t-sect">{ui.rizhu.replace("{p}", gzW(vv.pillars[2]!.gz))}</p>
              <h2 className="t-d3 mt-1">{tx.rizhu.title}</h2>
              <p className="t-body mt-2 leading-relaxed">{tx.rizhu.plain}</p>
              <dl className="mt-3 grid gap-2 t-body">
                <div><dt className="t-sect inline">{ui.love}{F ? (F.gap === "　" ? "　" : F.colon) : "　"}</dt><dd className="inline">{tx.rizhu.love}</dd></div>
                <div><dt className="t-sect inline">{ui.work}{F ? (F.gap === "　" ? "　" : F.colon) : "　"}</dt><dd className="inline">{tx.rizhu.work}</dd></div>
                <div><dt className="t-sect inline !text-[var(--cinnabar)]">{ui.watch}{F ? (F.gap === "　" ? "　" : F.colon) : "　"}</dt><dd className="inline">{tx.rizhu.watch}</dd></div>
              </dl>
            </div>
          )}
          {tx.stem && <div><p className="t-sect">{ui.dmHead.replace("{dm}", dmName)}</p><p className="t-body mt-2 leading-relaxed">{tx.stem.plain}</p></div>}
          {tx.strength && (
            <div>
              <p className="t-sect">{ui.strengthHead.replace("{lv}", F ? F.level(vv.strength.level) : vv.strength.level)}</p>
              <p className="t-body mt-2 leading-relaxed">{tx.strength.plain}</p>
              <p className="t-body mt-2 border-l-2 border-[var(--gold)] pl-3">{tx.strength.tips}</p>
              {fav && tx.elements[fav] && <p className="t-body mt-3 leading-relaxed"><b className={F && F.gap === " " ? "block font-medium" : "font-medium"}>{ui.favHead.replace("{e}", F ? F.elOf(fav) : fav)}</b>{F ? (F.gap === " " ? null : F.gap) : "　"}{tx.elements[fav]!.plain}</p>}
            </div>
          )}
          {curDecade && tx.dayun && <div id="decade" className="scroll-mt-20"><p className="t-sect">{ui.decadeHead.replace("{gz}", gzW(curDecade.gz)).replace("{t}", tenW(curDecade.ten))}</p><p className="t-body mt-2 leading-relaxed">{tx.dayun}</p></div>}
          {tx.liunian[kk.years[0]!.ten] && (
            <div>
              <p className="t-sect">{ui.yearHead.replace("{y}", String(vv.years[0]!.year)).replace("{gz}", gzW(vv.years[0]!.gz)).replace("{t}", tenW(vv.years[0]!.ten))}</p>
              <p className="t-body mt-2 leading-relaxed">{tx.liunian[kk.years[0]!.ten]!.plain}</p>
            </div>
          )}
        </section>
      )}

      {/* 5. back to the matter */}
      <section className="mt-[var(--s-6)] border-t border-[var(--ink-16)] pt-[var(--s-5)]">
        <p className="t-body">{ui.matter}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {ui.topics.split(",").map((t, i) => (
            <a key={t} href={`${castHref}${castHref.includes("?") ? "&" : "?"}${new URLSearchParams({ q: ui.topicQ.split(",")[i] ?? "", c: "bazi" })}`} onClick={() => track("bazi", { locale, method: "to_cast" })}
              className="px-4 py-2 rounded-[2px] border border-[var(--ink-16)] hover:border-[var(--ink)] t-body !text-[15px]">{t}</a>
          ))}
        </div>
      </section>

      <section className="mt-[var(--s-5)] grid gap-2 t-small">
        <a href={rizhuHref} className="underline underline-offset-4">{ui.allRizhu}</a>
        {yunshiHref && <a href={yunshiHref} className="underline underline-offset-4">{ui.yunshi}</a>}
        <a href={formHref} className="underline underline-offset-4 !text-[var(--ink-66)]">{ui.other}</a>
      </section>
    </div>
  );
}

/** 10-30: a lunar date in the page's words (1989, month 12, day 5 · Zi hour; 1989年12月5日 · 子の刻; 1989년 12월 5일 · 자시) */
function lunarIn(F: BzName, v: BaziView): string {
  const L = v.lunar;
  if (!L) return v.lunarText;
  const d = F.fill(F.N.lunar, { y: L.y, m: L.m, leap: L.leap ? F.N.leap : "", d: L.d });
  return L.hb ? `${d} · ${F.fill(F.N.hour, { b: F.branch(L.hb) })}` : d;
}

function Info({ n, v, ui, thisYear, hans, F = null }: { n: Normalized; v: BaziView; ui: BaziUi; thisYear: number; hans: boolean; F?: BzName | null }) {
  const f = baziInfo(n, v, thisYear, hans);
  if (F) {
    // 10-30 进度表 128 ④: the same rows in the page's words; 星宿 and 命卦 (a 八宅 feng-shui number) stay on the Chinese page
    const yb = v.pillars[0]!.branch;
    const named = (gzNay: string) => { const gz = gzNay.slice(0, 2); return `${F.gz(gz)} (${F.nayinOf(gz)})`; };
    const rowsF: [string, string][] = [
      [ui.i_zodiac, `${F.N.animals[branchIndex(yb)] ?? yb} · ${ui.age.replace("{a}", String(f.age))} · ${v.gender === "male" ? ui.male : ui.female}`],
      [ui.i_lunar, `${lunarIn(F, v)} · ${f.yin ? ui.yinW : ui.yangW} · ${v.gender === "male" ? ui.qian : ui.kun}`],
      [ui.i_solar, n.clock ? fmt(n.clock) : `${n.solarDate.y}-${String(n.solarDate.m).padStart(2, "0")}-${String(n.solarDate.d).padStart(2, "0")}`],
      ...(n.chartTime && n.clock ? [[ui.i_ts, fmt(n.chartTime)] as [string, string]] : []),
      ...(n.place ? [[ui.i_place, n.place.name] as [string, string]] : []),
      ...(v.siling ? [[ui.i_siling, ui.silingV.replace("{s}", [...v.siling].map((s) => F.dm(s)).join(" / "))] as [string, string]] : []),
      ...(f.term && f.termKeys ? [
        [ui.i_term, ui.termV.replace("{a}", F.jie(f.termKeys.prev)).replace("{ad}", String(f.term.afterD)).replace("{ah}", String(f.term.afterH)).replace("{b}", F.jie(f.termKeys.next)).replace("{bd}", String(f.term.beforeD)).replace("{bh}", String(f.term.beforeH))] as [string, string],
        [F.jie(f.termKeys.prev), f.term.prevAt] as [string, string], [F.jie(f.termKeys.next), f.term.nextAt] as [string, string],
      ] : []),
      ...(F.N.signs?.[f.conIdx] ? [[ui.i_con, F.N.signs[f.conIdx]!] as [string, string]] : []),
      ...(f.palaces ? [[ui.i_fetal, named(f.palaces.fetal)], [ui.i_breath, named(f.palaces.breath)], [ui.i_own, named(f.palaces.own)], [ui.i_body, named(f.palaces.body)]] as [string, string][] : []),
      [ui.kong, f.kong.split(" ").map((k) => [...k].map((c) => F.branch(c)).join(F.N.gz.includes(" ") ? "·" : "")).join(" ")],
    ];
    return (
      <dl className="grid grid-cols-[9em_1fr] gap-x-3 gap-y-2 text-[14px]">
        {rowsF.map(([k, val]) => <div key={k} className="contents"><dt className="!text-[var(--ink-45)]">{k}</dt><dd className="tabular-nums">{val}</dd></div>)}
      </dl>
    );
  }
  const rows: [string, string][] = [
    [ui.i_zodiac, `${f.zodiac} · ${ui.age.replace("{a}", String(f.age))} · ${v.gender === "male" ? ui.male : ui.female}`],
    [ui.i_lunar, `${v.lunarText}（${f.yin ? ui.yinW : ui.yangW} ${v.gender === "male" ? ui.qian : ui.kun}）`],
    [ui.i_solar, n.clock ? fmt(n.clock) : `${n.solarDate.y}-${String(n.solarDate.m).padStart(2, "0")}-${String(n.solarDate.d).padStart(2, "0")}`],
    ...(n.chartTime && n.clock ? [[ui.i_ts, fmt(n.chartTime)] as [string, string]] : []),
    // 10-22: place names come from the gazetteer in 繁體 — 臺 is 台 on the 简体 page
    ...(n.place ? [[ui.i_place, hans ? n.place.name.replace(/臺/g, "台") : n.place.name] as [string, string]] : []),
    ...(f.silingEl ? [[ui.i_siling, ui.silingV.replace("{s}", f.silingEl)] as [string, string]] : []),
    ...(f.term ? [
      [ui.i_term, ui.termV.replace("{a}", f.term.prev).replace("{ad}", String(f.term.afterD)).replace("{ah}", String(f.term.afterH)).replace("{b}", f.term.next).replace("{bd}", String(f.term.beforeD)).replace("{bh}", String(f.term.beforeH))] as [string, string],
      [f.term.prev, f.term.prevAt] as [string, string], [f.term.next, f.term.nextAt] as [string, string],
    ] : []),
    [ui.i_con, f.constellation], [ui.i_xiu, f.xiu],
    ...(f.palaces ? [[ui.i_fetal, f.palaces.fetal], [ui.i_breath, f.palaces.breath], [ui.i_own, f.palaces.own], [ui.i_body, f.palaces.body]] as [string, string][] : []),
    [ui.kong, f.kong],
    ...(f.gua ? [[ui.i_gua, ui.guaV.replace("{g}", f.gua.name).replace("{e}", f.gua.east ? ui.east : ui.west)] as [string, string]] : []),
  ];
  return (
    <dl className="grid grid-cols-[7.5em_1fr] gap-x-3 gap-y-2 text-[14px]">
      {rows.map(([k, val]) => <div key={k} className="contents"><dt className="!text-[var(--ink-45)]">{k}</dt><dd className="tabular-nums">{val}</dd></div>)}
    </dl>
  );
}
