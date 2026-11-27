import { db } from "./db";
import { toHans } from "./hant";
import { QIAN_SETS, qianResultPath } from "./qian-meta";
import { listProfiles, type StoredProfile } from "./birth-profiles";
import { myReportsT, type MyReportFilter, type MyReportName, type MyReportState } from "./dict/my-reports";
import { fmt, isForeign } from "./l10n/core";
import { ziweiUi } from "./mingli/ziwei/page-ui";
import { zwName } from "./mingli/ziwei/names";
import { BAZI_NAMES, bzName } from "./mingli/bazi/names";
import { astroUi, planetName, signName } from "./mingli/astro/page-ui";

/**
 * 10-23 进度表 114「我的報告」(会员 #838 10-23: 「合盤找不到要去信箱，深入紫微每次要再點」). Nothing on the site led back
 * to a report once it was written: 合盤、年書、八字／紫微／星盤的深度報告、正緣畫像、塔羅與解籤的個人解讀 opened only from
 * the letter, or by drawing the chart again and pressing the button again. This reads every one a customer has from each
 * product's own table (the same tables lib/deliveries.ts counts) into one list for 「我的」:
 *   what it is · for whom · when · written yet · the link.
 * 「For whom」 is the name of the customer's own birth profile (生辰檔案) when the chart is one of theirs — the reports keep
 * no birth date and no name (only the computed chart), so a profile is matched by its chart: 八字 by the four pillars and
 * gender, 紫微 by the natal palace and its stars, 星盤 by the natal planets; 合盤 by each person's year branch and day
 * pillar. Otherwise a short line of the chart itself (「庚金日主」「命宮在寅」「太陽牡羊座」).
 * Only paid (or member/pass-granted) reports; drafts never paid stay out; a 年書's three year parts are the 年書, not three
 * more rows; a member's monthly rewrites of one chart show as the newest one. Read-only.
 */

export type MySys = "bazi" | "ziwei" | "astro";
export interface MyReport {
  /** stable key for React lists */
  key: string;
  filter: MyReportFilter;
  name: string;
  /** a profile's name, two names for 合盤, or a short line of the chart; null for tarot／籤 (the question is shown instead) */
  who: string | null;
  /** tarot／籤: the reader's own question, clipped */
  question: string | null;
  at: number;
  state: MyReportState;
  href: string;
}

const many = <T,>(sql: string, ...a: unknown[]): T[] => {
  try { return db().prepare(sql).all(...(a as never[])) as T[]; } catch { return []; /* that product's table is not made yet */ }
};
const one = <T,>(sql: string, ...a: unknown[]): T | undefined => {
  try { return db().prepare(sql).get(...(a as never[])) as T | undefined; } catch { return undefined; }
};
const parse = <T,>(s: string | null | undefined): T | null => { try { return s ? (JSON.parse(s) as T) : null; } catch { return null; } };
const hans = (s: string) => toHans(s);
const clip = (s: string | null | undefined, n = 24) => { const t = (s ?? "").replace(/\s+/g, " ").trim(); return t ? (t.length > n ? `${t.slice(0, n)}…` : t) : null; };

/* ---------------- chart keys: the same chart, whatever the year it was written in ---------------- */

type BaziF = { gender?: string; pillars?: { gz: string }[]; dayMaster?: string; dmEl?: string };
type ZiweiF = { gender?: string; yearStem?: string; fiveClass?: string; soulBranch?: string; bodyBranch?: string; soulStar?: string; bodyStar?: string; natalMut?: unknown };
type AstroF = { planets?: { name: string; sign: string; deg: number }[]; asc?: { sign: string; deg: number } | null; timeKnown?: boolean };

export function baziKey(f: BaziF | null): string | null {
  if (!f?.pillars?.length || !f.gender) return null;
  return `${f.gender}|${f.pillars.map((p) => hans(p.gz)).join(",")}`;
}
export function ziweiKey(f: ZiweiF | null): string | null {
  if (!f?.soulBranch || !f.gender) return null;
  return [f.gender, f.yearStem, f.fiveClass, f.soulBranch, f.bodyBranch, f.soulStar, f.bodyStar, JSON.stringify(f.natalMut ?? null)].map((x) => hans(String(x ?? ""))).join("|");
}
export function astroKey(f: AstroF | null): string | null {
  if (!f?.planets?.length) return null;
  const pl = f.planets.map((p) => `${p.name}${p.sign}${Math.floor(p.deg)}`).join(",");
  return `${pl}|${f.asc ? `${f.asc.sign}${Math.floor(f.asc.deg)}` : "-"}`;
}

/** a birth (as the chart pages send it) → its keys; any system that cannot be drawn from it is null */
export async function keysOfBirth(input: unknown, gender: unknown, want: readonly MySys[] = ["bazi", "ziwei", "astro"], now = Date.now()): Promise<Partial<Record<MySys, string | null>>> {
  const out: Partial<Record<MySys, string | null>> = {};
  const { birthFromBody } = await import("./mingli/bazi/report");
  if (want.includes("astro")) {
    // 星盤 needs no gender (the report route reads it the same way: astroBirthFromBody)
    try {
      const { astroBirthFromBody } = await import("./mingli/astro/report");
      const { astroFacts } = await import("./mingli/astro/report-facts");
      const a = astroBirthFromBody(input, gender);
      out.astro = "error" in a ? null : astroKey(astroFacts(a.n, "deep", now, undefined, a.houses) as unknown as AstroF);
    } catch { out.astro = null; }
  }
  const b = birthFromBody(input, gender);
  if ("error" in b) return out;
  if (want.includes("bazi")) {
    try {
      const { baziOf } = await import("./mingli/bazi/chart");
      const { chartYearAt } = await import("./mingli/bazi/report-facts");
      const v = baziOf(b.n, b.gender, chartYearAt(now), true);
      out.bazi = baziKey({ gender: b.gender, pillars: v.pillars });
    } catch { out.bazi = null; }
  }
  if (want.includes("ziwei")) {
    try {
      const { ziweiFacts } = await import("./mingli/ziwei/report-facts");
      out.ziwei = ziweiKey(ziweiFacts(b.n, b.gender, "deep", now) as unknown as ZiweiF);
    } catch { out.ziwei = null; }
  }
  return out;
}

/** the customer's birth profiles with the keys of the systems asked for (computed only when a report needs them) */
async function profileKeys(customerId: number, want: readonly MySys[]): Promise<{ p: StoredProfile; keys: Partial<Record<MySys, string | null>>; yearBranch: string | null; dayPillar: string | null }[]> {
  if (!want.length) return [];
  let list: StoredProfile[] = [];
  try { list = listProfiles(customerId); } catch { return []; }
  const out = [];
  for (const p of list) {
    const gender = p.gender ?? (p.input as { gender?: string }).gender;
    // 八字／紫微／合盤 need the gender; a profile without one can still be a 星盤
    const keys = await keysOfBirth(p.input, gender === "male" || gender === "female" ? gender : undefined, want);
    const pillars = keys.bazi?.split("|")[1]?.split(",") ?? [];
    out.push({ p, keys, yearBranch: pillars[0]?.slice(1) ?? null, dayPillar: pillars[2] ?? null });
  }
  return out;
}

/* ---------------- the short line of a chart, when no profile matches ---------------- */

const baziLine = (f: BaziF | null) => (f?.dayMaster ? `${f.dayMaster}${f.dmEl ?? ""}日主` : null);
const ziweiLine = (f: ZiweiF | null) => (f?.soulBranch ? `命宮在${f.soulBranch}${f.soulStar ? `・命主${f.soulStar}` : ""}` : null);
const astroLine = (f: AstroF | null) => {
  const sun = f?.planets?.find((p) => p.name === "太陽");
  return sun ? `太陽${sun.sign}${f?.asc ? `・上升${f.asc.sign}` : ""}` : null;
};
type HepanSide = { zodiac?: string; yearBranch?: string; dayPillar?: string };
const hepanSideLine = (s: HepanSide | undefined) => (s?.dayPillar ? `${s.zodiac ? `屬${s.zodiac}・` : ""}${s.dayPillar}日` : "?");

/** 10-24 (看板「最近的解读」): a report's chart in a few words — 「庚金日主」「命宮在寅」「太陽牡羊座」, 合盤 both people */
export function chartLine(sys: "bazi" | "ziwei" | "astro" | "hepan", chartJson: string | null | undefined): string | null {
  const f = parse<unknown>(chartJson);
  if (!f) return null;
  if (sys === "bazi") return baziLine(f as BaziF);
  if (sys === "ziwei") return ziweiLine(f as ZiweiF);
  if (sys === "astro") return astroLine(f as AstroF);
  const h = f as { a?: HepanSide; b?: HepanSide };
  return `${hepanSideLine(h.a)} × ${hepanSideLine(h.b)}`;
}

/* ---------------- states ---------------- */

function reportState(sys: string, token: string, status: string): MyReportState {
  if (status === "done") {
    const mended = one<{ x: number }>("SELECT 1 AS x FROM emails WHERE session_id = ? AND kind = ? AND status = 'sent' LIMIT 1", `${sys}:${token}`, `${sys}-mended`);
    return mended ? "mended" : "done";
  }
  return status === "incomplete" ? "mending" : "writing";
}

/* ---------------- the list ---------------- */

type ReportRow = { token: string; kind: string; locale: string; chart_json: string; status: string; at: number; years: string | null };

/** Every report and personal reading of this customer, newest first. `locale` names them in that language. */
export async function myReports(customerId: number, locale: string): Promise<MyReport[]> {
  const t = myReportsT(locale);
  const zh = locale === "zh";
  const w = (s: string) => (zh ? hans(s) : s);
  const out: MyReport[] = [];

  // the 年書's own three year parts are the 年書 — not three more rows
  const nianshu = many<{ token: string; locale: string; year: number; status: string; at: number; bazi_token: string | null; ziwei_token: string | null; astro_token: string | null }>(
    "SELECT token, locale, year, status, COALESCE(paid_at, created_at) AS at, bazi_token, ziwei_token, astro_token FROM nianshu_reports WHERE customer_id = ? AND paid_at IS NOT NULL ORDER BY at DESC", customerId);
  const children = new Set(nianshu.flatMap((n) => [n.bazi_token, n.ziwei_token, n.astro_token]).filter((x): x is string => !!x));

  const rows = (table: string): ReportRow[] => many<ReportRow>(
    `SELECT token, kind, locale, chart_json, status, COALESCE(paid_at, created_at) AS at, years FROM ${table} WHERE customer_id = ? AND paid_at IS NOT NULL ORDER BY created_at DESC`, customerId,
  ).filter((r) => !children.has(r.token));
  const bazi = rows("bazi_reports"), ziwei = rows("ziwei_reports"), astro = rows("astro_reports");
  const hepan = many<{ token: string; locale: string; chart_json: string; status: string; at: number }>(
    "SELECT token, locale, chart_json, status, COALESCE(paid_at, created_at) AS at FROM hepan_reports WHERE customer_id = ? AND paid_at IS NOT NULL ORDER BY at DESC", customerId);

  const need: MySys[] = [];
  if (bazi.length || hepan.length || nianshu.length) need.push("bazi");
  if (ziwei.length) need.push("ziwei");
  if (astro.length) need.push("astro");
  const profiles = await profileKeys(customerId, need);
  const byKey = (sys: MySys, key: string | null) => (key ? profiles.find((x) => x.keys[sys] === key)?.p.name ?? null : null);
  const bySide = (s: HepanSide | undefined) => (s?.dayPillar ? profiles.find((x) => x.dayPillar === hans(s.dayPillar!) && (!s.yearBranch || x.yearBranch === hans(s.yearBranch)))?.p.name ?? null : null);

  // 八字／紫微／星盤: newest version of each chart and kind (a member's monthly rewrites are one chart)
  type Read = (f: unknown) => string | null;
  const sysRows = (sys: MySys, list: ReportRow[], path: string, key: Read, line: Read) => {
    const seen = new Set<string>();
    for (const r of list) {
      const f = parse<unknown>(r.chart_json);
      const k = key(f);
      const dedupe = `${r.kind}|${k ?? r.token}`;
      if (seen.has(dedupe)) continue;
      seen.add(dedupe);
      const nameKey = `${sys}_${r.kind}` as MyReportName;
      const name = t.names[nameKey] ?? t.names[`${sys}_deep` as MyReportName];
      const yearTag = r.kind === "year" && r.years ? ` ${r.years.split(",")[0]}` : "";
      const l = line(f);
      out.push({
        key: `${sys}:${r.token}`, filter: sys === "bazi" && r.kind === "love" ? "zhengyuan" : sys, name: `${name}${yearTag}`,
        who: byKey(sys, k) ?? (l ? w(l) : null), question: null, at: r.at, state: reportState(sys, r.token, r.status),
        href: `/${r.locale || "zh-hant"}/${path}/r/${r.token}`,
      });
    }
  };
  // 10-30 进度表 128 ④: outside Chinese the 八字 line is written with the page's names (Day Master Jia (Yang Wood))
  const baziLineIn = (f: BaziF | null) => {
    if (!isForeign(locale)) return baziLine(f);
    if (!f?.dayMaster) return null;
    return `${BAZI_NAMES[locale].dayMaster} ${bzName(locale).dm(f.dayMaster)}`;
  };
  sysRows("bazi", bazi, "bazi", baziKey as Read, baziLineIn as Read);
  // 10-30 进度表 128 ④: outside Chinese the 紫微 line is written with the page's names (Life Palace in Si · Life Lord star Wu Qu)
  const ziweiLineIn = (f: ZiweiF | null) => {
    if (!isForeign(locale)) return ziweiLine(f);
    if (!f?.soulBranch) return null;
    const ui = ziweiUi(locale), Z = zwName(locale);
    return `${Z.josa(ui.soulAt!.replace("{b}", Z.branch(f.soulBranch)))}${f.soulStar ? ` · ${ui.soulStar} ${Z.star(f.soulStar)}` : ""}`;
  };
  sysRows("ziwei", ziwei, "ziwei", ziweiKey as Read, ziweiLineIn as Read);
  // 10-30 进度表 128 ④: outside Chinese the 星盤 line is written with the page's names (the others open with their batch)
  const astroLineIn = (f: AstroF | null) => {
    if (!isForeign(locale)) return astroLine(f);
    const sun = f?.planets?.find((p) => p.name === "太陽");
    if (!sun) return null;
    const ui = astroUi(locale);
    return `${fmt(ui.fPS ?? "{p} {s}", { p: planetName("太陽", locale), s: signName(sun.sign, locale) })}${f?.asc ? `${ui.gap ?? " · "}${fmt(ui.fRising ?? "{r} {s}", { r: ui.rising ?? "", s: signName(f.asc.sign, locale) })}` : ""}`;
  };
  sysRows("astro", astro, "xingpan", astroKey as Read, astroLineIn as Read);

  // 10-30 进度表 128 ④: outside Chinese each side is written with the page's names (Horse · Jia Zi)
  const hepanSideIn = (s: HepanSide | undefined): string => {
    if (!isForeign(locale)) return w(hepanSideLine(s));
    if (!s?.dayPillar) return "?";
    const i = "子丑寅卯辰巳午未申酉戌亥".indexOf(s.yearBranch ?? "");
    return `${i >= 0 ? `${BAZI_NAMES[locale].animals[i]} · ` : ""}${bzName(locale).gz(s.dayPillar)}`;
  };
  for (const r of hepan) {
    const f = parse<{ a?: HepanSide; b?: HepanSide }>(r.chart_json);
    const a = bySide(f?.a) ?? hepanSideIn(f?.a), b = bySide(f?.b) ?? hepanSideIn(f?.b);
    out.push({ key: `hepan:${r.token}`, filter: "hepan", name: t.names.hepan, who: `${a} × ${b}`, question: null, at: r.at, state: reportState("hepan", r.token, r.status), href: `/${r.locale || "zh-hant"}/hepan/r/${r.token}` });
  }

  for (const r of nianshu) {
    const child = r.bazi_token ? parse<BaziF>(one<{ c: string }>("SELECT chart_json AS c FROM bazi_reports WHERE token = ?", r.bazi_token)?.c) : null;
    out.push({
      key: `nianshu:${r.token}`, filter: "nianshu", name: t.names.nianshu.replace("{y}", String(r.year)),
      who: byKey("bazi", baziKey(child)) ?? (baziLine(child) ? w(baziLine(child)!) : null), question: null, at: r.at,
      state: reportState("nianshu", r.token, r.status), href: `/${r.locale || "zh-hant"}/nianshu/r/${r.token}`,
    });
  }

  // 10-29 进度表 122: 寶寶取名參考／改名參考 — the surname (and the current name for a rename) is all a row keeps
  for (const r of many<{ token: string; locale: string; kind: string; facts_json: string; status: string; at: number }>(
    "SELECT token, locale, kind, facts_json, status, COALESCE(paid_at, created_at) AS at FROM name_reports WHERE customer_id = ? AND paid_at IS NOT NULL ORDER BY at DESC", customerId)) {
    const f = parse<{ surname?: string; current?: string; style?: string }>(r.facts_json);
    const style = f?.style === "f" ? "女孩" : f?.style === "n" ? "中性" : f?.style === "m" ? "男孩" : "";
    const who = r.kind === "rename" ? `${f?.surname ?? ""}${f?.current ?? ""}` : [f?.surname, style].filter(Boolean).join("・");
    out.push({
      key: `name:${r.token}`, filter: "name", name: r.kind === "rename" ? t.names.name_rename : t.names.name_baby, who: who ? w(who) : null, question: null, at: r.at,
      state: r.status === "done" ? "done" : r.status === "incomplete" ? "mending" : "writing", href: `/${r.locale || "zh-hant"}/name/r/${r.token}`,
    });
  }

  for (const r of many<{ token: string; locale: string; question: string; spread: number; personal: number; at: number }>(
    "SELECT token, locale, question, spread, personal_json IS NOT NULL AS personal, COALESCE(paid_at, created_at) AS at FROM tarot_draws WHERE customer_id = ? AND (paid_at IS NOT NULL OR personal_json IS NOT NULL) ORDER BY at DESC", customerId)) {
    out.push({ key: `tarot:${r.token}`, filter: "tarot", name: t.names.tarot, who: null, question: clip(r.question), at: r.at, state: r.personal ? "done" : "writing", href: `/${r.locale || "zh-hant"}/tarot/r/${r.token}` });
  }

  for (const r of many<{ token: string; set_name: string; num: number; question: string; personal: number; at: number }>(
    "SELECT token, set_name, num, question, personal_json IS NOT NULL AS personal, COALESCE(personal_at, paid_at, created_at) AS at FROM qian_draws WHERE customer_id = ? AND (paid_at IS NOT NULL OR personal_json IS NOT NULL) ORDER BY at DESC", customerId)) {
    const set = QIAN_SETS.find((s) => s.id === r.set_name || s.name === r.set_name);
    const lot = set ? `${zh ? set.nameHans : set.name} 第 ${r.num} ${zh ? "签" : "籤"}` : null;
    out.push({ key: `qian:${r.token}`, filter: "jieqian", name: lot ? `${t.names.jieqian}・${lot}` : t.names.jieqian, who: null, question: clip(r.question), at: r.at, state: r.personal ? "done" : "writing", href: qianResultPath(r.token) });
  }

  return out.sort((x, y) => y.at - x.at);
}

/* ---------------- the chart page: this chart's reports, without pressing the button again ---------------- */

export interface ChartReportLink { kind: "deep" | "love"; href: string; state: MyReportState }

/**
 * The deep report (and, for 八字, the 正緣畫像) this customer already has for the chart drawn from `input` — newest
 * version — so the chart page can put 「你這張盤的深度報告 → 打開」 at the top. Read-only: nothing is created and no
 * allowance is used; a chart without a report gives [].
 */
export async function reportsForChart(customerId: number, sys: MySys, input: unknown, gender: unknown): Promise<ChartReportLink[]> {
  const keys = await keysOfBirth(input, gender, [sys]);
  const k = keys[sys];
  if (!k) return [];
  const table = sys === "bazi" ? "bazi_reports" : sys === "ziwei" ? "ziwei_reports" : "astro_reports";
  const path = sys === "astro" ? "xingpan" : sys;
  const keyOf = (sys === "bazi" ? baziKey : sys === "ziwei" ? ziweiKey : astroKey) as (f: unknown) => string | null;
  const out: ChartReportLink[] = [];
  for (const kind of sys === "bazi" ? (["deep", "love"] as const) : (["deep"] as const)) {
    const rows = many<{ token: string; locale: string; chart_json: string; status: string }>(
      `SELECT token, locale, chart_json, status FROM ${table} WHERE customer_id = ? AND kind = ? AND paid_at IS NOT NULL ORDER BY created_at DESC LIMIT 60`, customerId, kind);
    const hit = rows.find((r) => keyOf(parse(r.chart_json)) === k);
    if (hit) out.push({ kind, href: `/${hit.locale || "zh-hant"}/${path}/r/${hit.token}`, state: reportState(sys, hit.token, hit.status) });
  }
  return out;
}

/* ---------------- 客服摘要: an order of a report product is not 「无解读」 ---------------- */

const REPORT_TIERS: { test: (tier: string) => boolean; table: string; sys: string; mail: string; path: (token: string, locale: string) => string; done: string }[] = [
  { test: (x) => x.startsWith("bazi_"), table: "bazi_reports", sys: "bazi", mail: "bazi", path: (k, l) => `/${l}/bazi/r/${k}`, done: "status = 'done'" },
  { test: (x) => x.startsWith("ziwei_"), table: "ziwei_reports", sys: "ziwei", mail: "ziwei", path: (k, l) => `/${l}/ziwei/r/${k}`, done: "status = 'done'" },
  { test: (x) => x.startsWith("astro_"), table: "astro_reports", sys: "astro", mail: "astro", path: (k, l) => `/${l}/xingpan/r/${k}`, done: "status = 'done'" },
  { test: (x) => x === "hepan_pair" || x.startsWith("hepan"), table: "hepan_reports", sys: "hepan", mail: "hepan", path: (k, l) => `/${l}/hepan/r/${k}`, done: "status = 'done'" },
  { test: (x) => x === "nianshu", table: "nianshu_reports", sys: "nianshu", mail: "nianshu", path: (k, l) => `/${l}/nianshu/r/${k}`, done: "status = 'done'" },
  { test: (x) => x === "tarot", table: "tarot_draws", sys: "tarot", mail: "tarot", path: (k, l) => `/${l}/tarot/r/${k}`, done: "personal_json IS NOT NULL" },
  { test: (x) => x === "qian", table: "qian_draws", sys: "qian", mail: "qian", path: (k) => qianResultPath(k), done: "personal_json IS NOT NULL" },
  // 10-29 进度表 122: 寶寶取名參考／改名參考 (its letter is name-mail)
  { test: (x) => x === "name_baby" || x === "name_rename", table: "name_reports", sys: "name", mail: "name", path: (k, l) => `/${l}/name/r/${k}`, done: "status = 'done'" },
];

/** A paid order of a report product → its report: written yet, where it opens, which letter delivered it. null for 六爻. */
export function reportForOrder(tier: string, sessionId: string): { locale: string; done: boolean; href: string; mailKind: string } | null {
  const m = REPORT_TIERS.find((x) => x.test(tier));
  if (!m) return null;
  const r = one<{ token: string; locale: string | null; done: number }>(`SELECT token, locale, (${m.done}) AS done FROM ${m.table} WHERE paid_session = ? ORDER BY COALESCE(paid_at, created_at) DESC LIMIT 1`, sessionId);
  if (!r) return null;
  const locale = r.locale || "zh-hant";
  return { locale, done: !!r.done, href: m.path(r.token, locale), mailKind: m.mail };
}
