// server-side only: never import from a client component (5 MB of place data, and lib/hant's OpenCC dictionaries)
import RAW from "@/data/mingli/places.json";
import { toHans } from "@/lib/hant";
import { isForeign, type Foreign } from "@/lib/l10n/core";
import { ADMIN_EN, countryName, MARKET } from "./place-names";

/**
 * 10-18 出生地點：全球城市庫＋搜尋. Birthplaces from GeoNames (CC BY 4.0, see THIRD_PARTY_NOTICES.md), built offline into
 * data/mingli/places.json:
 *  - every place GeoNames lists in Taiwan (cities1000 + all 368 鄉鎮市區), Hong Kong and Macau;
 *  - mainland China: every PPLA/PPLA2/PPLA3/PPLC (prefecture cities, county seats, districts) and every place ≥ 5,000;
 *  - the rest of the world: every place ≥ 15,000 and every capital.
 * Names are GeoNames' zh / zh-TW / zh-Hant / zh-HK / zh-CN / zh-Hans names (the missing script filled in with OpenCC);
 * places with no Chinese name keep their English one. Taiwan names use 臺 (official usage).
 *
 * Row layout (compact on purpose):
 *   [id, nameHant, nameHans, en, cc, admin1Hant, admin1Hans, countryHant, countryHans, lat, lon, tz, pop]
 * "admin1" is the county/city (縣市) for Taiwan, the district (區) for Hong Kong, the province for the mainland
 * (short form: 廣東, 新疆) and the state/province elsewhere; empty for Macau.
 */
type Row = [string, string, string, string, string, string, string, string, string, number, number, string, number];
const ROWS = RAW as unknown as Row[];

/** 10-30 进度表 128 ④: any of the nine — outside Chinese a place is its English name with the country in the reader's language */
export type GazLocale = "zh-hant" | "zh" | Foreign;
export interface GazPlace { id: string; name: string; label: string; lat: number; lon: number; tz: string }

const GROUP: Record<string, number> = { TW: 0, HK: 1, MO: 2, CN: 3 };
const SUFFIX = /(特別行政區|特别行政区|自治縣|自治县|市|縣|县|區|区|省|鄉|乡|鎮|镇)$/;
const CJK = /[㐀-鿿]/;

/** case, accents, spaces and punctuation folded away; 臺 = 台 */
function fold(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/臺/g, "台")
    .replace(/[\s·・.,，、'’\-()（）]/g, "");
}
/** 臺中市 → 臺中, 屯門區 → 屯門; a two-character name keeps its suffix (東區 stays 東區) */
const strip = (s: string): string => ([...s].length > 2 ? s.replace(SUFFIX, "") : s);

interface Entry { row: Row; keys: string[]; group: number }
let INDEX: Entry[] | null = null;

function index(): Entry[] {
  if (INDEX) return INDEX;
  INDEX = ROWS.map((row) => {
    const keys = new Set<string>();
    const add = (s: string) => { if (s) keys.add(s); };
    const [, hant, hans, en, , aHant, aHans] = row;
    for (const [name, admin] of [[hant, aHant], [hans, aHans]] as const) {
      const n = fold(name), ns = strip(n);
      add(n); add(ns);
      if (admin && CJK.test(admin) && CJK.test(name)) {
        // 新竹縣竹北 / 新竹竹北 / 广东东莞
        const a = fold(admin), as = strip(a);
        if (as !== ns) for (const p of new Set([a, as])) { add(p + n); add(p + ns); }
      }
    }
    add(fold(en));
    return { row, keys: [...keys], group: GROUP[row[4]] ?? 9 };
  });
  return INDEX;
}

function toPlace(row: Row, locale: GazLocale): GazPlace {
  if (isForeign(locale)) {
    const name = row[3] || row[1];
    const admin = ADMIN_EN[row[5]] ?? (CJK.test(row[5]) ? "" : row[5]);
    const country = row[4] ? countryName(row[4], locale) : "";
    const parts = [name];
    if (admin && fold(admin) !== fold(name)) parts.push(admin);
    if (country && fold(country) !== fold(name)) parts.push(country);
    return { id: row[0], name, label: parts.join(" · "), lat: row[9], lon: row[10], tz: row[11] };
  }
  const t = locale === "zh-hant";
  const name = t ? row[1] : row[2];
  const admin = t ? row[5] : row[6];
  const country = t ? row[7] : row[8];
  const base = (s: string) => strip(fold(s));
  const parts = [name];
  // the region only when it adds something: not 臺中市 · 臺中市, not an English state name under a Chinese city name
  if (admin && base(admin) !== base(name) && (CJK.test(admin) || !CJK.test(name))) parts.push(admin);
  if (country && base(country) !== base(name) && !(parts.length > 1 && base(country) === base(admin))) parts.push(country);
  return { id: row[0], name, label: parts.join(" · "), lat: row[9], lon: row[10], tz: row[11] };
}

/** The most-populous places of Taiwan, then Hong Kong, then the mainland — what the picker shows before anything is typed.
 *  10-30: outside Chinese, the reader's own countries' biggest places. */
function popular(locale: GazLocale, limit: number): GazPlace[] {
  if (isForeign(locale)) {
    const ccs = MARKET[locale];
    const per = Math.max(2, Math.ceil(limit / Math.min(ccs.length, 3)));
    const out: GazPlace[] = [];
    for (const cc of ccs) {
      let n = 0;
      for (const row of ROWS) {
        if (out.length >= limit || n >= per) break;
        if (row[4] === cc) { out.push(toPlace(row, locale)); n++; }
      }
      if (out.length >= limit) break;
    }
    return out;
  }
  const share = { TW: Math.ceil(limit * 0.4), HK: Math.ceil(limit * 0.3), CN: limit };
  const out: GazPlace[] = [];
  for (const cc of ["TW", "HK", "CN"] as const) {
    let n = 0;
    for (const row of ROWS) {
      if (out.length >= limit || n >= share[cc]) break;
      if (row[4] === cc) { out.push(toPlace(row, locale)); n++; } // rows are stored by country, then population
    }
  }
  return out;
}

/**
 * Search by Chinese name (Traditional or Simplified, 台/臺 alike, with or without 市/縣/區/省…, optionally preceded by
 * the county/province: 新竹縣竹北) or English name (case- and accent-insensitive). No pinyin.
 * Ranked exact > prefix > substring, then Taiwan / Hong Kong / Macau / mainland before the rest, then population.
 */
const JA_OLD: Record<string, string> = { 横: "橫", 浜: "濱", 広: "廣", 児: "兒", 戸: "戶", 沢: "澤", 県: "縣", 区: "區", 栄: "榮", 黒: "黑", 恵: "惠", 徳: "德", 駅: "驛", 関: "關" };
export function searchPlaces(q: string, locale: GazLocale, limit = 20): GazPlace[] {
  const raw = (q ?? "").trim().slice(0, 40);
  if (!raw) return popular(locale, limit);
  const qs = new Set<string>();
  // 10-30 进度表 128 ④: a Japanese reader types 横浜, 広島, 鹿児島 — the place data writes 橫濱, 廣島, 鹿兒島
  const ja = raw.replace(/[横浜広児戸沢県区栄黒恵徳駅関]/g, (c) => JA_OLD[c] ?? c);
  for (const v of [raw, CJK.test(raw) ? toHans(raw) : raw, ja]) {
    const f = fold(v);
    if (f) { qs.add(f); qs.add(strip(f)); }
  }
  if (!qs.size) return popular(locale, limit);
  const hits: { e: Entry; tier: number }[] = [];
  for (const e of index()) {
    let tier = 3;
    for (const k of e.keys) {
      for (const v of qs) {
        if (k === v) { tier = 0; break; }
        if (tier > 1 && k.startsWith(v)) tier = 1;
        else if (tier > 2 && k.includes(v)) tier = 2;
      }
      if (tier === 0) break;
    }
    if (tier < 3) hits.push({ e, tier });
  }
  // 10-18: a big city beats a same-named village (深圳 in 廣東 before 深圳 in 桃園): population on a log scale, with a
  // head start for Taiwan / Hong Kong / Macau and a smaller one for the mainland
  // 10-30: outside Chinese the head start goes to the reader's own countries instead
  const market = isForeign(locale) ? new Set(MARKET[locale]) : null;
  const weight = (e: Entry) => Math.log10(e.row[12] + 1) + (market ? (market.has(e.row[4]) ? 1.5 : 0) : e.group <= 2 ? 1.5 : e.group === 3 ? 0.5 : 0);
  hits.sort((a, b) => a.tier - b.tier || weight(b.e) - weight(a.e));
  const out: GazPlace[] = [], seen = new Set<string>();
  for (const h of hits) {
    const p = toPlace(h.e.row, locale);
    if (seen.has(p.label)) continue; // the city and its prefecture often share a name and a label
    seen.add(p.label); out.push(p);
    if (out.length >= Math.max(1, limit)) break;
  }
  return out;
}

let BY_ID: Map<string, Row> | null = null;
/** A place by its GeoNames id (the `id` searchPlaces returns), or null. */
export function placeByGeoId(id: string, locale: GazLocale = "zh-hant"): GazPlace | null {
  if (!BY_ID) BY_ID = new Map(ROWS.map((r) => [r[0], r]));
  const row = BY_ID.get(String(id));
  return row ? toPlace(row, locale) : null;
}
/** a place's ISO country code ("JP"), or null */
export function countryOfGeoId(id: string): string | null {
  if (!BY_ID) BY_ID = new Map(ROWS.map((r) => [r[0], r]));
  return BY_ID.get(String(id))?.[4] ?? null;
}
