import { LunarDay } from "tyme4ts";
import type { Gender, Normalized } from "@/lib/mingli/birth/normalize";
import { baziOf } from "@/lib/mingli/bazi/chart";
import { insightOf } from "@/lib/mingli/bazi/insight";
import { avoidOf, baziReportOffense, cleanQuestion, QUESTION_MAX } from "@/lib/mingli/bazi/report-facts";
import { astrolabeOf, BRANCHES, isMajor, opposite, sanFang, viewOf, type ZiweiView, type ZPalace } from "./chart";
import { gejuOf, gejuById, type GFact, type GejuHit } from "./geju";
import { flyOf, MUTS, STEM_MUT } from "./insight";
import { ZIWEI_UI_SOURCE } from "./page-ui";

export { cleanQuestion, QUESTION_MAX };

/**
 * 10-20 紫微②③ 付費報告 — the pure half (no database, no model, no Next), mirroring lib/mingli/bazi/report-facts.ts:
 * the chart facts a report is written from (fixed rules on iztro's chart), the 12-month curve of the 紫微年書, the
 * banned-word and date checks, and the page's fixed copy. The server half is ./report.ts. Design: docs/mingli/ziwei-reports.md.
 *
 * chart_json holds ONLY what is computed from the chart: palaces with stars, 亮度 and 四化, 宮干飛化, 格局, 大限 (ages and
 * the years they cover), the 八字 day master / strength / 喜用 for the cross-reading, and for a 年書 the year and month
 * facts. Never the birth date, the clock time, the place, a name or the lunar birth date text.
 *
 * Years: a 紫微 year turns at 正月初一 (iztro, 「正月初一換年」 on the chart page). The 年書 for year Y is the 流年 of the
 * lunar year that starts in calendar year Y, and its twelve 流月 are iztro's monthly layers. A leap month is split as
 * iztro splits it (fixLeap): days 1–15 belong to the month before, days 16 on to the month after — every month label says
 * so, with its 國曆 range (Neil: 日期是農曆的話一定要標注清楚).
 */

export type ZiweiReportKind = "deep" | "year";
export const isZiweiKind = (x: unknown): x is ZiweiReportKind => x === "deep" || x === "year";

type Astrolabe = ReturnType<typeof astrolabeOf>;
const KEY_PALACES = ["命宮", "財帛", "官祿", "夫妻"] as const;
const SHA = ["擎羊", "陀羅", "火星", "鈴星", "地空", "地劫"];
const LUNAR_NAMES = ["正", "二", "三", "四", "五", "六", "七", "八", "九", "十", "十一", "十二"];
export const lunarMonthName = (k: number): string => `${LUNAR_NAMES[k - 1]}月`;

/* ------------------------------------------------------------------ years */

const ymdAt = (now: number) => { const d = new Date(now + 8 * 3_600_000); return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate() }; };
const solarOfLunar = (y: number, m: number, d: number) => { const s = LunarDay.fromYmd(y, m, d).getSolarDay(); return { y: s.getYear(), m: s.getMonth(), d: s.getDay() }; };
const before = (a: { y: number; m: number; d: number }, b: { y: number; m: number; d: number }) => a.y * 10000 + a.m * 100 + a.d < b.y * 10000 + b.m * 100 + b.d;
/** the 紫微 year (lunar, turning at 正月初一) at a moment, UTC+8, named by the calendar year it starts in */
export function ziweiYearAt(now = Date.now()): number {
  const t = ymdAt(now);
  return before(t, solarOfLunar(t.y, 1, 1)) ? t.y - 1 : t.y;
}
/** deep → this year; year → ONE year, this or next (as the 八字 年書) */
export function ziweiReportYears(kind: ZiweiReportKind, now = Date.now(), pick?: number): number[] {
  const y = ziweiYearAt(now);
  return kind === "year" ? [pick === y + 1 ? y + 1 : y] : [y];
}

/* ------------------------------------------------------------------ month ranges (農曆 month → 國曆 dates) */

export interface MonthRange { n: number; lunar: string; from: string; to: string; leapNote: string | null; label: string; mid: string }
const md = (x: { m: number; d: number }) => `${x.m}/${x.d}`;
const dayBefore = (x: { y: number; m: number; d: number }) => { const t = new Date(Date.UTC(x.y, x.m - 1, x.d) - 86_400_000); return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() }; };
const leapOf = (y: number): number => { try { return LunarDay.fromYmd(y, 1, 1).getLunarMonth().getLunarYear().getLeapMonth(); } catch { return 0; } };
/**
 * The twelve 農曆 months of lunar year Y with their 國曆 ranges, split the way iztro splits a leap month (1–15 with the
 * month before, 16 on with the month after). label e.g. 「農曆正月（國曆 2/17–3/18）」, 「農曆七月（國曆 8/9–9/21，含閏六月下半月）」.
 * `mid` is a date inside the month (the 10th) where its 流月 layer is read.
 */
export function monthRanges(year: number): MonthRange[] {
  const leap = leapOf(year);
  const start = (k: number) => (k === 13 ? solarOfLunar(year + 1, 1, 1) : leap && k === leap + 1 ? solarOfLunar(year, -leap, 16) : solarOfLunar(year, k, 1));
  return Array.from({ length: 12 }, (_, i) => {
    const k = i + 1, from = start(k), to = dayBefore(start(k + 1));
    const leapNote = leap === k ? `含閏${lunarMonthName(k)}上半月` : leap && leap + 1 === k ? `含閏${lunarMonthName(leap)}下半月` : null;
    const lunar = lunarMonthName(k);
    return { n: k, lunar, from: md(from), to: md(to), leapNote, label: `農曆${lunar}（國曆 ${md(from)}–${md(to)}${leapNote ? `，${leapNote}` : ""}）`, mid: (() => { const s = solarOfLunar(year, k, 10); return `${s.y}-${s.m}-${s.d}`; })() };
  });
}

/* ------------------------------------------------------------------ chart facts */

export interface StarF { name: string; bright?: string; mut?: string }
export interface PalaceF {
  name: string; branch: string; stem: string; major: StarF[]; minor: StarF[]; isBody: boolean; isSoul: boolean;
  decadal: [number, number];
  /** the stars read for an empty palace (the ones across) */
  borrowed: string[] | null;
  /** this palace's 宮干 四化: where each lands (自化 when it stays) */
  fly: { m: string; star: string; to: string | null; self: boolean }[];
}
export interface DecadeF { palace: string; branch: string; stem: string; startAge: number; endAge: number; startYear: number; endYear: number; stars: string; mut: { m: string; star: string; palace: string | null }[]; when: "past" | "now" | "next" | "later" }
export interface GejuF { name: string; status: string; plain: string; source: string; facts: string[]; missing: string[]; breaks: string[] }
export interface CrossF { area: string; ziwei: "顯" | "平" | "弱"; ziweiWhy: string; bazi: "顯" | "平" | "弱"; baziWhy: string; agree: "同" | "異" | "平" }
export interface BaziSide { dayMaster: string; dmEl: string; strength: string; favour: string[]; avoid: string[]; groups: Record<string, number>; hasHour: boolean }

export interface ZiweiFacts {
  v: 1; kind: ZiweiReportKind; gender: Gender;
  fiveClass: string; soulBranch: string; bodyBranch: string; bodyPalace: string; soulStar: string; bodyStar: string; yearStem: string;
  palaces: PalaceF[];
  /** 生年四化: the star and the palace it sits in */
  natalMut: { m: string; star: string; palace: string }[];
  /** 宮干飛化 that land in 命宮／財帛／官祿／夫妻 (from any palace), and every 自化 */
  flyKey: { from: string; m: string; star: string; to: string; self: boolean }[];
  geju: GejuF[];
  decades: DecadeF[];
  /** 虛歲 at the report year (mid-year) */
  age: number;
  bazi: BaziSide | null;
  cross: CrossF[];
  years: number[];
  /** the 年書 facts (kind year) */
  book?: ZiweiBook;
}

const allStars = (p: ZPalace) => [...p.major, ...p.minor];
const palaceOfStar = (v: ZiweiView, star: string) => v.palaces.find((p) => allStars(p).some((s) => s.name === star)) ?? null;
const starLine = (p: ZPalace | PalaceF) => p.major.map((s) => `${s.name}${s.bright ? `（${s.bright}）` : ""}${s.mut ? `化${s.mut}` : ""}`).join("、");

/** 格局 hit → plain facts in words (the chart page's own templates) */
function word(f: GFact): string {
  const t = ZIWEI_UI_SOURCE[`f_${f.k}`] ?? f.k;
  return t.replace("{s}", (f.s ?? []).join("、")).replace("{p}", f.p ?? "").replace("{b}", f.b ?? "").replace("{x}", f.x ?? "");
}
export function gejuFacts(hits: GejuHit[]): GejuF[] {
  return hits.map((h) => ({
    name: h.name, status: ZIWEI_UI_SOURCE[`gjSt_${h.status}`] ?? h.status, plain: ZIWEI_UI_SOURCE[`gjp_${h.id}`] ?? "",
    source: (gejuById(h.id)?.source ?? "").split("：")[0]!,
    facts: h.facts.map(word), missing: h.missing.map(word), breaks: h.breaks.map(word),
  }));
}

/** how loud a palace is in the chart: 四化 in it, the 亮度 of its main stars, 煞 in it */
export function palaceWeight(p: Pick<ZPalace, "major" | "minor">): { level: "顯" | "平" | "弱"; why: string[] } {
  let s = 0;
  const why: string[] = [];
  for (const x of [...p.major, ...p.minor]) {
    if (x.mut === "祿" || x.mut === "權") { s += 1; why.push(`${x.name}化${x.mut}`); }
    else if (x.mut === "科") { s += 0.5; why.push(`${x.name}化科`); }
    else if (x.mut === "忌") { s -= 1; why.push(`${x.name}化忌`); }
  }
  for (const x of p.major) {
    if (x.bright === "廟" || x.bright === "旺") { s += 0.5; why.push(`${x.name}${x.bright}`); }
    else if (x.bright === "陷" || x.bright === "不") { s -= 0.5; why.push(`${x.name}${x.bright}`); }
  }
  const sha = p.minor.filter((x) => SHA.includes(x.name));
  if (sha.length) { s -= 0.5 * sha.length; why.push(sha.map((x) => x.name).join("、")); }
  if (!p.major.length) why.push("無主星");
  return { level: s >= 1 ? "顯" : s <= -1 ? "弱" : "平", why };
}

const GROUP_HANT: Record<string, string> = { 印: "印", 比劫: "比劫", 食伤: "食傷", 财: "財", 官杀: "官殺" };
/**
 * 紫微 × 八字, area by area, both sides by fixed rules: a palace's weight (palaceWeight) against the share of a 十神 group
 * (≥ 30 % 顯, ≤ 8 % 弱) — or for 自我 the 八字 strength (偏強／稍強 顯, 稍弱／偏弱 弱). agree 同 when both lean the same
 * way (both 顯 or both 弱), 平 when both are 平, otherwise 異.
 */
export function crossOf(v: ZiweiView, b: BaziSide, gender: Gender): CrossF[] {
  const total = Object.values(b.groups).reduce((a, x) => a + x, 0) || 1;
  const share = (g: string) => (b.groups[g] ?? 0) / total;
  const lv = (x: number): CrossF["bazi"] => (x >= 0.3 ? "顯" : x <= 0.08 ? "弱" : "平");
  const pct = (g: string) => `${GROUP_HANT[g] ?? g}約${Math.round(share(g) * 100)}%`;
  const spouse = gender === "male" ? "财" : "官杀";
  const rows: [string, string, CrossF["bazi"], string][] = [
    ["自我", "命宮", /強/.test(b.strength) ? "顯" : /弱/.test(b.strength) ? "弱" : "平", `日主${b.dayMaster}${b.dmEl}，${b.strength}`],
    ["事業", "官祿", lv(share("官杀")), pct("官杀")],
    ["財", "財帛", lv(share("财")), pct("财")],
    ["感情", "夫妻", lv(share(spouse)), `配偶星（${gender === "male" ? "財" : "官殺"}）${pct(spouse).replace(/^\S+?約/, "約")}`],
    ["才華表達", "子女", lv(share("食伤")), pct("食伤")],
    ["人際", "交友", lv(share("比劫")), pct("比劫")],
  ];
  return rows.map(([area, pal, bz, bzWhy]) => {
    const p = v.palaces.find((x) => x.name === pal)!;
    const w = palaceWeight(p);
    const agree: CrossF["agree"] = w.level === "平" && bz === "平" ? "平" : w.level === bz ? "同" : "異";
    return { area, ziwei: w.level, ziweiWhy: `${pal}：${w.why.join("、") || "平"}`, bazi: bz, baziWhy: bzWhy, agree };
  });
}

/** the astrolabe's lunar birth year (for the 大限 years) — used only to place the decades in time, never stored */
const lunarYearOf = (a: Astrolabe): number => (a as unknown as { rawDates: { lunarDate: { lunarYear: number } } }).rawDates.lunarDate.lunarYear;

export function decadesOf(a: Astrolabe, v: ZiweiView, age: number): DecadeF[] {
  const by = lunarYearOf(a);
  const list = [...v.palaces].sort((x, y) => x.decadal[0] - y.decadal[0]);
  const cur = list.findIndex((p) => age >= p.decadal[0] && age <= p.decadal[1]);
  return list.map((p, i) => {
    const t = STEM_MUT[p.stem];
    const stars = p.major.length ? starLine(p) : `（無主星，借對宮${starLine(v.palaces.find((x) => x.branch === opposite(p.branch))!)}）`;
    return {
      palace: p.name, branch: p.branch, stem: p.stem, startAge: p.decadal[0], endAge: p.decadal[1],
      startYear: by + p.decadal[0] - 1, endYear: by + p.decadal[1] - 1, stars,
      mut: t ? t.map((star, k) => ({ m: MUTS[k]!, star, palace: palaceOfStar(v, star)?.name ?? null })) : [],
      when: cur < 0 ? (age < p.decadal[0] ? (i === 0 ? "next" : "later") : "past") : i < cur ? "past" : i === cur ? "now" : i === cur + 1 ? "next" : "later",
    };
  });
}

export function palacesOf(v: ZiweiView): PalaceF[] {
  return v.palaces.map((p) => ({
    name: p.name, branch: p.branch, stem: p.stem, isBody: p.isBody, isSoul: p.isSoul, decadal: p.decadal,
    major: p.major.map((s) => ({ name: s.name, ...(s.bright ? { bright: s.bright } : {}), ...(s.mut ? { mut: s.mut } : {}) })),
    minor: p.minor.map((s) => ({ name: s.name, ...(s.mut ? { mut: s.mut } : {}) })),
    borrowed: p.major.length ? null : v.palaces.find((x) => x.branch === opposite(p.branch))!.major.map((s) => s.name),
    fly: flyOf(v, p.branch).map((f) => ({ m: f.m, star: f.star, to: f.toName, self: f.self })),
  }));
}

/** the facts of one report (the server recomputes from the birth input; nothing the browser computed is trusted) */
export function ziweiFacts(n: Normalized, gender: Gender, kind: ZiweiReportKind, now = Date.now(), pick?: number): ZiweiFacts {
  const a = astrolabeOf(n, gender, "zh-TW");
  const v = viewOf(a);
  const years = ziweiReportYears(kind, now, pick);
  const y = years[0]!;
  const midYear = monthRanges(y)[5]!.mid;
  let age = 0;
  try { age = a.horoscope(midYear).age.nominalAge; } catch { /* */ }
  const natalMut: ZiweiFacts["natalMut"] = [];
  for (const m of MUTS) for (const p of v.palaces) for (const s of allStars(p)) if (s.mut === m) natalMut.push({ m, star: s.name, palace: p.name });
  const flyKey: ZiweiFacts["flyKey"] = [];
  for (const p of v.palaces) for (const f of flyOf(v, p.branch)) {
    if (f.toName && (f.self || (KEY_PALACES as readonly string[]).includes(f.toName))) flyKey.push({ from: p.name, m: f.m, star: f.star, to: f.toName, self: f.self });
  }
  let bazi: BaziSide | null = null;
  try {
    const bv = baziOf(n, gender, y, false);
    const ins = insightOf(bv.pillars.map((p) => p.gz), gender);
    bazi = { dayMaster: bv.dayMaster, dmEl: bv.dmEl, strength: bv.strength.level, favour: [...bv.favour], avoid: avoidOf(bv), groups: { ...ins.groups }, hasHour: bv.hasHour };
  } catch { /* the cross chapter then says the 八字 side is not available */ }
  const f: ZiweiFacts = {
    v: 1, kind, gender, fiveClass: v.fiveClass, soulBranch: v.soulBranch, bodyBranch: v.bodyBranch,
    bodyPalace: v.palaces.find((p) => p.branch === v.bodyBranch)!.name, soulStar: v.soulStar, bodyStar: v.bodyStar, yearStem: v.chineseDate.slice(0, 1),
    palaces: palacesOf(v), natalMut, flyKey, geju: gejuFacts(gejuOf(v)), decades: decadesOf(a, v, age), age,
    bazi, cross: bazi ? crossOf(v, bazi, gender) : [], years,
  };
  if (kind === "year") f.book = ziweiBook(a, v, y);
  return f;
}

/* ------------------------------------------------------------------ 年書 facts (fixed rules; the writer only explains them) */

export interface MonthZ {
  n: number; label: string; lunar: string; from: string; to: string; leapNote: string | null;
  gz: string;
  /** the natal palace the 流月命宮 sits in, and its stars */
  palace: string; branch: string; stars: string;
  mut: { m: string; star: string; palace: string | null }[];
  score: number; level: 1 | 2 | 3 | 4 | 5; tags: string[]; flags: string[];
}
export interface ZiweiBook {
  year: number; gz: string; age: number;
  /** the lunar year's 國曆 span */
  span: { from: string; to: string; toYear: number };
  palace: { name: string; branch: string; stars: string; borrowed: boolean };
  mut: { m: string; star: string; palace: string | null }[];
  decade: { palace: string; branch: string; startAge: number; endAge: number; stars: string; rel: "同宮" | "對宮" | "三合" | "其他"; mut: { m: string; star: string; palace: string | null }[]; overlaps: string[] } | null;
  small: string | null;
  /** 流年 流魁 流鉞 流昌 流曲 流祿 流羊 流陀 流馬 → the natal palace each falls in */
  stars: Record<string, string>;
  months: MonthZ[];
  key: { smooth: number; slow: number; pivot: number };
  guards: { from: number; to: number; why: string[] }[];
  allies: { yearKui: string | null; yearYue: string | null; kui: string | null; yue: string | null; zuo: string | null; you: string | null; friends: string; yearKe: string | null };
}

/** rule weights of the 流月 curve — the whole rule set in one place (docs/mingli/ziwei-reports.md) */
export const ZW_CURVE_W = {
  base: 3, luSoul: 1, luKey: 0.5, quanKey: 0.5, keKey: 0.5, jiSoul: -1, jiOpp: -1, jiKey: -0.5, doubleJi: -0.5,
  natalLu: 0.5, natalJi: -0.5, kuiyue: 0.5, lucun: 0.5, yangtuo: -0.5, kongjie: -0.5,
};
const rel3 = (a: string, b: string): "同宮" | "對宮" | "三合" | "其他" => (a === b ? "同宮" : opposite(a) === b ? "對宮" : sanFang(a).slice(1, 3).includes(b) ? "三合" : "其他");
const horoStars = (item: { stars?: { name: string }[][] }, idx: number) => (item.stars?.[idx] ?? []).map((s) => s.name);

/**
 * The twelve 流月 of a 紫微 year, scored against the natal chart. Start at 3. The month's 四化 (流月天干): 化祿 into the
 * palace the 流月命宮 sits in +1, into 財帛／官祿／夫妻 (or 命宮) +0.5; 化權, 化科 into 命／財／官／夫 or the 流月 palace +0.5;
 * 化忌 into the 流月 palace −1, into the palace across it −1 (忌沖), into 命／財／官／夫 −0.5; 化忌 in the same palace as
 * the 流年化忌 −0.5. The 流月 palace holding a natal 化祿 +0.5 / natal 化忌 −0.5; 月魁／月鉞 there +0.5, 月祿 (祿存) there
 * +0.5, each of 月羊／月陀 there −0.5, natal 地空／地劫 there −0.5. Level = the score rounded, held to 1–5.
 */
export function monthCurveZ(a: Astrolabe, v: ZiweiView, year: number, yearJiPalace: string | null, yearSoul: string, decadeSoul: string | null): MonthZ[] {
  const W = ZW_CURVE_W;
  return monthRanges(year).map((r) => {
    const h = a.horoscope(r.mid);
    const mo = h.monthly;
    const pal = v.palaces[mo.index]!;
    const keyNames = new Set<string>([...KEY_PALACES, pal.name]);
    const mut = ((mo.mutagen ?? []) as string[]).map((star, k) => ({ m: MUTS[k]!, star, palace: palaceOfStar(v, star)?.name ?? null }));
    let score = W.base;
    const tags: string[] = [], flags: string[] = [];
    const add = (w: number, tag: string) => { score += w; tags.push(tag); };
    for (const x of mut) {
      if (!x.palace) continue;
      const t = `月${x.star}化${x.m}入${x.palace}`;
      if (x.m === "祿") { if (x.palace === pal.name) { add(W.luSoul, t); flags.push("祿到流月命宮"); } else if (keyNames.has(x.palace)) { add(W.luKey, t); flags.push(`祿到${x.palace}`); } }
      else if (x.m === "權" || x.m === "科") { if (keyNames.has(x.palace)) add(x.m === "權" ? W.quanKey : W.keKey, t); }
      else {
        const pb = v.palaces.find((p) => p.name === x.palace)!.branch;
        if (pb === pal.branch) { add(W.jiSoul, t); flags.push("忌入流月命宮"); }
        else if (pb === opposite(pal.branch)) { add(W.jiOpp, `${t}（沖流月命宮）`); flags.push("忌沖流月命宮"); }
        else if (keyNames.has(x.palace)) { add(W.jiKey, t); flags.push(`忌到${x.palace}`); }
        if (yearJiPalace && x.palace === yearJiPalace) { add(W.doubleJi, `月忌與年忌同在${x.palace}`); flags.push("雙忌"); }
      }
    }
    for (const s of allStars(pal)) {
      if (s.mut === "祿") add(W.natalLu, `流月命宮有本命${s.name}化祿`);
      if (s.mut === "忌") add(W.natalJi, `流月命宮有本命${s.name}化忌`);
    }
    const here = horoStars(mo, mo.index);
    if (here.some((s) => s === "月魁" || s === "月鉞")) { add(W.kuiyue, "月魁鉞在流月命宮"); flags.push("魁鉞"); }
    if (here.includes("月祿")) { add(W.lucun, "月祿存在流月命宮"); flags.push("祿存"); }
    for (const s of here.filter((s) => s === "月羊" || s === "月陀")) add(W.yangtuo, `${s}在流月命宮`);
    if (here.some((s) => s === "月羊" || s === "月陀")) flags.push("羊陀");
    if (allStars(pal).some((s) => s.name === "地空" || s.name === "地劫")) { add(W.kongjie, "流月命宮有空劫"); flags.push("空劫"); }
    if (here.some((s) => s === "月昌" || s === "月曲")) flags.push("昌曲");
    if (here.includes("月馬")) flags.push("月馬");
    if (pal.branch === yearSoul) flags.push("疊流年命宮");
    if (decadeSoul && pal.branch === decadeSoul) flags.push("疊大限命宮");
    score = Math.round(score * 100) / 100;
    const level = Math.max(1, Math.min(5, Math.round(score))) as MonthZ["level"];
    if (!tags.length) tags.push("平穩");
    const stars = pal.major.length ? starLine(pal) : `借對宮${starLine(v.palaces.find((x) => x.branch === opposite(pal.branch))!)}`;
    return { n: r.n, label: r.label, lunar: r.lunar, from: r.from, to: r.to, leapNote: r.leapNote, gz: `${mo.heavenlyStem}${mo.earthlyBranch}`, palace: pal.name, branch: pal.branch, stars, mut, score, level, tags, flags };
  });
}

/** how much a mark weighs when choosing the months */
export const ZW_MONTH_W = {
  ease: { 忌入流月命宮: 3, 忌沖流月命宮: 2, 雙忌: 1.5, 羊陀: 1, 空劫: 1, 忌到財帛: 0.5, 忌到官祿: 0.5, 忌到夫妻: 0.5 } as Record<string, number>,
  pivot: { 疊流年命宮: 3, 疊大限命宮: 2, 忌入流月命宮: 2, 祿到流月命宮: 2, 雙忌: 1.5, 忌沖流月命宮: 1.5, 魁鉞: 1, 月馬: 0.5, 昌曲: 0.5 } as Record<string, number>,
};
const wOf = (t: Record<string, number>, flags: string[]) => flags.reduce((a, f) => a + (t[f] ?? 0), 0);
/** smooth = the highest score (ties: fewer ease marks, earlier); slow = the lowest of the rest; pivot = the most pivot weight of the other ten */
export function keyMonthsZ(months: Pick<MonthZ, "score" | "flags">[]): { smooth: number; slow: number; pivot: number } {
  const idx = months.map((_, i) => i);
  const ease = (i: number) => wOf(ZW_MONTH_W.ease, months[i]!.flags);
  const smooth = [...idx].sort((a, b) => months[b]!.score - months[a]!.score || ease(a) - ease(b) || a - b)[0]!;
  const slow = idx.filter((i) => i !== smooth).sort((a, b) => months[a]!.score - months[b]!.score || ease(b) - ease(a) || a - b)[0]!;
  const pv = (i: number) => wOf(ZW_MONTH_W.pivot, months[i]!.flags);
  const pivot = idx.filter((i) => i !== smooth && i !== slow).sort((a, b) => pv(b) - pv(a) || Math.abs(months[b]!.score - 3) - Math.abs(months[a]!.score - 3) || a - b)[0]!;
  return { smooth, slow, pivot };
}
/** two or three stretches to go easy: runs of months at level ≤ 2 or with 忌入／忌沖流月命宮, lowest first; topped up to two */
export function guardPeriodsZ(months: Pick<MonthZ, "score" | "level" | "flags" | "tags">[], smooth: number): { from: number; to: number; why: string[] }[] {
  const hit = months.map((m) => m.level <= 2 || m.flags.includes("忌入流月命宮") || m.flags.includes("忌沖流月命宮"));
  const runs: [number, number][] = [];
  hit.forEach((h, i) => { if (!h || i === smooth) return; const last = runs[runs.length - 1]; if (last && last[1] === i - 1) last[1] = i; else runs.push([i, i]); });
  const minScore = ([a, b]: [number, number]) => Math.min(...months.slice(a, b + 1).map((m) => m.score));
  const picked = [...runs].sort((x, y) => minScore(x) - minScore(y) || x[0] - y[0]).slice(0, 3);
  const used = new Set(picked.flatMap(([a, b]) => Array.from({ length: b - a + 1 }, (_, k) => a + k)));
  const rest = months.map((_, i) => i).filter((i) => !used.has(i) && i !== smooth).sort((a, b) => months[a]!.score - months[b]!.score || a - b);
  while (picked.length < 2 && rest.length) { const i = rest.shift()!; picked.push([i, i]); }
  return picked.sort((x, y) => x[0] - y[0]).map(([from, to]) => {
    const why: string[] = [];
    for (let i = from; i <= to; i++) {
      for (const t of months[i]!.tags) if (/忌|羊|陀|空劫/.test(t)) why.push(t);
      for (const fl of months[i]!.flags) if (ZW_MONTH_W.ease[fl] && !why.some((w) => w.includes(fl))) why.push(fl);
    }
    return { from, to, why: [...new Set(why)].slice(0, 5) };
  });
}

export function ziweiBook(a: Astrolabe, v: ZiweiView, year: number): ZiweiBook {
  const ranges = monthRanges(year);
  const h = a.horoscope(ranges[5]!.mid);
  const yr = h.yearly, dc = h.decadal;
  const yp = v.palaces[yr.index]!;
  const yMut = ((yr.mutagen ?? []) as string[]).map((star, k) => ({ m: MUTS[k]!, star, palace: palaceOfStar(v, star)?.name ?? null }));
  const dp = dc && dc.index >= 0 ? v.palaces[dc.index] ?? null : null;
  const dMut = dp ? ((dc.mutagen ?? []) as string[]).map((star, k) => ({ m: MUTS[k]!, star, palace: palaceOfStar(v, star)?.name ?? null })) : [];
  const overlaps: string[] = [];
  for (const y of yMut) for (const d of dMut) {
    if (!y.palace || y.palace !== d.palace) continue;
    if ((y.m === "祿" || y.m === "忌") && (d.m === "祿" || d.m === "忌")) overlaps.push(`流年化${y.m}（${y.star}）與大限化${d.m}（${d.star}）同在${y.palace}`);
  }
  const stars: Record<string, string> = {};
  (yr.stars ?? []).forEach((list: { name: string }[], i: number) => { for (const s of list) if (/^流(魁|鉞|昌|曲|祿|羊|陀|馬)$/.test(s.name)) stars[s.name] = v.palaces[i]!.name; });
  const yearJi = yMut.find((x) => x.m === "忌")?.palace ?? null;
  const months = monthCurveZ(a, v, year, yearJi, yp.branch, dp?.branch ?? null);
  const key = keyMonthsZ(months);
  const end = ranges[11]!;
  const at = (s: string) => palaceOfStar(v, s)?.name ?? null;
  const friends = v.palaces.find((p) => p.name === "交友")!;
  return {
    year, gz: `${yr.heavenlyStem}${yr.earthlyBranch}`, age: h.age.nominalAge,
    span: { from: ranges[0]!.from, to: end.to, toYear: Number(end.to.split("/")[0]) < 6 ? year + 1 : year },
    palace: { name: yp.name, branch: yp.branch, stars: yp.major.length ? starLine(yp) : starLine(v.palaces.find((x) => x.branch === opposite(yp.branch))!), borrowed: !yp.major.length },
    mut: yMut,
    decade: dp ? { palace: dp.name, branch: dp.branch, startAge: dp.decadal[0], endAge: dp.decadal[1], stars: dp.major.length ? starLine(dp) : `借對宮${starLine(v.palaces.find((x) => x.branch === opposite(dp.branch))!)}`, rel: rel3(dp.branch, yp.branch), mut: dMut, overlaps } : null,
    small: h.age?.index !== undefined ? v.palaces[h.age.index]?.name ?? null : null,
    stars, months, key, guards: guardPeriodsZ(months, key.smooth),
    allies: {
      yearKui: stars["流魁"] ?? null, yearYue: stars["流鉞"] ?? null, kui: at("天魁"), yue: at("天鉞"), zuo: at("左輔"), you: at("右弼"),
      friends: friends.major.length ? starLine(friends) : `借對宮${starLine(v.palaces.find((x) => x.branch === opposite(friends.branch))!)}`,
      yearKe: yMut.find((x) => x.m === "科")?.palace ?? null,
    },
  };
}

/* ------------------------------------------------------------------ checks */

/**
 * The 八字 banned list (準 as accuracy, 保證, AI, 吉／凶, 化解, 太歲, medical, investment, legal, mechanics …) plus what a
 * 紫微 report adds: 小人 (no fear wording about people), 煞星 as fate (破格 stays a chart word, said calmly).
 */
export function ziweiReportOffense(text: string): string | null {
  const b = baziReportOffense(text, "deep");
  if (b) return b;
  const m = text.match(/小人|犯沖|剋應|克应|宿命|命不好|命苦|苦命/);
  if (m) return `fear:${m[0]}`;
  const en = text.match(/[A-Za-z]{2,}/);
  if (en) return `latin:${en[0]}`;
  return null;
}

const LUNAR_RE = /([農农]曆|[農农]历|閏|闰)?(十一|十二|正|冬|臘|腊|十|[一二三四五六七八九])月/g;
const SOLAR_RE = /(?:國曆|国历|公历)\s?(\d{1,2})\/(\d{1,2})(?:\s?[–\-~至到]\s?(\d{1,2})\/(\d{1,2}))?/g;
/**
 * 10-20 (Neil: 日期是農曆的話一定要標注清楚) — a 紫微年書's months are 農曆 months. Every month the text names must say which
 * calendar: a lunar month only as 農曆X月 (or 閏X月 inside a label); a 國曆 date only as 國曆 M/D (a range M/D–M/D), and only
 * a date that starts or ends one of this year's months; 「農曆X月（國曆 a–b）」 must carry that month's own range. Unlabelled
 * months (「三月」「3月」「5月5日」) and bare dates (「3/18」) are sent back.
 */
export function ziweiDateOffense(value: unknown, months: Pick<MonthZ, "n" | "lunar" | "from" | "to">[]): string | null {
  const ok = new Set(months.flatMap((m) => [m.from, m.to]));
  const byName = new Map(months.map((m) => [m.lunar, m]));
  for (const s of allStrings(value)) {
    for (const hit of s.matchAll(LUNAR_RE)) {
      if (!hit[1]) return `undated:${hit[0]}`;
      if (/[農农]/.test(hit[1]) && !byName.has(`${hit[2] === "冬" ? "十一" : /[臘腊]/.test(hit[2]!) ? "十二" : hit[2]}月`)) return `date:${hit[0]}`;
    }
    const covered: [number, number][] = [];
    for (const hit of s.matchAll(SOLAR_RE)) {
      covered.push([hit.index!, hit.index! + hit[0].length]);
      for (const d of [hit[1] && `${Number(hit[1])}/${Number(hit[2])}`, hit[3] && `${Number(hit[3])}/${Number(hit[4])}`]) if (d && !ok.has(d)) return `date:${d}`;
      // 「農曆X月（國曆 a–b」: the range must be that month's
      const pre = s.slice(Math.max(0, hit.index! - 12), hit.index!).match(/(?:[農农]曆|[農农]历)(十一|十二|正|十|[一二三四五六七八九])月[（(]$/);
      if (pre && hit[3]) {
        const m = byName.get(`${pre[1]}月`);
        if (!m || m.from !== `${Number(hit[1])}/${Number(hit[2])}` || m.to !== `${Number(hit[3])}/${Number(hit[4])}`) return `date:${pre[0]}${hit[0].replace(/^\S+\s?/, "")}`;
      }
    }
    for (const hit of s.matchAll(/\d{1,2}\/\d{1,2}/g)) if (!covered.some(([a, b]) => hit.index! >= a && hit.index! < b)) return `undated:${hit[0]}`;
    const ar = s.match(/\d{1,2}\s?月/);
    if (ar) return `undated:${ar[0]}`;
  }
  return null;
}
export const allStrings = (v: unknown): string[] => (typeof v === "string" ? [v] : Array.isArray(v) ? v.flatMap(allStrings) : v && typeof v === "object" ? Object.values(v).flatMap(allStrings) : []);

/* ------------------------------------------------------------------ chapters, writing calls, page copy (Traditional; zh pages go through toHans) */

export const ZW_DEEP_CHAPTERS: { key: string; title: string }[] = [
  { key: "zonglan", title: "總覽與格局" },
  { key: "minggong", title: "命宮與三方四正" },
  { key: "shengong", title: "身宮" },
  { key: "sihua", title: "生年四化" },
  { key: "shiye", title: "事業（官祿）" },
  { key: "caibo", title: "財帛" },
  { key: "ganqing", title: "感情（夫妻）" },
  { key: "renji", title: "人際（交友與兄弟）" },
  { key: "shenxin", title: "身心作息（疾厄）" },
  { key: "guoqu", title: "已走過的大限回顧" },
  { key: "xianzai", title: "現在與下一步大限" },
  { key: "bazi", title: "與八字的交叉" },
];
/** which chapters each writing call produces (five calls) */
export const ZW_DEEP_GROUPS: Record<string, string[]> = {
  A: ["zonglan", "minggong", "shengong"],
  B: ["sihua", "shiye", "caibo"],
  C: ["ganqing", "renji", "shenxin"],
  D: ["guoqu", "xianzai"],
  E: ["bazi"],
};
export const zwDeepGroupOf = (chapter: string): string => Object.keys(ZW_DEEP_GROUPS).find((g) => ZW_DEEP_GROUPS[g]!.includes(chapter)) ?? "A";
export const ZW_BOOK_GROUPS = ["ov", "m1", "m2", "m3", "m4", "ar", "ar2", "gx"] as const;
export function zwGroupKeys(kind: ZiweiReportKind, opt: { question?: boolean } = {}): string[] {
  return kind === "deep" ? Object.keys(ZW_DEEP_GROUPS) : [...ZW_BOOK_GROUPS, ...(opt.question ? ["qa"] : [])];
}
export const ZW_BOOK_AREAS: { key: "career" | "wealth" | "love" | "rhythm" | "people" | "home"; title: string }[] = [
  { key: "career", title: "事業" },
  { key: "wealth", title: "財運" },
  { key: "love", title: "感情" },
  { key: "rhythm", title: "健康作息" },
  { key: "people", title: "人際貴人" },
  { key: "home", title: "家宅出行" },
];
export const ZW_REPORT_UI = {
  back: "紫微命盤",
  kindLabel: { deep: "紫微深度報告", year: "紫微年書" } as Record<ZiweiReportKind, string>,
  kindSub: { deep: "十二章，從格局、各宮到大限，最後和八字對讀", year: "一整年的年書：總判、關鍵月、逐月宜忌、六大領域、貴人與季度行動" } as Record<ZiweiReportKind, string>,
  writing: "報告正在寫，一章一章出來，寫好的會先出現在這裡。大約一兩分鐘，頁面會自己更新。",
  writingChapter: "這一章正在寫……",
  failedChapter: "這一章這次沒寫成，我們會補上，寫好會寄信通知你。",
  head: "命盤",
  headSoul: "命宮", headBody: "身宮", headFive: "五行局", headLords: "命主／身主",
  gejuNone: "這張盤沒有符合常見格局的組合，各宮的星曜更值得細看。",
  decadeNow: "現在", decadeNext: "下一步",
  crossHead: "兩套命盤，各看一面", crossAgree: { 同: "方向一致", 異: "各有側重", 平: "都平穩" } as Record<string, string>,
  crossNone: "這張盤沒有八字資料可以對讀。",
  levelWord: { 1: "放慢", 2: "收著走", 3: "平穩", 4: "順手", 5: "有勢" } as Record<number, string>,
  bookVerdict: "年度總判", bookKeyword: "今年的關鍵字",
  bookYearPalace: "流年命宮", bookYearMut: "流年四化", bookDecade: "與大限", bookSmall: "小限", bookOverlap: "疊在一起的",
  bookKeyMonths: "三個關鍵月份", keySmooth: "最順手的月", keySlow: "最需要放慢的月", keyPivot: "最重要的一個月",
  bookMonths: "十二個月逐月", monthYi: "宜", monthJi: "不宜", monthPalace: "流月命宮在",
  monthsNote: "紫微的流月按農曆月份走。每個月都標了農曆月份和對應的國曆日期；遇到閏月，依排盤慣例前半月併入上個月、後半月併入下個月。",
  bookCurve: "每月的能量起伏",
  bookAreas: "六大領域", areaSingle: "單身", areaPaired: "有伴",
  bookAllies: "貴人與合作", alliesYear: "今年的魁鉞", alliesNatal: "本命的魁鉞", alliesHelpers: "左輔右弼", alliesFriends: "交友宮",
  bookGuards: "需要守的時段", bookQuarters: "季度行動清單",
  quarter: { 1: "第一季", 2: "第二季", 3: "第三季", 4: "第四季" } as Record<number, string>,
  bookQuestion: "答你的問題", questionYou: "你問的是", questionCast: "想看這件事接下來的走向，可以為它起一卦 →",
  unpaidHead: "這份報告還沒付款", unpaidBody: "付款完成後，報告會直接寫在這一頁，也會寄到你的信箱。",
  productName: "YaoFlow 紫微年書：{y} 年，逐月來看（數位內容）",
  productNameHans: "YaoFlow 紫微年书：{y} 年，逐月来看（数字内容）",
};
/** every fixed string above, for the banned-word test */
export function ziweiReportStaticStrings(): string[] {
  const out: string[] = [];
  const walk = (x: unknown) => { if (typeof x === "string") out.push(x); else if (x && typeof x === "object") Object.values(x).forEach(walk); };
  walk(ZW_REPORT_UI); walk(ZW_DEEP_CHAPTERS.map((c) => c.title)); walk(ZW_BOOK_AREAS.map((c) => c.title));
  return out;
}
export const zwQuarterMonths = (q: number): number[] => [q * 3, q * 3 + 1, q * 3 + 2];
export { BRANCHES, isMajor };
