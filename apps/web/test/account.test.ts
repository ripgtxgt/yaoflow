import { describe, expect, it } from "vitest";
// DATA_DIR is a fresh temp dir (test/setup.ts)

import type { LineValue } from "@yaoflow/engine";
import { issueLoginToken, redeemLoginToken, safeNextPath, LINKS_PER_HOUR } from "../src/lib/auth";
import {
  castsForCustomer, customerForSession, deleteSession, saveCast, upsertCustomer, upsertSubscription, subUseByToken,
} from "../src/lib/db";
import { allowanceWindow, entitlementFor, redeemSubscription, DEEP_PER_MONTH } from "../src/lib/subscription";
import { verifyPaidSession } from "../src/lib/paid-store";
import { verifyWebhookSignature } from "../src/lib/stripe";
import { createHmac } from "node:crypto";

const VALUES: LineValue[] = [7, 8, 9, 8, 7, 8];
const AT = Date.UTC(2026, 8, 3, 2);

describe("magic-link login", () => {
  it("issues a token that redeems exactly once into a session for the address", () => {
    const issued = issueLoginToken("Neil@Example.com ", "ja", "/ja/account");
    const raw = issued?.raw;
    expect(raw).toMatch(/^[0-9a-f]{64}$/);
    expect(issued?.code).toMatch(/^\d{6}$/); // 10-02: and a six-digit code in the same letter
    const r = redeemLoginToken(raw!);
    expect(r?.email).toBe("neil@example.com");
    expect(r?.locale).toBe("ja");
    expect(r?.nextPath).toBe("/ja/account");
    expect(customerForSession(r!.sessionId)?.email).toBe("neil@example.com");
    // a link is single-use
    expect(redeemLoginToken(raw!)).toBeNull();
    // garbage never becomes a session
    expect(redeemLoginToken("nope")).toBeNull();
    expect(redeemLoginToken("f".repeat(64))).toBeNull();
    deleteSession(r!.sessionId);
    expect(customerForSession(r!.sessionId)).toBeNull();
  });

  it("throttles one address to a handful of links per hour", () => {
    for (let i = 0; i < LINKS_PER_HOUR; i++) expect(issueLoginToken("flood@example.com", "en", null)).not.toBeNull();
    expect(issueLoginToken("flood@example.com", "en", null)).toBeNull();
  });

  it("only ever sends people back to our own pages", () => {
    expect(safeNextPath("/ja/account")).toBe("/ja/account");
    expect(safeNextPath("/zh-hant/cast?q=x")).toBe("/zh-hant/cast?q=x");
    expect(safeNextPath("//evil.com")).toBeNull();
    expect(safeNextPath("https://evil.com/ja")).toBeNull();
    expect(safeNextPath("/ja/\nSet-Cookie")).toBeNull();
    expect(safeNextPath(42)).toBeNull();
  });

  it("files a signed-in visitor's casts under the account", () => {
    const cid = upsertCustomer("filer@example.com", "de");
    saveCast({ customerId: cid, castAtMs: AT, tzOffsetMinutes: 120, locale: "de", question: "Soll ich?", topic: "decision", values: VALUES, chart: chartStub() });
    const casts = castsForCustomer(cid);
    expect(casts).toHaveLength(1);
    expect(casts[0]!.question).toBe("Soll ich?");
    expect(casts[0]!.primary_num).toBeGreaterThan(0);
    expect(casts[0]!.session_id).toBeNull(); // no reading page for a bare cast
  });
});

describe("membership entitlement", () => {
  const month = 30 * 86_400_000;

  it("a live monthly subscription covers unlimited light readings and DEEP_PER_MONTH deep ones, spent one by one", async () => {
    const cid = upsertCustomer("member@example.com", "en");
    const now = Date.now();
    upsertSubscription({
      customerId: cid, stripeCustomerId: "cus_test1", stripeSubscriptionId: "sub_test1", status: "active", plan: "month",
      periodStart: now - 5 * 86_400_000, periodEnd: now + 25 * 86_400_000, cancelAtPeriodEnd: false,
    });
    let ent = await entitlementFor(cid);
    expect(ent.active).toBe(true);
    expect(ent.plan).toBe("month");
    expect(ent.deepLeft).toBe(DEEP_PER_MONTH);
    expect(ent.resetsAt).toBe(now + 25 * 86_400_000);

    const input = { question: "Will it work?", values: VALUES, castAtMs: AT, tzOffsetMinutes: 0, locale: "en" as const };
    const r = await redeemSubscription(cid, "deep", input);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.sid).toMatch(/^sub_[0-9a-f]{36}$/);
    ent = await entitlementFor(cid);
    expect(ent.deepLeft).toBe(DEEP_PER_MONTH - 1);

    // the pseudo-session is a paid record for everything downstream: the member's email, no charge
    const rec = await verifyPaidSession(r.sid);
    expect(rec?.tier).toBe("deep");
    expect(rec?.email).toBe("member@example.com");
    expect(rec?.subscription).toBe(true);
    expect(rec?.amountCents).toBe(0);
    expect(rec?.input.question).toBe("Will it work?");
    expect(subUseByToken(r.sid.slice(4))?.tier).toBe("deep");
    expect(await verifyPaidSession("sub_" + "0".repeat(36))).toBeNull();

    // spend the rest, then the allowance is gone but light readings still flow
    // 09-29: the same cast redeemed again (double tap / retry) hands back the same unit, nothing more is spent
    const again = await redeemSubscription(cid, "deep", input);
    expect(again.ok && again.sid).toBe(r.sid);
    expect((await entitlementFor(cid)).deepLeft).toBe(DEEP_PER_MONTH - 1);
    for (let i = 0; i < DEEP_PER_MONTH - 1; i++) expect((await redeemSubscription(cid, "deep", { ...input, castAtMs: AT + i + 1 })).ok).toBe(true);
    const out = await redeemSubscription(cid, "deep", { ...input, castAtMs: AT + 999 });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toBe("deep_exhausted");
    expect((await redeemSubscription(cid, "one", input)).ok).toBe(true);
  });

  it("a canceled subscription covers nothing; a yearly one renews its deep allowance every 30 days", async () => {
    const gone = upsertCustomer("gone@example.com", "en");
    upsertSubscription({
      customerId: gone, stripeCustomerId: "cus_g", stripeSubscriptionId: "sub_gone", status: "canceled", plan: "month",
      periodStart: Date.now() - 40 * 86_400_000, periodEnd: Date.now() - 10 * 86_400_000, cancelAtPeriodEnd: true,
    });
    const e = await entitlementFor(gone);
    expect(e.active).toBe(false);
    expect(e.deepLeft).toBe(0);
    const r = await redeemSubscription(gone, "one", { question: "?", values: VALUES, castAtMs: AT, tzOffsetMinutes: 0, locale: "en" });
    expect(r.ok).toBe(false);

    const yearly = upsertCustomer("yearly@example.com", "en");
    const start = Date.now() - 45 * 86_400_000;
    const row = upsertSubscription({
      customerId: yearly, stripeCustomerId: "cus_y", stripeSubscriptionId: "sub_year", status: "active", plan: "year",
      periodStart: start, periodEnd: start + 365 * 86_400_000, cancelAtPeriodEnd: false,
    });
    const w = allowanceWindow(row);
    expect(w.since).toBe(start + month); // 45 days in → second 30-day allowance month
    expect(w.until).toBe(start + 2 * month);
    expect((await entitlementFor(yearly)).resetsAt).toBe(start + 2 * month);
  });
});

describe("stripe webhook signature", () => {
  it("accepts a fresh, correctly signed payload and rejects everything else", () => {
    const secret = "whsec_test";
    const payload = JSON.stringify({ type: "customer.subscription.updated", data: { object: { id: "sub_1" } } });
    const t = Math.floor(Date.now() / 1000);
    const v1 = createHmac("sha256", secret).update(`${t}.${payload}`).digest("hex");
    expect(verifyWebhookSignature(payload, `t=${t},v1=${v1}`, secret)).toBe(true);
    expect(verifyWebhookSignature(payload + " ", `t=${t},v1=${v1}`, secret)).toBe(false);
    expect(verifyWebhookSignature(payload, `t=${t},v1=${"0".repeat(64)}`, secret)).toBe(false);
    expect(verifyWebhookSignature(payload, `t=${t - 900},v1=${createHmac("sha256", secret).update(`${t - 900}.${payload}`).digest("hex")}`, secret)).toBe(false);
    expect(verifyWebhookSignature(payload, null, secret)).toBe(false);
  });
});

function chartStub(): Record<string, unknown> {
  return {
    cast: { primary: { number: 3, fullZh: "水雷屯" }, changed: { number: 49, fullZh: "泽火革" }, changingPositions: [3, 4] },
    palace: { palace: "坎", palacePhase: "水", world: 2, response: 5 },
    calendar: { year: { stem: "丙", branch: "午" }, month: { stem: "丙", branch: "申" }, day: { stem: "庚", branch: "辰" }, voidBranches: ["申", "酉"] },
  };
}
