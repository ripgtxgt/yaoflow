import { describe, expect, it } from "vitest";
import { publishableKey, walletEmailOf } from "../src/lib/stripe";

describe("钱包直付（09-26）", () => {
  it("stays off until a real publishable key is configured", () => {
    const old = process.env.STRIPE_PUBLISHABLE_KEY;
    process.env.WALLET_PAY = "on";
    delete process.env.STRIPE_PUBLISHABLE_KEY;
    expect(publishableKey()).toBeNull();
    process.env.STRIPE_PUBLISHABLE_KEY = "sk_live_nope";
    expect(publishableKey()).toBeNull();
    process.env.STRIPE_PUBLISHABLE_KEY = "pk_test_abc123";
    expect(publishableKey()).toBe("pk_test_abc123");
    process.env.WALLET_PAY = "off";
    expect(publishableKey()).toBeNull(); // the switch, even with a key
    if (old === undefined) delete process.env.STRIPE_PUBLISHABLE_KEY; else process.env.STRIPE_PUBLISHABLE_KEY = old;
  });

  it("takes the buyer's address from the wallet, else the receipt address", () => {
    const base = { id: "pi_1", status: "succeeded", amount_received: 7500, currency: "twd", created: 1, metadata: {} };
    expect(walletEmailOf({ ...base, latest_charge: { billing_details: { email: "a@b.co" } }, receipt_email: "c@d.co" })).toBe("a@b.co");
    expect(walletEmailOf({ ...base, latest_charge: "ch_1", receipt_email: "c@d.co" })).toBe("c@d.co");
  });
});

import type { LineValue } from "@yaoflow/engine";
import { db, recordOrder, saveCast, saveReading, upsertCustomer } from "../src/lib/db";
import { sendReadingTo } from "../src/lib/reading-mail";
import { resolveServerChart } from "../src/lib/reading";

describe("钱包付款改寄邮箱（09-26）", () => {
  const V: LineValue[] = [7, 8, 9, 8, 7, 8];
  const make = (sid: string, email: string, ageMs = 0) => {
    const cid = upsertCustomer(email, "zh-hant");
    const chart = resolveServerChart({ question: "q", values: V, castAtMs: Date.now(), tzOffsetMinutes: 480 }, true) as unknown as Record<string, unknown>;
    const castId = saveCast({ customerId: cid, castAtMs: Date.now(), tzOffsetMinutes: 480, locale: "zh-hant", question: "這份工作會順利嗎", topic: "career", values: V, chart });
    saveReading(castId, cid, "one", "zh-hant", { summary: { "zh-hant": "會順，但慢。" } } as never);
    recordOrder({ sessionId: sid, customerId: cid, castId, tier: "one", amountCents: 7500, currency: "twd", email, status: "paid", paymentIntent: sid });
    if (ageMs) db().prepare("UPDATE orders SET created_at = ? WHERE session_id = ?").run(Date.now() - ageMs, sid);
    return cid;
  };
  it("only for wallet orders, only within two days, and never someone else's", async () => {
    make("cs_nottwallet1", "w1@icloud.com");
    expect(await sendReadingTo("cs_nottwallet1", "me@gmail.com", null)).toEqual({ ok: false, error: "not_allowed" });
    make("pi_walletold1", "w2@icloud.com", 3 * 86_400_000);
    expect(await sendReadingTo("pi_walletold1", "me@gmail.com", null)).toEqual({ ok: false, error: "expired" });
    const owner = make("pi_walletnew1", "w3@icloud.com");
    expect(await sendReadingTo("pi_walletnew1", "me@gmail.com", owner + 999)).toEqual({ ok: false, error: "not_allowed" });
    // no mail key in tests: the send itself fails, and nothing is moved
    expect((await sendReadingTo("pi_walletnew1", "me@gmail.com", null)).ok).toBe(false);
    expect((db().prepare("SELECT email FROM orders WHERE session_id = ?").get("pi_walletnew1") as { email: string }).email).toBe("w3@icloud.com");
  });
});
