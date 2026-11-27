import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { randomBytes } from "node:crypto";
import { createGrant, createSession, upsertCustomer } from "../src/lib/db";
import { SESSION_COOKIE } from "../src/lib/auth";
import { GET } from "../src/app/api/grant/gift/route";
import { dropGift, keepGift, keptGift, loadPending, savePending } from "../src/lib/cast-ui/store";

/**
 * 10-22 (客服 #1928): a friend's gift link was lost on the way — cast on it, went to sign in, came back to an empty
 * page, then asked from the account page (/cast?q=, no gift=) and met the price, three times. The browser now keeps
 * the open gift (and a figure cast on it) until it is spent, expired, or turns out to be the reader's own.
 */
function fakeStorage() {
  const m = new Map<string, string>();
  vi.stubGlobal("localStorage", { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) });
  return m;
}
afterEach(() => { vi.unstubAllGlobals(); });

describe("the gift this browser opened and has not spent", () => {
  it("is kept, read back, outlives a sign-in, and is dropped only by its own token", () => {
    fakeStorage();
    const a = "a".repeat(36), b = "b".repeat(36);
    expect(keptGift()).toBeNull();
    keepGift(a);
    expect(keptGift()).toBe(a);
    keepGift("not-a-token");
    expect(keptGift()).toBe(a);
    dropGift(b); // another link's spend leaves this one
    expect(keptGift()).toBe(a);
    keepGift(b); // the newer link opened wins
    expect(keptGift()).toBe(b);
    dropGift(b);
    expect(keptGift()).toBeNull();
    keepGift(a, Date.now() - 91 * 86_400_000); // past 90 days: forgotten
    expect(keptGift()).toBeNull();
  });

  it("a figure cast on a gift link waits through the sign-in with its gift", () => {
    fakeStorage();
    const g = "c".repeat(36);
    savePending({ q: "他下個月會回來嗎", values: [7, 8, 9, 6, 7, 8], at: Date.now(), locale: "zh-hant", gift: g });
    expect(loadPending()).toMatchObject({ q: "他下個月會回來嗎", gift: g });
  });

  it("no storage at all (private mode that throws): nothing kept, nothing breaks", () => {
    vi.stubGlobal("localStorage", { getItem: () => { throw new Error("denied"); }, setItem: () => { throw new Error("denied"); }, removeItem: () => { throw new Error("denied"); } });
    expect(() => keepGift("d".repeat(36))).not.toThrow();
    expect(keptGift()).toBeNull();
    expect(() => dropGift()).not.toThrow();
  });
});

describe("/api/grant/gift says when the gift is the reader's own (so the page does not keep it)", () => {
  const ask = async (token: string, cookie?: string) =>
    (await GET(new NextRequest(`https://x.test/api/grant/gift?token=${token}`, cookie ? { headers: { cookie } } : undefined))).json();

  it("the giver's account and the browser that made it are told own; a friend is not", async () => {
    const giver = upsertCustomer("gk-giver@example.com", "zh-hant");
    const friend = upsertCustomer("gk-friend@example.com", "zh-hant");
    const token = randomBytes(18).toString("hex");
    createGrant({ token, kind: "gift_cast", tier: "deep", expiresAt: Date.now() + 86_400_000, fromSessionId: "cs_test_gk", fromCustomerId: giver, fromDevice: "a".repeat(24) });
    const sg = "1".repeat(64), sf = "2".repeat(64);
    createSession(sg, giver, 3_600_000);
    createSession(sf, friend, 3_600_000);
    expect(await ask(token, `${SESSION_COOKIE}=${sg}`)).toMatchObject({ state: "open", own: true });
    expect(await ask(token, `yf_dv=${"a".repeat(24)}`)).toMatchObject({ state: "open", own: true });
    const f = await ask(token, `${SESSION_COOKIE}=${sf}; yf_dv=${"b".repeat(24)}`);
    expect(f.state).toBe("open");
    expect(f.own).toBeUndefined();
    expect((await ask(token)).own).toBeUndefined();
  });

  it("a support gift (no giver) is nobody's own", async () => {
    const token = randomBytes(18).toString("hex");
    createGrant({ token, kind: "gift_cast", tier: "deep", expiresAt: Date.now() + 86_400_000, fromSessionId: "comp_1022_test", via: "comp" });
    const r = await ask(token, `yf_dv=${"c".repeat(24)}`);
    expect(r.state).toBe("open");
    expect(r.own).toBeUndefined();
  });
});
