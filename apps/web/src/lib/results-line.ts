import { db, outcomeStats } from "./db";
import { tarotRevisitCounts } from "./tarot";

/**
 * 10-22 进度表 79 (10-21 定稿設計 第二屏「把結果擺出來」): the raw counts of what readers reported when their windows came —
 * every 問事 revisit, the I Ching readings and the tarot spreads together (10-22 进度表 90: the free ones too); private ones
 * are counted, never shown. The same figures head /outcomes (10-23 进度表 104 ②).
 * Counts only, never a rate (竞争力深调 §四: 不寫準確率).
 *
 * 10-23 进度表 104 ② (Neil: 「应验记录没有更新，你得检查一下前端给用户显示的数据对不对」):
 *   - 「到期寄信 622 封」was a count of matters, not letters (one merged letter carries several) and left out the ones a
 *     reader answered on the site before the letter went — now 「已問 N 件」: a check-in sent, or an answer already given.
 *   - the five numbers were the I Ching scores (does the fact match what the reading said) under the reader's words
 *     (「說發生了 63」 held 52 readers who said nothing happened, as the reading had said) — the readings' line now uses
 *     /outcomes' words; the tarot spreads and free casts, which have no call to score, are the reader's fact on a line of their own.
 *   - read at most every 5 minutes, and forgotten the moment a reader answers (revisit/outcome, tarot/answer).
 */
export interface ResultsCounts {
  /** matters asked about: a check-in went out, or the reader answered first (件, not letters) */
  asked: number;
  /** of those, answered */
  answered: number;
  /** the I Ching readings, scored against what the reading said — 應了 / 部分 / 沒應 / 不確定 / 還沒定, as on /outcomes */
  judged: { hit: number; partial: number; miss: number; unclear: number; open: number };
  /** tarot spreads and free casts: what the reader said happened, no right or wrong — 發生了 / 有動靜 / 沒動靜 / 還沒定 */
  facts: { happened: number; stirred: number; nothing: number; open: number };
}

let cache: { at: number; v: ResultsCounts } | null = null;
export const RESULTS_TTL = 5 * 60_000;
const NOT_OURS = "(customer_id IS NULL OR customer_id NOT IN (SELECT id FROM customers WHERE test_flag = 1))";

export function resultsCounts(now = Date.now()): ResultsCounts {
  if (cache && now - cache.at < RESULTS_TTL) return cache.v;
  const d = db();
  const o = outcomeStats();
  const askedIching = (d.prepare(`SELECT COUNT(*) AS v FROM revisits WHERE kind IS NULL AND (status = 'sent' OR outcome IS NOT NULL) AND ${NOT_OURS}`).get() as { v: number } | undefined)?.v ?? 0;
  const t = tarotRevisitCounts();
  // 10-22 进度表 90: the free readings' revisits (设计稿 R7「付不付費都給回訪」) — the reader's own fact
  const f = (d.prepare(`SELECT SUM(status = 'sent' OR outcome IS NOT NULL) AS asked, SUM(outcome IS NOT NULL) AS answered, SUM(event = 'happened') AS h, SUM(event = 'stirred') AS s,
      SUM(event = 'nothing') AS n, SUM(event = 'open') AS o FROM revisits WHERE kind = 'cast' AND ${NOT_OURS}`).get() as
    { asked: number | null; answered: number | null; h: number | null; s: number | null; n: number | null; o: number | null } | undefined) ?? { asked: 0, answered: 0, h: 0, s: 0, n: 0, o: 0 };
  const v: ResultsCounts = {
    asked: askedIching + t.asked + (f.asked ?? 0),
    answered: o.answered + t.answered + (f.answered ?? 0),
    judged: { hit: o.hit, partial: o.partial, miss: o.miss, unclear: o.unclear, open: o.open },
    facts: { happened: t.happened + (f.h ?? 0), stirred: t.moving + (f.s ?? 0), nothing: t.nothing + (f.n ?? 0), open: t.undecided + (f.o ?? 0) },
  };
  cache = { at: now, v };
  return v;
}

/** forget the figure — after a reader answers (the next page view reads it again), and for tests */
export const resetResultsCache = () => { cache = null; };
