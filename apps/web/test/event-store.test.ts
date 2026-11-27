import { describe, expect, it } from "vitest";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";
import { record, readEvents, readEventsBetween, castsByShareCode } from "../src/lib/analytics-server";
import { backfillFromFiles, dailyRows, eventsDb, EVENTS_DIR, liveSince, rollupDays } from "../src/lib/event-store";
import { archiveOld, POLICIES, ARCHIVE_DIR } from "../src/lib/archive";
import { db, recordOps } from "../src/lib/db";
import { homeDay } from "../src/lib/clock";

// 10-15 进度表 60: the event log in events.db — writes, filtered reads, the one-off import of the day files, the daily
// roll-up, and the monthly archive (copy, count, then delete; state kinds never move).
const DAY = 86_400_000;
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as { DatabaseSync: new (p: string, o?: { readOnly?: boolean }) => { prepare(s: string): { get(...a: unknown[]): unknown }; close(): void } };

describe("event store", () => {
  it("round-trips an event with every field, and filters by name, browser and share code", () => {
    const now = Date.now();
    record({ t: now - 5000, e: "page_view", s: "es-1", b: "bbbbbbbbbbb1", path: "/zh-hant", locale: "zh-hant", c: "threads", vt: "n", vn: 1 });
    record({ t: now - 4000, e: "cast_complete", s: "es-1", b: "bbbbbbbbbbb1", path: "/zh-hant/cast", hex: 12, tier: "x" });
    record({ t: now - 3000, e: "page_view", s: "es-2", b: "bbbbbbbbbbb2", path: "/zh", via: "678978" });
    record({ t: now - 2000, e: "cast_complete", s: "es-2", b: "bbbbbbbbbbb2", path: "/zh/cast" });
    record({ t: now - 1000, e: "share_click", s: "es-2", method: "copy", sf: "result" });

    const all = readEvents(1);
    const first = all.find((e) => e.s === "es-1" && e.e === "page_view")!;
    expect(first).toMatchObject({ path: "/zh-hant", locale: "zh-hant", c: "threads", vt: "n", vn: 1, b: "bbbbbbbbbbb1" });
    expect(all.find((e) => e.e === "cast_complete" && e.s === "es-1")?.hex).toBe(12);
    expect(all.find((e) => e.e === "share_click")).toMatchObject({ method: "copy", sf: "result" });
    expect(all.map((e) => e.t)).toEqual([...all.map((e) => e.t)].sort((a, b) => a - b));

    expect(readEvents(1, { only: ["cast_complete"] }).map((e) => e.s).sort()).toEqual(["es-1", "es-2"]);
    expect(readEvents(1, { browsers: ["bbbbbbbbbbb2"] }).map((e) => e.e)).toEqual(["page_view", "cast_complete"]);
    expect(readEvents(1, { only: [], orVia: true }).map((e) => e.s)).toEqual(["es-2"]);
    expect(readEvents(1, { browsers: [] })).toEqual([]);
    expect(readEventsBetween(now - 4500, now - 2500).map((e) => e.t)).toEqual([now - 4000, now - 3000]);
    expect(castsByShareCode(1).get("678978")).toBe(1);
    // a tab is filed under the moment it was first seen, even when an earlier-stamped event arrives later
    record({ t: now - 6000, e: "page_view", s: "es-2", path: "/zh" });
    expect(readEvents(1, { startedIn: [now - 6500, now - 5500] }).every((e) => e.s === "es-2")).toBe(true);
    expect(readEvents(1, { startedIn: [now - 5500, now] }).map((e) => e.s)).toEqual(["es-1", "es-1"]);
    expect(readEvents(1, { startedIn: [-Infinity, now - 5500] }).length).toBe(4);
    expect(liveSince()).not.toBeNull();
  });

  it("imports the day files written before the switch, once, skipping what is already in the database", () => {
    const boundary = liveSince()!;
    if (!existsSync(EVENTS_DIR)) mkdirSync(EVENTS_DIR, { recursive: true });
    const old = boundary - 3 * DAY;
    const name = new Date(old).toISOString().slice(0, 10) + ".jsonl";
    writeFileSync(join(EVENTS_DIR, name), [
      JSON.stringify({ t: old, e: "page_view", s: "old-1", path: "/en" }),
      "{not json",
      JSON.stringify({ t: old + 1000, e: "cast_complete", s: "old-1", hex: 3 }),
      "",
    ].join("\n"));
    // a line on or after the boundary is already in the database (record() wrote both)
    const today = new Date(boundary).toISOString().slice(0, 10) + ".jsonl";
    writeFileSync(join(EVENTS_DIR, today), JSON.stringify({ t: boundary + 10, e: "page_view", s: "dup" }) + "\n", { flag: "a" });

    const r = backfillFromFiles();
    expect(r.rows).toBe(2);
    expect(r.left).toBe(0);
    expect(readEventsBetween(old - 1, old + 2000).map((e) => [e.s, e.e, e.hex ?? null])).toEqual([["old-1", "page_view", null], ["old-1", "cast_complete", 3]]);
    expect(readEvents(1).filter((e) => e.s === "dup")).toEqual([]);
    expect(backfillFromFiles().rows).toBe(0); // second run: every file already marked
  });

  it("rolls a Taipei day up into events, sessions and browsers per kind", () => {
    const day = "2026-01-10";
    const t0 = Date.parse(`${day}T09:00:00+08:00`);
    const d = eventsDb();
    const ins = d.prepare("INSERT INTO events (t, e, s, b, path, method, via, x) VALUES (?,?,?,?,?,?,?,?)");
    ins.run(t0, "page_view", "r1", "B1", "/zh", null, null, JSON.stringify({ locale: "zh" }));
    ins.run(t0 + 1, "page_view", "r1", "B1", "/zh/cast", null, null, JSON.stringify({ locale: "zh" }));
    ins.run(t0 + 2, "page_view", "r2", "B2", "/zh", null, null, JSON.stringify({ locale: "zh" }));
    ins.run(t0 + 3, "share_click", "r2", "B2", null, "copy", null, null);
    ins.run(Date.parse(`${day}T23:59:00+08:00`) + 120_000, "page_view", "next", "B3", "/zh", null, null, null); // the next Taipei day
    rollupDays([day]);
    rollupDays([day]); // a re-run replaces, never doubles
    const rows = dailyRows(day, day);
    expect(rows.find((r) => r.e === "page_view")).toMatchObject({ locale: "zh", n: 3, sessions: 2, browsers: 2 });
    expect(rows.find((r) => r.e === "share_click")).toMatchObject({ method: "copy", n: 1 });
    expect(rows.reduce((a, r) => a + r.n, 0)).toBe(4);
  });
});

describe("day-by-day overview", () => {
  it("adds the days up to what the whole window gives (a tab open across midnight counts once)", async () => {
    const { computeStats, mergeStats, mergeVisitorTypes, visitorTypes } = await import("../src/lib/analytics-server");
    const { piecesOf } = await import("../src/lib/admin-bundle");
    const start = Date.parse("2026-10-01T10:00:00+08:00");
    const evs: Parameters<typeof computeStats>[0] = [];
    let k = 0;
    for (let day = 0; day < 3; day++) for (let i = 0; i < 40; i++) {
      const s = `m${day}-${i}`, t = start + day * DAY + i * 60_000, b = `bb${i % 25}`;
      const c = i % 3 === 0 ? "threads" : undefined, locale = i % 4 === 0 ? "en" : "zh-hant";
      evs.push({ t, e: "visit_day", s, b, td: homeDay(t), fd: homeDay(start), pd: day ? homeDay(t - DAY) : undefined, vt: day ? "r" : "n", locale, c });
      evs.push({ t: t + 1, e: "page_view", s, b, path: "/zh-hant", ref: i % 2 ? "google.com" : undefined, locale, c, vt: day ? "r" : "n" });
      if (i % 2 === 0) evs.push({ t: t + 2, e: "cast_complete", s, b, hex: (i % 64) + 1, cur: "TWD", locale, c, vt: day ? "r" : "n" });
      if (i % 5 === 0) evs.push({ t: t + 3, e: "reading_click", s, b, tier: "deep", cur: "TWD", locale, vt: day ? "r" : "n" });
      if (i % 10 === 0) evs.push({ t: t + 4, e: "purchase", s, b, method: "paid", tier: "deep", locale });
      if (i % 7 === 0) evs.push({ t: t + 5, e: "share_click", s, method: "copy", sf: "result" });
      if (i % 9 === 0) evs.push({ t: t + 6, e: "page_view", s, via: "678978", path: "/zh/share/x" });
      k++;
    }
    // tabs open across midnight: they belong to the day they started, and are counted once
    for (let i = 0; i < 6; i++) {
      const s = `night-${i}`, t = Date.parse("2026-10-01T23:50:00+08:00") + i * 1000;
      evs.push({ t, e: "page_view", s, b: `nb${i}`, path: "/zh-hant/cast", locale: "zh-hant", vt: "n" });
      evs.push({ t: t + 2 * 60_000, e: "cast_complete", s, b: `nb${i}`, hex: 4, cur: "TWD", locale: "zh-hant", vt: "n" });
      evs.push({ t: t + 20 * 60_000, e: "cast_complete", s, b: `nb${i}`, hex: 5, cur: "TWD", locale: "zh-hant", vt: "n" });
      if (i % 2) evs.push({ t: t + 25 * 60_000, e: "reading_click", s, b: `nb${i}`, tier: "deep", cur: "TWD", locale: "zh-hant", vt: "n" });
      // the same tab picked up again the next morning: a new visit day in the same session
      if (i < 3) evs.push({ t: t + 9 * 3_600_000, e: "visit_day", s, b: `nb${i}`, td: homeDay(t + 9 * 3_600_000), fd: homeDay(t), pd: homeDay(t), vt: "r", locale: "zh-hant" });
    }
    evs.sort((a, b) => a.t - b.t);
    const since = start - 3_600_000, until = start + 3 * DAY;
    const whole = computeStats(evs);
    // each piece: the tabs that started in it, with all their events in the window (lib/admin-bundle.ts piece())
    const firstSeen = new Map<string, number>();
    for (const e of evs) if (!firstSeen.has(e.s)) firstSeen.set(e.s, e.t);
    const between = (a: number, z: number) => evs.filter((e) => e.t >= a && e.t < z);
    const parts = piecesOf(since, until).map((p) => evs.filter((e) => {
      const f = firstSeen.get(e.s)!;
      return e.t >= since && e.t < until && (p.from === since ? f < p.to : f >= p.from && f < p.to);
    }));
    expect(parts.length).toBe(4); // partial first day + three more cuts (the third day runs into the fourth's start)
    // a plain cut at midnight counts the night tabs twice
    const plain = mergeStats(piecesOf(since, until).map((p) => computeStats(between(p.from, p.to), undefined, { full: true })));
    expect(plain.funnel.castComplete).toBeGreaterThan(whole.funnel.castComplete);
    const merged = mergeStats(parts.map((x) => computeStats(x, undefined, { full: true })));
    expect(merged.funnel).toEqual(whole.funnel);
    expect(merged.rates).toEqual(whole.rates);
    expect(merged.byDay).toEqual(whole.byDay);
    const by = <T,>(xs: T[], k: keyof T) => [...xs].sort((a, b) => String(a[k]).localeCompare(String(b[k])));
    expect(by(merged.byChannel, "c")).toEqual(by(whole.byChannel, "c"));
    expect(by(merged.byLocaleFunnel, "locale")).toEqual(by(whole.byLocaleFunnel, "locale"));
    expect(merged.byLocale).toEqual(whole.byLocale);
    expect(merged.topRefs).toEqual(whole.topRefs);
    expect(merged.sharing.referredSessions).toBe(whole.sharing.referredSessions);
    expect(merged.sharing.shareRate).toEqual(whole.sharing.shareRate);
    expect(merged.sharing.k).toBe(whole.sharing.k);
    expect(merged.topHexagrams.reduce((a, h) => a + h.n, 0)).toBe(whole.topHexagrams.reduce((a, h) => a + h.n, 0));
    const vt = mergeVisitorTypes(parts.map((x) => visitorTypes(x, new Set())));
    expect(vt).toEqual(visitorTypes(evs, new Set()));
    expect(k).toBe(120);
  });
});

describe("archive", () => {
  it("moves whole old months of telemetry out — counted first — and leaves state kinds and recent rows", () => {
    const now = Date.parse("2027-06-15T12:00:00+08:00");
    const jan = Date.parse("2026-07-10T12:00:00+08:00"); // > 180 days before `now`, month wholly past — and never the real month (11-01: 2026-11 was, and the real-clock row joined it)
    const d = db();
    const put = d.prepare("INSERT INTO ops_events (at, kind, detail) VALUES (?,?,?)");
    for (let i = 0; i < 5; i++) put.run(jan + i * 1000, "cron_fulfill", `{"n":${i}}`);
    put.run(jan + 9000, "unsub", "someone");           // state: never moves
    put.run(now - 10 * DAY, "cron_fulfill", "recent");  // inside the window
    recordOps("gen_ms", "deep 1000");                   // today, real clock: far inside

    const moved = archiveOld(POLICIES.find((p) => p.name === "ops_events")!, now);
    // (the gen_ms written on the real clock today is also older than this pretend `now` — it moves in its own month)
    expect(moved.map((m) => [m.month, m.moved])).toContainEqual(["2026-07", 5]);
    expect((d.prepare("SELECT COUNT(*) AS n FROM ops_events WHERE kind = 'cron_fulfill' AND at < ?").get(now - 180 * DAY) as { n: number }).n).toBe(0);
    expect((d.prepare("SELECT COUNT(*) AS n FROM ops_events WHERE kind = 'unsub' AND detail = 'someone'").get() as { n: number }).n).toBe(1);
    expect((d.prepare("SELECT n FROM ops_daily WHERE day = '2026-07-10' AND kind = 'cron_fulfill'").get() as { n: number }).n).toBe(5);

    const arc = new DatabaseSync(join(ARCHIVE_DIR, "ops_events-2026-07.db"), { readOnly: true });
    expect((arc.prepare("SELECT COUNT(*) AS n FROM ops_events").get() as { n: number }).n).toBe(5);
    arc.close();
    expect(archiveOld(POLICIES.find((p) => p.name === "ops_events")!, now)).toEqual([]); // nothing left to move
  });

  it("keeps the raw events of the last 400 days and the painted-door fortnight", () => {
    const now = Date.parse("2028-03-01T12:00:00+08:00");
    const d = eventsDb();
    const ins = d.prepare("INSERT INTO events (t, e, s, b, path, method, via, x) VALUES (?,?,?,?,?,?,?,?)");
    const door = Date.parse("2026-09-15T12:00:00+08:00");
    ins.run(door, "page_view", "door", null, "/", null, null, null);
    const oct = Date.parse("2026-10-20T12:00:00+08:00");
    ins.run(oct, "page_view", "oct-old", null, "/", null, null, null);
    const moved = archiveOld(POLICIES.find((p) => p.name === "events")!, now, 24);
    expect(moved.some((m) => m.month === "2026-10")).toBe(true);
    expect(readEventsBetween(door - 1, door + 1).map((e) => e.s)).toEqual(["door"]);
    expect(readEventsBetween(oct - 1, oct + 1)).toEqual([]);
    expect(homeDay(oct)).toBe("2026-10-20");
  });
});
