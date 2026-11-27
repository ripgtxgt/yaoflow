import { db } from "./db";
import { listProfiles } from "./birth-profiles";
import { chartFromBirth, chartFromFacts, myToday, type MyChart, type MyToday } from "./mingli/bazi/today";
import type { ChartFacts } from "./mingli/bazi/report-facts";
import { dayPlus, type DayPlus } from "./mingli/bazi/today-plus";
import { rightsFor, can } from "./entitlements";

/**
 * 10-22 进度表 92 — a member's own 八字 for the 每天 things (你的今天, 黃曆「今天對你」, 擇日 read against your chart):
 * the 生辰檔案 marked 自己 (computed here, nothing of it stored or shown); for 結婚 and its kin, the profile marked 伴侶
 * as well. Server only.
 */
function factsOnFile(customerId: number): ChartFacts | null {
  try {
    const r = db().prepare("SELECT chart_json FROM bazi_reports WHERE customer_id = ? AND paid_at IS NOT NULL ORDER BY created_at DESC LIMIT 1").get(customerId) as { chart_json: string } | undefined;
    return r ? (JSON.parse(r.chart_json) as ChartFacts) : null;
  } catch { return null; } // the table exists once a report was ever written
}

/**
 * 10-22: only the 生辰檔案 marked 自己 (or 伴侶) — 92 ② 「沒有生辰檔案的先請他填一次」. The latest 八字 report is not used:
 * a member who wrote reports for family or friends would have read their day against someone else's chart.
 */
export function myChart(customerId: number, who: "self" | "partner" = "self", now = Date.now()): MyChart | null {
  const p = listProfiles(customerId).find((x) => x.who === who);
  return p ? chartFromBirth(p.input, p.gender ?? p.input.gender ?? "male", now) : null;
}
/** the chart of the member's latest 八字 report (kept for callers that ask for it by name) */
export function chartOnFile(customerId: number): MyChart | null {
  const f = factsOnFile(customerId);
  return f ? chartFromFacts(f) : null;
}

/** the 每日運勢／黃曆 block's state for this reader: a member with a chart, a member without one, or anyone else */
export type MyDay = { state: "show"; today: MyToday; plus?: DayPlus | null } | { state: "need" } | { state: "teaser" };
export async function myDay(customerId: number | null | undefined, ymd: string, now = Date.now()): Promise<MyDay> {
  if (!customerId) return { state: "teaser" };
  const r = await rightsFor(customerId, now).catch(() => null);
  if (!r || !can(r, "daily_personal")) return { state: "teaser" };
  const c = myChart(customerId, "self", now);
  const t = c ? myToday(c, ymd) : null;
  // 10-26: 宜忌、時段、顏色方位、桃花、你們倆、七天、沖日預告
  let plus: DayPlus | null = null;
  try { plus = c ? dayPlus(c, ymd, myChart(customerId, "partner", now)) : null; } catch { plus = null; }
  return t ? { state: "show", today: t, plus } : { state: "need" };
}
