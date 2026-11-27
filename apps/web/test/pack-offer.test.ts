import { describe, expect, it } from "vitest";
import { createSubUse, recordEmail, recordOps, recordUnsub, upsertCustomer, upsertSubscription } from "../src/lib/db";
import { DEEP_PER_MONTH } from "../src/lib/subscription";
import { packOfferFor, packOfferLetter, packOfferNumbers } from "../src/lib/pack-offer";
import { PACK_OFFER_T } from "../src/lib/dict/pack-offer";
import { buildPackBoughtEmail } from "../src/lib/email";
import { LOCALES } from "../src/lib/locales";

const DAY = 86_400_000;
function member(email: string, subId: string, used: number) {
  const now = Date.now();
  const cid = upsertCustomer(email, "zh-hant");
  const sub = upsertSubscription({
    customerId: cid, stripeCustomerId: `cus_${subId}`, stripeSubscriptionId: subId, status: "active", plan: "month",
    periodStart: now - 2 * DAY, periodEnd: now + 28 * DAY, cancelAtPeriodEnd: false, currency: "TWD", amountMinor: 26900,
  });
  for (let i = 0; i < used; i++) createSubUse({ subscriptionId: sub.id, customerId: cid, tier: "deep", locale: "zh-hant", token: `po_${subId}_${String(i).padStart(3, "0")}_`.padEnd(36, "x"), inputJson: "{}" });
  return cid;
}

describe("09-29 会员增购包邮件", () => {
  it("the numbers: NT$699 for 15, NT$75 one by one, saves NT$426 (38%)", () => {
    const n = packOfferNumbers("TWD", "zh-hant");
    expect(n.price).toContain("699");
    expect(n.one).toContain("75");
    expect(n.fifteen).toContain("1,125");
    expect(n.save).toContain("426");
    expect(n.pct).toBe(38);
  });

  it("due at 2 left or fewer, once a period; not at 3; not after an unsubscribe", async () => {
    expect(await packOfferFor(member("po-3@example.org", "sub_po3", DEEP_PER_MONTH - 3))).toBeNull();
    const c = await packOfferFor(member("po-2@example.org", "sub_po2", DEEP_PER_MONTH - 2));
    expect(c?.left).toBe(2);
    const m = packOfferLetter(c!);
    expect(m.subject).toContain("只剩 2 份");
    expect(m.text).toContain("省 NT$426");
    expect(m.text).toContain("#membership");
    recordEmail(c!.key, "pack_offer", c!.email, "sent");
    expect(await packOfferFor(c!.customerId)).toBeNull();

    const out = await packOfferFor(member("po-0@example.org", "sub_po0", DEEP_PER_MONTH));
    expect(out?.left).toBe(0);
    expect(packOfferLetter(out!).subject).toContain("用完了");

    const u = member("pz-unsub@unsub.example.org", "sub_pou", DEEP_PER_MONTH);
    recordUnsub("pz-unsub@unsub.example.org"); // 10-23: how /api/unsub records it (the exact address)
    recordOps("unsub", "p…@unsub.example.org"); // the masked ops line alone no longer stops anyone else
    expect(await packOfferFor(u)).toBeNull();
  });

  it("copy exists in every language", () => {
    for (const l of LOCALES) {
      const t = (PACK_OFFER_T as Record<string, Record<string, string>>)[l]!;
      expect(Object.keys(t).sort(), l).toEqual(Object.keys(PACK_OFFER_T.zh).sort());
    }
  });

  it("the arrival letter: what was paid, what is held, every language filled in", () => {
    for (const l of LOCALES) {
      const m = buildPackBoughtEmail({ locale: l as never, paid: "NT$699", n: 15, left: 15, cap: DEEP_PER_MONTH, castUrl: "https://yaoflow.com/x/cast" });
      expect(m.subject + m.text, l).not.toMatch(/\{\w+\}/);
      expect(m.text, l).toContain("NT$699");
      expect(m.text, l).toContain("15");
      expect(m.html, l).toContain('charset="utf-8"');
    }
    expect(buildPackBoughtEmail({ locale: "zh-hant", paid: "NT$699", n: 15, left: 15, cap: 10, castUrl: "u" }).subject).toBe("增購已到帳：15 份深斷");
    // 10-02: a small pack says 5; a large one that took in 3 singles says it added 12 and that they make 15
    expect(buildPackBoughtEmail({ locale: "zh-hant", paid: "NT$299", n: 5, left: 5, cap: 10, castUrl: "u" }).subject).toBe("增購已到帳：5 份深斷");
    for (const l of LOCALES) {
      const m = buildPackBoughtEmail({ locale: l as never, paid: "NT$474", n: 12, credit: 3, left: 12, cap: 10, castUrl: "u" });
      expect(m.subject + m.text, l).not.toMatch(/\{\w+\}/);
      expect(m.text, l).toContain("12");
      expect(m.text, l).toContain("15");
    }
  });
});
