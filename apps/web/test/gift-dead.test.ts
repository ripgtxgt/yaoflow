import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { randomBytes } from "node:crypto";
import { createGrant } from "../src/lib/db";
import { redeemGiftCast } from "../src/lib/grants";
import { GET } from "../src/app/api/grant/gift/route";

// 10-16: an old gift link opened again says so (156 「出錯了」 in 12 sessions were spent links), and the browser that
// spent it is pointed back to its reading.
const ask = async (token: string, dv?: string) =>
  (await GET(new NextRequest(`https://x.test/api/grant/gift?token=${token}`, dv ? { headers: { cookie: `yf_dv=${dv}` } } : undefined))).json();

describe("gift link state", () => {
  it("open, then used (with the way back for the browser that used it), then expired", async () => {
    const token = randomBytes(18).toString("hex");
    createGrant({ token, kind: "gift_cast", tier: "deep", expiresAt: Date.now() + 86_400_000, fromSessionId: "cs_test_dead" });
    expect((await ask(token)).state).toBe("open");
    expect(redeemGiftCast(token, "{}", "friend@example.test", null, "zh-hant", "aaaaaaaaaaaaaaaaaaaaaaaa").ok).toBe(true);
    expect(await ask(token, "aaaaaaaaaaaaaaaaaaaaaaaa")).toMatchObject({ state: "used", sid: `gr_${token}` });
    const other = await ask(token, "bbbbbbbbbbbbbbbbbbbbbbbb");
    expect(other.state).toBe("used");
    expect(other.sid).toBeUndefined();
    const old = randomBytes(18).toString("hex");
    createGrant({ token: old, kind: "gift_cast", tier: "deep", expiresAt: Date.now() - 1000, fromSessionId: "cs_test_old" });
    expect((await ask(old)).state).toBe("expired");
  });
});
