import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { LineValue } from "@yaoflow/engine";

/**
 * 10-23 进度表 108 运营后台二期: ① every letter that goes out by itself has a sample and (where it may) a switch that
 * its run obeys; ② cases can be featured, taken down and put back, and a check-in's result set right — each kept in
 * 操作记录, a hidden case gone from the public lists at once; the day's lots; ③ the 「今天」 board counts as 105 does.
 * The mail sender is stubbed.
 */
const sent: { to: string | string[]; subject: string; kind: string }[] = [];
vi.mock("../src/lib/email", async (orig) => {
  const real = await orig<typeof import("../src/lib/email")>();
  return { ...real, sendEmail: vi.fn(async (to: string | string[], subject: string, _h: string, _t: string, opts: { kind: string }) => { sent.push({ to, subject, kind: opts.kind }); return { ok: true, id: `re_108_${sent.length}` }; }) };
});
process.env.ADMIN_KEY = "admin-key-108";
process.env.SITE_URL = "https://yaoflow.com";

const db = await import("../src/lib/db");
const sw = await import("../src/lib/letter-switch");
const { runPassNotices } = await import("../src/lib/pass-notice");
const am = await import("../src/lib/auto-mail");
const content = await import("../src/lib/content-admin");
const { publishCase } = await import("../src/lib/cases");
const { resolveServerChart } = await import("../src/lib/reading");
const { allRecords } = await import("../src/lib/outcome-records");
const { recentActions } = await import("../src/lib/admin-actions");
const { todayBoard } = await import("../src/lib/today-board");
const { chargesIn } = await import("../src/lib/admin-money");
const { deliveryCounts } = await import("../src/lib/deliveries");
const { homeDayStart } = await import("../src/lib/clock");
const { POST: lettersPost } = await import("../src/app/api/admin/letters/route");
const { POST: contentPost } = await import("../src/app/api/admin/content/route");
const { POST: revisitRun } = await import("../src/app/api/revisit/run/route");
const { POST: headsupRun } = await import("../src/app/api/headsup/run/route");

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 9, 24, 3, 0); // 11:00 Taipei
const V: LineValue[] = [7, 8, 9, 8, 7, 8];
const form = (url: string, fields: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries({ key: "admin-key-108", ...fields })) f.set(k, v);
  return new NextRequest(url, { method: "POST", body: f });
};
const back = (r: Response) => { const u = new URL(r.headers.get("location")!); return { done: u.searchParams.get("done"), failed: u.searchParams.get("failed") }; };
const cron = (url: string) => new NextRequest(url, { method: "POST", headers: { "x-cron-key": "admin-key-108" } });

describe("① 自动信件：开关", () => {
  const cid = db.upsertCustomer("o108-pass@example.org", "zh-hant");
  // a 7-day pass that ends tomorrow (Taipei) — its notice is due today
  const pass = db.upsertSubscription({ customerId: cid, stripeCustomerId: null, stripeSubscriptionId: "pass_o108seven", status: "active", plan: "month", periodStart: NOW - 6 * DAY, periodEnd: NOW + DAY, cancelAtPeriodEnd: true, currency: "TWD", amountMinor: 29900, passDays: 7 });
  const again = () => db.db().prepare("UPDATE subscriptions SET pass_notice_at = NULL WHERE id = ?").run(pass.id);

  it("every letter starts on; a letter switched off is not sent by its run, and goes again once on", async () => {
    expect(sw.LETTER_SWITCH_IDS.every((id) => sw.letterOn(id))).toBe(true);
    sw.setLetterOn("pass_notice", false, NOW);
    expect(sw.letterOn("pass_notice")).toBe(false);
    expect(sw.letterOffSince("pass_notice")).toBe(NOW);
    expect((await runPassNotices(NOW)).sent).toBe(0);
    sw.setLetterOn("pass_notice", true, NOW);
    again();
    sent.length = 0;
    expect((await runPassNotices(NOW)).sent).toBe(1);
    expect(sent[0]).toMatchObject({ to: "o108-pass@example.org", kind: "pass_notice" });
  });

  it("the switch from the page needs a reason and the tick, is kept in 操作记录, and has no switch for the letters that must go", async () => {
    expect(back(await lettersPost(form("http://localhost/api/admin/letters", { id: "revisit", on: "0", reason: "", confirm: "yes" }))).failed).toMatch(/理由/);
    expect(back(await lettersPost(form("http://localhost/api/admin/letters", { id: "revisit", on: "0", reason: "回访信要改版" }))).failed).toMatch(/确认/);
    expect(back(await lettersPost(form("http://localhost/api/admin/letters", { id: "sub_confirm", on: "0", reason: "x x", confirm: "yes" }))).failed).toMatch(/没有开关/);
    expect(back(await lettersPost(form("http://localhost/api/admin/letters", { id: "revisit", on: "0", reason: "回访信要改版", confirm: "yes" }))).done).toMatch(/回访信、回访合并信已关掉/);
    expect(sw.letterOn("revisit")).toBe(false);
    expect(recentActions(5, "letter_switch")[0]).toMatchObject({ reason: "回访信要改版", ok: 1, customer_id: null });
    // the two runners that live in routes answer 「off」 — a dry run still lists
    expect(await (await revisitRun(cron("http://localhost/api/revisit/run"))).json()).toEqual({ off: true });
    expect(await (await revisitRun(cron("http://localhost/api/revisit/run?dry=1"))).json()).not.toEqual({ off: true });
    sw.setLetterOn("headsup", false); sw.setLetterOn("dayof", false);
    expect(await (await headsupRun(cron("http://localhost/api/headsup/run"))).json()).toEqual({ off: true });
    expect(await (await headsupRun(cron("http://localhost/api/headsup/run?mode=day"))).json()).toEqual({ off: true });
    for (const id of ["revisit", "headsup", "dayof"] as const) sw.setLetterOn(id, true);
    expect(am.AUTO_MAILS.filter((m) => !m.switchId).map((m) => m.id).sort()).toEqual(["erase_confirm", "erase_done", "member_welcome", "nianshu_received", "pass_open", "refund_member", "refund_part", "sub_confirm", "sub_renew"]); // 10-23 111: money back, the 年書 receipt and the deletion letters have no switch
    // every switch on the page is one the runs know, and every switch has a letter on the page
    expect([...new Set(am.AUTO_MAILS.map((m) => m.switchId).filter(Boolean))].sort()).toEqual([...sw.LETTER_SWITCH_IDS].sort());
  });
});

describe("① 自动信件：样信与七天", () => {
  it("every letter renders for a test reader (their own cast where it uses one) and for the sample reader", async () => {
    const tid = db.upsertCustomer("o108-tester@example.org", "zh");
    db.db().prepare("UPDATE customers SET test_flag = 1 WHERE id = ?").run(tid);
    const chart = resolveServerChart({ question: "這次搬家順不順", values: V, castAtMs: NOW - 10 * DAY, tzOffsetMinutes: 480 }, true) as unknown as Record<string, unknown>;
    db.saveCast({ customerId: tid, castAtMs: NOW - 10 * DAY, tzOffsetMinutes: 480, locale: "zh", question: "這次搬家順不順", topic: "move", values: V, chart });
    const reader = am.sampleReaders().find((r) => r.id === tid)!;
    expect(reader).toMatchObject({ locale: "zh", currency: "CNY", email: "o108-tester@example.org" });
    for (const r of [reader, am.SAMPLE_READER]) {
      for (const m of am.AUTO_MAILS) {
        const out = await am.renderSample(m, r, "https://yaoflow.com", NOW);
        expect("error" in out ? `${m.id}: ${out.error}` : "ok").toBe("ok");
        if (!("error" in out)) {
          expect(out.subject.length, m.id).toBeGreaterThan(2);
          expect(out.html, m.id).toMatch(/<html/i);
        }
      }
    }
    const rv = await am.renderSample(am.autoMail("revisit")!, reader, "https://yaoflow.com", NOW);
    expect("error" in rv ? "" : rv.text).toContain("搬家"); // the reader's own cast, in 简体
  });

  it("the week: sent, opened, unsubscribed after it, bounced, failed — our test accounts left out", () => {
    const a = db.upsertCustomer("o108-a@example.org", "zh-hant");
    const t = db.upsertCustomer("o108-t@example.org", "zh-hant");
    db.db().prepare("UPDATE customers SET test_flag = 1 WHERE id = ?").run(t);
    const now = Date.now();
    db.logMailSent({ id: "re_o108_1", kind: "sub_recap", email: "o108-a@example.org", subject: "x", customerId: a });
    db.logMailSent({ id: "re_o108_2", kind: "sub_recap", email: "o108-b@example.org", subject: "x", customerId: null });
    db.logMailSent({ id: "re_o108_3", kind: "sub_recap", email: "o108-t@example.org", subject: "x", customerId: t });
    db.db().prepare("UPDATE mail_log SET opened_at = ? WHERE id = 're_o108_1'").run(now);
    db.db().prepare("UPDATE mail_log SET bounced_at = ? WHERE id = 're_o108_2'").run(now);
    db.recordUnsub("o108-a@example.org", "link", now + 60_000);
    expect(am.autoMailStats(am.autoMail("sub_recap")!, now + 120_000)).toEqual({ sent: 2, opened: 1, unsub: 1, bad: 1, failed: 0 });
    // a letter counted from its own rows (the member letters share one kind of mail)
    db.logMailSent({ id: "re_o108_ml", kind: "daily", email: "o108-a@example.org", subject: "x", customerId: a });
    db.recordEmail("ml:o108:2026-10-24", "member_letter", "o108-a@example.org", "sent", "re_o108_ml");
    db.recordEmail("ml:o108b:2026-10-24", "member_letter", "o108-b@example.org", "failed", "http 429");
    expect(am.autoMailStats(am.autoMail("member_letter")!, now + 120_000)).toMatchObject({ sent: 1, failed: 1, unsub: 1 });
    expect(am.autoMailStats(am.autoMail("daily_mail")!, now + 120_000).sent).toBe(0); // a member letter is not a 每日三卦 letter
  });
});

/** a published deep reading with its revisit, answered `outcome` */
function publicCase(sid: string, email: string, outcome?: "hit" | "miss") {
  const cid = db.upsertCustomer(email, "zh-hant");
  const at = NOW - 40 * DAY;
  const chart = resolveServerChart({ question: "合約簽得下來嗎", values: V, castAtMs: at, tzOffsetMinutes: 480 }, true) as unknown as Record<string, unknown>;
  const castId = db.saveCast({ customerId: cid, castAtMs: at, tzOffsetMinutes: 480, locale: "zh-hant", question: "合約簽得下來嗎", topic: "career", values: V, chart });
  db.saveReading(castId, cid, "deep", "zh-hant", { verdict: { zh: "能簽。" }, tendency: { zh: "x" }, timing: { zh: "10月4日到8日之間會有回覆。" }, basis: { zh: "x" }, strategy: { zh: "x" }, caution: { zh: "x" }, next_step: { zh: "x" }, closing: { zh: "x" } } as never);
  db.recordOrder({ sessionId: sid, customerId: cid, castId, tier: "deep", amountCents: 999, currency: "USD", email, status: "paid" });
  db.scheduleRevisit({ sessionId: sid, castId, customerId: cid, email, locale: "zh-hant", tier: "deep", castAtMs: at, windowDays: 14, timingQuote: "10月4日到8日之間" });
  expect(publishCase(sid, `公開說法 ${sid}`, cid).ok).toBe(true);
  const rid = (db.db().prepare("SELECT id FROM revisits WHERE session_id = ?").get(sid) as { id: number }).id;
  if (outcome) db.setRevisitOutcome(rid, outcome, { event: outcome === "hit" ? "happened" : "nothing" });
  const pid = (db.db().prepare("SELECT public_id FROM cases WHERE session_id = ?").get(sid) as { public_id: string }).public_id;
  return { cid, rid, pid };
}

describe("② 内容整理", () => {
  const a = publicCase("cs_o108_a", "o108-case-a@example.org", "hit");
  const b = publicCase("cs_o108_b", "o108-case-b@example.org");
  db.db().prepare("UPDATE cases SET published_at = published_at + 1000 WHERE public_id = ?").run(b.pid); // b is the newer one

  it("精选 puts a case first in the lists (newest pick first); taking it off puts it back in its place", () => {
    expect(db.listCases("zh-hant", 10).map((c) => c.public_id).slice(0, 2)).toEqual([b.pid, a.pid]);
    expect(content.featureCase(a.pid, true, "说得清楚", NOW)).toMatchObject({ ok: true });
    expect(db.listCases("zh-hant", 10)[0]!.public_id).toBe(a.pid);
    expect(content.adminCases("featured").map((c) => c.publicId)).toEqual([a.pid]);
    content.featureCase(a.pid, false, "换一条", NOW);
    expect(db.listCases("zh-hant", 10)[0]!.public_id).toBe(b.pid);
  });

  it("撤下 takes it off every public list at once (and out of the records); 恢复 brings it back; a withdrawal is the author's", async () => {
    expect(allRecords().some((r) => r.publicId === a.pid)).toBe(true);
    expect(back(await contentPost(form("http://localhost/api/admin/content", { op: "hide", public_id: a.pid, reason: "有个人信息", confirm: "yes" }))).done).toMatch(/撤下/);
    expect(db.caseView(a.pid)).toBeNull();
    expect(db.listCases("zh-hant", 10).some((c) => c.public_id === a.pid)).toBe(false);
    expect(allRecords().some((r) => r.publicId === a.pid)).toBe(false);
    expect(content.featureCase(a.pid, true, "x x", NOW)).toMatchObject({ ok: false });
    expect(back(await contentPost(form("http://localhost/api/admin/content", { op: "show", public_id: a.pid, reason: "已经打码", confirm: "yes" }))).done).toMatch(/恢复/);
    expect(db.caseView(a.pid)).not.toBeNull();
    db.unpublishCase("cs_o108_b");
    db.hideCase(b.pid);
    expect(content.setCaseHidden(b.pid, false, "x x")).toMatchObject({ ok: false });
    expect(back(await contentPost(form("http://localhost/api/admin/content", { op: "hide", public_id: "nope", reason: "x x", confirm: "yes" }))).failed).toMatch(/编号/);
    expect(recentActions(10, "case_hide").map((x) => JSON.parse(x.params_json).op)).toEqual(["show", "hide"]);
  });

  it("a check-in scored wrong is set right — from what, to what, why — and the public records follow", async () => {
    expect(content.recordsToCheck().find((r) => r.revisitId === a.rid)).toMatchObject({ outcome: "hit", event: "happened" });
    const before = db.db().prepare("SELECT outcome_at FROM revisits WHERE id = ?").get(a.rid) as { outcome_at: number };
    expect(back(await contentPost(form("http://localhost/api/admin/content", { op: "fix", revisit_id: String(a.rid), to: "miss", reason: "读者回信说其实没签成", confirm: "yes" }))).done).toMatch(/应了 → 没应/);
    const row = db.db().prepare("SELECT outcome, outcome_at FROM revisits WHERE id = ?").get(a.rid) as { outcome: string; outcome_at: number };
    expect(row).toEqual({ outcome: "miss", outcome_at: before.outcome_at }); // the day stays the reader's
    expect(allRecords().find((r) => r.publicId === a.pid)!.state).toBe("miss");
    expect(content.recordsToCheck().find((r) => r.revisitId === a.rid)!.fixed).toMatchObject({ from: "hit", to: "miss", reason: "读者回信说其实没签成" });
    expect(content.fixOutcome(a.rid, "miss", "x x")).toMatchObject({ ok: false });
    expect(back(await contentPost(form("http://localhost/api/admin/content", { op: "fix", revisit_id: String(a.rid), to: "great", reason: "x x", confirm: "yes" }))).failed).toMatch(/状态/);
    expect(content.fixOutcome(a.rid, null, "还没答，先放回去").ok).toBe(true);
    expect(allRecords().find((r) => r.publicId === a.pid)!.state).toBe("pending");
    expect(recentActions(10, "outcome_fix")[0]).toMatchObject({ customer_id: a.cid, ok: 1 });
  });

  it("今日一籤: each day's draws, people and most-drawn lots", () => {
    db.db().exec("CREATE TABLE IF NOT EXISTS tq_draws (subject TEXT NOT NULL, day TEXT NOT NULL, set_id TEXT NOT NULL, num INTEGER NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (subject, day))");
    const ins = db.db().prepare("INSERT INTO tq_draws (subject, day, set_id, num, at) VALUES (?, ?, ?, ?, ?)");
    ins.run("c:1", "2026-10-23", "liushi-jiazi", 7, NOW - DAY); ins.run("b:x", "2026-10-23", "liushi-jiazi", 7, NOW - DAY); ins.run("c:2", "2026-10-23", "liushi-jiazi", 12, NOW - DAY);
    ins.run("c:1", "2026-10-24", "liushi-jiazi", 30, NOW);
    const days = content.todayQianDays(30, 5, NOW);
    expect(days.map((d) => d.day)).toEqual(["2026-10-24", "2026-10-23"]);
    expect(days[1]).toMatchObject({ draws: 3, people: 3, lots: 2 });
    expect(days[1]!.top[0]).toMatchObject({ num: 7, n: 2 });
    expect(days[1]!.top[0]!.title).toMatch(/第 7 籤/);
  });
});

describe("③ 今天", () => {
  it("counts as 105 does, and every alarm points somewhere", () => {
    const now = Date.now();
    const since = homeDayStart(now);
    const cid = db.upsertCustomer("o108-today@example.org", "zh-hant");
    db.recordOrder({ sessionId: "cs_o108_today", customerId: cid, castId: null, tier: "pass_1d", amountCents: 9900, currency: "TWD", email: "o108-today@example.org", status: "paid" });
    const t = todayBoard(now + 1000);
    expect(t.charges).toEqual(chargesIn(since, now + 1000));
    expect(t.charges.passes.d1).toBeGreaterThanOrEqual(1);
    expect(t.deliveries).toEqual(deliveryCounts(since, now + 1000));
    expect(t.people.newAccounts).toBeGreaterThanOrEqual(1);
    expect(t.alerts.map((a) => a.id)).toEqual(["mail_fail", "bounce", "checkout", "caps", "server"]);
    expect(t.alerts.every((a) => a.href.startsWith("/admin"))).toBe(true);
    db.logMailSent({ id: "re_o108_fail", kind: "reading", email: "o108-today@example.org", subject: "x", customerId: cid });
    db.db().prepare("UPDATE mail_log SET failed_at = ? WHERE id = 're_o108_fail'").run(now);
    expect(todayBoard(now + 2000).alerts.find((a) => a.id === "mail_fail")!.level).toBe("watch");
  });

  it("10-30: a GA read that timed out is fixed once a later read went through", async () => {
    const { splitErrors } = await import("../src/lib/today-board");
    const since = Date.now() - 1000;
    db.db().exec("CREATE TABLE IF NOT EXISTS ga_reports (key TEXT PRIMARY KEY, json TEXT, at INTEGER)");
    db.recordOps("ga_data_fail", "The operation was aborted due to timeout");
    const label = (xs: { label: string }[]) => xs.map((x) => x.label).join("|");
    expect(label(splitErrors(since).open)).toContain("GA 数据读不到");
    db.db().prepare("INSERT INTO ga_reports (key, json, at) VALUES ('all', '{}', ?) ON CONFLICT(key) DO UPDATE SET at = excluded.at").run(Date.now() + 5);
    const after = splitErrors(since);
    expect(label(after.open)).not.toContain("GA");
    expect(label(after.healed)).toContain("GA 数据读取超时，下一次已读到");
  });

  it("10-23 (Neil: 「这些我要怎么处理呢」): the server card says what fixed itself and lights only for what did not", async () => {
    const { splitErrors } = await import("../src/lib/today-board");
    const { createReport, factsFromBirth, birthFromBody } = await import("../src/lib/mingli/bazi/report");
    const since = homeDayStart(Date.now());
    const sum = (xs: { n: number }[]) => xs.reduce((a, x) => a + x.n, 0);
    const before = splitErrors(since);
    // a report chapter refused by the checks and written again: done now → fixed; one whose report is not done → open
    const place = { id: "1668341", name: "Taipei Daan", lat: 25.03, lon: 121.54, tz: "Asia/Taipei" };
    const b = birthFromBody({ calendar: "solar", y: 1990, m: 5, d: 17, leap: false, timeMode: "exact", h: 12, mi: 30, place }, "female");
    if ("error" in b) throw new Error(b.error);
    const facts = factsFromBirth(b.n, "female", "deep");
    const done = createReport({ kind: "deep", locale: "zh-hant", register: null, customerId: null, email: null, facts, paid: { session: "member:1", amountMinor: 0 } }).token;
    const writing = createReport({ kind: "deep", locale: "zh-hant", register: null, customerId: null, email: null, facts, paid: { session: "member:1", amountMinor: 0 }, salt: "o108" }).token;
    db.db().prepare("UPDATE bazi_reports SET status = 'done' WHERE token = ?").run(done);
    db.db().prepare("UPDATE bazi_reports SET status = 'writing' WHERE token = ?").run(writing);
    db.recordOps("bazi_report_part_fail", `${done.slice(-6)} deep A short:xingge`);
    db.recordOps("bazi_report_part_fail", `${writing.slice(-6)} deep B medical:處方`);
    db.recordOps("wallet_sweep_fail", "The operation was aborted due to timeout");
    db.recordOps("teaser_fail", "three slips → fallback");
    const mid = splitErrors(since);
    expect(sum(mid.healed) - sum(before.healed)).toBe(3);
    expect(mid.healed.map((x) => x.label)).toEqual(expect.arrayContaining(["报告章节重写，已写完", "付款扫单下一分钟重扫", "免费摘要用了备用文字"]));
    expect(mid.open.find((x) => x.label.startsWith("报告还在补写"))?.n).toBeGreaterThanOrEqual(1);
    db.db().prepare("UPDATE bazi_reports SET status = 'done' WHERE token = ?").run(writing);
    expect(sum(splitErrors(since).open)).toBe(sum(before.open));
    // 10-24: 「…_report_incomplete」 writes 「deep <tail> missing B」 — a done report is fixed, not 「还在补写」
    db.recordOps("bazi_report_incomplete", `deep ${done.slice(-6)} missing B`);
    expect(sum(splitErrors(since).open)).toBe(sum(before.open));
    // 10-24: a 命盘问答 answer refused by the checks is not kept nor counted — the reader sees 「再試一次」; nothing to do
    db.recordOps("mingli_qa_fail", "astro medical:處方");
    expect(sum(splitErrors(since).open)).toBe(sum(before.open));
    expect(splitErrors(since).healed.some((x) => x.label.startsWith("命盘问答有一题没答成"))).toBe(true);
    // a reader left without their paid reading is named in plain words
    db.recordOps("tarot_personal_fail", "zzzzzz cards");
    const after = splitErrors(since);
    expect(after.open.find((x) => x.label === "塔罗个人解读没写出来")?.n).toBeGreaterThanOrEqual(1);
    const server = todayBoard(Date.now() + 1000).alerts.find((a) => a.id === "server")!;
    expect(server.level).not.toBe("ok");
    expect(server.line).toContain("要看：");
    expect(server.line).toContain("已自动补上");
    expect(server.line).not.toMatch(/mingli_qa_fail|tarot_personal_fail|wallet_sweep_fail|bazi_report_part_fail/); // in words, not kinds
  });

  it("10-23: bounces are a share of what was sent — a mass-letter day reads calm; spam complaints at 0.3% read red", () => {
    const at = Date.now();
    for (let i = 0; i < 600; i++) db.logMailSent({ id: `re_o108_mass_${i}`, kind: "announce_1023", email: `o108-mass-${i}@example.org`, subject: "x" });
    for (let i = 0; i < 4; i++) db.db().prepare("UPDATE mail_log SET bounced_at = ? WHERE id = ?").run(at, `re_o108_mass_${i}`);
    const calm = todayBoard(at + 1000).alerts.find((a) => a.id === "bounce")!;
    expect(calm.level).toBe("watch");
    expect(calm.line).toMatch(/占今天寄出 \d+ 封的 \d+\.\d%/);
    expect(calm.line).toContain("以后群发自动跳过");
    for (let i = 4; i < 7; i++) db.db().prepare("UPDATE mail_log SET complained_at = ? WHERE id = ?").run(at, `re_o108_mass_${i}`);
    expect(todayBoard(at + 2000).alerts.find((a) => a.id === "bounce")!.level).toBe("bad");
  });
});
