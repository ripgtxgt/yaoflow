import { describe, expect, it } from "vitest";
import { upsertCustomer, upsertSubscription } from "../src/lib/db";
import { setFeature } from "../src/lib/features";
import { normalizeBirth } from "../src/lib/mingli/birth/normalize";
import { nianshuFacts, nsOffense, nsScript } from "../src/lib/mingli/nianshu/report";
import { createReport } from "../src/lib/mingli/bazi/report";
import { createZiweiReport } from "../src/lib/mingli/ziwei/report";
import { createAstroReport } from "../src/lib/mingli/astro/report";
import { asksOutcome, cleanQ, qaHistory, saveQa, suggestedQuestions } from "../src/lib/mingli/qa";
import { letterUnsubUrl, letterUnsubValid, memberLetterEligible, monthNow, setMemberLetterOff } from "../src/lib/member-letter";
import { baziYearOf, buildMonthLetter, modelFacts, monthBits, monthZNow, pointsOf, xunify } from "../src/lib/month-letter";
import { REWRITE_EVERY_MS, noteRewrite, rewriteNextAt, rewriteSalt } from "../src/lib/mingli/rewrite";
import { closePassForCredit, fulfilPass, passCredit, passIdFor } from "../src/lib/pass";
import { passNoticeDue } from "../src/lib/pass-notice";
import type { CheckoutSession } from "../src/lib/stripe";
process.env.UPGRADE_CREDIT = "on"; // 10-24: the credit is off by default; these tests are about how it works when on

/** 10-22 通卡 第二批 (进度表 75 ⑧): 命盤問答 · 會員每日信 · 每月流月信 · 深度報告月更 · 升級會員差額折抵 · 7 天卡到期提醒 */
const D = 86_400_000;
const tpe = (y: number, m: number, d: number, h = 12) => Date.UTC(y, m - 1, d, h - 8);
const birth = normalizeBirth({ calendar: "solar", y: 1989, m: 9, d: 26, timeMode: "exact", h: 12, mi: 0, placeId: "tw-tpe" } as never);
const facts26 = nianshuFacts(birth, "male", "placidus", 2026, tpe(2026, 10, 21));
const member = (email: string, id: string, now: number) => {
  const cid = upsertCustomer(email, "zh-hant");
  upsertSubscription({ customerId: cid, stripeCustomerId: `cus_${id}`, stripeSubscriptionId: id, status: "active", plan: "month", periodStart: now - D, periodEnd: now + 29 * D, cancelAtPeriodEnd: false, currency: "twd", amountMinor: 26900 });
  return cid;
};

describe("第二批① 命盤問答", () => {
  it("knows a question about an outcome or a date (the page then offers a cast)", () => {
    expect(asksOutcome("我今年會不會換工作？")).toBe(true);
    expect(asksOutcome("什么时候会有对象")).toBe(true);
    expect(asksOutcome("我適合什麼樣的工作？")).toBe(false);
    expect(cleanQ("  我的\u0000財帛宮<b>怎麼看  ")).toBe("我的 財帛宮 b 怎麼看");
    expect([...cleanQ("問".repeat(300))!].length).toBe(200);
    expect(cleanQ(42)).toBeNull();
  });

  // 10-24 (Neil): no free questions any more (test/qa-pass-only-1024.test.ts) — the thread is still the chart's
  it("the thread belongs to the chart and the account", () => {
    const cid = upsertCustomer("qa-a@example.com", "zh-hant");
    const now = tpe(2026, 10, 22, 10);
    const who = { customerId: cid, bid: "bqa0001" };
    saveQa({ ...who, system: "bazi", chartHash: "h1", locale: "zh-hant", question: "我適合什麼工作？", answer: "答".repeat(90), cast: false }, now - 2 * D);
    for (let i = 0; i < 3; i++) saveQa({ ...who, system: "bazi", chartHash: "h1", locale: "zh-hant", question: `問題${i}`, answer: "答".repeat(90), cast: i === 0 }, now + i * 60_000);
    const h = qaHistory("h1", { customerId: cid, bid: null });
    expect(h.length).toBe(4);
    expect(h[0]!.question).toBe("我適合什麼工作？"); // oldest first
    expect(qaHistory("h2", { customerId: cid, bid: null })).toEqual([]);
    expect(qaHistory("h1", { customerId: null, bid: "bqa0001" })).toEqual([]); // the account's rows are not the browser's
  });

  it("suggests three different questions per system, in the page's script", () => {
    for (const s of ["bazi", "ziwei", "astro"] as const) {
      const q = suggestedQuestions(s, "abcdef0123", "zh-hant");
      expect(new Set(q).size).toBe(3);
    }
    const zh = suggestedQuestions("bazi", "abcdef0123", "zh");
    expect(zh.join("")).not.toMatch(/適|麼|裡|錢/);
    expect(suggestedQuestions("bazi", "abcdef0123", "zh-hant")).not.toEqual(suggestedQuestions("bazi", "ffff000000", "zh-hant"));
  });
});

describe("第二批② 會員每日信", () => {
  it("today's 節氣月 from the chart: 寒露 in late October; January and early February still belong to the year before", () => {
    const f = facts26.bazi;
    expect(monthNow(f, tpe(2026, 10, 22))).toMatchObject({ term: "寒露", start: "10/8" });
    expect(monthNow(f, tpe(2026, 1, 20))?.term).toBe("小寒");
    expect(monthNow(f, tpe(2026, 2, 3))?.term).toBe("小寒");
    expect(monthNow(f, tpe(2026, 2, 5))?.term).toBe("立春");
    expect(monthNow(f, tpe(2026, 12, 20))?.term).toBe("大雪");
  });

  it("goes to renewing and complimentary members on Chinese pages, never to a 通卡, and stops with one click", async () => {
    const now = tpe(2026, 10, 22, 7);
    const cid = member("ml-a@example.com", "sub_ml_a", now);
    setFeature("tongka", "preview");
    expect(memberLetterEligible(cid, "zh-hant", now)).toBe(false); // the letter starts with the 通卡 model open to everyone
    setFeature("tongka", "on");
    expect(memberLetterEligible(cid, "zh-hant", now)).toBe(true);
    expect(memberLetterEligible(cid, "en", now)).toBe(false);
    const comp = upsertCustomer("ml-comp@example.com", "zh");
    upsertSubscription({ customerId: comp, stripeCustomerId: null, stripeSubscriptionId: "comp_ml_1", status: "active", plan: "year", periodStart: now, periodEnd: now + 365 * D, cancelAtPeriodEnd: false, currency: "usd", amountMinor: 0 });
    expect(memberLetterEligible(comp, "zh", now)).toBe(true);
    const holder = upsertCustomer("ml-pass@example.com", "zh-hant");
    upsertSubscription({ customerId: holder, stripeCustomerId: null, stripeSubscriptionId: "pass_ml_1", status: "active", plan: "month", periodStart: now, periodEnd: now + 30 * D, cancelAtPeriodEnd: true, currency: "twd", amountMinor: 34900, passDays: 30 });
    expect(memberLetterEligible(holder, "zh-hant", now)).toBe(false);
    setMemberLetterOff(cid, true);
    expect(memberLetterEligible(cid, "zh-hant", now)).toBe(false);
    setMemberLetterOff(cid, false);
    expect(memberLetterEligible(cid, "zh-hant", now)).toBe(true);
    process.env.UNSUB_SECRET ??= "test-secret";
    const url = letterUnsubUrl("https://yaoflow.com", "ML-A@example.com", "zh-hant");
    const t = new URL(url).searchParams.get("t")!;
    expect(letterUnsubValid("ml-a@example.com", t)).toBe(true);
    expect(letterUnsubValid("other@example.com", t)).toBe(false);
  });
});

describe("第二批③ 每月流月信", () => {
  it("says a time inside the month as 上旬／中旬／下旬, never a day", () => {
    expect(xunify("國曆 2/26 水星開始逆行（雙魚座）")).toBe("國曆 2 月下旬水星開始逆行（雙魚座）");
    expect(xunify("1/5")).toBe("1 月上旬");
    expect(xunify("2027/1/15")).toBe("1 月中旬");
    expect(baziYearOf(2026, 1, "大雪")).toBe(2025);
    expect(baziYearOf(2026, 2, "小寒")).toBe(2025);
    expect(baziYearOf(2026, 2, "立春")).toBe(2026);
    expect(baziYearOf(2026, 10, "寒露")).toBe(2026);
  });

  it("finds the 紫微 流月 that covers a 國曆 date, across the lunar year's end", () => {
    const months = facts26.ziwei.book!.months;
    const oct = monthZNow(months, 2026, { y: 2026, m: 10, d: 22 });
    expect(oct).not.toBeNull();
    expect(oct!.palace).toBeTruthy();
    expect(monthZNow(months, 2026, { y: 2027, m: 1, d: 20 })?.n).toBe(12); // 臘月 of lunar 2026 is January 2027
    expect(monthZNow(months, 2026, { y: 2026, m: 2, d: 10 })).toBeNull(); // before 正月初一: the year before's book
    expect(monthZNow(months, 2026, { y: 2027, m: 3, d: 1 })).toBeNull();
  });

  it("reads the natal points from the facts' sign and degree", () => {
    const pts = pointsOf(facts26.astro);
    expect(pts.map((p) => p.name).sort()).toEqual(["上升", "太陽", "月亮", "金星"]);
    for (const p of pts) { expect(p.lon).toBeGreaterThanOrEqual(0); expect(p.lon).toBeLessThan(360); }
    expect(pointsOf({ ...facts26.astro, moonApprox: true, asc: null }).map((p) => p.name).sort()).toEqual(["太陽", "金星"]);
  });

  it("the month's bits from what is on file: 八字 always, 紫微 and the sky from a 年書; nothing dated, nothing lunar, in what the model sees", () => {
    const now = tpe(2026, 10, 22, 9);
    const cid = upsertCustomer("mo-a@example.com", "zh-hant");
    expect(monthBits(cid, now)).toBeNull();
    const paid = { session: "cs_mo_a", currency: "twd", amountMinor: 0 };
    createReport({ kind: "year", locale: "zh-hant", register: null, customerId: cid, email: "mo-a@example.com", facts: facts26.bazi, paid }, now - D);
    const b1 = monthBits(cid, now)!;
    expect(b1.bazi).toMatchObject({ month: { term: "寒露", start: "10/8" }, yearGz: "丙午" });
    expect(b1.bazi!.yearTen).toBeTruthy();
    expect(b1.ziwei).toBeNull();
    createZiweiReport({ kind: "year", locale: "zh-hant", register: null, customerId: cid, email: "mo-a@example.com", facts: facts26.ziwei, paid }, now - D);
    createAstroReport({ kind: "year", locale: "zh-hant", register: null, customerId: cid, email: "mo-a@example.com", facts: facts26.astro, paid }, now - D);
    const b = monthBits(cid, now)!;
    expect(b.ym).toBe("2026-10");
    expect(b.ziwei?.month.palace).toBeTruthy();
    expect(b.ziwei?.span).toMatch(/^國曆 \d{1,2} 月[上中下]旬–\d{1,2} 月[上中下]旬$/);
    expect(b.astro?.page?.level).toBeGreaterThanOrEqual(1);
    const seen = JSON.stringify(modelFacts(b));
    expect(seen).not.toMatch(/\d{1,2}\/\d{1,2}/);
    expect(seen).not.toMatch(/農曆|正月|臘月|初一|1989|tw-tpe/);
    expect(seen).toMatch(/寒露/);
  });

  it("the letter: the member's text, the 節氣月 label with its start, one-click stop; 简体 pages say 公历", () => {
    const now = tpe(2026, 10, 22, 9);
    const cid = upsertCustomer("mo-b@example.com", "zh");
    createReport({ kind: "deep", locale: "zh", register: null, customerId: cid, email: "mo-b@example.com", facts: { ...facts26.bazi, kind: "deep" }, paid: { session: "cs_mo_b", currency: "cny", amountMinor: 6800 } }, now - D);
    const b = monthBits(cid, now)!;
    const text = { keyword: "收束", bazi: "這個月寒露起，正印當令，你容易把心放回該做的事上。國曆 10 月中旬以後，先把手上的一件事收好，再談新的。" };
    expect(nsOffense(text)).toBeNull();
    const hans = { keyword: nsScript(text.keyword, "zh"), bazi: nsScript(text.bazi, "zh") };
    expect(hans.bazi).toContain("公历 10 月中旬以后");
    const m = buildMonthLetter(b, hans, "zh", "https://yaoflow.com", "mo-b@example.com");
    expect(m.subject).toBe("流月信｜公历 10 月：收束");
    expect(m.html).toContain("寒露月（公历 10/8 起）");
    expect(m.html).toContain(hans.bazi);
    expect(m.html).toContain("/api/member-letter/unsub?e=mo-b%40example.com");
    expect(m.html).not.toMatch(/國曆|undefined|null/);
    expect(m.text).toContain("https://yaoflow.com/zh/cast?c=moletter");
    const h = buildMonthLetter(b, text, "zh-hant", "https://yaoflow.com", "mo-b@example.com");
    expect(h.subject).toBe("流月信｜國曆 10 月：收束");
    expect(h.html).toContain("會員專屬");
  });
});

describe("第二批④ 深度報告月更", () => {
  it("a chart may be rewritten once every 30 days, counted from the first report until a rewrite is noted", () => {
    const cid = upsertCustomer("rw-a@example.com", "zh-hant");
    const now = tpe(2026, 10, 22, 9);
    expect(rewriteNextAt(cid, "bazi", "chart1", null, now)).toBeNull();
    expect(rewriteNextAt(cid, "bazi", "chart1", now - 10 * D, now)).toBe(now + 20 * D);
    expect(rewriteNextAt(cid, "bazi", "chart1", now - 31 * D, now)).toBeNull();
    noteRewrite(cid, "bazi", "chart1", now);
    expect(rewriteNextAt(cid, "bazi", "chart1", now - 100 * D, now + D)).toBe(now + REWRITE_EVERY_MS);
    expect(rewriteNextAt(cid, "bazi", "chart1", null, now + REWRITE_EVERY_MS)).toBeNull();
    expect(rewriteNextAt(cid, "ziwei", "chart1", null, now)).toBeNull(); // another system, another clock
    expect(rewriteSalt(Date.UTC(2026, 9, 21, 20))).toBe("rw:2026-10-22"); // 04:00 台北 the next day
  });

  it("a rewrite is a new report row of the same chart (the salt changes the dedupe hash)", () => {
    const cid = upsertCustomer("rw-b@example.com", "zh-hant");
    const now = tpe(2026, 10, 22, 9);
    const base = { kind: "deep" as const, locale: "zh-hant", register: null, customerId: cid, email: "rw-b@example.com", facts: { ...facts26.bazi, kind: "deep" as const }, paid: { session: "cs_rw_b", currency: "twd", amountMinor: 0 } };
    const a = createReport(base, now);
    expect(createReport(base, now + 1000).created).toBe(false);
    const b = createReport({ ...base, salt: rewriteSalt(now + 31 * D) }, now + 31 * D);
    expect(b.created).toBe(true);
    expect(b.token).not.toBe(a.token);
  });
});

describe("第二批⑤ 升級會員差額折抵 · ⑥ 7 天卡到期提醒", () => {
  const session = (id: string, email: string, cust: number, days: string, amount: number): CheckoutSession => ({
    id, url: null, mode: "payment", payment_status: "paid", status: "complete",
    metadata: { kind: "pass", email, locale: "zh-hant", cust: String(cust), days },
    customer_details: { email }, amount_total: amount, currency: "twd", customer: "cus_pass_credit",
  });

  it("what is left of a running pass comes back as a one-time credit in its own currency; the pass then closes once", async () => {
    const cid = upsertCustomer("credit-a@example.com", "zh-hant");
    const t0 = tpe(2026, 10, 1, 9);
    expect(passCredit(cid, "twd", t0)).toBeNull();
    const r = await fulfilPass(session("cs_credit_a", "credit-a@example.com", cid, "30", 34900), t0);
    expect(r.ok && r.created).toBe(true);
    const c = passCredit(cid, "twd", t0 + 15 * D)!;
    expect(c).toMatchObject({ passId: passIdFor("cs_credit_a"), currency: "TWD", daysLeft: 15, amountMinor: Math.floor(34900 * 15 / 30) });
    expect(passCredit(cid, "usd", t0 + 15 * D)).toBeNull();
    expect(passCredit(cid, "twd", t0 + 30 * D - 60_000)).toBeNull(); // the last minute is not worth a coupon
    expect(closePassForCredit(c.passId, t0 + 15 * D)).toBe(true);
    expect(closePassForCredit(c.passId, t0 + 15 * D)).toBe(false);
    expect(passCredit(cid, "twd", t0 + 16 * D)).toBeNull();
  });

  it("a 7 天 card hears the day before it ends, the 30-day one three days before, a 1 日 card not at all", () => {
    const now = tpe(2026, 10, 22, 9);
    const row = (days: number, endsIn: number) => ({ stripe_subscription_id: "pass_x", status: "active", period_end: now + endsIn * D, pass_days: days });
    expect(passNoticeDue(row(7, 1), now)).toBe(true);
    expect(passNoticeDue(row(7, 3), now)).toBe(false);
    expect(passNoticeDue(row(30, 3), now)).toBe(true);
    expect(passNoticeDue(row(30, 1), now)).toBe(false);
    expect(passNoticeDue(row(1, 1), now)).toBe(false);
    expect(passNoticeDue({ ...row(7, 1), pass_notice_at: now - D }, now)).toBe(false);
  });
});
