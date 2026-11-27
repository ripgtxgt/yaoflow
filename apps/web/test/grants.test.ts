import { describe, expect, it } from "vitest";
import type { LineValue } from "@yaoflow/engine";
import { createGrant, customerHadInviteLight, giftCastForSession, grantByToken, grantStats, orderBySession, recordOrder, saveCast, saveReading, upsertCustomer } from "../src/lib/db";
import { canMintGift, GIFT_CAST_DAYS, giftLink, grantInviteLight, mintGiftCast, redeemGiftCast } from "../src/lib/grants";
import { verifyPaidSession } from "../src/lib/paid-store";
import { buildReadingEmail, buildRevisitEmail } from "../src/lib/email";
import { buildRewardEmail } from "../src/lib/referral";
import { resolveServerChart } from "../src/lib/reading";

const VALUES: LineValue[] = [7, 8, 9, 8, 7, 8];
const INPUT = JSON.stringify({ question: "要不要接这个项目", values: VALUES, castAtMs: Date.UTC(2026, 8, 10, 3), tzOffsetMinutes: 480, locale: "zh" });

/** a paid deep reading on record: cast + reading + order, the way the reading page leaves them */
function paidDeep(sid: string, status = "paid", amount = 999) {
  const cid = upsertCustomer(`${sid}@example.com`, "zh");
  const input = { question: "问一件事", values: VALUES, castAtMs: Date.UTC(2026, 8, 10, 3), tzOffsetMinutes: 480 };
  const chart = resolveServerChart(input, true) as unknown as Record<string, unknown>;
  const castId = saveCast({ customerId: cid, castAtMs: input.castAtMs, tzOffsetMinutes: 480, locale: "zh", question: input.question, topic: "career", values: VALUES, chart });
  saveReading(castId, cid, "deep", "zh", { verdict: { zh: "可成" } } as never);
  recordOrder({ sessionId: sid, customerId: cid, castId, tier: "deep", amountCents: amount, currency: "USD", email: `${sid}@example.com`, status });
  return cid;
}

describe("送一卦 (gift a cast)", () => {
  it("only a deep reading that was paid for — money or membership — can give one away", () => {
    paidDeep("cs_g1");
    paidDeep("sub_g2", "subscription", 0);
    paidDeep("gf_g3", "gift", 0);
    expect(canMintGift("cs_g1")).toBe(true);
    expect(canMintGift("sub_g2")).toBe(true);
    expect(canMintGift("gf_g3")).toBe(false);
    expect(canMintGift("cs_nothing")).toBe(false);
  });

  it("mints one link per reading, 14 days long, and returns the same one on a second ask", () => {
    const cid = paidDeep("cs_g4");
    const a = mintGiftCast("cs_g4", "zh", cid, "787878");
    const b = mintGiftCast("cs_g4", "zh", cid, "787878");
    expect(a.token).toBe(b.token);
    expect(a.kind).toBe("gift_cast");
    expect(Math.abs(a.expires_at - a.created_at - GIFT_CAST_DAYS * 86_400_000)).toBeLessThan(1000);
    expect(giftCastForSession("cs_g4")?.token).toBe(a.token);
    expect(giftLink("https://yaoflow.com", "ja", a.token)).toBe(`https://yaoflow.com/ja/cast?gift=${a.token}`);
  });

  it("a friend spends it once on their own cast and it becomes a deep reading downstream", async () => {
    const cid = paidDeep("cs_g5");
    const g = mintGiftCast("cs_g5", "en", cid, null);
    const r = redeemGiftCast(g.token, INPUT, "friend@example.com", null, "zh");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.sid).toBe(`gr_${g.token}`);
    const rec = await verifyPaidSession(r.sid);
    expect(rec).toMatchObject({ tier: "deep", locale: "zh", reward: true, grantKind: "gift_cast", email: "friend@example.com", amountCents: 0 });
    expect(rec!.input.values).toEqual(VALUES);
    // second use is refused; a made-up token is unknown
    expect(redeemGiftCast(g.token, INPUT, null, null, "zh")).toEqual({ ok: false, error: "already_used" });
    expect(redeemGiftCast("f".repeat(36), INPUT, null, null, "zh")).toEqual({ ok: false, error: "unknown_token" });
  });

  it("an expired link is refused", () => {
    createGrant({ token: "e".repeat(36), kind: "gift_cast", tier: "deep", expiresAt: Date.now() - 1000, fromSessionId: "cs_old" });
    expect(redeemGiftCast("e".repeat(36), INPUT, null, null, "zh")).toEqual({ ok: false, error: "expired" });
  });
});

describe("双边推荐 (invited newcomer's free light reading)", () => {
  it("mints and spends in one step, remembers the account, and reads as a light reward downstream", async () => {
    const cid = upsertCustomer("newcomer@example.com", "en");
    expect(customerHadInviteLight(cid)).toBe(false);
    const sid = grantInviteLight("787878", INPUT, "newcomer@example.com", cid, "en");
    expect(sid).toMatch(/^gr_[0-9a-f]{36}$/);
    expect(customerHadInviteLight(cid)).toBe(true);
    const rec = await verifyPaidSession(sid);
    expect(rec).toMatchObject({ tier: "one", reward: true, grantKind: "invite_light", via: "787878", customerId: cid });
    const g = grantByToken(sid.slice(3))!;
    expect(g.used_at).toBeGreaterThan(0);
    const st = grantStats(Date.now() - 60_000);
    expect(st.inviteLight).toBeGreaterThanOrEqual(1);
    expect(st.giftClaimed).toBeGreaterThanOrEqual(1);
    expect(orderBySession("cs_g1")?.status).toBe("paid");
  });
});

describe("gift line in the mails", () => {
  const base = { question: "q", values: VALUES, hexName: "乾为天", changedName: null, headline: "h", url: "https://yaoflow.com/zh/reading?sid=cs_x" };
  it("appears only when a gift URL is given, in every language", () => {
    const withGift = buildReadingEmail({ ...base, locale: "ja", tier: "deep", giftUrl: "https://yaoflow.com/ja/reading?sid=cs_x#gift" });
    expect(withGift.html).toContain("#gift");
    expect(withGift.html).toContain("友だちのために一卦");
    const without = buildReadingEmail({ ...base, locale: "ja", tier: "one" });
    expect(without.html).not.toContain("#gift");
    const rv = buildRevisitEmail({ locale: "fr", question: "q", values: VALUES, hexName: "x", changedName: null, timingQuote: null, windowDays: 7, readingUrl: "https://yaoflow.com/fr/reading?sid=cs_x", castUrl: "https://yaoflow.com/fr", giftUrl: "https://yaoflow.com/fr/reading?sid=cs_x#gift" });
    expect(rv.html).toContain("Offrir une lecture à un ami");
    expect(rv.text).toContain("#gift");
  });
  it("the referral reward mail is on paper now, like every other email", () => {
    const m = buildRewardEmail("zh", "https://yaoflow.com/zh/cast?reward=" + "a".repeat(36));
    expect(m.html).toContain("background:#f4f2ec;color:#14151c");
    expect(m.html).not.toContain("opacity");
  });
});
