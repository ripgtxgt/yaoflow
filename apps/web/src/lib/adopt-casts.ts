import { fullChart, type LineValue } from "@yaoflow/engine";
import { createMatter, db, recordOps, saveCast, setCastMatter } from "./db";
import { fallbackTitle } from "./matter-assign";
import { classifyTopic } from "./topic";
import { toHans } from "./hant";
import { asLocale } from "./locales";

/**
 * 10-31 进度表 131 ⑤ (Neil: 起卦先放开，付费、看解读、设回访、保存时再登录): casting needs no account again, so the casts a
 * browser made before anyone knew whose it was reach 「我的」 the moment it proves whose it is (signed in, paid, claimed —
 * browser_links). The 10-26 one-off backfill (scripts/backfill-old-casts-1026.ts), per browser, live: every cast_log row of
 * the last 90 days on a browser filed under exactly ONE account, not sensitive, with no casts row of that account on the
 * same figure within half an hour — kept with its own time, filed by the browser's own grouping (a thread that already has a
 * kept cast joins that matter, else one new matter per thread). The same for its tarot draws, 擲筊 asks and 求籤 lots.
 * Idempotent; no model call.
 */
export function adoptBrowserCasts(bid: string, customerId: number, now = Date.now()): number {
  const d = db();
  const owners = d.prepare("SELECT COUNT(DISTINCT customer_id) AS n FROM browser_links WHERE bid = ?").get(bid) as { n: number };
  if (owners.n !== 1) return 0; // a shared browser: whose casts they are cannot be told
  const since = now - 90 * 86_400_000;
  // the other asks: rows with no owner join this one
  for (const t of ["tarot_draws", "jiaobei_asks", "qiuqian_draws"]) {
    try { d.prepare(`UPDATE ${t} SET customer_id = ? WHERE bid = ? AND customer_id IS NULL AND created_at >= ?`).run(customerId, bid, since); } catch { /* table not there yet */ }
  }
  type Row = { id: number; at: number; tz: number; locale: string | null; question: string; values_str: string; topic: string | null; thread_id: number | null; title: string | null };
  const rows = d.prepare(
    `SELECT l.id, l.at, l.tz, l.locale, l.question, l.values_str, l.topic, l.thread_id, t.title
     FROM cast_log l LEFT JOIN cast_threads t ON t.id = l.thread_id
     WHERE l.bid = ? AND l.at >= ? AND COALESCE(l.sensitive, '') = '' AND l.question IS NOT NULL AND l.values_str IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM casts c WHERE c.customer_id = ? AND ABS(c.cast_at - l.at) < 1800000 AND REPLACE(c.values_str, ',', '') = l.values_str)
     ORDER BY l.at LIMIT 200`,
  ).all(bid, since, customerId) as Row[];
  if (!rows.length) return 0;
  const keptIn = (threadId: number): number | null => {
    const r = d.prepare(
      `SELECT c.matter_id FROM cast_log l JOIN casts c ON c.customer_id = ? AND ABS(c.cast_at - l.at) < 1800000 AND REPLACE(c.values_str, ',', '') = l.values_str
       WHERE l.thread_id = ? AND c.matter_id IS NOT NULL ORDER BY c.cast_at DESC LIMIT 1`,
    ).get(customerId, threadId) as { matter_id: number } | undefined;
    return r?.matter_id ?? null;
  };
  const threadMatter = new Map<string, number>();
  let n = 0;
  for (const r of rows) {
    const values = r.values_str.replace(/,/g, "").split("").map(Number) as LineValue[];
    if (values.length !== 6 || values.some((v) => ![6, 7, 8, 9].includes(v))) continue;
    try {
      const locale = r.locale ?? "zh-hant";
      const topic = r.topic ?? classifyTopic(toHans(r.question));
      const chart = fullChart({ values, utcMs: r.at, tzOffsetMinutes: r.tz });
      const castId = saveCast({ customerId, castAtMs: r.at, tzOffsetMinutes: r.tz, locale, question: r.question, topic, values, chart: chart as unknown as Record<string, unknown> });
      d.prepare("UPDATE casts SET created_at = ? WHERE id = ?").run(r.at, castId);
      const key = r.thread_id ? `t${r.thread_id}` : `log${r.id}`;
      let m = threadMatter.get(key) ?? (r.thread_id ? keptIn(r.thread_id) : null);
      if (!m) m = createMatter(customerId, r.title || fallbackTitle(r.question, asLocale(locale)), "rule", topic, r.at);
      threadMatter.set(key, m);
      setCastMatter(castId, m, "adopt");
      n++;
    } catch (e) {
      recordOps("adopt_cast_fail", `${bid.slice(0, 6)} #${customerId}: ${e instanceof Error ? e.message.slice(0, 120) : "?"}`);
    }
  }
  if (n) recordOps("adopt_casts", `${bid.slice(0, 6)} → #${customerId}: ${n}`);
  return n;
}
