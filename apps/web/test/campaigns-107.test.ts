import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * 10-23 进度表 107 ③ 分群与群发: who a segment reaches (and the fixed exclusions: ours, the unreachable, the unsubscribed,
 * consent-only places without a yes), the letter per reader (their groups' parts, prices in their money), test letters
 * to us only, a schedule only after a test, batches that never write to an address twice, and a stop that holds.
 * The mail sender is stubbed — nothing leaves.
 */
const sent: { to: string | string[]; subject: string; html: string; text: string; kind: string; unsub?: string | null; sessionId?: string | null }[] = [];
let failFor: string | null = null;
vi.mock("../src/lib/email", async (orig) => {
  const real = await orig<typeof import("../src/lib/email")>();
  return {
    ...real,
    sendEmail: vi.fn(async (to: string | string[], subject: string, html: string, text: string, opts: { kind: string; unsubUrl?: string | null; sessionId?: string | null }) => {
      if (failFor && to === failFor) { failFor = null; return { ok: false, error: "http 429" }; }
      sent.push({ to, subject, html, text, kind: opts.kind, unsub: opts.unsubUrl, sessionId: opts.sessionId });
      return { ok: true, id: `re_c107_${sent.length}` };
    }),
  };
});

process.env.ADMIN_KEY = "admin-key-107c";
process.env.SITE_URL = "https://yaoflow.com";
process.env.DIGEST_TO = "owner107@example.net";

const db = await import("../src/lib/db");
const camp = await import("../src/lib/campaigns");
const { createDraw } = await import("../src/lib/tarot");
const { ensureInboxTable } = await import("../src/lib/inbound");
const { formatMoney, TONGKA_PRICES } = await import("../src/lib/money");
const { recentActions } = await import("../src/lib/admin-actions");
const { POST } = await import("../src/app/api/admin/campaigns/route");
const { POST: runPost } = await import("../src/app/api/admin/campaigns/run/route");

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 9, 24, 3, 0);   // 11:00 Taipei
const NIGHT = Date.UTC(2026, 9, 24, 15, 0); // 23:00 Taipei

function customer(email: string, locale: string, tz: string | null, extra: { test?: boolean; marketing?: number; marketingAt?: number | null; seen?: number } = {}): number {
  const id = db.upsertCustomer(email, locale);
  db.db().prepare("UPDATE customers SET tz = ?, test_flag = ?, marketing_ok = ?, marketing_at = ?, last_seen = ? WHERE id = ?")
    .run(tz, extra.test ? 1 : 0, extra.marketing ?? 0, extra.marketingAt ?? null, extra.seen ?? NOW - DAY, id);
  return id;
}
function sub(cid: number, sid: string, cur: string, o: { closing?: boolean; endsIn?: number; amount?: number } = {}) {
  db.upsertSubscription({
    customerId: cid, stripeCustomerId: `cus_${sid.replace(/[^A-Za-z0-9]/g, "")}`, stripeSubscriptionId: sid, status: "active", plan: "month",
    periodStart: NOW - 5 * DAY, periodEnd: NOW + (o.endsIn ?? 25) * DAY, cancelAtPeriodEnd: sid.startsWith("pass_") || !!o.closing, currency: cur, amountMinor: o.amount ?? 26900,
    ...(sid.startsWith("pass_") ? { passDays: 7 } : {}),
  });
}

const m1 = customer("c107-renewing@example.org", "zh-hant", "Asia/Taipei");
sub(m1, "sub_c107renew", "TWD");
const m2 = customer("c107-closing@example.org", "zh", "Asia/Shanghai");
sub(m2, "sub_c107close", "CNY", { closing: true });
const p1 = customer("c107-pass-ending@example.org", "zh-hant", "Asia/Hong_Kong");
sub(p1, "pass_c107ending", "HKD", { endsIn: 2, amount: 9900 });
const p2 = customer("c107-pass-long@example.org", "zh-hant", "Asia/Taipei");
sub(p2, "pass_c107long", "TWD", { endsIn: 10, amount: 29900 });
const once = customer("c107-once@example.org", "zh-hant", "Asia/Taipei", { seen: NOW - 40 * DAY });
db.recordOrder({ sessionId: "cs_c107_once", customerId: once, castId: null, tier: "deep", amountCents: 9900, currency: "TWD", email: "c107-once@example.org", status: "paid" });
const free = customer("c107-free@example.org", "zh", "Asia/Shanghai");
createDraw({ question: "他會回來嗎", spread: 3, locale: "zh", bid: "c107bid000000001", customerId: free, register: null }, NOW - DAY);
const berlinYes = customer("c107-berlin-yes@example.org", "zh-hant", "Europe/Berlin", { marketing: 1, marketingAt: NOW - DAY });
// never written to
customer("c107-tester@example.org", "zh-hant", "Asia/Taipei", { test: true });
customer("owner107@example.net", "zh", "Asia/Taipei");
customer("someone@yaoflow.com", "zh-hant", null);
customer("c107-bounced@example.org", "zh-hant", "Asia/Taipei");
db.logMailSent({ id: "re_c107_bounce", kind: "reading", email: "c107-bounced@example.org", subject: "x" });
db.db().prepare("UPDATE mail_log SET bounced_at = ? WHERE id = 're_c107_bounce'").run(NOW - DAY);
customer("c107-unsub@example.org", "zh-hant", "Asia/Taipei", { marketing: 0, marketingAt: NOW - DAY });
customer("c107-berlin@example.org", "zh-hant", "Europe/Berlin");
const bulk = Array.from({ length: 12 }, (_, i) => customer(`c107-bulk${String(i).padStart(2, "0")}@example.org`, i % 2 ? "zh" : "zh-hant", i % 2 ? "Asia/Shanghai" : "Asia/Taipei"));

const emails = (seg: Partial<import("../src/lib/campaigns").Segment>) => camp.audience({ ...camp.DEFAULT_SEGMENT, ...seg }, NOW).recipients.map((r) => r.email).filter((e) => e.startsWith("c107-") && !e.includes("bulk")).sort();

describe("圈人", () => {
  it("everyone who can be written to — never ours, the unreachable, the unsubscribed, or a consent-only place without a yes", () => {
    const a = camp.audience(camp.DEFAULT_SEGMENT, NOW);
    expect(emails({})).toEqual([
      "c107-berlin-yes@example.org", "c107-closing@example.org", "c107-free@example.org", "c107-once@example.org", "c107-pass-ending@example.org", "c107-pass-long@example.org", "c107-renewing@example.org",
    ]);
    expect(a.recipients.some((r) => r.email === "owner107@example.net" || r.email.endsWith("@yaoflow.com") || r.email === "c107-tester@example.org")).toBe(false);
    expect(a.skipped).toMatchObject({ bounced_or_complained: 1, unsubscribed: 1, consent_region: 1 });
    expect(a.skipped.internal_or_test).toBeGreaterThanOrEqual(3);
    expect(a.recipients.length).toBe(7 + 12);
  });
  it("by what they are to us now", () => {
    expect(emails({ standing: "member_renewing" })).toEqual(["c107-renewing@example.org"]);
    expect(emails({ standing: "member_closing" })).toEqual(["c107-closing@example.org"]);
    expect(emails({ standing: "pass_now" })).toEqual(["c107-pass-ending@example.org", "c107-pass-long@example.org"]);
    expect(emails({ standing: "pass_ending", days: 3 })).toEqual(["c107-pass-ending@example.org"]);
    expect(emails({ standing: "pass_ending", days: 14 })).toEqual(["c107-pass-ending@example.org", "c107-pass-long@example.org"]);
    expect(emails({ standing: "paid_once_lapsed", days: 30 })).toEqual(["c107-once@example.org"]);
    expect(emails({ standing: "paid_once_lapsed", days: 60 })).toEqual([]);
    expect(emails({ standing: "free_only" })).toEqual(["c107-berlin-yes@example.org", "c107-free@example.org"]);
  });
  it("by language, money and product used", () => {
    expect(emails({ locale: "zh" })).toEqual(["c107-closing@example.org", "c107-free@example.org"]);
    expect(emails({ currency: "CNY" })).toEqual(["c107-closing@example.org", "c107-free@example.org"]);
    expect(emails({ currency: "HKD" })).toEqual(["c107-pass-ending@example.org"]);
    expect(emails({ product: "tarot" })).toEqual(["c107-free@example.org"]);
    const r = camp.audience(camp.DEFAULT_SEGMENT, NOW).recipients.find((x) => x.email === "c107-renewing@example.org")!;
    expect(r).toMatchObject({ locale: "zh-hant", currency: "TWD", member: true, pass: false, paid: true });
  });
  it("segmentFrom keeps only what it knows", () => {
    expect(camp.segmentFrom({ standing: "nope", days: "9999", locale: "en", currency: "twd", product: "x" })).toEqual({ standing: "all", days: 365, locale: "all", currency: "all", product: "all" });
    expect(camp.segmentLine({ standing: "pass_ending", days: 5, locale: "zh", currency: "CNY", product: "tarot" })).toBe("通卡 5 天内到期 · 简体 · CNY · 用过塔罗");
  });
});

describe("信的内容", () => {
  const body = "各位好\n\n【只给会员】會員段落【/只给】\n\n【只給沒付過錢】還沒付過錢的段落【/只給】\n\n7 天通卡 {7天通卡}";
  it("each reader: their groups' parts only, the price in their money", () => {
    const member = camp.fillBody(body, { member: true, pass: false, paid: true, currency: "TWD", locale: "zh-hant" });
    expect(member).toContain("會員段落");
    expect(member).not.toContain("還沒付過錢的段落");
    expect(member).toContain(formatMoney("TWD", TONGKA_PRICES[7].TWD, "zh-hant"));
    const nobody = camp.fillBody(body, { member: false, pass: false, paid: false, currency: "CNY", locale: "zh" });
    expect(nobody).not.toContain("會員段落");
    expect(nobody).toContain("還沒付過錢的段落");
    expect(nobody).toContain(formatMoney("CNY", TONGKA_PRICES[7].CNY, "zh"));
    expect(nobody).not.toMatch(/\n{3,}/);
  });
  it("marks it does not know are named before anything is sent", () => {
    expect(camp.unknownMarks(body)).toEqual([]);
    expect(camp.unknownMarks("{價錢} 【只给老客】x【/只给】 【只给会员】y")).toEqual(["{價錢}", "【只给老客】", "【只给】没有成对"]);
  });
  it("the letter carries the unsubscribe; 简体 readers get it converted unless written", () => {
    const c = { subject_hant: "爻流十一月的消息", subject_hans: null, body_hant: "這個月會員有新東西。", body_hans: null };
    const m = camp.campaignMail(c, { email: "x@example.org", locale: "zh", currency: "CNY", member: true, pass: false, paid: true }, "https://yaoflow.com");
    expect(m.subject).toBe("爻流十一月的消息");
    expect(m.text).toContain("这个月会员有新东西");
    expect(m.html).toContain("/api/unsub?e=x%40example.org");
  });
});

describe("寄出：先寄自己、排时间、分批", () => {
  it("a schedule needs a test letter first, and again after an edit; marks it does not know stop it", async () => {
    const id = camp.saveCampaign({ name: "测试一", segment: camp.DEFAULT_SEGMENT, subjectHant: "爻流的消息", bodyHant: "大家好\n\n【只给会员】會員段【/只给】", perRun: 10 }, NOW);
    expect(camp.scheduleCampaign(id, NOW, NOW)).toMatchObject({ ok: false, error: "not_tested" });
    sent.length = 0;
    expect((await camp.testCampaign(id, "https://yaoflow.com", NOW)).sent).toBe(2);
    expect(sent.map((m) => m.to)).toEqual([["owner107@example.net"], ["owner107@example.net"]]);
    expect(sent.every((m) => m.kind === "test")).toBe(true);
    expect(sent[0]!.subject).toMatch(/^\[测试·繁体·会员＋通卡\] /);
    expect(sent[0]!.text).toContain("會員段");
    expect(sent[1]!.subject).toMatch(/^\[测试·简体·没付过钱\] /);
    expect(sent[1]!.text).not.toContain("会员段");
    camp.saveCampaign({ id, name: "测试一", segment: camp.DEFAULT_SEGMENT, subjectHant: "爻流的消息", bodyHant: "改過了 {價錢}", perRun: 10 }, NOW);
    expect(camp.campaign(id)!.tested_at).toBeNull();
    await camp.testCampaign(id, "https://yaoflow.com", NOW);
    expect(camp.scheduleCampaign(id, NOW, NOW)).toMatchObject({ ok: false, error: "unknown_marks" });
  });

  it("batches of per_run, Taipei day only; every address once; an unsubscribe between batches holds; a failure is tried again", async () => {
    const id = camp.saveCampaign({ name: "分批", segment: camp.DEFAULT_SEGMENT, subjectHant: "爻流的消息", bodyHant: "大家好", perRun: 10 }, NOW);
    await camp.testCampaign(id, "https://yaoflow.com", NOW);
    expect(camp.scheduleCampaign(id, NOW, NOW)).toMatchObject({ ok: true, planned: 19 });
    sent.length = 0;
    expect(await camp.runCampaigns("https://yaoflow.com", { now: NIGHT, pace: 0, only: id })).toEqual([]); // 23:00 Taipei: nothing
    failFor = "c107-bulk00@example.org";
    const first = await camp.runCampaigns("https://yaoflow.com", { now: NOW, pace: 0, only: id });
    expect(first).toEqual([{ id, sent: 9, failed: 1, left: 9 }]);
    expect(camp.campaign(id)!.status).toBe("sending");
    // someone unsubscribes before the next batch
    const notYet = camp.audience(camp.DEFAULT_SEGMENT, NOW).recipients.map((r) => r.email).find((e) => !sent.some((m) => m.to === e) && e !== "c107-bulk00@example.org")!;
    db.recordUnsub(notYet, "link", NOW);
    const second = await camp.runCampaigns("https://yaoflow.com", { now: NOW + 600_000, pace: 0, only: id });
    expect(second).toEqual([{ id, sent: 9, failed: 0, left: 0 }]); // 8 left after the unsubscribe, plus the one that failed
    expect(sent.some((m) => m.to === notYet)).toBe(false);
    expect(sent.filter((m) => m.to === "c107-bulk00@example.org")).toHaveLength(1);
    const to = sent.map((m) => m.to as string);
    expect(new Set(to).size).toBe(to.length);
    expect(to.some((e) => e === "owner107@example.net" || e.endsWith("@yaoflow.com") || e === "c107-tester@example.org" || e === "c107-unsub@example.org" || e === "c107-berlin@example.org")).toBe(false);
    expect(sent.every((m) => m.kind === "campaign" && m.unsub?.includes("/api/unsub?e=") && m.sessionId === `campaign:${id}:${m.to}`)).toBe(true);
    expect(camp.campaign(id)).toMatchObject({ status: "done", sent: 18, failed: 0 });
    expect(await camp.runCampaigns("https://yaoflow.com", { now: NOW + 1_200_000, pace: 0, only: id })).toEqual([]); // done: not picked again
  });

  it("stopped: what has not gone out stays unsent", async () => {
    const id = camp.saveCampaign({ name: "要停的", segment: { ...camp.DEFAULT_SEGMENT, locale: "zh" }, subjectHant: "爻流的消息", bodyHant: "大家好", perRun: 10 }, NOW);
    await camp.testCampaign(id, "https://yaoflow.com", NOW);
    camp.scheduleCampaign(id, NOW + 3_600_000, NOW);
    expect(await camp.runCampaigns("https://yaoflow.com", { now: NOW, pace: 0, only: id })).toEqual([]); // not yet its time
    expect(camp.stopCampaign(id, NOW)).toBe(true);
    expect(await camp.runCampaigns("https://yaoflow.com", { now: NOW + 7_200_000, pace: 0, only: id })).toEqual([]);
    expect(camp.campaign(id)).toMatchObject({ status: "stopped", sent: 0 });
    expect(camp.stopCampaign(id, NOW)).toBe(false);
  });

  it("the record: opened, unsubscribed and replies among its own recipients", () => {
    const c = camp.campaigns().find((x) => x.name === "分批")!;
    const a = "c107-renewing@example.org", b = "c107-free@example.org";
    db.logMailSent({ id: "re_c107_open1", kind: "campaign", email: a, subject: "x", sessionId: `campaign:${c.id}:${a}` });
    db.logMailSent({ id: "re_c107_open2", kind: "campaign", email: b, subject: "x", sessionId: `campaign:${c.id}:${b}` });
    db.db().prepare("UPDATE mail_log SET opened_at = ? WHERE id IN ('re_c107_open1', 're_c107_open2')").run(NOW + 60_000);
    db.recordUnsub(b, "link", NOW + 120_000);
    ensureInboxTable();
    db.db().prepare("INSERT INTO support_inbox (id, received_at, from_addr, subject) VALUES ('in_c107', ?, ?, '回信')").run(NOW + 180_000, a.toUpperCase());
    expect(camp.campaignStats(c)).toEqual({ sent: 18, failed: 0, opened: 2, unsubs: 1, replies: 1 });
  });
});

describe("后台表单（/api/admin/campaigns）与定时", () => {
  const post = (fields: Record<string, string>) => {
    const f = new FormData();
    for (const [k, v] of Object.entries({ key: "admin-key-107c", ...fields })) f.set(k, v);
    return POST(new NextRequest("http://localhost/api/admin/campaigns", { method: "POST", body: f }));
  };
  const back = (r: Response) => { const u = new URL(r.headers.get("location")!); return { id: Number(u.searchParams.get("id")) || null, done: u.searchParams.get("done"), failed: u.searchParams.get("failed") }; };

  it("save → test → schedule (box ticked, the count typed again, a reason) → stop; each step in 操作记录", async () => {
    expect(back(await post({ op: "save", name: "表单", subject_hant: "", body_hant: "x" })).failed).toMatch(/主旨/);
    const saved = back(await post({ op: "save", name: "表单", standing: "member_renewing", locale: "all", currency: "all", product: "all", subject_hant: "給會員", body_hant: "會員好", per_run: "50" }));
    expect(saved.done).toMatch(/草稿/);
    const id = String(saved.id);
    expect(camp.segmentOf(camp.campaign(Number(id))!)).toMatchObject({ standing: "member_renewing" });
    expect(back(await post({ op: "schedule", id, confirm: "yes", confirm_count: "1", reason: "十一月提醒" })).failed).toMatch(/测试/);
    expect(back(await post({ op: "test", id })).done).toMatch(/测试信 2 封/);
    const n = camp.audience(camp.segmentOf(camp.campaign(Number(id))!)).recipients.length;
    expect(back(await post({ op: "schedule", id, confirm_count: String(n), reason: "十一月提醒" })).failed).toMatch(/确认/);
    expect(back(await post({ op: "schedule", id, confirm: "yes", confirm_count: String(n + 5), reason: "十一月提醒" })).failed).toMatch(/对得上/);
    expect(back(await post({ op: "schedule", id, confirm: "yes", confirm_count: String(n), reason: "" })).failed).toMatch(/为什么/);
    const ok = back(await post({ op: "schedule", id, confirm: "yes", confirm_count: String(n), reason: "十一月提醒", at: "2030-01-02T10:30" }));
    expect(ok.done).toMatch(/排好了/);
    expect(camp.campaign(Number(id))).toMatchObject({ status: "scheduled", scheduled_at: Date.UTC(2030, 0, 2, 2, 30), planned: n });
    expect(back(await post({ op: "save", id, name: "表单", subject_hant: "改", body_hant: "改" })).failed).toMatch(/不能改/);
    expect(back(await post({ op: "stop", id, reason: "先不寄" })).done).toMatch(/停了/);
    const copy = back(await post({ op: "copy", id }));
    expect(camp.campaign(copy.id!)).toMatchObject({ status: "draft", name: "表单（复制）", subject_hant: "給會員" });
    const log = recentActions(50, "campaign").filter((a) => JSON.parse(a.params_json).campaign === Number(id) || JSON.parse(a.params_json).campaign === id);
    // the refusals before the tick, the count and the reason never reached the campaign; the one without a test did
    expect(log.map((a) => [JSON.parse(a.params_json).op, a.ok])).toEqual([["stop", 1], ["schedule", 1], ["test", 1], ["schedule", 0]]);
    expect(log.find((a) => JSON.parse(a.params_json).op === "schedule" && a.ok === 1)).toMatchObject({ reason: "十一月提醒", customer_id: null });
  });

  it("the cron route needs the key", async () => {
    expect((await runPost(new NextRequest("http://localhost/api/admin/campaigns/run", { method: "POST" }))).status).toBe(403);
    const r = await runPost(new NextRequest("http://localhost/api/admin/campaigns/run", { method: "POST", headers: { "x-cron-key": "admin-key-107c" } }));
    expect(r.status).toBe(200);
    expect(Array.isArray(((await r.json()) as { ran: unknown[] }).ran)).toBe(true);
  });
});
