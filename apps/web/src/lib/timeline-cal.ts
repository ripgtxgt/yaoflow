/**
 * 10-14 进度表 §四 44: the calendar side of the timing timeline — client-safe (no database, no parser). The events
 * carry the kind of matter and a link, never the question.
 */
export interface TimelineData {
  /** the cast day, 「YYYY-MM-DD」 */
  start: string;
  /** at most three windows, in order (多段应期: the next is where to look if the one before stays quiet) */
  windows: { start: string; end: string }[];
  /** the day the check-in letter goes out */
  revisit: string;
}

const iso = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
/** 「YYYYMMDD」 for calendar files, and the day after (an all-day event ends the next day, exclusive) */
const ymd = (s: string) => s.replace(/-/g, "");
const nextDay = (s: string) => { const d = new Date(`${s}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1); return iso(d); };
const icsEsc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");

/**
 * The .ics: one all-day event per window and one for the check-in day. Never the reader's question — only the kind of
 * matter and a link (the matter page, or the account).
 */
export function timelineIcs(t: TimelineData, words: { window: string; revisit: string; kind: string; link: string }, uidSeed: string): string {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const ev = (n: number, start: string, endExclusive: string, summary: string) => [
    "BEGIN:VEVENT", `UID:${uidSeed}-${n}@yaoflow.com`, `DTSTAMP:${stamp}`,
    `DTSTART;VALUE=DATE:${ymd(start)}`, `DTEND;VALUE=DATE:${ymd(endExclusive)}`,
    `SUMMARY:${icsEsc(summary)}`, `DESCRIPTION:${icsEsc(`${words.kind}\n${words.link}`)}`, `URL:${words.link}`,
    "TRANSP:TRANSPARENT", "END:VEVENT",
  ].join("\r\n");
  return [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//YaoFlow//Timing//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    ...t.windows.map((w, k) => ev(k + 1, w.start, nextDay(w.end), words.window)),
    ev(9, t.revisit, nextDay(t.revisit), words.revisit),
    "END:VCALENDAR", "",
  ].join("\r\n");
}

/** Google Calendar's one-tap link for the window the check-in follows (the last one). */
export function timelineGoogleUrl(t: TimelineData, words: { window: string; kind: string; link: string }): string {
  const w = t.windows[t.windows.length - 1]!;
  const q = new URLSearchParams({ action: "TEMPLATE", text: words.window, dates: `${ymd(w.start)}/${ymd(nextDay(w.end))}`, details: `${words.kind}\n${words.link}` });
  return `https://calendar.google.com/calendar/render?${q.toString()}`;
}
