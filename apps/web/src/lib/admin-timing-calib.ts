import { db } from "./db";
import { absoluteDates, stripScope } from "./revisit";
import { isContactQuestion } from "./contact-question";
import { toHans } from "./hant";

/**
 * 10-31 进度表 129 ⑤ (Neil: 「有很多人反馈说六爻的应期不准确」→「全部都做吧」): the 应期 calibration table — of the
 * answered revisits on 六爻 readings, how often the matter happened in the named window, outside it, stirred, or not at
 * all, split by topic × 联络/复合题 × the reading's lean × how wide the window was. Looked at weekly: a row whose
 * "happened in window" rate sits far below what its lean promised is where the prompt or the guard needs work.
 * Readings cast from TIMING_129_AT on carry the new rules (observation period + check-back date).
 */
export const TIMING_129_AT = Date.UTC(2026, 9, 31, 5, 0); // 10-31 13:00 北京时间，129 上线之后起的卦

export type CalibRow = {
  topic: string; contact: boolean; lean: string; width: string;
  n: number; happened: number; offwindow: number; stirred: number; nothing: number; open: number;
};

const WIDTHS = ["1–3 天", "4–8 天", "9–15 天", "16 天以上", "没有日子"] as const;
function widthOf(quote: string | null, castAt: number): (typeof WIDTHS)[number] {
  if (!quote) return "没有日子";
  const c = new Date(castAt);
  const ds = absoluteDates(stripScope(quote), new Date(c.getFullYear(), c.getMonth(), c.getDate())).map((d) => d.getTime());
  if (!ds.length) return "没有日子";
  const days = Math.round((Math.max(...ds) - Math.min(...ds)) / 86_400_000) + 1;
  return days <= 3 ? "1–3 天" : days <= 8 ? "4–8 天" : days <= 15 ? "9–15 天" : "16 天以上";
}

const TOPIC: Record<string, string> = { relationship: "感情", career: "工作", decision: "抉择", study: "学业", money: "财", health: "健康", lost: "寻物", other: "其他" };

export function timingCalibration(opts: { since?: number; test?: boolean } = {}): { rows: CalibRow[]; total: CalibRow; offDates: number } {
  const since = opts.since ?? 0;
  const rows = db().prepare(
    `SELECT r.event, r.lean, r.timing_quote, r.off_date, c.question, c.topic, c.cast_at
     FROM revisits r JOIN casts c ON c.id = r.cast_id
     WHERE r.kind IS NULL AND r.tier = 'deep' AND r.event IS NOT NULL AND COALESCE(r.ask, 'event') = 'event' AND c.cast_at >= ?
       ${opts.test ? "" : "AND (r.customer_id IS NULL OR r.customer_id NOT IN (SELECT id FROM customers WHERE test_flag = 1))"}`,
  ).all(since) as { event: string; lean: string | null; timing_quote: string | null; off_date: string | null; question: string; topic: string | null; cast_at: number }[];
  const map = new Map<string, CalibRow>();
  const total: CalibRow = { topic: "全部", contact: false, lean: "", width: "", n: 0, happened: 0, offwindow: 0, stirred: 0, nothing: 0, open: 0 };
  let offDates = 0;
  for (const r of rows) {
    const topic = TOPIC[r.topic ?? "other"] ?? r.topic ?? "其他";
    const contact = isContactQuestion(toHans(r.question ?? ""));
    const lean = r.lean === "likely" ? "会" : r.lean === "unlikely" ? "不会" : r.lean === "even" ? "难说" : "未知";
    const width = widthOf(r.timing_quote, r.cast_at);
    const k = `${topic}|${contact}|${lean}|${width}`;
    const row = map.get(k) ?? { topic, contact, lean, width, n: 0, happened: 0, offwindow: 0, stirred: 0, nothing: 0, open: 0 };
    const ev = r.event as "happened" | "offwindow" | "stirred" | "nothing" | "open";
    for (const x of [row, total]) {
      x.n += 1;
      if (ev in x) (x as unknown as Record<string, number>)[ev] += 1;
    }
    if (ev === "offwindow" && r.off_date) offDates += 1;
    map.set(k, row);
  }
  const order = (r: CalibRow) => [r.contact ? 0 : 1, ["会", "难说", "不会", "未知"].indexOf(r.lean), WIDTHS.indexOf(r.width as (typeof WIDTHS)[number])];
  const out = [...map.values()].sort((a, b) => b.n - a.n || String(order(a)).localeCompare(String(order(b))));
  return { rows: out, total, offDates };
}
