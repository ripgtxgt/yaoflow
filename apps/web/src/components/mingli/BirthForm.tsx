"use client";

import { useEffect, useMemo, useState } from "react";
import { Wheels } from "@/components/WheelPicker";
import { BirthError, fmt, normalizeBirth, type BirthInput, type Gender } from "@/lib/mingli/birth/normalize";
import { deleteProfile, loadProfiles, saveProfile, setCurrent, syncProfiles, type Profile, type Who } from "@/lib/mingli/birth/profiles";
import type { BirthUi } from "@/lib/mingli/birth/ui";
import { track } from "@/lib/track";
import type { EventName } from "@/lib/analytics-server";

/**
 * 10-18 进度表 71–74 生辰表单 (shared by 紫微、八字、星盤). 10-18 (Neil: 参考问真八字): one compact card — 稱呼, 性別 and
 * 國曆／農曆 on one row, 出生時間 and 出生地點 as rows that open a bottom sheet with wheels (年 月 日 時 分, 時／分 can be
 * 「未知」), a type-in box (199303270255), and the true solar time shown live under the card. The profile is kept on this
 * device only and the chart page opens.
 */
const WHO: Who[] = ["self", "partner", "family", "friend", "other"];
const BRANCH = ["子", "丑", "丑", "寅", "寅", "卯", "卯", "辰", "辰", "巳", "巳", "午", "午", "未", "未", "申", "申", "酉", "酉", "戌", "戌", "亥", "亥", "子"];
const LUNAR_M = ["正月", "二月", "三月", "四月", "五月", "六月", "七月", "八月", "九月", "十月", "冬月", "臘月"];
const LUNAR_D = ["初一", "初二", "初三", "初四", "初五", "初六", "初七", "初八", "初九", "初十", "十一", "十二", "十三", "十四", "十五", "十六", "十七", "十八", "十九", "二十", "廿一", "廿二", "廿三", "廿四", "廿五", "廿六", "廿七", "廿八", "廿九", "三十"];
const UNKNOWN = -1;
const pad = (n: number) => String(n).padStart(2, "0");

type Geo = { id: string; name: string; label: string; lat: number; lon: number; tz: string };
type When = { cal: "solar" | "lunar"; leap: boolean; y: number; m: number; d: number; h: number; mi: number };

/** 10-20 合盤: with onPick the form hands the chosen or new profile back instead of opening a chart page */
export type Picked = { id: string; name: string; gender?: Gender; input: BirthInput; who: Who };

export default function BirthForm({ locale, ui, chartHref, needGender = true, astro = false, event, onPick, initialWho = "self", goLabel }: {
  locale: string; ui: BirthUi; chartHref: string; needGender?: boolean; astro?: boolean; event: EventName;
  onPick?: (p: Picked) => void; initialWho?: Who; goLabel?: string;
}) {
  const [saved, setSaved] = useState<Profile[]>([]);
  const [fresh, setFresh] = useState(false);
  const [who, setWho] = useState<Who>(initialWho);
  const [name, setName] = useState("");
  const [gender, setGender] = useState<Gender | "">("");
  const [when, setWhen] = useState<When>({ cal: "solar", leap: false, y: 1990, m: 1, d: 1, h: 12, mi: 0 });
  const [whenSet, setWhenSet] = useState(false);
  // 10-30 进度表 128 ④: no Taiwan default outside Chinese — the reader picks their own birthplace
  const [placeId, setPlaceId] = useState(ui.foreign ? "" : "tw-tpe");
  const [geo, setGeo] = useState<Geo | null>(null);
  const [dstSkip, setDstSkip] = useState(false);
  const [sheet, setSheet] = useState<"time" | "place" | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    const s = loadProfiles(); setSaved(s); if (!s.length) setFresh(true);
    // 10-22 生辰檔案: signed in, the account's profiles join this device's — a new device starts with them, not a blank form
    void syncProfiles().then((m) => { if (m && m.length) { setSaved(m); if (!s.length) setFresh(false); } });
  }, []);

  const input = (w: When = when): BirthInput => {
    const hourKnown = w.h !== UNKNOWN, minKnown = w.mi !== UNKNOWN;
    return {
      calendar: w.cal, y: w.y, m: w.m, d: w.d, leap: w.cal === "lunar" && w.leap,
      timeMode: !hourKnown ? "unknown" : minKnown ? "exact" : "branch",
      h: hourKnown && minKnown ? w.h : undefined, mi: hourKnown && minKnown ? w.mi : undefined,
      branch: hourKnown && !minKnown ? (w.h === 23 ? 12 : Math.floor((w.h + 1) / 2) % 12) : undefined,
      placeId, place: geo ? { id: geo.id, name: geo.label, lat: geo.lat, lon: geo.lon, tz: geo.tz } : undefined, dstAlreadyRemoved: dstSkip, trueSolar: true, zi: "next",
    };
  };
  const norm = useMemo(() => { try { return normalizeBirth(input()); } catch { return null; } }, // eslint-disable-next-line react-hooks/exhaustive-deps
    [when, placeId, geo, dstSkip]);
  const place = ui.places.find((p) => p.id === placeId);
  const whenText = !whenSet ? "" : when.cal === "lunar" && ui.foreign
    ? `${ui.lunar} ${when.y}-${pad(when.m)}${when.leap ? ` ${ui.leap}` : ""}-${pad(when.d)} ${when.h === UNKNOWN ? ui.timeUnknown : when.mi === UNKNOWN ? `${pad(when.h)}:00` : `${pad(when.h)}:${pad(when.mi)}`}`
    : when.cal === "lunar"
    ? `${ui.lunar} ${when.y}${ui.y}${when.leap ? ui.leap : ""}${LUNAR_M[when.m - 1]}${LUNAR_D[when.d - 1]} ${when.h === UNKNOWN ? ui.timeUnknown : when.mi === UNKNOWN ? `${pad(when.h)}${ui.hourUnit}` : `${pad(when.h)}:${pad(when.mi)}`}`
    : `${when.y}-${pad(when.m)}-${pad(when.d)} ${when.h === UNKNOWN ? ui.timeUnknown : when.mi === UNKNOWN ? (ui.foreign ? `${pad(when.h)}:00` : `${pad(when.h)}${ui.hourUnit}`) : `${pad(when.h)}:${pad(when.mi)}`}`;

  const submit = () => {
    setErr("");
    if (needGender && !gender) return setErr(ui.errGender);
    if (!whenSet) return setErr(ui.errTime);
    const inp = input();
    try { normalizeBirth(inp); } catch (e) {
      const k = e instanceof BirthError ? e.message : "";
      return setErr(k === "lunar-date" ? ui.errLunar : k === "year" ? ui.errYear : k === "place" ? ui.errPlace : k === "time" ? ui.errTime : ui.errDate);
    }
    const saved = saveProfile({ who, name: name.trim().slice(0, 12) || ui.namePh, gender: gender || undefined, input: inp }, { current: !onPick });
    track(event, { locale, method: `chart_new:${inp.timeMode}:${geo ? "geo" : place?.group ?? "-"}` });
    if (onPick) { onPick({ id: saved.id, name: saved.name, gender: saved.gender, input: saved.input, who: saved.who }); return; }
    window.location.assign(chartHref);
  };
  const use = (p: Profile) => {
    track(event, { locale, method: "chart_saved" });
    if (onPick) { onPick({ id: p.id, name: p.name, gender: p.gender, input: p.input, who: p.who }); return; }
    setCurrent(p.id); window.location.assign(chartHref);
  };

  if (!fresh && saved.length) {
    return (
      <div>
        <p className="t-sect mb-1.5">{ui.saved}</p>
        <ul className="divide-y divide-[var(--ink-16)] border-y border-[var(--ink-16)]">
          {saved.map((p) => (
            <li key={p.id} className="py-3 flex items-center gap-3">
              <span className="t-body flex-1">{p.name}<span className="t-small ml-2 !text-[var(--ink-45)]">{ui.whoOpts.split(",")[WHO.indexOf(p.who)]}</span></span>
              <button type="button" onClick={() => use(p)} disabled={needGender && !p.gender} className="px-4 py-2 rounded-[2px] bg-[var(--ink)] !text-[var(--paper)] t-small disabled:opacity-40">{ui.use}</button>
              <button type="button" onClick={() => { deleteProfile(p.id); const s = loadProfiles(); setSaved(s); if (!s.length) setFresh(true); }} className="t-small underline underline-offset-4 !text-[var(--ink-45)]">{ui.del}</button>
            </li>
          ))}
        </ul>
        <button type="button" onClick={() => setFresh(true)} className="mt-[var(--s-3)] t-body underline underline-offset-4">{ui.newOne} →</button>
      </div>
    );
  }

  const seg = (on: boolean) => `px-3.5 py-1.5 rounded-full text-[14px] transition-colors ${on ? "bg-[var(--ink)] !text-[var(--paper)]" : "!text-[var(--ink-66)]"}`;
  const row = "flex items-center justify-between gap-3 py-3.5 min-h-[3.25rem]";
  return (
    <div className="max-w-[30rem]">
      <div className="rounded-[10px] border border-[var(--ink-16)] px-4 divide-y divide-[var(--ink-16)]">
        <label className={row}>
          <span className="t-body shrink-0">{ui.name}</span>
          <input value={name} maxLength={12} placeholder={ui.namePh} onChange={(e) => setName(e.target.value)} className="text-right bg-transparent t-body !text-[16px] min-w-0 flex-1 focus:outline-none placeholder:!text-[var(--ink-45)]" />
        </label>
        <div className={`${row} flex-wrap`}>
          {needGender ? (
            <span className="inline-flex rounded-full border border-[var(--ink-16)] p-0.5">
              {(["male", "female"] as const).map((g) => <button key={g} type="button" onClick={() => setGender(g)} className={seg(gender === g)}>{g === "male" ? ui.male : ui.female}</button>)}
            </span>
          ) : <span />}
          <span className="inline-flex rounded-full border border-[var(--ink-16)] p-0.5">
            {WHO.map((w, i) => <button key={w} type="button" onClick={() => setWho(w)} className={`${seg(who === w)} !px-2.5 !text-[13px]`}>{ui.whoOpts.split(",")[i]}</button>)}
          </span>
        </div>
        <button type="button" onClick={() => setSheet("time")} className={`${row} w-full text-left`}>
          <span className="t-body shrink-0">{ui.time}</span>
          <span className={`t-body truncate ${whenSet ? "" : "!text-[var(--ink-45)]"}`}>{whenText || ui.pickTime}<span className="ml-2 !text-[var(--ink-45)]">›</span></span>
        </button>
        <button type="button" onClick={() => setSheet("place")} className={`${row} w-full text-left`}>
          <span className="t-body shrink-0">{ui.place}</span>
          <span className={`t-body truncate ${geo || place ? "" : "!text-[var(--ink-45)]"}`}>{geo ? geo.label : place ? (place.region && place.region !== place.name ? `${place.region} · ${place.name}` : place.name) : ui.pickTime}<span className="ml-2 !text-[var(--ink-45)]">›</span></span>
        </button>
      </div>
      {whenSet && norm?.chartTime && norm.clock && (
        <p className="t-small mt-2 !text-[var(--ink-45)]">{ui.trueSolarLine.replace("{t}", fmt(norm.chartTime))}</p>
      )}
      {whenSet && norm?.dst && (
        <div className="mt-1 t-small !text-[var(--ink-66)]">
          <p>{ui.dstNote}</p>
          <label className="inline-flex items-center gap-1.5 mt-1"><input type="checkbox" checked={dstSkip} onChange={(e) => setDstSkip(e.target.checked)} />{ui.dstSkip}</label>
        </div>
      )}
      {astro && whenSet && when.h === UNKNOWN && <p className="t-small mt-2">{ui.needTime}</p>}
      {err && <p className="t-small mt-3 !text-[var(--cinnabar)]">{err}</p>}
      <button type="button" onClick={submit} className="mt-[var(--s-4)] w-full py-3.5 rounded-full bg-[var(--ink)] !text-[var(--paper)] tracking-[0.2em] text-[15px]">{goLabel ?? ui.go}</button>
      <p className="t-small mt-2 text-center !text-[var(--ink-45)]">{ui.privacy}</p>

      {sheet === "time" && <TimeSheet ui={ui} value={when} onClose={() => setSheet(null)} onDone={(w) => { setWhen(w); setWhenSet(true); setSheet(null); }} />}
      {sheet === "place" && <PlaceSheet ui={ui} locale={locale} current={geo} onClose={() => setSheet(null)} onGeo={(g) => { setGeo(g); setSheet(null); }} />}
    </div>
  );
}

function Sheet({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); }; window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [onClose]);
  return (
    <div className="fixed inset-0 z-[300] flex items-end sm:items-center justify-center bg-black/30" onClick={onClose}>
      <div className="w-full sm:max-w-[30rem] rounded-t-[16px] sm:rounded-[16px] bg-[var(--paper)] px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-2xl" onClick={(e) => e.stopPropagation()}>{children}</div>
    </div>
  );
}

function TimeSheet({ ui, value, onDone, onClose }: { ui: BirthUi; value: When; onDone: (w: When) => void; onClose: () => void }) {
  const [w, setW] = useState<When>(value);
  const [typed, setTyped] = useState("");
  const thisYear = new Date().getFullYear();
  const lunar = w.cal === "lunar";
  const dim = lunar ? 30 : new Date(w.y, w.m, 0).getDate();
  const d = Math.min(w.d, dim);
  const years = useMemo(() => Array.from({ length: thisYear - 1899 }, (_, i) => ({ value: 1900 + i, label: String(1900 + i) })), [thisYear]);
  // 10-30 进度表 128 ④: outside Chinese the lunar months and days are numbers, and the hours carry no 地支
  const cn = !ui.foreign;
  const months = useMemo(() => Array.from({ length: 12 }, (_, i) => ({ value: i + 1, label: lunar && cn ? LUNAR_M[i]! : pad(i + 1) })), [lunar, cn]);
  const days = useMemo(() => Array.from({ length: dim }, (_, i) => ({ value: i + 1, label: lunar && cn ? LUNAR_D[i]! : pad(i + 1) })), [dim, lunar, cn]);
  const hours = useMemo(() => [{ value: UNKNOWN, label: ui.unknownShort }, ...Array.from({ length: 24 }, (_, i) => ({ value: i, label: cn ? `${pad(i)}${BRANCH[i]}` : pad(i) }))], [ui.unknownShort, cn]);
  const mins = useMemo(() => [{ value: UNKNOWN, label: ui.unknownShort }, ...Array.from({ length: 60 }, (_, i) => ({ value: i, label: pad(i) }))], [ui.unknownShort]);
  const quick = (s: string) => {
    setTyped(s);
    const m = /^(\d{4})(\d{2})(\d{2})(\d{2})?(\d{2})?$/.exec(s.trim());
    if (!m) return;
    const y = +m[1]!, mo = +m[2]!, dd = +m[3]!;
    if (y < 1900 || y > thisYear || mo < 1 || mo > 12 || dd < 1 || dd > 31) return;
    setW({ ...w, y, m: mo, d: dd, h: m[4] ? Math.min(23, +m[4]) : w.h, mi: m[5] ? Math.min(59, +m[5]) : m[4] ? 0 : w.mi });
  };
  const head = ["年", "月", "日", "時", "分"].map((x) => (ui as unknown as Record<string, string>)[`col_${x}`] ?? x);
  return (
    <Sheet onClose={onClose}>
      <div className="flex items-center justify-between gap-2">
        {/* the lunar calendar where readers use it for birthdays: the Chinese pages and Korean (음력) */}
        {(cn || ui.lunarOk) && (
        <span className="inline-flex rounded-full bg-[var(--ink)]/[0.06] p-0.5">
          {(["solar", "lunar"] as const).map((c) => <button key={c} type="button" onClick={() => setW({ ...w, cal: c })} className={`px-4 py-1.5 rounded-full text-[14px] ${w.cal === c ? "bg-[var(--paper)] shadow-sm" : "!text-[var(--ink-45)]"}`}>{c === "solar" ? ui.solar : ui.lunar}</button>)}
        </span>
        )}
        {lunar && <label className="t-small inline-flex items-center gap-1.5"><input type="checkbox" checked={w.leap} onChange={(e) => setW({ ...w, leap: e.target.checked })} />{ui.leap}</label>}
        <button type="button" onClick={() => onDone({ ...w, d })} className="ml-auto px-5 py-2 rounded-full bg-[var(--ink)] !text-[var(--paper)] text-[14px]">{ui.ok}</button>
      </div>
      {!lunar && (
        <input value={typed} onChange={(e) => quick(e.target.value.replace(/\D/g, "").slice(0, 12))} inputMode="numeric" placeholder={ui.quickPh}
          className="mt-3 w-full rounded-full border border-[var(--ink-16)] bg-transparent px-4 py-2 text-[15px] tabular-nums focus:outline-none" />
      )}
      <div className="mt-3 grid grid-cols-[1.4fr_1fr_1fr_1.2fr_1fr] text-center text-[13px] !text-[var(--ink-45)]">{head.map((h) => <span key={h}>{h}</span>)}</div>
      <Wheels columns={[
        { key: "y", width: "21%", options: years, value: w.y, onChange: (y) => setW((o) => ({ ...o, y })) },
        { key: `m${lunar}`, width: "18%", options: months, value: w.m, onChange: (m) => setW((o) => ({ ...o, m })) },
        { key: `d${dim}${lunar}`, width: "18%", options: days, value: d, onChange: (x) => setW((o) => ({ ...o, d: x })) },
        { key: "h", width: "24%", options: hours, value: w.h, onChange: (h) => setW((o) => ({ ...o, h, mi: h === UNKNOWN ? UNKNOWN : o.mi })) },
        { key: "mi", width: "19%", options: mins, value: w.mi, onChange: (mi) => setW((o) => ({ ...o, mi })) },
      ]} />
    </Sheet>
  );
}

/**
 * 10-18 (Neil: 文字多了會重疊): wheel rows are one line. Long official names get their common short form
 * (黔西南布依族苗族自治州 → 黔西南州, 三都水族自治縣 → 三都縣, 鄂溫克族自治旗 → 鄂溫克旗); whatever is still long is set
 * smaller to fit the column, and cut with … as a last resort.
 */
const ETHNIC = "布依|苗|侗|土家|彝|藏|羌|白|傣|景頗|景颇|傈僳|哈尼|壯|壮|回|蒙古|朝鮮|朝鲜|哈薩克|哈萨克|柯爾克孜|柯尔克孜|黎|水|仡佬|瑤|瑶|納西|纳西|普米|怒|獨龍|独龙|拉祜|佤|畲|滿|满|土|撒拉|東鄉|东乡|保安|裕固|錫伯|锡伯|達斡爾|达斡尔|鄂溫克|鄂温克|鄂倫春|鄂伦春|毛南|仫佬|京|各|塔吉克|布朗|維吾爾|维吾尔|俄羅斯|俄罗斯|塔塔爾|塔塔尔|烏孜別克|乌孜别克|門巴|门巴|珞巴|基諾|基诺|德昂|阿昌";
const AUTO = new RegExp(`^(.{2,}?)(?:(?:${ETHNIC})族?)+自治(州|縣|县|旗)$`);
export const shortPlace = (n: string) => {
  const m = AUTO.exec(n);
  if (m) return m[1]! + m[2]!;
  return n.replace(/族?自治(縣|县|旗)$/, "$1"); // 東鄉族自治縣 → 東鄉縣, 鄂溫克族自治旗 → 鄂溫克旗
};
function fitLabel(text: string, colPx: number) {
  const units = [...text].reduce((a, c) => a + (/[\x00-\xff]/.test(c) ? 0.55 : 1), 0);
  const size = Math.max(12, Math.min(18, Math.floor((colPx - 8) / Math.max(units, 1))));
  return <span className="block w-full overflow-hidden text-ellipsis whitespace-nowrap px-1 text-center" style={{ fontSize: size }}>{text}</span>;
}

type TNode = { name: string; children?: TNode[]; id?: string; lat?: number; lon?: number; tz?: string };
type Region = "tw" | "hkmo" | "cn" | "intl";
const REGIONS: Region[] = ["tw", "hkmo", "cn", "intl"];
const TREES = new Map<string, Promise<TNode[]>>();
const loadTree = (r: Region, loc: string) => {
  const k = `${r}:${loc}`;
  if (!TREES.has(k)) TREES.set(k, fetch(`/api/places/tree?r=${r}&locale=${loc}`).then((x) => x.json()).then((j: { tree: TNode[] }) => j.tree).catch(() => { TREES.delete(k); return []; }));
  return TREES.get(k)!;
};

/**
 * 10-18 (Neil: 出生地點要跟問真一樣): region tabs (台灣 / 港澳 / 大陸 / 海外), then one wheel per level — 縣市 → 鄉鎮市區,
 * 省 → 市 → 區縣, 國家 → 州／省 → 城市 — and a search box over every place. Lists come from /api/places/tree.
 */
function PlaceSheet({ ui, locale, current, onGeo, onClose }: { ui: BirthUi; locale: string; current: Geo | null; onGeo: (g: Geo) => void; onClose: () => void }) {
  // 10-30 进度表 128 ④: outside Chinese only the "intl" tree (countries in the reader's language) and the search
  const loc = ui.foreign ? locale : locale === "zh" ? "zh" : "zh-hant";
  const regions: Region[] = ui.foreign ? ["intl"] : REGIONS;
  const [region, setRegion] = useState<Region>(() => { const r = current?.id.split(":")[0] as Region; return regions.includes(r) ? r : regions[0]!; });
  const [tree, setTree] = useState<TNode[] | null>(null);
  const [path, setPath] = useState<number[]>([]);
  useEffect(() => {
    let live = true;
    setTree(null);
    void loadTree(region, loc).then((t) => {
      if (!live) return;
      setTree(t);
      // reopen on the place already chosen
      const want = current?.id;
      const find = (nodes: TNode[], acc: number[]): number[] | null => {
        for (let i = 0; i < nodes.length; i++) {
          const n = nodes[i]!;
          if (n.id && n.id === want) return [...acc, i];
          if (n.children) { const f = find(n.children, [...acc, i]); if (f) return f; }
        }
        return null;
      };
      setPath((want && find(t, [])) || []);
    });
    return () => { live = false; };
  }, [region, loc, current?.id]);

  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Geo[] | null>(null);
  useEffect(() => {
    const t = q.trim();
    if (!t) { setHits(null); return; }
    const ac = new AbortController();
    const timer = setTimeout(() => {
      fetch(`/api/places?q=${encodeURIComponent(t)}&locale=${loc}`, { signal: ac.signal })
        .then((r) => r.json()).then((j: { places: Geo[] }) => setHits(j.places ?? [])).catch(() => {});
    }, 180);
    return () => { clearTimeout(timer); ac.abort(); };
  }, [q, loc]);

  // the columns: walk down the tree along path (missing indexes = 0)
  const cols: { nodes: TNode[]; i: number }[] = [];
  let level = tree ?? [];
  for (let d = 0; level.length; d++) {
    const i = Math.min(path[d] ?? 0, level.length - 1);
    cols.push({ nodes: level, i });
    level = level[i]!.children ?? [];
  }
  const chain = cols.map((c) => c.nodes[c.i]!);
  const leaf = chain[chain.length - 1];
  const pick = () => {
    if (!leaf || leaf.lat === undefined || !leaf.id) return;
    // 中正區 · 臺北市 / 梅縣區 · 梅州市 · 廣東 (same order as the search results) — drop a level that only repeats its parent (北京 · 北京市, 新加坡 · 新加坡)
    const names = chain.map((n) => n.name).filter((n, k, a) => k === 0 || !(n.startsWith(a[k - 1]!) || a[k - 1]!.startsWith(n)) || k === a.length - 1);
    onGeo({ id: leaf.id, name: shortPlace(leaf.name), label: names.map(shortPlace).reverse().join(" · "), lat: leaf.lat, lon: leaf.lon!, tz: leaf.tz! });
  };
  const colPx = Math.min(typeof window === "undefined" ? 380 : window.innerWidth, 480) - 32;
  const width = cols.length === 3 ? ["30%", "34%", "36%"] : ["42%", "58%"];
  const tabName = (r: Region) => ui[`reg_${r}` as keyof BirthUi] as string;
  return (
    <Sheet onClose={onClose}>
      <div className="flex items-center justify-between gap-2">
        {regions.length > 1 ? (
        <span className="inline-flex rounded-full bg-[var(--ink)]/[0.06] p-0.5">
          {regions.map((r) => <button key={r} type="button" onClick={() => { setRegion(r); setPath([]); }} className={`px-3 py-1.5 rounded-full text-[14px] ${region === r ? "bg-[var(--paper)] shadow-sm" : "!text-[var(--ink-45)]"}`}>{tabName(r)}</button>)}
        </span>
        ) : <span className="t-sect">{ui.place}</span>}
        {!hits && <button type="button" onClick={pick} disabled={!leaf} className="px-5 py-2 rounded-full bg-[var(--ink)] !text-[var(--paper)] text-[14px] disabled:opacity-40">{ui.ok}</button>}
      </div>
      <input value={q} onChange={(e) => setQ(e.target.value.slice(0, 40))} placeholder={ui.placeSearch} enterKeyHint="search"
        className="mt-3 w-full rounded-full border border-[var(--ink-16)] bg-transparent px-4 py-2 text-[16px] focus:outline-none placeholder:!text-[var(--ink-45)]" />
      {hits ? (
        <ul className="mt-2 h-[17rem] overflow-y-auto overscroll-contain divide-y divide-[var(--ink-16)]">
          {hits.length === 0 && <li className="py-3 t-small !text-[var(--ink-45)]">{ui.placeNone}</li>}
          {hits.map((h) => (
            <li key={h.id}><button type="button" onClick={() => onGeo(h)} className="w-full text-left py-3 t-body">{h.name}<span className="t-small ml-2 !text-[var(--ink-45)]">{h.label.split(" · ").slice(1).join(" · ")}</span></button></li>
          ))}
        </ul>
      ) : (
        <div className="mt-3 min-h-[17rem]">
          <div className="grid text-center text-[13px] !text-[var(--ink-45)]" style={{ gridTemplateColumns: width.join(" ") }}>
            {(ui[`cols_${region}` as keyof BirthUi] as string).split(",").map((h) => <span key={h}>{h}</span>)}
          </div>
          {tree && cols.length > 0 && (
            <Wheels columns={cols.map((c, d) => ({
              key: `${region}-${d}-${path.slice(0, d).join(".")}`, width: width[d] ?? "33%",
              options: c.nodes.map((n, k) => ({ value: k, label: fitLabel(shortPlace(n.name), colPx * parseFloat(width[d] ?? "33") / 100) })), value: c.i,
              onChange: (k: number) => setPath((p) => [...cols.slice(0, d).map((x) => x.i), k]),
            }))} />
          )}
        </div>
      )}
    </Sheet>
  );
}
