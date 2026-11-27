import {
  BRANCHES, STEMS, PHASE_ZH, dayIndexAt, generates, monthBranchFromLongitude, overcomes,
  seasonPhase, solarLongitude, lunarDateOf, lunarLabelZh, lunarMonthsBetween,
  type Branch, type ChartLine, type FullChart, type Phase, type Relation, type Strength,
} from "@yaoflow/engine";
import { askWindow, overlapsAsk, type AskWindow } from "./ask-window";
import { questionScale } from "./scale-words";
import type { Topic } from "./topic";
import { MONEY_KW } from "./keywords";
import { lostItemOf } from "./lost-item";

/**
 * 应期 v2 — the timing window is DERIVED before the model speaks.
 *
 * Left to itself the model produced the same "农历九、十月前后" for eight casts
 * in ten: the prompt's own example anchored it, and the payload never told it
 * today's date or which classical rule applied. Here the rules run in code
 * (用神 → 旬空/月破/动静/日冲 → 旺衰 sets the horizon) and every candidate is
 * turned into concrete Gregorian dates in the caster's own timezone. The
 * model chooses among these and explains; it no longer invents.
 *
 * Rules (增删卜易 / 卜筮正宗, simplified to the load-bearing ones):
 *   旬空 → 出空：值日填实、冲空之日；事大者值月
 *   月破 → 出月后填实之月、逢合之日
 *   动爻 → 逢合之日（动而待合）、值日；缓者值月
 *   静爻 → 冲动之日、值日；日冲暗动者逢合之日
 *   旺相应近（日）、休应中（周）、囚死应远（月）
 */

const DAY_MS = 86_400_000;

export interface TimingWindow {
  /** ISO local dates, inclusive. */
  start: string;
  end: string;
  /** Human label in zh, e.g. 9月12日（乙未日）/ 10月8日–11月7日（戌月）. */
  label_zh: string;
  label_en: string;
  /** 09-24: falls (at least partly) inside the window the question named */
  in_ask?: boolean;
  /** 09-26: a day-level span's core day (ISO) — the one that must fall inside what they asked */
  core?: string;
}

export interface TimingCandidate {
  kind: "hour" | "day" | "month";
  branch: Branch;
  rule_zh: string;
  rule_en: string;
  windows: TimingWindow[];
}

/**
 * What time scale the question itself lives on. "now" = this moment / today
 * (午觉、今晚的饭局、下午的会), "day" = a named near day (明天、本周、周末,
 * an explicit date), "open" = the chart decides. A soft hint: the model still
 * reads the question, but a "now" question must never get a date days away.
 */
export type QuestionScale = "now" | "day" | "weeks" | "long" | "choose" | "open";

export { questionScale } from "./scale-words";

export interface TimingPlan {
  /** Caster's local date of the cast, ISO. */
  today: string;
  today_label_zh: string;
  /** Caster's local clock at the cast, HH:MM, and the 时辰 it falls in. */
  now_local: string;
  now_hour_branch: Branch;
  question_scale: QuestionScale;
  /** true when the person picked the scale on the form — then it is binding, not a guess */
  scale_declared: boolean;
  /** Today's 时辰-level windows for the focal line (值时/冲时/合时), upcoming only. */
  today_hours: TimingCandidate[];
  /** Which line the rules were run on and why. */
  focal: {
    pos: number;
    relation: Relation;
    branch: Branch;
    strength: Strength;
    changing: boolean;
    void: boolean;
    month_clash: boolean;
    day_clash: boolean;
    how_zh: string;
  };
  /** Natural time scale of the answer, from the focal line's strength. */
  horizon: "days" | "weeks" | "months";
  candidates: TimingCandidate[];
  /** 09-24: the window the question itself named (明天 / 这周 / 这个月 / 年底前…), in the caster's dates */
  ask_window: AskWindow | null;
  /** whether any candidate falls inside ask_window */
  ask_hit: boolean;
  /**
   * 10-05: the lunar calendar for the model — today's lunar date and the
   * Gregorian span of the coming lunar months (繁體 / 简体 / en), so a reader's
   * 農曆十月 (or a follow-up "我是問農曆") can be placed without guessing.
   */
  lunar: { today_hant: string; today_hans: string; months_hant: string; months_hans: string; months_en: string };
}

/** The coming lunar months as one line, e.g. 九月＝10月10日–11月8日；十月＝11月9日–12月8日 … */
function lunarMonthsNote(todayIso: string): TimingPlan["lunar"] {
  const d = lunarDateOf(todayIso);
  const endIso = new Date(Date.parse(`${todayIso}T00:00:00Z`) + 200 * DAY_MS).toISOString().slice(0, 10);
  const months = lunarMonthsBetween(todayIso, endIso).slice(0, 7);
  const md = (iso: string) => `${Number(iso.slice(5, 7))}月${Number(iso.slice(8, 10))}日`;
  const mdEn = (iso: string) => `${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][Number(iso.slice(5, 7)) - 1]} ${Number(iso.slice(8, 10))}`;
  const line = (script: "hant" | "hans") => months.map((m) => {
    const name = lunarLabelZh({ month: m.month, leap: m.leap }, script).replace(/^(農曆|农历)/, "");
    const yr = m.month === 1 || m === months[0] ? `${m.year}年` : "";
    return `${yr}${name}＝${md(m.start)}–${md(m.end)}`;
  }).join("；");
  return {
    today_hant: lunarLabelZh(d, "hant"),
    today_hans: lunarLabelZh(d, "hans"),
    months_hant: line("hant"),
    months_hans: line("hans"),
    months_en: months.map((m) => `${m.leap ? "leap " : ""}lunar month ${m.month} (${m.year}) = ${mdEn(m.start)} – ${mdEn(m.end)}`).join("; "),
  };
}

const REL_ZH: Record<Relation, string> = {
  parent: "父母爻", sibling: "兄弟爻", child: "子孙爻", wealth: "妻财爻", officer: "官鬼爻",
};

/**
 * Money words win the focal line even when the topic classifier said "career":
 * "客户欠的那笔款" is a 妻财 question, not an 官鬼 one — the classifier's order
 * serves merchandising stats, not 取用神.
 */
const MONEY_RE = /欠|款|钱|债|回款|收入|工资|薪|投资|股|基金|理财|赚|亏|租金|房价|报价|预算|推广|营销|生意|销售|业绩|订单|获客|变现|money|pay|debt|owe|salary|invest|price|loan|refund|sales|revenue|marketing|launch|customers/i;

/** 取用神 by topic; relationship/decision/health fall back to the 世/应 lines. */
function focalRelation(topic: Topic, question: string): Relation | "world" | "response" {
  // 10-29 进度表 127 尋物: a lost thing is its own 用神 — 父母 for papers, clothes and bags, 妻财 for the rest (lib/lost-item.ts)
  const lost = lostItemOf(question);
  if (lost) return lost.focal;
  if (MONEY_RE.test(question) || MONEY_KW.test(question)) return "wealth";
  switch (topic) {
    case "money": return "wealth";
    case "career": return "officer";
    case "study": return "parent";
    case "relationship": return "response";
    case "health": return "world";
    default: return "world";
  }
}

const STRENGTH_RANK: Record<Strength, number> = { wang: 4, xiang: 3, xiu: 2, qiu: 1, si: 0 };

function pickFocal(chart: FullChart, topic: Topic, question: string): { line: ChartLine; how_zh: string } {
  const want = focalRelation(topic, question);
  if (want === "world" || want === "response") {
    const line = chart.lines.find((l) => (want === "world" ? l.isWorld : l.isResponse))!;
    return { line, how_zh: want === "world" ? "以世爻为用" : "以应爻为用（问对方/关系）" };
  }
  const pool = chart.lines.filter((l) => l.relation === want);
  if (pool.length === 0) {
    const line = chart.lines.find((l) => l.isWorld)!;
    return { line, how_zh: `${REL_ZH[want]}不上卦（伏藏），暂以世爻为用；应期兼看出伏之日` };
  }
  // 动者 > 临世应者 > 旺者 > 位低者
  const sorted = [...pool].sort((a, b) =>
    Number(b.changing) - Number(a.changing) ||
    Number(b.isWorld || b.isResponse) - Number(a.isWorld || a.isResponse) ||
    STRENGTH_RANK[b.strength] - STRENGTH_RANK[a.strength] ||
    a.position - b.position);
  const line = sorted[0]!;
  const why = pool.length > 1
    ? (line.changing ? "两现取动者" : line.isWorld || line.isResponse ? "两现取临世应者" : "两现取旺者")
    : "";
  return { line, how_zh: `用神取${REL_ZH[want]}${why ? `（${why}）` : ""}` };
}

const bi = (b: Branch) => BRANCHES.indexOf(b);
const clashOf = (b: Branch): Branch => BRANCHES[(bi(b) + 6) % 12]!;
/** 六合 partner: 子丑 寅亥 卯戌 辰酉 巳申 午未. */
const combineOf = (b: Branch): Branch => BRANCHES[((13 - bi(b)) % 12 + 12) % 12]!;

/** Local calendar date of an instant, as ISO + parts. */
function localDate(utcMs: number, tz: number): { iso: string; m: number; d: number } {
  const t = new Date(utcMs + tz * 60_000);
  const y = t.getUTCFullYear(), m = t.getUTCMonth() + 1, d = t.getUTCDate();
  return { iso: `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`, m, d };
}

/** 10-04: the caster's local calendar date of any instant, ISO — "which day is it for them now?" */
export const localIsoDate = (utcMs: number, tz: number): string => localDate(utcMs, tz).iso;

/** Whole calendar days from one ISO date to a later one (0 when the same day). */
export const isoDaysBetween = (from: string, to: string): number =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

function ganzhiOfDayIndex(i: number): string {
  return STEMS[i % 10]! + BRANCHES[i % 12]!;
}

const HOUR_MS = 3_600_000;

/** 时辰 of a local hour: 子 23–01, 丑 01–03, … 亥 21–23. */
export function hourBranch(localHour: number): Branch {
  return BRANCHES[Math.floor(((localHour + 1) % 24) / 2)]!;
}

/**
 * Today's 时辰 window for `branch`, if it has not fully passed. The 子 slot
 * straddles midnight: before 01:00 it is the one already under way.
 */
function hourWindow(branch: Branch, castMs: number, tz: number): TimingWindow | null {
  const L = castMs + tz * 60_000;
  const midnight = L - (L % DAY_MS);
  const i = bi(branch);
  let start = midnight + (((i * 2 + 23) % 24) * HOUR_MS);
  if (branch === "子" && L - midnight < HOUR_MS) start = midnight - HOUR_MS;
  const end = start + 2 * HOUR_MS;
  if (end <= L) return null; // already over today
  const hh = (ms: number) => String(new Date(ms).getUTCHours()).padStart(2, "0") + ":00";
  const ongoing = start <= L;
  const label = `${hh(start)}–${hh(end)}`;
  const iso = (ms: number) => new Date(ms - tz * 60_000).toISOString();
  const minsAway = Math.round((start - L) / 60_000);
  const soonZh = ongoing ? "，正在进行" : minsAway < 60 ? `，${minsAway}分钟后开始` : `，${Math.round(minsAway / 60)}小时后`;
  const soonEn = ongoing ? ", under way" : minsAway < 60 ? `, starts in ${minsAway} min` : `, in ${Math.round(minsAway / 60)}h`;
  return {
    start: iso(start), end: iso(end),
    label_zh: `今天 ${label}（${branch}时${soonZh}）`,
    label_en: `today ${label} (${branch} hour${soonEn})`,
  };
}

/**
 * Next days (within `limit` days) whose day branch is `branch` — each as a
 * five-day SPAN centred on that day (09-26, Neil: 「日期改成时间段」). The
 * classical 应期 is a node, not a deadline; nine real answers showed readers
 * checking a single printed day and calling anything a few days off a miss.
 * The window now runs two days either side (never starting before tomorrow),
 * and the label keeps the core day so the reading can say which is likeliest.
 */
const SPAN = 2;
/**
 * 10-31 进度表 129 ②（回访 309 条：几天一段的应期 63% 没发生）: outside a question about today or a named day, the
 * window is an OBSERVATION PERIOD — three days before the node to four after (8 days), not a 5-day span with a
 * "most likely" day. The reading names its end as the check-back date.
 */
export const WIDE = { before: 3, after: 4 } as const;
/** 10-05: with `inside`, only days whose core falls in that ISO range count (the window the question named) */
function dayWindows(branch: Branch, castMs: number, tz: number, count: number, limit = 60, inside?: { start: string; end: string }, span: { before: number; after: number } = { before: SPAN, after: SPAN }): TimingWindow[] {
  const out: TimingWindow[] = [];
  for (let d = 1; d <= limit && out.length < count; d++) {
    const t = castMs + d * DAY_MS;
    const idx = dayIndexAt(t, tz);
    if (BRANCHES[idx % 12] === branch) {
      const core = localDate(t, tz);
      if (inside && (core.iso < inside.start || core.iso > inside.end)) continue;
      const s = localDate(castMs + Math.max(1, d - span.before) * DAY_MS, tz);
      const e = localDate(castMs + (d + span.after) * DAY_MS, tz);
      const zhSpan = s.m === e.m ? `${s.m}月${s.d}日–${e.d}日` : `${s.m}月${s.d}日–${e.m}月${e.d}日`;
      out.push({
        start: s.iso, end: e.iso, core: core.iso,
        label_zh: `${zhSpan}（核心${core.m}月${core.d}日，${ganzhiOfDayIndex(idx)}日，${d}天后）`,
        label_en: `${s.iso} to ${e.iso} (core ${core.iso}, ${ganzhiOfDayIndex(idx)} day, in ${d} days)`,
      });
    }
  }
  return out;
}

/** The next 节气 month whose branch is `branch` (may be the current one). */
function monthWindow(branch: Branch, castMs: number, tz: number): TimingWindow | null {
  let start: number | null = null;
  for (let d = 0; d <= 430; d++) {
    const t = castMs + d * DAY_MS;
    // local midnight in UTC is t − (local ms since midnight); noon is +12h
    const noon = t - ((t + tz * 60_000) % DAY_MS) + 12 * 3_600_000;
    const b = monthBranchFromLongitude(solarLongitude(noon));
    if (b === branch && start === null) start = t;
    if (b !== branch && start !== null) {
      const s = localDate(start, tz), e = localDate(t - DAY_MS, tz);
      const daysAway = Math.round((start - castMs) / DAY_MS);
      return {
        start: s.iso, end: e.iso,
        label_zh: `${s.m}月${s.d}日–${e.m}月${e.d}日（${branch}月${daysAway <= 0 ? "，即本月" : `，${daysAway}天后开始`}）`,
        label_en: `${s.iso} to ${e.iso} (${branch} month${daysAway <= 0 ? ", the current one" : `, starts in ${daysAway} days`})`,
      };
    }
  }
  return null;
}

/** Contiguous 节气-month runs from today, as ISO windows with their branch. */
function monthRuns(castMs: number, tz: number, days = 400): { branch: Branch; window: TimingWindow }[] {
  const runs: { branch: Branch; window: TimingWindow }[] = [];
  let cur: { branch: Branch; start: number } | null = null;
  const flush = (endT: number) => {
    if (!cur) return;
    const s = localDate(cur.start, tz), e = localDate(endT, tz);
    const daysAway = Math.round((cur.start - castMs) / DAY_MS);
    runs.push({
      branch: cur.branch,
      window: {
        start: s.iso, end: e.iso,
        label_zh: `${s.m}月${s.d}日–${e.m}月${e.d}日（${cur.branch}月${daysAway <= 0 ? "，即本月" : `，${daysAway}天后开始`}）`,
        label_en: `${s.iso} to ${e.iso} (${cur.branch} month${daysAway <= 0 ? ", the current one" : `, starts in ${daysAway} days`})`,
      },
    });
  };
  for (let d = 0; d <= days; d++) {
    const t = castMs + d * DAY_MS;
    const noon = t - ((t + tz * 60_000) % DAY_MS) + 12 * 3_600_000;
    const b = monthBranchFromLongitude(solarLongitude(noon));
    if (!cur) cur = { branch: b, start: t };
    else if (b !== cur.branch) { flush(t - DAY_MS); cur = { branch: b, start: t }; }
  }
  return runs;
}

const clashesBranch = (a: Branch, b: Branch) => (bi(a) - bi(b) + 12) % 12 === 6;

/**
 * 择时: the months ahead in which the focal line is 当令 (same phase) or 得生
 * (the month's phase feeds it), skipping months that clash its branch (月破)
 * and months that drain or overcome it. Soonest first, at most three.
 */
function favorableMonths(line: ChartLine, castMs: number, tz: number): TimingCandidate[] {
  const phase = line.phase as Phase;
  const out: TimingCandidate[] = [];
  for (const run of monthRuns(castMs, tz)) {
    if (out.length >= 3) break;
    // the current month only counts if a real stretch of it is left
    const daysLeft = Math.round((new Date(run.window.end).getTime() - castMs) / DAY_MS);
    if (daysLeft < 10) continue;
    if (clashesBranch(run.branch, line.branch)) continue;
    const mp = seasonPhase(run.branch);
    let rule_zh: string | null = null, rule_en: string | null = null;
    if (mp === phase) {
      rule_zh = `择时：${run.branch}月${PHASE_ZH[mp]}当令，用神${line.branch}${PHASE_ZH[phase]}值旺`;
      rule_en = `Timing choice: the ${run.branch} month is ${mp} season — the focal line ${line.branch} (${phase}) is in power`;
    } else if (generates(mp, phase)) {
      rule_zh = `择时：${run.branch}月${PHASE_ZH[mp]}生${PHASE_ZH[phase]}，用神${line.branch}得月建生扶`;
      rule_en = `Timing choice: the ${run.branch} month (${mp}) feeds the focal line ${line.branch} (${phase})`;
    } else if (overcomes(mp, phase)) {
      continue; // month overcomes the focal line — not a time to act
    } else {
      continue; // drained or draining — neutral at best
    }
    if (line.isVoid && daysLeft > 0 && out.length === 0) rule_zh += "（用神现旬空，宜待出空之后）";
    out.push({ kind: "month", branch: run.branch, rule_zh, rule_en: rule_en!, windows: [run.window] });
  }
  return out;
}

/** Build the plan. `topic` chooses the focal line; cast instant/tz give real dates. */
export function timingPlan(
  chart: FullChart,
  castMs: number,
  tzOffsetMinutes: number,
  topic: Topic,
  question = "",
  /** a scale the person declared on the form — beats keyword detection */
  scaleOverride?: QuestionScale,
): TimingPlan {
  const tz = Number.isFinite(tzOffsetMinutes) ? tzOffsetMinutes : 0;
  const { line, how_zh } = pickFocal(chart, topic, question);
  const b = line.branch;
  const scale = scaleOverride ?? questionScale(question, castMs, tz);
  const ask = askWindow(question, castMs, tz);
  // strength sets the horizon — unless the matter's own scale is declared or evident
  const horizon: TimingPlan["horizon"] =
    scale === "long" || scale === "choose" ? "months"
    : scale === "weeks" ? "weeks"
    : scale === "now" || scale === "day" ? "days"
    : line.strength === "wang" || line.strength === "xiang" ? "days"
    : line.strength === "xiu" ? "weeks" : "months";

  const cands: TimingCandidate[] = [];
  const hours: TimingCandidate[] = [];
  // 10-31 进度表 129 ②: a question about today / a named day keeps the 5-day span; everything else gets the 8-day period
  const span = scale === "now" || scale === "day" ? { before: SPAN, after: SPAN } : WIDE;
  const day = (branch: Branch, rule_zh: string, rule_en: string, n = 2) =>
    cands.push({ kind: "day", branch, rule_zh, rule_en, windows: dayWindows(branch, castMs, tz, n, 60, undefined, span) });
  const month = (branch: Branch, rule_zh: string, rule_en: string) => {
    const w = monthWindow(branch, castMs, tz);
    if (w) cands.push({ kind: "month", branch, rule_zh, rule_en, windows: [w] });
  };
  /** Same rule, one notch finer: 时辰 windows for same-day questions. */
  const hour = (branch: Branch, rule_zh: string, rule_en: string) => {
    const w = hourWindow(branch, castMs, tz);
    if (w) hours.push({ kind: "hour", branch, rule_zh, rule_en, windows: [w] });
  };

  // 时辰-level: 空→值时/冲时；动/暗动/月破→合时/值时；静→冲时/值时
  if (line.isVoid) {
    hour(b, `当日之事：用神${b}旬空，${b}时填实`, `Same-day: void ${b} fills in the ${b} hour`);
    hour(clashOf(b), `或${clashOf(b)}时冲空`, `Or the ${clashOf(b)} hour clashes the void`);
  } else if (line.changing || line.dayClash || line.monthClash) {
    hour(combineOf(b), `当日之事：${combineOf(b)}时合住用神${b}`, `Same-day: the ${combineOf(b)} hour combines ${b}`);
    hour(b, `或${b}时值时`, `Or its own ${b} hour`);
  } else {
    hour(clashOf(b), `当日之事：用神${b}安静，${clashOf(b)}时冲动`, `Same-day: still ${b} is set in motion in the ${clashOf(b)} hour`);
    hour(b, `或${b}时值时`, `Or its own ${b} hour`);
  }

  if (line.isVoid) {
    day(b, `用神${b}旬空，出空之日填实而应（值${b}日）`, `Focal line ${b} is void; it fills on a ${b} day`);
    day(clashOf(b), `冲空之日亦应（${clashOf(b)}日冲${b}）`, `A ${clashOf(b)} day clashing the void also triggers`);
    month(b, `事大缓者，出空于值月（${b}月）`, `Slow matters resolve when the ${b} month fills the void`);
  } else if (line.monthClash) {
    month(b, `用神${b}月破，出月后填实之月应（${b}月）`, `Focal line ${b} is month-broken; resolves once its own month arrives`);
    day(combineOf(b), `出月后逢合之日应（${combineOf(b)}合${b}）`, `After the current month, a ${combineOf(b)} day (combining ${b}) triggers`);
  } else if (line.changing) {
    day(combineOf(b), `动爻${b}逢合而应（${combineOf(b)}日合住动爻）`, `Moving line ${b} settles on a ${combineOf(b)} day (its combination)`);
    day(b, `动爻值日应（${b}日）`, `Or on its own ${b} day`);
    month(b, `缓者应于值月（${b}月）`, `Slow matters: its own ${b} month`);
  } else if (line.dayClash) {
    day(combineOf(b), `用神${b}被日辰冲动（暗动），逢合之日应（${combineOf(b)}日）`, `Line ${b} is clashed by the day (hidden motion); resolves on a ${combineOf(b)} day`);
    day(b, `或值日应（${b}日）`, `Or on its own ${b} day`);
  } else {
    day(clashOf(b), `用神${b}安静，待冲动之日应（${clashOf(b)}日冲${b}）`, `Focal line ${b} is still; a ${clashOf(b)} day (clashing it) sets it in motion`);
    day(b, `或值日应（${b}日）`, `Or on its own ${b} day`);
    month(b, `缓者应于值月（${b}月）`, `Slow matters: its own ${b} month`);
  }

  // 择时 replaces the "when will it happen" candidates with favorable months
  if (scale === "choose") {
    const fav = favorableMonths(line, castMs, tz);
    if (fav.length > 0) cands.splice(0, cands.length, ...fav);
  }

  // 10-05: a window named further out than the first two 值日/冲日 (農曆十月 two months away, 明年3月…):
  // find the rule's days INSIDE that window too, so the model has real candidates there instead of inventing
  if (ask && ask.kind !== "today") {
    const limit = Math.min(430, isoDaysBetween(localDate(castMs, tz).iso, ask.end) + SPAN);
    for (const c of cands) {
      if (c.kind !== "day" || c.windows.some((w) => w.core && w.core >= ask.start && w.core <= ask.end)) continue;
      for (const w of dayWindows(c.branch, castMs, tz, 2, limit, ask, span)) if (!c.windows.some((x) => x.core === w.core)) c.windows.push(w);
    }
  }
  // 09-24: mark what falls inside the window the question named
  if (ask) for (const c of [...cands, ...hours]) for (const w of c.windows) w.in_ask = overlapsAsk(ask, w.core ?? w.start, w.core ?? w.end); // 09-26: a span counts by its core day
  const inAsk = (c: TimingCandidate) => (c.windows.some((w) => w.in_ask) ? 0 : 1);
  // candidates inside the asked window first; then horizon-aware: near matters put day windows first, far ones month first
  cands.sort((x, y) => {
    if (ask) { const d = inAsk(x) - inAsk(y); if (d !== 0) return d; }
    const near = horizon !== "months";
    const kx = x.kind === "day" ? 0 : 1, ky = y.kind === "day" ? 0 : 1;
    return near ? kx - ky : ky - kx;
  });

  const today = localDate(castMs, tz);
  const L = castMs + tz * 60_000;
  const localHour = (L % DAY_MS) / HOUR_MS;
  const now_local = `${String(Math.floor(localHour)).padStart(2, "0")}:${String(Math.floor((L % HOUR_MS) / 60_000)).padStart(2, "0")}`;
  const now_hour_branch = hourBranch(Math.floor(localHour));
  const lunar = lunarMonthsNote(today.iso);
  return {
    today: today.iso,
    today_label_zh: `${today.m}月${today.d}日 ${now_local}（${chart.calendar.day.stem}${chart.calendar.day.branch}日 ${now_hour_branch}时，${chart.calendar.month.branch}月；${lunar.today_hans}）`,
    now_local,
    now_hour_branch,
    question_scale: scale,
    scale_declared: scaleOverride !== undefined,
    today_hours: hours,
    focal: {
      pos: line.position, relation: line.relation, branch: b, strength: line.strength,
      changing: line.changing, void: line.isVoid, month_clash: line.monthClash, day_clash: line.dayClash,
      how_zh,
    },
    horizon,
    candidates: cands,
    ask_window: ask,
    ask_hit: !!ask && [...cands, ...(ask.kind === "today" ? hours : [])].some((c) => c.windows.some((w) => w.in_ask)),
    lunar,
  };
}
