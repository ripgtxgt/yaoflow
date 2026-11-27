import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * 10-23 进度表 111 ③: what a single purchase's letter carries (what was paid, the receipt), the 年書 「收到了」 letter's
 * sample, a pass bought on top of another (from when it counts), the unused days of a pass credited to a membership,
 * and the two letters around a deletion (before: what goes and the reply it needs; after: done — and no log row left).
 */
const sent: { to: string | string[]; subject: string; text: string; kind: string; id: string }[] = [];
vi.mock("../src/lib/email", async (orig) => {
  const real = await orig<typeof import("../src/lib/email")>();
  return {
    ...real,
    sendEmail: vi.fn(async (to: string | string[], subject: string, _html: string, text: string, opts: { kind: string; customerId?: number | null }) => {
      const id = `re_111c_${sent.length + 1}`;
      sent.push({ to, subject, text, kind: opts.kind, id });
      const { logMailSent } = await import("../src/lib/db");
      logMailSent({ id, kind: opts.kind, email: Array.isArray(to) ? to.join(", ") : to, subject, customerId: opts.customerId ?? null });
      return { ok: true, id };
    }),
  };
});
process.env.ADMIN_KEY = "admin-key-111c";
process.env.SITE_URL = "https://yaoflow.com";
process.env.STRIPE_SECRET_KEY = "sk_test_111c";
vi.stubGlobal("fetch", vi.fn(async (url: string | URL) => {
  const path = String(url).replace("https://api.stripe.com/v1", "");
  if (path.startsWith("/payment_intents/pi_111cA1")) return Response.json({ latest_charge: { receipt_url: "https://pay.stripe.com/receipts/111c" } });
  return new Response("{}", { status: 404 });
}));

const { db, recordOrder, upsertCustomer } = await import("../src/lib/db");
const { buildNianshuEmail, buildHepanReportEmail, buildTarotEmail, buildQianEmail, buildPassOpenEmail, buildMemberWelcomeEmail } = await import("../src/lib/email");
const { receiptFor } = await import("../src/lib/receipt");
const { tarotText } = await import("../src/lib/tarot-text");
const { passCreditNote } = await import("../src/lib/welcome");
const { autoMail, renderSample, SAMPLE_READER } = await import("../src/lib/auto-mail");
const { POST: erase } = await import("../src/app/api/admin/erase/route");
process.env.UPGRADE_CREDIT = "on"; // 10-24: the credit is off by default; these tests are about how it works when on

describe("单买的信附上已付与收据", () => {
  it("receiptFor: a paid order's amount and Stripe's receipt page (kept for next time); nothing for an included or unpaid one", async () => {
    recordOrder({ sessionId: "cs_111c_paid", customerId: null, castId: null, tier: "nianshu", amountCents: 89000, currency: "TWD", email: "r@example.com", status: "paid", paymentIntent: "pi_111cA1" });
    expect(await receiptFor("cs_111c_paid", "zh-hant")).toEqual({ amount: "NT$890", url: "https://pay.stripe.com/receipts/111c" });
    expect((db().prepare("SELECT receipt_url FROM orders WHERE session_id = 'cs_111c_paid'").get() as { receipt_url: string }).receipt_url).toBe("https://pay.stripe.com/receipts/111c");
    expect(await receiptFor("member:12", "zh-hant")).toBeNull();
    recordOrder({ sessionId: "cs_111c_zero", customerId: null, castId: null, tier: "tarot", amountCents: 0, currency: "TWD", email: "r@example.com", status: "paid", paymentIntent: null });
    expect(await receiptFor("cs_111c_zero", "zh-hant")).toBeNull();
  });
  it("the four letters carry the line when there is one, and none when there is not", () => {
    const rc = { amount: "NT$890", url: "https://pay.stripe.com/receipts/x" };
    for (const m of [buildNianshuEmail({ url: "https://u", receipt: rc }), buildHepanReportEmail({ url: "https://u", receipt: rc }), buildTarotEmail({ t: tarotText("zh-hant").mail, locale: "zh-hant", cards: "三張", url: "https://u", receipt: rc }), buildQianEmail({ num: 8, title: "x", url: "https://u", receipt: rc })]) {
      expect(m.text).toContain("已付 NT$890 · 付款收據");
      expect(m.html).toContain("https://pay.stripe.com/receipts/x");
    }
    expect(buildNianshuEmail({ url: "https://u", hans: true, receipt: rc }).text).toContain("付款收据");
    expect(buildNianshuEmail({ url: "https://u" }).text).not.toContain("收據");
  });
  it("the 年書 「收到了，寫好就寄」 letter renders (sample on /admin/letters)", async () => {
    const m = await renderSample(autoMail("nianshu_received")!, SAMPLE_READER, "https://yaoflow.com");
    expect("error" in m ? m.error : null).toBeNull();
    expect("text" in m ? m.text : "").toContain("寫好會再寄一封信給你");
  });
});

describe("通卡叠买与升会员", () => {
  it("a pass bought on top of another says from when it counts", () => {
    const m = buildPassOpenEmail({ locale: "zh-hant", name: "7 天通卡", until: "11月6日", perks: ["x"], castUrl: "https://c", servicesUrl: "https://s", queuedFrom: "10月30日" });
    expect(m.text).toContain("這張接在你手上那張通卡後面：從 10月30日 起算，到 11月6日。");
    expect(buildPassOpenEmail({ locale: "zh-hant", name: "7 天通卡", until: "11月6日", perks: ["x"], castUrl: "https://c", servicesUrl: "https://s" }).text).not.toContain("接在");
  });
  it("a membership paid partly by a pass's unused days says how much", () => {
    const m = buildMemberWelcomeEmail({ locale: "zh-hant", plan: "month", paid: "NT$249", date: "11月23日", perks: ["x"], castUrl: "https://c", manageUrl: "https://m", passCredit: "NT$100" });
    expect(m.text).toContain("你通卡剩下的天數已經折抵 NT$100");
    expect(passCreditNote({ pass_credit: "pass_abc", pass_credit_minor: "10000", pass_credit_cur: "TWD" })).toEqual({ minor: 10000, currency: "TWD" });
    expect(passCreditNote({ pass_credit: "pass_abc" })).toBeNull();
    expect(passCreditNote({})).toBeNull();
  });
});

describe("删除帐号：之前一封、之后一封", () => {
  const post = (fields: Record<string, string>) => {
    const f = new FormData();
    for (const [k, v] of Object.entries({ key: "admin-key-111c", ...fields })) f.set(k, v);
    return erase(new NextRequest("http://localhost/api/admin/erase", { method: "POST", body: f }));
  };
  it("step 1 sends the letter that says what goes and asks for a reply, deletes nothing, and is in 操作记录", async () => {
    const cid = upsertCustomer("leaving@example.com", "zh-hant");
    const r = await post({ customer_id: String(cid), step: "confirm" });
    expect(r.status).toBe(303);
    const m = sent.find((x) => x.kind === "erase")!;
    expect(m.to).toBe("leaving@example.com");
    expect(m.subject).toContain("刪除帳號前的確認");
    expect(m.text).toContain("確定刪除");
    expect(db().prepare("SELECT 1 FROM customers WHERE id = ?").get(cid)).toBeTruthy();
    expect((db().prepare("SELECT action, ok FROM admin_actions WHERE customer_id = ? ORDER BY id DESC LIMIT 1").get(cid) as { action: string }).action).toBe("erase_confirm");
  });
  it("step 2 deletes, then tells them — and that letter leaves no row behind", async () => {
    const cid = Number((db().prepare("SELECT id FROM customers WHERE email = 'leaving@example.com'").get() as { id: number }).id);
    const r = await post({ customer_id: String(cid), confirm: "leaving@example.com" });
    expect(r.status).toBe(303);
    const done = sent.filter((x) => x.kind === "erase").at(-1)!;
    expect(done.subject).toContain("帳號已刪除");
    expect(db().prepare("SELECT 1 FROM customers WHERE id = ?").get(cid)).toBeUndefined();
    expect(db().prepare("SELECT 1 FROM mail_log WHERE id = ?").get(done.id)).toBeUndefined();
    expect(db().prepare("SELECT COUNT(*) AS n FROM mail_log WHERE lower(email) = 'leaving@example.com'").get()).toEqual({ n: 0 });
  });
});
