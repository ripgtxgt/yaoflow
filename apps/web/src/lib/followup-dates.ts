/**
 * 10-22 复查: a follow-up asked on 10-21 about a cast of 10-12 answered 「10月16日到20日這幾天，18日前後最可能」 — a window
 * that had gone by. The prompt now knows the reader's today (FOLLOWUP_LATE_NOTE in lib/reading.ts) and the payload marks
 * passed windows, and the model still did it one time in two in the 10-22 acceptance run. So the answer is checked: a
 * passed window of THIS chart named with no word that it has gone by sends the answer back once. Only the chart's own
 * windows count — a date the reader reported ("他10月11日連打三通") is no window and is left alone.
 */

const MONTHS_EN: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const PAST = /過去|过去|已過|已过|過了|过了|錯過|错过|沒等到|没等到|已經|已经|走完|落空|那時|那时|當時|当时|\bpassed\b|\bgone\b|\balready\b|\bmissed\b|\bwas\b|\bwere\b/i;
const pad = (n: number) => String(n).padStart(2, "0");
const md = (m: number, d: number) => `${pad(m)}-${pad(d)}`;

interface Span { text: string; start: string; end: string }

/** The dates a clause names, as month-day spans: 「10月16日到20日」 → 10-16..10-20, 「10月18日」 → 10-18..10-18, "October 16–20". */
function spansIn(clause: string): Span[] {
  const out: Span[] = [];
  for (const m of clause.matchAll(/(\d{1,2})\s*月\s*(\d{1,2})\s*[日号號](?:\s*(?:[-–—~～至到]|之間到|之间到)\s*(?:(\d{1,2})\s*月\s*)?(\d{1,2})\s*[日号號])?/g)) {
    const m1 = Number(m[1]), d1 = Number(m[2]);
    const d2 = m[4] ? Number(m[4]) : d1;
    const m2 = m[3] ? Number(m[3]) : m[4] && d2 < d1 ? (m1 % 12) + 1 : m1;
    out.push({ text: m[0], start: md(m1, d1), end: md(m2, d2) });
  }
  const MON = "(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sept?|oct|nov|dec)";
  for (const m of clause.matchAll(new RegExp(`\\b${MON}\\.?\\s+(\\d{1,2})(?:\\s*(?:[-–—]|to|and)\\s*(?:${MON}\\.?\\s+)?(\\d{1,2}))?\\b`, "gi"))) {
    const m1 = MONTHS_EN[m[1]!.toLowerCase().slice(0, 3)]!, d1 = Number(m[2]);
    const d2 = m[4] ? Number(m[4]) : d1;
    const m2 = m[3] ? MONTHS_EN[m[3].toLowerCase().slice(0, 3)]! : m[4] && d2 < d1 ? (m1 % 12) + 1 : m1;
    out.push({ text: m[0], start: md(m1, d1), end: md(m2, d2) });
  }
  return out;
}

/**
 * The first passed window of the chart that the answer names as if it were still to come — its words as written — or
 * null. `windows` are the chart's candidate windows (ISO dates), `today` the reader's today (ISO).
 */
export function passedWindowMention(reply: string, windows: readonly { start: string; end: string }[], today: string): string | null {
  const passed = windows.filter((w) => w.end < today);
  if (!passed.length) return null;
  const starts = new Set(passed.map((w) => w.start.slice(5)));
  const ends = new Set(passed.map((w) => w.end.slice(5)));
  for (const clause of reply.split(/(?<=[。！？!?；;\n])/)) {
    if (PAST.test(clause)) continue;
    for (const s of spansIn(clause)) if (starts.has(s.start) || ends.has(s.end)) return s.text;
  }
  return null;
}
