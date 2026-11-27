import { describe, expect, it, vi } from "vitest";

/**
 * 10-23 进度表 112 年书早鸟信: who gets it (the 10-23 announcement's readers, each once for this letter, less a 2027 年書
 * buyer), what it says (early-bird next to the full price, in their money; the one-click unsubscribe), and when it may go
 * (tests to the owner any time; the batches only from 11/1 10:00 Taipei, in the Taipei day). The sender is stubbed.
 */
const sent: { to: string | string[]; subject: string; text: string; kind: string; unsub?: string | null }[] = [];
vi.mock("../src/lib/email", async (orig) => {
  const real = await orig<typeof import("../src/lib/email")>();
  return { ...real, sendEmail: vi.fn(async (to: string | string[], subject: string, _h: string, text: string, opts: { kind: string; unsubUrl?: string | null }) => { sent.push({ to, subject, text, kind: opts.kind, unsub: opts.unsubUrl }); return { ok: true, id: `re_112_${sent.length}` }; }) };
});
process.env.REVISIT_SECRET ??= "secret-112";
process.env.DIGEST_TO = "owner112@yaoflow.test";

const { db, upsertCustomer } = await import("../src/lib/db");
const { COMMERCIAL_KINDS } = await import("../src/lib/email");
const { planNianshuEarly, sendNianshuEarly, sendNianshuEarlyTests, earlyMailFor, NIANSHU_EARLY_FROM, NIANSHU_EARLY_KIND } = await import("../src/lib/nianshu-early-1101");

const reader = (email: string, locale = "zh-hant") => { const id = upsertCustomer(email, locale); db().prepare("UPDATE customers SET marketing_ok = 1, tz = 'Asia/Taipei' WHERE id = ?").run(id); return id; };

describe("收件人", () => {
  it("the announcement's readers, less a 2027 年書 buyer; not the ones already sent this letter", async () => {
    reader("early-a@reader112.net");
    const b = reader("early-b@reader112.net");
    reader("early-c@reader112.net", "zh");
    const { nianshuOfChild } = await import("../src/lib/mingli/nianshu/report");
    nianshuOfChild("bazi", "make-the-table"); // the 年書 table is made on first use
    db().prepare("INSERT INTO nianshu_reports (token, locale, customer_id, year, chart_json, input_hash, paid_at, email, created_at) VALUES ('tok112b', 'zh-hant', ?, 2027, '{}', 'h', ?, 'early-b@reader112.net', ?)").run(b, Date.now(), Date.now());
    const plan = planNianshuEarly();
    const emails = plan.recipients.map((r) => r.email);
    expect(emails).toContain("early-a@reader112.net");
    expect(emails).toContain("early-c@reader112.net");
    expect(emails).not.toContain("early-b@reader112.net");
    expect(plan.skipped.bought_2027).toBe(1);
    // the 10-23 announcement having gone to them does not count as this letter
    db().prepare("INSERT INTO emails (session_id, kind, email, sent_at, status) VALUES ('announce:early-a@reader112.net', 'announce_1023', 'early-a@reader112.net', ?, 'sent')").run(Date.now());
    expect(planNianshuEarly().recipients.map((r) => r.email)).toContain("early-a@reader112.net");
  });
});

describe("信", () => {
  it("early-bird next to the full price in the reader's money, the link with its source, one-click unsubscribe", () => {
    const m = earlyMailFor({ email: "x@reader112.net", locale: "zh-hant", currency: "TWD" }, "https://yaoflow.com");
    expect(m.subject).toContain("2027 年書開賣");
    expect(m.text).toContain("早鳥價 NT$890（原價 NT$1,190）");
    expect(m.text).toContain("https://yaoflow.com/zh-hant/nianshu?c=nianshu-early");
    expect(m.text).toContain("一鍵退訂");
    const hans = earlyMailFor({ email: "y@reader112.net", locale: "zh", currency: "CNY" }, "https://yaoflow.com");
    expect(hans.text).toContain("早鸟价 ¥128（原价 ¥168）");
    expect(COMMERCIAL_KINDS.has(NIANSHU_EARLY_KIND as never)).toBe(true);
  });
  it("the tests go to the owner only, and record nothing", async () => {
    sent.length = 0;
    expect((await sendNianshuEarlyTests("https://yaoflow.com")).sent).toBe(4);
    expect(sent.every((m) => JSON.stringify(m.to).includes("owner112@yaoflow.test"))).toBe(true);
    expect(sent.every((m) => m.subject.startsWith("[测试"))).toBe(true);
    expect(db().prepare("SELECT COUNT(*) AS n FROM emails WHERE kind = ?").get(NIANSHU_EARLY_KIND)).toEqual({ n: 0 });
  });
});

describe("什么时候能寄", () => {
  it("not before 11/1 10:00 Taipei, not at night; from then on each address once", async () => {
    expect((await sendNianshuEarly("https://yaoflow.com", { now: NIANSHU_EARLY_FROM - 60_000, pace: 0 })).refused).toBe("before_1101");
    expect((await sendNianshuEarly("https://yaoflow.com", { now: NIANSHU_EARLY_FROM + 12 * 3_600_000, pace: 0 })).refused).toBe("night");
    sent.length = 0;
    const r = await sendNianshuEarly("https://yaoflow.com", { now: NIANSHU_EARLY_FROM + 60_000, pace: 0, limit: 50 });
    expect(r.refused).toBeUndefined();
    expect(sent.filter((m) => m.kind === NIANSHU_EARLY_KIND).map((m) => m.to)).toEqual(expect.arrayContaining(["early-a@reader112.net", "early-c@reader112.net"]));
    expect(sent.every((m) => !!m.unsub)).toBe(true);
    sent.length = 0;
    await sendNianshuEarly("https://yaoflow.com", { now: NIANSHU_EARLY_FROM + 120_000, pace: 0, limit: 50 });
    expect(sent.filter((m) => m.to === "early-a@reader112.net")).toHaveLength(0);
  });
});
