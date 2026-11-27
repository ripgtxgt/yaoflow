import { absoluteDates } from "./revisit";

/**
 * 10-01 (#838 的 PDF：「假設這題有深斷，那可能會問出更多東西，那如果有更多應期，是否可以統一整理」).
 * A matter's deep readings name a window, and the follow-up conversation often names more ("那 10 月中呢？" →
 * 「10月14日到18日之間…」). Those dates lived only inside each conversation. This pulls every dated sentence
 * out of the readings' timing field and the replies in the follow-ups, one entry per sentence, sorted by date.
 * Pure — the page hands it the text.
 */
export interface DateSource {
  kind: "reading" | "followup";
  castId: number;
  sessionId: string | null;
  /** when that text was written — the year a bare 「1月5日」 belongs to is counted from here */
  at: number;
  text: string;
}

export interface MatterDate {
  start: number;
  end: number;
  sentence: string;
  kind: "reading" | "followup";
  castId: number;
  sessionId: string | null;
  at: number;
  status: "past" | "now" | "soon" | "later";
}

const DAY = 86_400_000;
const SENTENCE = /[^。！？!?\n]+[。！？!?]?/g;

export function matterDates(sources: DateSource[], now = Date.now()): MatterDate[] {
  const out: MatterDate[] = [];
  const seen = new Set<string>();
  for (const s of sources) {
    for (const m of s.text.matchAll(SENTENCE)) {
      const sentence = m[0].trim();
      if (sentence.length < 4) continue;
      // 10-01: one sentence often names several things — 「最近的是9月23日，再往後10月5日」 is two days, not a 13-day window,
      // and 「9月19日前後先有動靜…要等到2027年2月4日到3月5日」 is a day and a window. A window is two dates inside ONE
      // clause; clauses split on commas, semicolons and or/and words.
      const clauses = sentence.split(/[，,；;、]|(?:或|和|與|与|及|以及|或者|\bor\b|\band\b|\bthen\b)/i);
      const spans: { start: number; end: number }[] = [];
      for (const cl of clauses) {
        // a window that began a few days before the text was written (「這個月（9月26日到30日）」 said on the 29th) is this
        // year's, not next year's — dates resolve forward from 60 days before the writing, not from the writing itself
        const ds = absoluteDates(cl, new Date(s.at - 60 * DAY)).map((d) => d.getTime()).filter((t) => t - s.at < 400 * DAY);
        if (!ds.length) continue;
        if (ds.length === 2 && Math.abs(ds[1]! - ds[0]!) <= 120 * DAY) spans.push({ start: Math.min(...ds), end: Math.max(...ds) + DAY - 1 });
        else for (const t of ds) spans.push({ start: t, end: t + DAY - 1 });
      }
      for (const { start, end } of spans) {
      // the same window said twice (reading and a follow-up repeating it) is one entry — the first saying wins
      const key = `${new Date(start).toDateString()}|${new Date(end).toDateString()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const status = end < now ? "past" : start <= now ? "now" : start - now <= 7 * DAY ? "soon" : "later";
      out.push({ start, end, sentence: sentence.length > 90 ? `${sentence.slice(0, 89)}…` : sentence, kind: s.kind, castId: s.castId, sessionId: s.sessionId, at: s.at, status });
      }
    }
  }
  return out.sort((a, b) => a.start - b.start || a.end - b.end);
}
