import { afterEach, describe, expect, it, vi } from "vitest";
import type { LineValue } from "@yaoflow/engine";
import { NextRequest } from "next/server";

/**
 * 10-07 应期类信收口 (Neil: 「有没有必要把应验的邮件全部给停了，因为现在的效果一点都不好」→ 收口，不全停 →「要」):
 * one of heads-up / day-of / revisit a day per address, three a week, no 5-day reminder, no heads-up for members, no
 * revisit asked more than two weeks after its window closed. sendEmail is stubbed: it "sends" and writes the mail_log
 * row the caps are read from, like the real one.
 */
const sent = vi.hoisted(() => ({ list: [] as { to: string; kind: string }[], fail: false, last: null as null | { subject: string; html: string; text: string } }));
vi.mock("../src/lib/email", async (orig) => {
  const real = await orig<typeof import("../src/lib/email")>();
  const { logMailSent } = await import("../src/lib/db");
  return {
    ...real,
    sendEmail: vi.fn(async (to: string, subject: string, _html: string, _text: string, opts: { kind: string; sessionId?: string | null; customerId?: number | null }) => {
      if (sent.fail) return { ok: false, error: "stubbed failure" };
      const id = `re_test_${sent.list.length + 1}_${Date.now()}`;
      logMailSent({ id, kind: opts.kind, email: to, subject, sessionId: opts.sessionId, customerId: opts.customerId });
      sent.list.push({ to: to.toLowerCase(), kind: opts.kind });
      sent.last = { subject, html: _html, text: _text };
      return { ok: true, id };
    }),
  };
});

const { db, logMailSent, recordOrder, saveCast, saveReading, scheduleRevisit, upsertCustomer, upsertSubscription } = await import("../src/lib/db");
const { resolveServerChart } = await import("../src/lib/reading");
const tm = await import("../src/lib/timing-mail");
const { runDayOf, runHeadsUps } = await import("../src/lib/headsup");
const { POST: revisitRun } = await import("../src/app/api/revisit/run/route");

const H = 3_600_000, DAY = 86_400_000;
const V: LineValue[] = [7, 8, 9, 8, 7, 8];
const NOW = Date.now();
const localMidnight = (t: number) => { const d = new Date(t); return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(); };
const mdy = (t: number) => { const d = new Date(t); return `${d.getMonth() + 1}月${d.getDate()}日`; };

afterEach(() => { sent.list.length = 0; sent.fail = false; sent.last = null; delete process.env.REVISIT_REMIND; });

/** a mail_log row of this kind to this address at `at` */
let seq = 0;
const logged = (email: string, kind: string, at: number) => {
  const id = `re_seed_${++seq}`;
  logMailSent({ id, kind, email, subject: "s" });
  db().prepare("UPDATE mail_log SET created_at = ? WHERE id = ?").run(at, id);
};

/** one deep reading with a timing line, its revisit scheduled; the cast sits `castDaysAgo` days back */
function reading(sid: string, email: string, o: { castDaysAgo: number; windowDays: number; quote: string; createdAgoMs?: number }) {
  const cid = upsertCustomer(email, "zh-hant");
  const castAt = NOW - o.castDaysAgo * DAY;
  const input = { question: "這份工作該不該換", values: V, castAtMs: castAt, tzOffsetMinutes: 480 };
  const chart = resolveServerChart(input, true) as unknown as Record<string, unknown>;
  const castId = saveCast({ customerId: cid, castAtMs: castAt, tzOffsetMinutes: 480, locale: "zh-hant", question: input.question, topic: "career", values: V, chart });
  saveReading(castId, cid, "deep", "zh-hant", { verdict: { "zh-hant": "可。" }, tendency: { "zh-hant": "先緊後鬆。" }, timing: { "zh-hant": o.quote }, basis: { "zh-hant": "x" }, strategy: { "zh-hant": "x" }, caution: { "zh-hant": "y" }, next_step: { "zh-hant": "z" }, closing: { "zh-hant": "w" }, signals: { "zh-hant": "兩個訊號" } } as never);
  recordOrder({ sessionId: sid, customerId: cid, castId, tier: "deep", amountCents: 7500, currency: "TWD", email, status: "paid" });
  scheduleRevisit({ sessionId: sid, castId, customerId: cid, email, locale: "zh-hant", tier: "deep", castAtMs: castAt, windowDays: o.windowDays, timingQuote: o.quote });
  // the row was created "now"; the letters leave a reading alone for its first day or two
  db().prepare("UPDATE revisits SET created_at = ? WHERE session_id = ?").run(NOW - (o.createdAgoMs ?? 5 * DAY), sid);
  return { cid, castId };
}
const revisitOf = (sid: string) => db().prepare("SELECT * FROM revisits WHERE session_id = ?").get(sid) as { id: number; status: string; sent_at: number | null; reminded_at: number | null; dayof_at: number | null; foretold_at: number | null };
const cron = (q = "") => revisitRun(new NextRequest(`http://localhost/api/revisit/run${q}`, { method: "POST", headers: { "x-cron-key": process.env.ADMIN_KEY! } }));

describe("每人每天一封、七天三封", () => {
  it("the gate: nothing → ok; one of the family in the last 20 hours → today; three in seven days → week; other kinds do not count", () => {
    const e = "gate@example.com";
    expect(tm.timingMailGate(e, NOW)).toBe("ok");
    logged(e, "reading", NOW - H); // a delivery is not in the family
    logged(e, "launch", NOW - 2 * H);
    expect(tm.timingMailGate(e, NOW)).toBe("ok");
    logged(e, "dayof", NOW - 3 * H);
    expect(tm.timingMailGate(e, NOW)).toBe("today");
    expect(tm.timingMailGate(e, NOW + 21 * H)).toBe("ok"); // tomorrow: one letter in the week so far
    logged(e, "revisit", NOW - 2 * DAY);
    logged(e, "headsup", NOW - 5 * DAY);
    expect(tm.timingMailGate(e, NOW + 21 * H)).toBe("week"); // three within seven days
    expect(tm.timingMailGate(e, NOW + 2.5 * DAY)).toBe("ok"); // the heads-up fell out of the window
    expect(tm.TIMING_WEEK_MAX).toBe(3);
    expect(tm.REVISIT_STALE_MS).toBe(14 * DAY);
  });
});

describe("回访信：让位给当天的信、过期不问、不再催答", () => {
  it("a capped revisit stays pending and goes the next day; a stale one is skipped; two for one address go in ONE letter (77)", async () => {
    process.env.ADMIN_KEY ??= "test-admin-key";
    const e = "rv-cap@example.com";
    // two readings whose windows closed yesterday — both due
    reading("cs_tm_rv1", e, { castDaysAgo: 11, windowDays: 10, quote: "先看9月28日前後" });
    reading("cs_tm_rv2", e, { castDaysAgo: 12, windowDays: 11, quote: "先看9月28日前後" });
    // and one whose window closed three weeks ago: too late to ask
    reading("cs_tm_old", "rv-old@example.com", { castDaysAgo: 40, windowDays: 18, quote: "先看9月28日前後" });
    // a day-of letter already went to this address this morning
    logged(e, "dayof", NOW - 2 * H);
    const dry = (await (await cron("?dry=1")).json()) as { results: { id: number; email: string; status: string }[]; capped: number; stale: number };
    const mine = dry.results.filter((r) => r.email === e);
    expect(mine.map((r) => r.status)).toEqual(["capped_today", "capped_today"]);
    expect(dry.results.find((r) => r.email === "rv-old@example.com")!.status).toBe("skipped_stale");
    expect(sent.list).toHaveLength(0);
    // the real run: nothing to this address today, the stale one marked skipped
    const run = (await (await cron()).json()) as { capped: number; stale: number };
    expect(run.capped).toBeGreaterThanOrEqual(2);
    expect(run.stale).toBe(1);
    expect(revisitOf("cs_tm_old").status).toBe("skipped");
    expect(revisitOf("cs_tm_rv1").status).toBe("pending");
    expect(sent.list.filter((s) => s.to === e)).toHaveLength(0);
    // tomorrow: both go in one letter (10-22 进度表 77) — one mail_log row, one slot of the cap
    db().prepare("UPDATE mail_log SET created_at = created_at - ? WHERE email = ?").run(DAY, e);
    const run2 = (await (await cron()).json()) as { letters: number; results: { email: string; status: string }[] };
    const after = [revisitOf("cs_tm_rv1"), revisitOf("cs_tm_rv2")];
    expect(after.filter((r) => r.status === "sent")).toHaveLength(2);
    expect(run2.results.filter((r) => r.email === e).map((r) => r.status)).toEqual(["sent_in_2", "sent_in_2"]);
    expect(sent.list.filter((s) => s.to === e && s.kind === "revisit")).toHaveLength(1);
    expect(sent.last?.subject).toContain("2");
    expect(sent.last?.html.match(/\/api\/revisit\/outcome\?/g)?.length ?? 0).toBe(8); // four answers per reading, two readings
    expect(sent.last?.text).toContain("這份工作該不該換");
  });

  it("the five-day reminder is off by default and back with REVISIT_REMIND=on", async () => {
    process.env.ADMIN_KEY ??= "test-admin-key";
    const e = "rv-remind@example.com";
    reading("cs_tm_rm", e, { castDaysAgo: 20, windowDays: 10, quote: "先看9月28日前後" });
    db().prepare("UPDATE revisits SET status = 'sent', sent_at = ? WHERE session_id = ?").run(NOW - 6 * DAY, "cs_tm_rm");
    await cron();
    expect(revisitOf("cs_tm_rm").reminded_at).toBeNull();
    expect(sent.list.filter((s) => s.to === e)).toHaveLength(0);
    process.env.REVISIT_REMIND = "on";
    await cron();
    expect(revisitOf("cs_tm_rm").reminded_at).not.toBeNull();
    expect(sent.list.filter((s) => s.to === e && s.kind === "revisit")).toHaveLength(1);
  });
});

describe("当天的信与一周前的提醒", () => {
  it("the day-of letter yields to the cap and is not sent later; the heads-up skips members and the cap", async () => {
    const today = localMidnight(NOW);
    // A: window names today, cast 5 days ago, due in 10 days — a day-of letter is due
    const a = "dayof-a@example.com";
    reading("cs_tm_da", a, { castDaysAgo: 5, windowDays: 15, quote: `先看${mdy(today)}前後` });
    // B: same, but a revisit letter went to B this morning
    const b = "dayof-b@example.com";
    reading("cs_tm_db", b, { castDaysAgo: 5, windowDays: 15, quote: `先看${mdy(today)}前後` });
    logged(b, "revisit", NOW - 3 * H);
    const r = await runDayOf({ now: NOW });
    expect(sent.list.filter((s) => s.kind === "dayof").map((s) => s.to)).toEqual([a]);
    expect(r.skippedQuiet).toBeGreaterThanOrEqual(1);
    expect(revisitOf("cs_tm_da").dayof_at).not.toBeNull();
    expect(revisitOf("cs_tm_db").dayof_at).not.toBeNull(); // passed over for good: today's letter is about today
    // the heads-up a week ahead: C gets it; D is a member (account page shows the date); A got the day-of letter today
    const c = "hu-c@example.com", d = "hu-d@example.com";
    const inFive = today + 5 * DAY;
    reading("cs_tm_hc", c, { castDaysAgo: 5, windowDays: 20, quote: `先看${mdy(inFive)}前後` });
    reading("cs_tm_hd", d, { castDaysAgo: 5, windowDays: 20, quote: `先看${mdy(inFive)}前後` });
    reading("cs_tm_ha", a, { castDaysAgo: 5, windowDays: 20, quote: `先看${mdy(inFive)}前後` });
    const dCid = upsertCustomer(d, "zh-hant");
    upsertSubscription({ customerId: dCid, stripeCustomerId: "cus_tm_d", stripeSubscriptionId: "sub_tm_d", status: "active", plan: "month", periodStart: NOW - DAY, periodEnd: NOW + 29 * DAY, cancelAtPeriodEnd: false });
    const h = await runHeadsUps("week", { now: NOW });
    expect(sent.list.filter((s) => s.kind === "headsup").map((s) => s.to)).toEqual([c]);
    expect(h.skippedMember).toBe(1);
    expect(h.skippedCap).toBeGreaterThanOrEqual(1);
    expect(revisitOf("cs_tm_hc").foretold_at).not.toBeNull();
    expect(revisitOf("cs_tm_ha").foretold_at).toBeNull(); // capped today, due again tomorrow
  });
});
