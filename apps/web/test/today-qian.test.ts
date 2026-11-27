import { describe, expect, it } from "vitest";
import { db, upsertCustomer, upsertSubscription } from "../src/lib/db";
import { PASS_SPLIT_AT } from "../src/lib/sub-plan";
import * as tq from "../src/lib/today-qian";
import { buildCardNoticeEmail, buildTodayQianEmail } from "../src/lib/today-qian-mail";
import { allQian, QIAN_SETS } from "../src/lib/qian";

/** 10-14 进度表 50 今日一籤 */
const NOW = Date.UTC(2026, 9, 15, 2); // 10:00 Taipei

describe("今日一籤", () => {
  it("every lot of the 12 sets carries 今日宜／忌", () => {
    for (const s of QIAN_SETS) for (const e of allQian(s.id)) { expect(e.yi, `${s.id} ${e.num}`).toBeTruthy(); expect(e.ji, `${s.id} ${e.num}`).toBeTruthy(); }
  });

  it("one lot a day, fixed: the same subject and day give the same lot, a new day another draw", () => {
    const sub = "b:00000000000000a1";
    expect(tq.lotNumberFor(sub, "2026-10-15", "liushi-jiazi")).toBe(tq.lotNumberFor(sub, "2026-10-15", "liushi-jiazi"));
    const a = tq.drawToday(sub, NOW);
    const b = tq.drawToday(sub, NOW + 3_600_000);
    expect(b).toMatchObject({ day: a.day, num: a.num, set: "liushi-jiazi" });
    expect(a.num).toBeGreaterThanOrEqual(1); expect(a.num).toBeLessThanOrEqual(60);
    // changing the temple does not change today's lot; tomorrow draws from its set
    tq.setPrefs(sub, { set: "yuelao", temple: "putian" });
    expect(tq.drawToday(sub, NOW + 7_200_000).num).toBe(a.num);
    const t = tq.drawToday(sub, NOW + 86_400_000);
    expect(t.set).toBe("yuelao");
    expect(tq.monthDraws(sub, "2026-10").map((x) => x.day)).toEqual(["2026-10-15", "2026-10-16"]);
    expect(tq.streakOf(sub, NOW + 86_400_000)).toBe(2);
  });

  it("a browser's draws become the account's when it signs in", () => {
    const cid = upsertCustomer("tq-adopt@example.com", "zh-hant");
    const bid = "00000000000000b2";
    const d = tq.drawToday(`b:${bid}`, NOW);
    tq.adoptBrowser(cid, bid);
    expect(tq.drawnOn(`c:${cid}`, d.day)?.num).toBe(d.num);
  });

  it("free: the lot and poem; members and card holders: their matter's words, 宜／忌; 月老 speaks of love only", () => {
    const free = tq.lotView({ set: "liushi-jiazi", num: 1 }, { full: false, section: "work", hk: false })!;
    expect(free.poem).toHaveLength(4);
    expect(free.full).toBeUndefined();
    const full = tq.lotView({ set: "liushi-jiazi", num: 1 }, { full: true, section: "work", hk: false })!;
    expect(full.full).toMatchObject({ section: "work", yi: expect.any(String), ji: expect.any(String) });
    expect(full.full!.text).toContain("求職");
    expect(tq.lotView({ set: "yuelao", num: 3 }, { full: true, section: "work", hk: false })!.full!.section).toBe("love");
    expect(tq.lotToHans(full).title).not.toBe("");
  });

  it("籤卡: paid once, 30 days, a second one stacks; access follows it; the checkout records once", () => {
    const cid = upsertCustomer("tq-card@example.com", "zh-hant");
    expect(tq.accessOf(cid, NOW)).toBeNull();
    const s = { id: "cs_test_tqcard_1", payment_status: "paid", metadata: { kind: "qiancard", cust: String(cid) }, currency: "twd", amount_total: 5900 };
    const r1 = tq.fulfilCard(s);
    expect(r1.ok && r1.created).toBe(true);
    const r2 = tq.fulfilCard(s);
    expect(r2.ok && !r2.created).toBe(true);
    expect(tq.accessOf(cid)).toBe("card");
    const r3 = tq.fulfilCard({ ...s, id: "cs_test_tqcard_2" });
    expect(r3.ok && r3.row.starts_at).toBe(r1.ok ? r1.row.ends_at : 0);
    expect(tq.fulfilCard({ ...s, id: "cs_x", metadata: { kind: "pass" } })).toEqual({ ok: false, why: "not_card" });
    expect(tq.cardMinor("TWD")).toBe(5900);
  });

  it("the letters: the lot with its words and a one-click stop; the card notice with two equal buttons (no 再買 since 92)", () => {
    const v = tq.lotView({ set: "guandi", num: 7 }, { full: true, section: "love", hk: false })!;
    const m = buildTodayQianEmail({ locale: "zh-hant", day: "2026-10-15", lot: v, site: "https://yaoflow.com", email: "a@example.com" });
    expect(m.text).toContain("今日宜");
    expect(m.unsubUrl).toContain("/api/today-qian/unsub?u=a%40example.com&t=");
    expect(m.html).not.toMatch(/靈驗|改運|神明說|AI/);
    const z = buildTodayQianEmail({ locale: "zh", day: "2026-10-15", lot: v, site: "https://yaoflow.com", email: "a@example.com" });
    expect(z.subject.startsWith("今日一签")).toBe(true);
    const n = buildCardNoticeEmail({ locale: "zh-hant", endsAt: NOW, site: "https://yaoflow.com", cardId: 9 });
    expect((n.html.match(/card-choice\?id=9/g) ?? []).length).toBe(2);
    expect(n.html).not.toContain("再買"); expect(n.html).toContain("NT$349");
  });

  it("10-22 进度表 92: the full lot is a member's; a 通卡 bought before the split keeps it to its end, a new one does not", () => {
    const D = 86_400_000;
    const at = Date.now();
    const mk = (email: string, id: string, created: number) => {
      const cid = upsertCustomer(email, "zh-hant");
      upsertSubscription({ customerId: cid, stripeCustomerId: null, stripeSubscriptionId: id, status: "active", plan: "month", periodStart: at - D, periodEnd: at + 6 * D, cancelAtPeriodEnd: !id.startsWith("sub_"), currency: "twd", amountMinor: 19900, passDays: id.startsWith("pass_") ? 7 : null });
      db().prepare("UPDATE subscriptions SET created_at = ? WHERE stripe_subscription_id = ?").run(created, id);
      return cid;
    };
    expect(tq.accessOf(mk("tq92-member@example.com", "sub_tq92_m", PASS_SPLIT_AT + D), at)).toBe("member");
    expect(tq.accessOf(mk("tq92-old@example.com", "pass_tq92_old", PASS_SPLIT_AT - 60_000), at)).toBe("pass");
    expect(tq.accessOf(mk("tq92-new@example.com", "pass_tq92_new", PASS_SPLIT_AT + 60_000), at)).toBeNull();
  });
});

describe("今日一籤：给页面的数据", () => {
  it("the month's draws are plain objects (a client component rejects null-prototype rows)", () => {
    const sub = "b:00000000000000c3";
    tq.drawToday(sub, NOW);
    const m = tq.monthDraws(sub, "2026-10");
    expect(m.length).toBe(1);
    expect(Object.getPrototypeOf(m[0])).toBe(Object.prototype);
  });
});
