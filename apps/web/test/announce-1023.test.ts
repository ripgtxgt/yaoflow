import { describe, expect, it, vi } from "vitest";
import type { LineValue } from "@yaoflow/engine";

/**
 * 10-23 进度表 103 公告信: who gets it (every reader address but ours, the unreachable, the unsubscribed, those who said
 * no, consent-only places without a yes, and save-to-mailbox addresses that were promised one reminder only), in whose
 * money, with which of the two personal lines — and each address once. Resend is stubbed.
 */
const sent: { to: string | string[]; subject: string; html: string; text: string; kind: string; unsub?: string | null }[] = [];
let failNext: string | null = null;
vi.mock("../src/lib/email", async (orig) => {
  const real = await orig<typeof import("../src/lib/email")>();
  return {
    ...real,
    sendEmail: vi.fn(async (to: string | string[], subject: string, html: string, text: string, opts: { kind: string; unsubUrl?: string | null }) => {
      if (failNext && to === failNext) { failNext = null; return { ok: false, error: "http 429" }; }
      sent.push({ to, subject, html, text, kind: opts.kind, unsub: opts.unsubUrl });
      return { ok: true, id: `re_ann_${sent.length}` };
    }),
  };
});

const db = await import("../src/lib/db");
const ro = await import("../src/lib/recover-offer");
const { planAnnounce, summarize, announceMailFor, sendAnnounce, sendAnnounceTests, announceStats, ANNOUNCE_KIND } = await import("../src/lib/announce-1023");
const { COMMERCIAL_KINDS } = await import("../src/lib/email");

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 9, 23, 3, 0); // 11:00 Taipei
const SITE = "https://yaoflow.com";

function customer(email: string, locale: string, tz: string | null, extra: { test?: boolean; marketing?: number | null; marketingAt?: number | null } = {}): number {
  const id = db.upsertCustomer(email, locale);
  db.db().prepare("UPDATE customers SET tz = ?, test_flag = ?, marketing_ok = ?, marketing_at = ? WHERE id = ?")
    .run(tz, extra.test ? 1 : 0, extra.marketing ?? 0, extra.marketingAt ?? null, id);
  return id;
}
function sub(cid: number, sid: string, cur: string) {
  db.upsertSubscription({ customerId: cid, stripeCustomerId: `cus_${sid}`, stripeSubscriptionId: sid, status: "active", plan: "month", periodStart: NOW - 5 * DAY, periodEnd: NOW + 25 * DAY, cancelAtPeriodEnd: sid.startsWith("pass_"), currency: cur, amountMinor: 26900 });
}

const tw = customer("ann-tw-member@example.org", "zh-hant", "Asia/Taipei");
sub(tw, "sub_ann_tw", "TWD");
const cn = customer("ann-cn-free@example.org", "zh", "Asia/Shanghai");
const hk = customer("ann-hk-paid@example.org", "zh-hant", "Asia/Hong_Kong");
db.recordOrder({ sessionId: "cs_ann_hk", customerId: hk, castId: null, tier: "pass_1d", amountCents: 2500, currency: "HKD", email: "ann-hk-paid@example.org", status: "paid" });
const ps = customer("ann-pass@example.org", "zh-hant", "Asia/Taipei");
sub(ps, "pass_ann_ps", "TWD");
customer("ann-tester@example.org", "zh-hant", "Asia/Taipei", { test: true });
customer("ripgtxgt@gmail.com", "zh", "Asia/Taipei");
customer("someone@yaoflow.com", "zh-hant", null);
customer("ann-bounced@example.org", "zh-hant", "Asia/Taipei");
db.logMailSent({ id: "re_bounce_1", kind: "reading", email: "ann-bounced@example.org", subject: "x" });
db.db().prepare("UPDATE mail_log SET bounced_at = ? WHERE id = 're_bounce_1'").run(NOW - DAY);
customer("ann-unsub@example.org", "zh-hant", "Asia/Taipei", { marketing: 0, marketingAt: NOW - DAY });
customer("ann-never-asked@example.org", "zh-hant", "Asia/Taipei", { marketing: 0 }); // the default: never asked — still written to
customer("ann-berlin@example.org", "zh-hant", "Europe/Berlin");
customer("ann-berlin-yes@example.org", "zh-hant", "Europe/Berlin", { marketing: 1, marketingAt: NOW - DAY });
db.createSavedCast({ token: "a".repeat(48), email: "ann-saved-only@example.org", locale: "zh-hant", question: "這次面試能過嗎", values: [7, 8, 9, 8, 7, 8] as LineValue[], castAt: NOW - DAY, tzOffset: 480, hex: "HEX", teaser: null, currency: "TWD" }, NOW - DAY);
ro.notePending({ co: "coANN0001", sessionId: "cs_ann_pending", kind: "deep", email: "ann-checkout-only@example.org", remind: true, locale: "zh", currency: "cny", amount: 990, product: "深断", managed: false, cardHint: true, metadata: { country: "CN", tzname: "Asia/Shanghai" }, cancelUrl: "u", successUrl: "s", now: NOW - DAY });

describe("公告信：寄给谁", () => {
  it("every reader address but ours, the unreachable, the unsubscribed and those who said no; consent-only places need a yes; a saved cast's address was promised one reminder only", () => {
    const plan = planAnnounce(NOW);
    const by = Object.fromEntries(plan.recipients.map((r) => [r.email, r]));
    expect(Object.keys(by).filter((e) => e.startsWith("ann-")).sort()).toEqual([
      "ann-berlin-yes@example.org", "ann-checkout-only@example.org", "ann-cn-free@example.org", "ann-hk-paid@example.org", "ann-never-asked@example.org", "ann-pass@example.org", "ann-tw-member@example.org",
    ]);
    expect(by["ripgtxgt@gmail.com"]).toBeUndefined();
    expect(by["someone@yaoflow.com"]).toBeUndefined();
    expect(plan.skipped).toMatchObject({ bounced_or_complained: 1, unsubscribed: 1, consent_region: 1, saved_cast_promise: 1 });
    expect(plan.skipped.internal_or_test).toBeGreaterThanOrEqual(3);
    // whose money, which lines
    expect(by["ann-tw-member@example.org"]).toMatchObject({ locale: "zh-hant", currency: "TWD", member: true, pass: false, group: "member" });
    expect(by["ann-cn-free@example.org"]).toMatchObject({ locale: "zh", currency: "CNY", member: false, pass: false, group: "free" });
    expect(by["ann-hk-paid@example.org"]).toMatchObject({ currency: "HKD", group: "paid" });
    expect(by["ann-pass@example.org"]).toMatchObject({ pass: true, member: false, group: "pass" });
    expect(by["ann-checkout-only@example.org"]).toMatchObject({ locale: "zh", currency: "CNY", group: "other" });
    const sum = summarize(plan);
    expect(sum.recipients).toBe(plan.recipients.length);
    expect(JSON.stringify(sum)).not.toMatch(/@/); // counts only
    expect(sum.saidYesToNews).toBe(1); // only the Berlin reader ticked the box here
  });
});

describe("公告信：信的内容", () => {
  it("繁体 for a member in NT$: the prices from the price table, the member's line, not the pass holder's; nothing left unfilled", () => {
    const m = announceMailFor({ email: "x@example.org", locale: "zh-hant", currency: "TWD", member: true, pass: false }, SITE);
    expect(m.subject).toBe("爻流 YaoFlow 的幾項更新：新增的服務、新的通卡，與會員的變化");
    for (const p of ["1 日通卡 NT$99（每個帳號的第一張 NT$75）", "7 天通卡 NT$199", "30 天通卡 NT$349", "會員（NT$269／月", "首月 NT$349", "單買一次（NT$75）"]) expect(m.text).toContain(p);
    expect(m.text).toContain("已經是會員的您：月費不變");
    expect(m.text).not.toContain("您手上的卡照常用到到期");
    expect(m.html + m.text).not.toMatch(/\{\w+\}|\*\*/);
    expect(m.html).toContain("<strong");
    expect(m.html).toContain(`${SITE}/zh-hant/terms`);
    expect(m.html).toContain("/api/unsub?");
    expect(m.text.split("不想再收到")[0]).not.toMatch(/AI|準/);
  });

  it("简体 in yuan for someone with neither: no personal line; a pass holder gets theirs", () => {
    const m = announceMailFor({ email: "y@example.org", locale: "zh", currency: "CNY", member: false, pass: false }, SITE);
    expect(m.subject).toContain("几项更新");
    expect(m.text).toContain("1 日通卡 ¥12.90（每个账号的第一张 ¥9.90）");
    expect(m.text).not.toContain("已经是会员的你");
    expect(m.text).not.toContain("你手上的卡照常用到到期");
    expect(m.html).toContain(`${SITE}/zh/privacy`);
    const p = announceMailFor({ email: "z@example.org", locale: "zh-hant", currency: "HKD", member: false, pass: true }, SITE);
    expect(p.text).toContain("您手上的卡照常用到到期，內容不變。");
    expect(p.text).toContain("HK$");
  });

  it("is commercial mail: one-click unsubscribe header", () => {
    expect(COMMERCIAL_KINDS.has(ANNOUNCE_KIND as never)).toBe(true);
  });
});

describe("公告信：怎么寄", () => {
  it("the tests go to the owner only, two letters, and nothing is recorded as sent", async () => {
    const before = sent.length;
    expect(await sendAnnounceTests(SITE)).toEqual({ sent: 2 });
    const t = sent.slice(before);
    expect(t.map((x) => x.subject)).toEqual([expect.stringContaining("[测试·繁体·会员＋通卡两段都显示]"), expect.stringContaining("[测试·简体·非会员]")]);
    expect(t.every((x) => JSON.stringify(x.to).includes("ripgtxgt@gmail.com"))).toBe(true);
    expect(t[0]!.text).toContain("已經是會員的您");
    expect(t[0]!.text).toContain("您手上的卡照常用到到期");
    expect(db.db().prepare("SELECT COUNT(*) AS n FROM emails WHERE kind = ?").get(ANNOUNCE_KIND)).toEqual({ n: 0 });
  });

  it("not at night (Taipei); in batches; each address once — a failed one is tried again, a sent one never", async () => {
    expect(await sendAnnounce(SITE, { now: Date.UTC(2026, 9, 23, 15, 0), pace: 0 })).toMatchObject({ refused: "night" });
    const plan = planAnnounce(NOW);
    const total = plan.recipients.length;
    failNext = plan.recipients[0]!.email;
    const before = sent.length;
    const first = await sendAnnounce(SITE, { now: NOW, pace: 0, limit: 3 });
    expect(first).toMatchObject({ sent: 2, failed: 1, left: total - 3 });
    const rest = await sendAnnounce(SITE, { now: NOW, pace: 0, limit: 400 });
    expect(rest.sent).toBe(total - 2); // the failed one again, and everyone else
    expect(await sendAnnounce(SITE, { now: NOW, pace: 0, limit: 400 })).toMatchObject({ sent: 0, left: 0 });
    const mine = sent.slice(before);
    expect(new Set(mine.map((x) => x.to)).size).toBe(total);
    expect(mine.every((x) => x.kind === ANNOUNCE_KIND && /\/api\/unsub\?/.test(x.unsub ?? ""))).toBe(true);
    expect(announceStats()).toMatchObject({ sent: total, failed: 0 });
    // and the plan now says so
    expect(planAnnounce(NOW).recipients).toHaveLength(0);
    expect(planAnnounce(NOW).skipped.already_sent).toBe(total);
  });

  it("10-23: an address the typo check flags is left out (gmail.con and edu-tw bounced, gmai.com is a stranger's catch-all)", () => {
    const before = planAnnounce(NOW, { sentKind: "ann_typo_probe" }).skipped.bad_address ?? 0;
    for (const e of ["ann-typo@gmail.con", "ann-typo@gmai.com", "ann-typo@mail.nknu.edu-tw"]) customer(e, "zh-hant", "Asia/Taipei");
    customer("ann-typo-ok@ms25.hinet.net", "zh-hant", "Asia/Taipei");
    const plan = planAnnounce(NOW, { sentKind: "ann_typo_probe" });
    expect(plan.skipped.bad_address).toBe(before + 3);
    expect(plan.recipients.map((r) => r.email).filter((e) => e.startsWith("ann-typo"))).toEqual(["ann-typo-ok@ms25.hinet.net"]);
  });
});
