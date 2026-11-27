import type { TrackedEvent } from "./analytics-server";

/**
 * 09-26 对照测试 — per arm, from the browser sessions that carried the tag:
 * saw the free line, tapped a price, went to pay, got the free light reading,
 * and paid (the paid-order browser sessions). Each experiment is read on its
 * own bit, the other bit mixed in evenly by the draw.
 */
export interface ArmRow {
  arm: string; sessions: number; teased: number; clicked: number; checkout: number; free: number; paid: number;
  /** 10-02 存到信箱: sessions that saved the cast; return visits from the letter; how many of those paid */
  saved: number; returned: number; returnPaid: number;
  /** 10-02 x: taps on the "read it in full" button under the list of what the full reading holds */
  previewTaps: number;
}

type Flags = { teased: boolean; clicked: boolean; checkout: boolean; free: boolean; saved: boolean; returned: boolean; previewTap: boolean };

export function abStats(evs: TrackedEvent[], paidSessions: Set<string>): { free: ArmRow[]; odds: ArmRow[]; onePrice: ArmRow[]; verdict: ArmRow[]; preview: ArmRow[]; save: ArmRow[] } {
  const tagOf = new Map<string, string>();
  const flags = new Map<string, Flags>();
  for (const e of evs) {
    if (!e.ab) continue;
    if (!tagOf.has(e.s)) tagOf.set(e.s, e.ab);
    const f = flags.get(e.s) ?? { teased: false, clicked: false, checkout: false, free: false, saved: false, returned: false, previewTap: false };
    if (e.e === "teaser_shown") f.teased = true;
    if (e.e === "reading_click" && !(e.method ?? "").startsWith("wallet")) f.clicked = true;
    if (e.e === "checkout_start") f.checkout = true;
    if (e.e === "reading_click" && e.method === "free_ok") f.free = true;
    if (e.e === "cast_saved" && e.method === "ok") f.saved = true;
    if (e.e === "saved_open") f.returned = true;
    if (e.e === "heat_click" && e.method === "preview-deep") f.previewTap = true;
    flags.set(e.s, f);
  }
  // the bit's position in the tag: f=1, o=3, p=5, v=7, x=11, y=13 — a session tagged before a bit existed sits in neither arm.
  // 10-02: a visit back from a saved-cast letter is the same reader's second sitting — it adds what it paid, not another
  // "saw the free line", so the y arms compare paid per reader who cast. Only y1 can save, and the letter may be opened
  // on another device (which draws its own arms), so a return visit counts for y1 whatever its tag, and for no other bit.
  const rows = (pos: 1 | 3 | 5 | 7 | 11 | 13): ArmRow[] => ["0", "1"].map((v) => {
    const r: ArmRow = { arm: v, sessions: 0, teased: 0, clicked: 0, checkout: 0, free: 0, paid: 0, saved: 0, returned: 0, returnPaid: 0, previewTaps: 0 };
    for (const [s, tag] of tagOf) {
      const f = flags.get(s)!;
      const paid = paidSessions.has(s);
      if (f.returned) {
        if (pos !== 13 || v !== "1") continue;
        r.returned += 1;
        if (paid) { r.returnPaid += 1; r.paid += 1; }
        continue;
      }
      if (tag[pos] !== v) continue;
      r.sessions += 1;
      if (f.teased) r.teased += 1;
      if (f.clicked) r.clicked += 1;
      if (f.checkout) r.checkout += 1;
      if (f.free) r.free += 1;
      if (f.saved) r.saved += 1;
      if (f.previewTap) r.previewTaps += 1;
      if (paid) r.paid += 1;
    }
    return r;
  });
  return { free: rows(1), odds: rows(3), onePrice: rows(5), verdict: rows(7), preview: rows(11), save: rows(13) };
}

/**
 * 09-30 对照测试 h (首页首屏). What the new hero is for is the first step, so it is read on the sessions that
 * LANDED on the home page: how many started a cast, finished one, and went on to a price, to pay, and paid.
 */
export interface HomeArmRow { arm: string; landed: number; started: number; cast: number; clicked: number; paid: number }

const HOME_PATH = /^\/(zh-hant|zh|en|ja|ko|fr|de|es|pt)\/?$/;

export function homeAbStats(evs: TrackedEvent[], paidSessions: Set<string>): HomeArmRow[] {
  const first = new Map<string, TrackedEvent>();
  const tagOf = new Map<string, string>();
  const did = new Map<string, { started: boolean; cast: boolean; clicked: boolean }>();
  for (const e of evs) {
    if (e.e === "page_view" && !first.has(e.s)) first.set(e.s, e);
    if (e.ab && e.ab.length >= 10 && !tagOf.has(e.s)) tagOf.set(e.s, e.ab);
    const d = did.get(e.s) ?? { started: false, cast: false, clicked: false };
    if (e.e === "cast_start") d.started = true;
    if (e.e === "cast_complete") d.cast = true;
    if (e.e === "reading_click" && !(e.method ?? "").startsWith("wallet")) d.clicked = true;
    did.set(e.s, d);
  }
  return ["0", "1"].map((v) => {
    const r: HomeArmRow = { arm: v, landed: 0, started: 0, cast: 0, clicked: 0, paid: 0 };
    for (const [s, tag] of tagOf) {
      if (tag[9] !== v) continue;
      const pv = first.get(s);
      if (!pv || !HOME_PATH.test((pv.path ?? "").split("?")[0]!)) continue;
      const d = did.get(s)!;
      r.landed += 1;
      if (d.started) r.started += 1;
      if (d.cast) r.cast += 1;
      if (d.clicked) r.clicked += 1;
      if (paidSessions.has(s)) r.paid += 1;
    }
    return r;
  });
}

/**
 * 10-13 (Neil, on the heat page: h1 looked like 78% casting and 5% paying against 65% / 2.3%): the ended tests were read
 * over the page's day window, but since each test ended every new browser carries the control's bit — so the control
 * row kept growing with days the test never ran, and the window cut most of the test week off the other row. Re-read
 * over the test's own run, the home test was 63.8% / 3.7% (h0) against 65.1% / 3.1% (h1), as decided on 10-08.
 * Each ended test is now counted only over the days it ran (UTC; start = the deploy, end = the commit that ended it).
 */
export const AB_RUNS = {
  free: [Date.parse("2026-09-26T12:50:00Z"), Date.parse("2026-10-07T16:50:00Z")],
  odds: [Date.parse("2026-09-26T12:50:00Z"), Date.parse("2026-10-07T16:50:00Z")],
  onePrice: [Date.parse("2026-09-28T07:43:00Z"), Date.parse("2026-10-02T08:52:00Z")],
  verdict: [Date.parse("2026-09-28T07:43:00Z"), Date.parse("2026-10-02T08:52:00Z")],
  home: [Date.parse("2026-09-29T17:21:00Z"), Date.parse("2026-10-07T16:50:00Z")],
  preview: [Date.parse("2026-10-02T09:46:00Z"), Date.parse("2026-10-05T15:01:00Z")],
  save: [Date.parse("2026-10-02T09:46:00Z"), Date.parse("2026-10-07T16:50:00Z")],
} as const;
export const AB_RUNS_FROM = Math.min(...Object.values(AB_RUNS).map((r) => r[0]));
export const AB_RUNS_TO = Math.max(...Object.values(AB_RUNS).map((r) => r[1]));

/** Sessions whose first event falls inside [from, to). */
function inRun(evs: TrackedEvent[], [from, to]: readonly [number, number]): TrackedEvent[] {
  const start = new Map<string, number>();
  for (const e of evs) if (e.s && !start.has(e.s)) start.set(e.s, e.t);
  return evs.filter((e) => { const t = start.get(e.s); return t !== undefined && t >= from && t < to; });
}

/** Every ended test, each over its own run. */
export function endedTestStats(evs: TrackedEvent[], paidSessions: Set<string>): ReturnType<typeof abStats> & { home: HomeArmRow[] } {
  const pick = <K extends keyof ReturnType<typeof abStats>>(k: K, run: keyof typeof AB_RUNS) => abStats(inRun(evs, AB_RUNS[run]), paidSessions)[k];
  return {
    free: pick("free", "free"), odds: pick("odds", "odds"), onePrice: pick("onePrice", "onePrice"), verdict: pick("verdict", "verdict"),
    preview: pick("preview", "preview"), save: pick("save", "save"),
    home: homeAbStats(inRun(evs, AB_RUNS.home), paidSessions),
  };
}
