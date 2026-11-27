import { describe, expect, it, vi } from "vitest";

/**
 * 10-22 (客服核对): a paid report whose writing stopped half way is finished by the server's own clock, and the letter
 * it is owed goes out — #2104's 八字 report sat at retry with no letter; #838's 星盤 report had a chapter that the page
 * promised 「我們會補上，寫好會寄信通知你」 and nothing ever did.
 */
const fake = vi.hoisted(() => ({ next: "done" as string, calls: [] as string[], sent: [] as { to: string; subject: string; kind: string }[] }));
vi.mock("../src/lib/mingli/bazi/report", async (orig) => {
  const real = await orig<typeof import("../src/lib/mingli/bazi/report")>();
  return {
    ...real,
    // the writing itself is the model's; here one round just moves the row the way the module would
    ensureBaziReport: vi.fn(async (token: string) => {
      fake.calls.push(token);
      const { db } = await import("../src/lib/db");
      const r = real.baziReport(token)!;
      const b = JSON.parse(r.body_json || "{}") as { rounds?: number };
      b.rounds = (b.rounds ?? 0) + 1;
      db().prepare("UPDATE bazi_reports SET status = ?, body_json = ?, lease_at = NULL, updated_at = ? WHERE token = ?").run(fake.next, JSON.stringify(b), Date.now(), token);
      return b;
    }),
  };
});
vi.mock("../src/lib/email", async (orig) => {
  const real = await orig<typeof import("../src/lib/email")>();
  return { ...real, sendEmail: vi.fn(async (to: string, subject: string, _h: string, _t: string, opts: { kind: string }) => { fake.sent.push({ to, subject, kind: opts.kind }); return { ok: true, id: "re_test" }; }) };
});

const { db, upsertCustomer } = await import("../src/lib/db");
const { normalizeBirth } = await import("../src/lib/mingli/birth/normalize");
const { createReport, factsFromBirth } = await import("../src/lib/mingli/bazi/report");
const { MEND_GAP_MS, mendCandidates, mendOne, runReportMend } = await import("../src/lib/mingli/report-mend");
const { buildReportMendedEmail } = await import("../src/lib/email");

const MIN = 60_000;
let n = 0;
function report(status: string, o: { touchedAgo?: number; rounds?: number; leaseAgo?: number; session?: string; createdAgo?: number } = {}) {
  const now = Date.now();
  const email = `rm-${++n}@example.com`;
  const cid = upsertCustomer(email, "zh-hant");
  const birth = normalizeBirth({ calendar: "solar", y: 1980 + n, m: 3, d: 9, timeMode: "exact", h: 8, mi: 0, placeId: "tw-tpe" } as never);
  const facts = factsFromBirth(birth, "female", "deep", now);
  const created = now - (o.createdAgo ?? 30 * MIN);
  const { token } = createReport({ kind: "deep", locale: "zh-hant", register: null, customerId: cid, email, facts, paid: { session: o.session ?? `member:${n}`, amountMinor: 0 } }, created);
  db().prepare("UPDATE bazi_reports SET status = ?, body_json = ?, updated_at = ?, lease_at = ? WHERE token = ?")
    .run(status, JSON.stringify({ parts: {}, rounds: o.rounds ?? 1 }), now - (o.touchedAgo ?? 5 * MIN), o.leaseAgo === undefined ? null : now - o.leaseAgo, token);
  return { token, email };
}
const due = (token: string) => mendCandidates().some((p) => p.token === token);
const letterSent = (token: string) => db().prepare("INSERT INTO emails (session_id, kind, email, sent_at, status, detail) VALUES (?, 'bazi-mail', 'x@example.com', ?, 'sent', NULL)").run(`bazi:${token}`, Date.now());

describe("which reports the mend picks up", () => {
  it("a report left at retry or new, once nobody has touched it for a few minutes", () => {
    expect(due(report("retry", { touchedAgo: 5 * MIN }).token)).toBe(true);
    expect(due(report("new", { touchedAgo: 5 * MIN }).token)).toBe(true);
    expect(due(report("retry", { touchedAgo: 1 * MIN }).token)).toBe(false); // a page may still be on it
  });

  it("a writing whose lease ran out, not one still being written", () => {
    expect(due(report("writing", { leaseAgo: 15 * MIN }).token)).toBe(true);
    expect(due(report("writing", { leaseAgo: 2 * MIN }).token)).toBe(false);
  });

  it("an incomplete one: two more rounds, twenty minutes apart, then it is left alone", () => {
    expect(due(report("incomplete", { rounds: 2, touchedAgo: MEND_GAP_MS + MIN }).token)).toBe(true);
    expect(due(report("incomplete", { rounds: 3, touchedAgo: MEND_GAP_MS + MIN }).token)).toBe(true);
    expect(due(report("incomplete", { rounds: 4, touchedAgo: MEND_GAP_MS + MIN }).token)).toBe(false);
    expect(due(report("incomplete", { rounds: 2, touchedAgo: 5 * MIN }).token)).toBe(false);
  });

  it("never a preview test's, never one older than two weeks, never a finished one", () => {
    expect(due(report("retry", { session: "test:preview" }).token)).toBe(false);
    expect(due(report("retry", { createdAgo: 15 * 86_400_000 }).token)).toBe(false);
    expect(due(report("done").token)).toBe(false);
  });
});

describe("what one round does", () => {
  it("retry → done: the ordinary letter goes out (it never had)", async () => {
    const { token, email } = report("retry");
    fake.next = "done"; fake.sent.length = 0;
    const r = await mendOne(mendCandidates().find((p) => p.token === token)!, "https://yaoflow.test");
    expect(r).toMatchObject({ from: "retry", to: "done", letter: "sent" });
    expect(fake.sent).toEqual([{ to: email, subject: "你的八字深度報告寫好了", kind: "bazi" }]);
    expect(due(token)).toBe(false);
  });

  it("incomplete → done: the chapter is in, and the 「補好了」 letter the page promised goes out — once", async () => {
    const { token, email } = report("incomplete", { rounds: 2, touchedAgo: MEND_GAP_MS + MIN });
    letterSent(token);
    fake.next = "done"; fake.sent.length = 0;
    const r = await mendOne(mendCandidates().find((p) => p.token === token)!, "https://yaoflow.test");
    expect(r).toMatchObject({ from: "incomplete", to: "done", letter: "mended:sent" });
    expect(fake.sent).toEqual([{ to: email, subject: "你的八字深度報告補好了", kind: "report_mended" }]);
    // the row went back to retry for the round (the module only writes what is missing) and is done now
    expect((db().prepare("SELECT status FROM bazi_reports WHERE token = ?").get(token) as { status: string }).status).toBe("done");
    fake.sent.length = 0;
    expect(await mendOne({ sys: "bazi", token, status: "incomplete", rounds: 3, updatedAt: 0 }, "https://yaoflow.test")).toMatchObject({ letter: "mended:already" });
    expect(fake.sent).toEqual([]);
  });

  it("incomplete → still incomplete: no letter, and after its last round it is not picked again", async () => {
    const { token } = report("incomplete", { rounds: 3, touchedAgo: MEND_GAP_MS + MIN });
    letterSent(token);
    fake.next = "incomplete"; fake.sent.length = 0;
    const r = await mendOne(mendCandidates().find((p) => p.token === token)!, "https://yaoflow.test");
    expect(r).toMatchObject({ from: "incomplete", to: "incomplete", letter: "already" });
    expect(fake.sent).toEqual([]);
    db().prepare("UPDATE bazi_reports SET updated_at = ? WHERE token = ?").run(Date.now() - MEND_GAP_MS - MIN, token);
    expect(due(token)).toBe(false); // four rounds used
  });

  it("a run takes one report, the stalest first", async () => {
    for (const p of mendCandidates()) db().prepare(`UPDATE ${p.sys}_reports SET status = 'done' WHERE token = ?`).run(p.token);
    const old = report("retry", { touchedAgo: 50 * MIN });
    const young = report("retry", { touchedAgo: 10 * MIN });
    fake.next = "done"; fake.calls.length = 0;
    const out = await runReportMend("https://yaoflow.test");
    expect(out.map((r) => r.token)).toEqual([old.token]);
    expect(fake.calls).toEqual([old.token]);
    expect(due(young.token)).toBe(true);
  });
});

describe("the 「補好了」 letter", () => {
  it("names the report in the page's own script, 你們的 for a 合盤, and carries the link", () => {
    expect(buildReportMendedEmail({ sys: "bazi", kind: "deep", url: "https://y.test/zh-hant/bazi/r/x" }).subject).toBe("你的八字深度報告補好了");
    expect(buildReportMendedEmail({ sys: "ziwei", kind: "deep", url: "u", hans: true }).subject).toBe("你的紫微深度报告补好了");
    expect(buildReportMendedEmail({ sys: "astro", kind: "year", url: "u" }).subject).toBe("你的星盤年報補好了");
    expect(buildReportMendedEmail({ sys: "hepan", url: "u" }).subject).toBe("你們的合盤報告補好了");
    expect(buildReportMendedEmail({ sys: "nianshu", url: "u", hans: true }).subject).toBe("你的年书补好了");
    const m = buildReportMendedEmail({ sys: "bazi", kind: "love", url: "https://y.test/zh-hant/bazi/r/x" });
    expect(m.subject).toBe("你的正緣畫像補好了");
    expect(m.html).toContain("https://y.test/zh-hant/bazi/r/x");
    expect(m.text).toContain("https://y.test/zh-hant/bazi/r/x");
    for (const s of [m.subject, m.text]) expect(s).not.toMatch(/[準准]|AI|靈驗/);
  });
});
