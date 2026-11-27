import { SolarDay, SolarTerm } from "tyme4ts";
import CONTENT from "@/data/mingli/yunshi.json";
import { huangliDay, parseYmd } from "@/lib/mingli/calendar/day";

/**
 * 10-18 进度表 73 每日運勢（生肖版）: the reader's sign (地支) against the day's branch, by the usual tables, in this
 * order: 沖 → 刑 → 害 → 破 → 六合 → 三合 → 同支 → 平. Each relation maps to one of three tiers (順手／平穩／多留意). The
 * words come from data/mingli/yunshi.json (drafted by 开发, reviewed by 推广); see slot() for how a variant is picked.
 */
export const BRANCHES = ["子", "丑", "寅", "卯", "辰", "巳", "午", "未", "申", "酉", "戌", "亥"] as const;
export const SIGNS = ["rat", "ox", "tiger", "rabbit", "dragon", "snake", "horse", "goat", "monkey", "rooster", "dog", "pig"] as const;
export type Sign = (typeof SIGNS)[number];
export type Relation = "chong" | "xing" | "hai" | "po" | "liuhe" | "sanhe" | "same" | "ping";
export type Tier = "smooth" | "steady" | "careful";

const pairs = (s: string) => new Set(s.split(" ").flatMap((p) => [p, p[1]! + p[0]!]));
const CHONG = pairs("子午 丑未 寅申 卯酉 辰戌 巳亥");
const HAI = pairs("子未 丑午 寅巳 卯辰 申亥 酉戌");
const PO = pairs("子酉 卯午 辰丑 未戌 寅亥 巳申");
const LIUHE = pairs("子丑 寅亥 卯戌 辰酉 巳申 午未");
// 刑: 子卯相刑; 寅巳申、丑戌未 三刑 (any two of the group); 辰午酉亥 自刑
const XING = pairs("子卯 寅巳 巳申 申寅 丑戌 戌未 未丑");
const SELF_XING = new Set(["辰", "午", "酉", "亥"]);
const SANHE = ["申子辰", "亥卯未", "寅午戌", "巳酉丑"];

export function relationOf(sign: number, dayBranch: number): Relation {
  const a = BRANCHES[sign]!, b = BRANCHES[dayBranch]!, ab = a + b;
  if (CHONG.has(ab)) return "chong";
  if (XING.has(ab) || (a === b && SELF_XING.has(a))) return "xing";
  if (HAI.has(ab)) return "hai";
  if (PO.has(ab)) return "po";
  if (LIUHE.has(ab)) return "liuhe";
  if (a !== b && SANHE.some((g) => g.includes(a) && g.includes(b))) return "sanhe";
  if (a === b) return "same";
  return "ping";
}

export const TIER_OF: Record<Relation, Tier> = { liuhe: "smooth", sanhe: "smooth", ping: "steady", same: "steady", po: "steady", chong: "careful", xing: "careful", hai: "careful" };

type Line = { line: string; yi: string; ji: string };
export type Content = {
  tiers: Record<Tier, { name: string; plain: string }>;
  relations: Record<Relation, Line[]>;
  stems: Record<string, string[]>;
  plain: Record<Relation, string[]>;
  zodiac: Record<Sign, { name: string; branch: string; intro: string; faq: { q: string; a: string }[] }>;
  faq: { q: string; a: string }[];
};
export const C = CONTENT as unknown as Content;

/** days since 1970-01-01 for a Taipei calendar date */
const dayNo = (y: number, m: number, d: number) => Math.floor(Date.UTC(y, m - 1, d) / 86_400_000);
// 1970-01-01 is 辛巳日: branch 巳 (5), stem 辛 (7)
const branchOfDay = (n: number) => (((n + 5) % 12) + 12) % 12;

/**
 * Which variant a sign gets on day n: within one twelve-day round (子 to 亥) the slot (sign + branch) mod 12 is different
 * for every sign on the same day and for every day of the same sign; each round moves the slots on by a fixed step
 * (12 for 平, which needs 36 variants; 5 for the rest, 15 variants). Checked by test: no two signs share a line on the
 * same day, and no sign sees the same line twice within 30 days.
 */
function slot(sign: number, rel: Relation, n: number): number {
  const round = Math.floor((n + 5) / 12);
  const step = rel === "ping" ? 12 : 5;
  return round * step + ((sign + branchOfDay(n)) % 12);
}

export interface Yunshi {
  sign: Sign; signIdx: number; name: string; ymd: string; dayGz: string; dayBranch: string;
  relation: Relation; tier: Tier; tierName: string; line: string; yi: string; ji: string; rhythm: string; plain: string;
}

export function yunshiFor(signIdx: number, ymd: string, c: Content = C): Yunshi | null {
  const p = parseYmd(ymd);
  if (!p || signIdx < 0 || signIdx > 11) return null;
  const d = huangliDay(p.y, p.m, p.d);
  const n = dayNo(p.y, p.m, p.d);
  const db = BRANCHES.indexOf(d.gz.day[1] as (typeof BRANCHES)[number]);
  const rel = relationOf(signIdx, db);
  const occ = slot(signIdx, rel, n);
  const lines = c.relations[rel], plains = c.plain[rel];
  const pick = lines[occ % lines.length]!;
  const stem = d.gz.day[0]!;
  const rh = c.stems[stem] ?? [];
  const tier = TIER_OF[rel];
  const sign = SIGNS[signIdx]!;
  return {
    sign, signIdx, name: c.zodiac[sign].name, ymd, dayGz: d.gz.day, dayBranch: d.gz.day[1]!,
    relation: rel, tier, tierName: c.tiers[tier].name, line: pick.line, yi: pick.yi, ji: pick.ji,
    rhythm: rh[Math.floor(n / 10) % (rh.length || 1)] ?? "", plain: plains[occ % plains.length]!,
  };
}

export const signBySlug = (s: string) => SIGNS.indexOf(s as Sign);

/** the sign for a birth date, by 立春 (the year turns at the 立春 day) */
export function signOfBirth(y: number, m: number, d: number): number {
  const lc = SolarTerm.fromName(y, "立春").getJulianDay().getSolarDay();
  const before = m < lc.getMonth() || (m === lc.getMonth() && d < lc.getDay());
  const yy = before ? y - 1 : y;
  return (((yy - 4) % 12) + 12) % 12;
}

/** the 立春 day (February) for each year in a range — for the in-page birthday helper */
export function lichunTable(from = 1920, to = 2030): Record<number, number> {
  const out: Record<number, number> = {};
  for (let y = from; y <= to; y++) out[y] = SolarTerm.fromName(y, "立春").getJulianDay().getSolarDay().getDay();
  return out;
}

export const _test = { dayNo, branchOfDay, slot, SolarDay };
