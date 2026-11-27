import { describe, expect, it } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { createSession, customerForSession, db, endPaySessionsOnForeign, recordOrder, upsertCustomer, upsertSubscription } from "../src/lib/db";
import { armPayLogin, maskEmail, PAY_LOGIN_COOKIE, PAY_LOGIN_TTL_MS, PAY_SESSION_TTL_MS, redeemPayLogin } from "../src/lib/pay-login";
import { issueLoginToken, redeemLoginToken } from "../src/lib/auth";
import { POST as payLoginPOST } from "../src/app/api/pay-login/route";
import { marksFrom } from "../src/lib/presence-marks";
import { _resetPresence, snapshot, touch } from "../src/lib/presence";
import { LEGAL_UPDATED, PRIVACY } from "../src/lib/legal";
import { PRIVACY_HANT } from "../src/lib/legal-hant";

/**
 * 10-02 (Neil: 「都做吧」) — the browser that pays is signed in to a NEW account, once, at that moment; the reading
 * link alone never signs anyone in; an address with any history must still use an email link.
 */
let n = 0;
const sidOf = () => `cs_test_paylogin_${Date.now().toString(36)}_${++n}`;

/** a checkout armed from a browser that is not signed in: returns the nonce the browser would hold */
function arm(sid: string, have?: string): string {
  const req = new NextRequest("http://localhost/api/checkout", { method: "POST", headers: have ? { cookie: `${PAY_LOGIN_COOKIE}=${have}` } : {} });
  const res = NextResponse.json({ ok: true });
  armPayLogin(req, res, sid);
  const c = res.cookies.get(PAY_LOGIN_COOKIE);
  expect(c?.httpOnly).toBe(true);
  expect(c?.maxAge).toBe(PAY_LOGIN_TTL_MS / 1000);
  return c!.value;
}

/** the reading page's fulfilment, reduced to what pay-login reads: a paid order on a customer made from the address */
function paidOrder(sid: string, email: string, status = "paid"): number {
  const cid = upsertCustomer(email, "zh");
  recordOrder({ sessionId: sid, customerId: cid, castId: null, tier: "deep", amountCents: 1299, currency: "usd", email, status });
  return cid;
}

const sessionsOf = (cid: number) => db().prepare("SELECT id, via, expires_at, created_at FROM sessions WHERE customer_id = ?").all(cid) as { id: string; via: string | null; expires_at: number; created_at: number }[];

describe("付款后自动登录 — the rules", () => {
  it("signs a brand-new address in once, with a 30-day session marked 'pay'", () => {
    const sid = sidOf();
    const nonce = arm(sid);
    expect(nonce).toMatch(/^[0-9a-f]{48}$/);
    const cid = paidOrder(sid, `new-${n}@example.com`);
    const r = redeemPayLogin(sid, nonce);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.customerId).toBe(cid);
    const s = sessionsOf(cid);
    expect(s).toHaveLength(1);
    expect(s[0]!.via).toBe("pay");
    expect(s[0]!.expires_at - s[0]!.created_at).toBe(PAY_SESSION_TTL_MS);
    expect(customerForSession(r.sessionId)?.via).toBe("pay");
    // once only
    expect(redeemPayLogin(sid, nonce)).toEqual({ ok: false, reason: "used" });
  });

  it("the reading link alone does nothing: no cookie, a wrong cookie, an unknown checkout", () => {
    const sid = sidOf();
    const nonce = arm(sid);
    paidOrder(sid, `link-${n}@example.com`);
    expect(redeemPayLogin(sid, undefined)).toEqual({ ok: false, reason: "no_cookie" });
    expect(redeemPayLogin(sid, "zz")).toEqual({ ok: false, reason: "no_cookie" });
    expect(redeemPayLogin(sid, "a".repeat(48))).toEqual({ ok: false, reason: "mismatch" });
    expect(redeemPayLogin(sidOf(), nonce)).toEqual({ ok: false, reason: "unknown" });
    // the right browser still can, afterwards
    expect(redeemPayLogin(sid, nonce).ok).toBe(true);
  });

  it("a browser keeps one nonce across checkouts; stale after 3 hours; nothing before the payment is recorded", () => {
    const a = sidOf(); const b = sidOf();
    const nonce = arm(a);
    expect(arm(b, nonce)).toBe(nonce);
    paidOrder(a, `stale-${n}@example.com`);
    expect(redeemPayLogin(a, nonce, Date.now() + PAY_LOGIN_TTL_MS + 60_000)).toEqual({ ok: false, reason: "stale" });
    expect(redeemPayLogin(b, nonce)).toEqual({ ok: false, reason: "not_paid" }); // no order yet
    const c = sidOf(); const nc = arm(c);
    paidOrder(c, `gift-${n}@example.com`, "gift");
    expect(redeemPayLogin(c, nc)).toEqual({ ok: false, reason: "not_paid" });
  });

  it("an address with any history needs an email link: another order, a membership, a sign-in ever, an old customer row", () => {
    // another order
    const e1 = `hist1-${n}@example.com`;
    paidOrder(sidOf(), e1);
    const s1 = sidOf(); const n1 = arm(s1); paidOrder(s1, e1);
    expect(redeemPayLogin(s1, n1)).toMatchObject({ ok: false, reason: "existing" });
    expect(redeemPayLogin(s1, n1)).toEqual({ ok: false, reason: "used" }); // decided once

    // a membership
    const e2 = `hist2-${n}@example.com`;
    const c2 = upsertCustomer(e2, "en");
    upsertSubscription({ customerId: c2, stripeCustomerId: "cus_pl2", stripeSubscriptionId: `sub_pl2_${n}`, status: "canceled", plan: "month",
      periodStart: Date.now() - 40 * 86_400_000, periodEnd: Date.now() - 10 * 86_400_000, cancelAtPeriodEnd: false });
    const s2 = sidOf(); const n2 = arm(s2); paidOrder(s2, e2);
    expect(redeemPayLogin(s2, n2)).toMatchObject({ ok: false, reason: "existing" });

    // signed in once and signed out (the session row is gone, the stamp is not)
    const e3 = `hist3-${n}@example.com`;
    const c3 = upsertCustomer(e3, "en");
    db().prepare("UPDATE customers SET last_login_at = ? WHERE id = ?").run(Date.now() - 86_400_000, c3);
    const s3 = sidOf(); const n3 = arm(s3); paidOrder(s3, e3);
    expect(redeemPayLogin(s3, n3)).toMatchObject({ ok: false, reason: "existing" });

    // known to us for longer than a day (a newsletter, a sealed question …)
    const e4 = `hist4-${n}@example.com`;
    const c4 = upsertCustomer(e4, "en");
    db().prepare("UPDATE customers SET first_seen = ? WHERE id = ?").run(Date.now() - 3 * 86_400_000, c4);
    const s4 = sidOf(); const n4 = arm(s4); paidOrder(s4, e4);
    expect(redeemPayLogin(s4, n4)).toMatchObject({ ok: false, reason: "existing" });
  });

  it("an email-link sign-in ends payment-made sessions on other browsers, and keeps its own", () => {
    const sid = sidOf(); const nonce = arm(sid);
    const email = `owner-${n}@example.com`;
    const cid = paidOrder(sid, email);
    const r = redeemPayLogin(sid, nonce);
    expect(r.ok).toBe(true);
    const raw = issueLoginToken(email, "en", null)!.raw;
    const login = redeemLoginToken(raw)!;
    expect(login.customerId).toBe(cid);
    const left = sessionsOf(cid);
    expect(left.map((s) => s.id)).toEqual([login.sessionId]);
    expect(left[0]!.via).toBe("email");
  });

  it("anything filed under the address by a browser not signed in to it ends payment-made sessions only", () => {
    const sid = sidOf(); const nonce = arm(sid);
    const cid = paidOrder(sid, `foreign-${n}@example.com`);
    const r = redeemPayLogin(sid, nonce);
    expect(r.ok).toBe(true);
    createSession("e".repeat(64), cid, 86_400_000, "email");
    expect(endPaySessionsOnForeign(cid, "test")).toBe(1);
    expect(sessionsOf(cid).map((s) => s.via)).toEqual(["email"]);
    expect(endPaySessionsOnForeign(null, "test")).toBe(0);
  });

  it("masks the address shown on the page", () => {
    expect(maskEmail("lena.w@gmail.com")).toBe("le***@gmail.com");
    expect(maskEmail("ab@x.io")).toBe("ab@x.io");
  });
});

describe("/api/pay-login", () => {
  const post = (sid: string, cookie?: string) => payLoginPOST(new NextRequest("http://localhost/api/pay-login", {
    method: "POST", headers: { "Content-Type": "application/json", ...(cookie ? { cookie } : {}) }, body: JSON.stringify({ sid }),
  }));

  it("sets the sign-in cookies for 30 days and clears the one-time cookie", async () => {
    const sid = sidOf(); const nonce = arm(sid);
    paidOrder(sid, `route-${n}@example.com`);
    const res = await post(sid, `${PAY_LOGIN_COOKIE}=${nonce}`);
    const j = await res.json() as { signedIn?: boolean; email?: string };
    expect(j.signedIn).toBe(true);
    expect(j.email).toBe(`ro***@example.com`);
    expect(res.cookies.get("yf_session")?.maxAge).toBe(PAY_SESSION_TTL_MS / 1000);
    expect(res.cookies.get("yf_in")?.value).toBe("1");
    expect(res.cookies.get(PAY_LOGIN_COOKIE)?.maxAge).toBe(0);
  });

  it("refuses bad ids, and says no without the browser's cookie", async () => {
    expect((await post("../etc")).status).toBe(400);
    const sid = sidOf(); arm(sid);
    paidOrder(sid, `nocookie-${n}@example.com`);
    const j = await (await post(sid)).json() as { signedIn?: boolean; reason?: string };
    expect(j).toEqual({ signedIn: false, reason: "no_cookie" });
  });
});

describe("实时面板 — marks on visitors who are not signed in", () => {
  const req = (cookie: string) => new NextRequest("http://localhost/api/pulse", { method: "POST", headers: cookie ? { cookie } : {} });

  it("reads the marker cookies, never who it is", () => {
    expect(marksFrom(req("yf_fd=1"), false)).toEqual({ paid: true, free: false, was: false });
    expect(marksFrom(req("yf_il=1"), false)).toEqual({ paid: false, free: true, was: false });
    expect(marksFrom(req("yf_ff=1"), false)).toEqual({ paid: false, free: true, was: false });
    expect(marksFrom(req("yf_session=" + "f".repeat(64)), false)).toEqual({ paid: false, free: false, was: true });
    // signed in right now: not "was"
    expect(marksFrom(req("yf_session=" + "f".repeat(64)), true).was).toBe(false);
    expect(marksFrom(req(""), false)).toEqual({ paid: false, free: false, was: false });
  });

  it("counts known-but-not-signed-in visitors, and paid ones apart", () => {
    _resetPresence();
    const t = Date.now();
    touch({ s: "markpaid01", t, e: "page_view", path: "/zh", marks: { paid: true }, replay: true });
    touch({ s: "markfree01", t, e: "page_view", path: "/zh", marks: { free: true }, replay: true });
    touch({ s: "markwas001", t, e: "page_view", path: "/zh", marks: { was: true }, replay: true });
    touch({ s: "marknone01", t, e: "page_view", path: "/zh", marks: {}, replay: true });
    touch({ s: "markmember", t, e: "page_view", path: "/zh", customer: { id: 999001, email: "m@example.com" }, marks: { paid: true, was: true }, replay: true });
    const snap = snapshot(t + 1000);
    expect(snap.knownAnon).toBe(3);
    expect(snap.knownAnonPaid).toBe(1);
    const row = snap.rows.find((r) => r.s === "markmember")!;
    expect(row.marks.was).toBe(false); // signed in now
    // paid sticks once seen; "was" follows the latest request
    touch({ s: "markwas001", t: t + 2000, e: "pulse", path: "/zh", marks: { was: false }, replay: true });
    touch({ s: "markpaid01", t: t + 2000, e: "pulse", path: "/zh", marks: {}, replay: true });
    const snap2 = snapshot(t + 3000);
    expect(snap2.rows.find((r) => r.s === "markwas001")!.marks.was).toBe(false);
    expect(snap2.rows.find((r) => r.s === "markpaid01")!.marks.paid).toBe(true);
  });
});

describe("隐私政策 says so", () => {
  it("dated 10-02 or later, in every language: the pay-made sign-in, its cookie, and the staff page", () => {
    expect(LEGAL_UPDATED >= "2026-10-02").toBe(true); // 10-03: the cast log changed the policy again
    const langs = Object.keys(PRIVACY[0]!);
    expect(langs.length).toBeGreaterThanOrEqual(8);
    for (const l of langs) {
      const text = PRIVACY.map((sec) => ((sec as Record<string, { p: string[] }>)[l]?.p ?? []).join(" ")).join(" ");
      expect(text, l).toContain("yf_pl");
      // the cookie's 30-day session, the bullet's 30 days and 30 minutes, and the rights section's 30 days
      expect(text.match(/\b30\b/g)?.length ?? 0, l).toBeGreaterThanOrEqual(4);
    }
    const hant = PRIVACY_HANT.map((s) => s.p.join(" ")).join(" ");
    expect(hant).toContain("yf_pl");
    expect(hant).toContain("30 分鐘");
  });
});
