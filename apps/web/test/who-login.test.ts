import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { whoFrom, whoValue, WHO_COOKIE } from "../src/lib/who-mark";
import { deviceModel } from "../src/lib/ua-brief";
import { _resetPresence, snapshot, touch } from "../src/lib/presence";
import { knownFrom } from "../src/lib/presence-marks";
import { POST as trackPOST } from "../src/app/api/track/route";
import { POST as codePOST } from "../src/app/api/auth/code/route";
import { CODE_TRIES, issueLoginToken, redeemLoginCode, redeemLoginToken } from "../src/lib/auth";
import { buildLoginEmail } from "../src/lib/email";
import { LOGIN_CODE_T } from "../src/lib/dict/login-code";
import { customerForSession, upsertCustomer } from "../src/lib/db";
import { grantInviteLight } from "../src/lib/grants";
import { verifyPaidSession } from "../src/lib/paid-store";
import { browserSessionOf } from "../src/lib/browser-session";
import { PRIVACY } from "../src/lib/legal";
import { PRIVACY_HANT } from "../src/lib/legal-hant";
import { LOCALES } from "../src/lib/locales";

/** 10-02 (Neil: 「付过钱的为什么还是访客」「设备型号」「领过免费的也应该能查到是谁」→「好，都做吧」) */

describe("认人标记 yf_who", () => {
  it("vouches for one customer id, and only when we signed it", () => {
    const v = whoValue(42);
    expect(whoFrom(v)).toBe(42);
    expect(whoFrom(v.replace(/^42\./, "43."))).toBeNull(); // another id under the same signature
    expect(whoFrom("42.AAAAAAAAAAAAAAAAAAAAAA")).toBeNull();
    expect(whoFrom("hello")).toBeNull();
    expect(whoFrom(undefined)).toBeNull();
  });

  it("the board names a browser that is not signed in by its mark — and a signed-in tab by its sign-in", () => {
    _resetPresence();
    const cid = upsertCustomer("known-who@example.com", "zh-hant");
    const req = new NextRequest("http://localhost/api/track", { method: "POST", headers: { cookie: `${WHO_COOKIE}=${whoValue(cid)}` } });
    const known = knownFrom(req, false);
    expect(known).toEqual({ id: cid, email: "known-who@example.com" });
    expect(knownFrom(req, true)).toBeNull(); // signed in: the sign-in speaks
    touch({ s: "whotab1", t: Date.now(), e: "page_view", path: "/zh-hant/cast", known, model: "iPhone 16 Pro Max · iOS 26.6 · Threads" });
    const row = snapshot().rows.find((r) => r.s === "whotab1")!;
    expect(row).toMatchObject({ customerId: null, who: "known-who", recognized: true, knownId: cid, model: "iPhone 16 Pro Max · iOS 26.6 · Threads" });
    const feed = snapshot().feed.find((f) => f.s === "whotab1")!;
    expect(feed).toMatchObject({ who: "known-who", recognized: true });
  });

  it("api/track reads the mark (and ignores a forged one)", async () => {
    _resetPresence();
    const cid = upsertCustomer("track-who@example.com", "en");
    const post = (cookie: string, s: string) => trackPOST(new NextRequest("http://localhost/api/track", {
      method: "POST",
      headers: { "content-type": "application/json", cookie, "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 26_6_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/23G90 Barcelona 449.0.0.31.70 (iPhone17,2; iOS 26_6_2; zh_HK; zh-Hant-HK; scale=3.00; 1320x2868; IABMV/1; 1077561780)" },
      body: JSON.stringify({ e: "page_view", s, path: "/en/cast" }),
    }));
    await post(`${WHO_COOKIE}=${whoValue(cid)}`, "whotrack1");
    await post(`${WHO_COOKIE}=${cid}.forgedforgedforgedforg`, "whotrack2");
    const rows = snapshot().rows;
    expect(rows.find((r) => r.s === "whotrack1")).toMatchObject({ recognized: true, who: "track-who", model: "iPhone 16 Pro Max · iOS 26.6 · Threads" });
    expect(rows.find((r) => r.s === "whotrack2")).toMatchObject({ recognized: false, who: null });
  });
});

describe("设备型号", () => {
  it("names the phone when the browser does, and says what it can otherwise", () => {
    const cases: [string, string][] = [
      ["Mozilla/5.0 (iPhone; CPU iPhone OS 26_6_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/23G90 Barcelona 449.0.0.31.70 (iPhone17,2; iOS 26_6_2; zh_HK; zh-Hant-HK; scale=3.00; 1320x2868; IABMV/1; 1077561780)", "iPhone 16 Pro Max · iOS 26.6 · Threads"],
      ["Mozilla/5.0 (Linux; Android 16; SM-S9310 Build/BP4A.251205.006; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/153.0.8010.36 Mobile Safari/537.36 Barcelona 449.0.0.54.82 Android (36/16; 420dpi; 1080x2340; samsung; SM-S9310; pa1q; qcom; zh_HK_#Hant; 1079714040)", "Galaxy S25 · Android 16 · Threads"],
      ["Mozilla/5.0 (iPhone; CPU iPhone OS 26_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/23H24 Instagram 448.0.0.39.66 (iPhone18,2; iOS 26_7; zh_HK; zh-Hant-HK; scale=3.00; 1320x2868; IABMV/1; 1072661960) Safari/604.1", "iPhone 17 Pro Max · iOS 26.7 · Instagram"],
      ["Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.7.5 Mobile/15E148 Safari/604.1", "iPhone · iOS 18.7 · Safari 18.7"],
      ["Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Mobile Safari/537.36", "Android 10 · Chrome 152"],
      ["Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Safari Line/26.15.0", "iPhone · iOS 18.7 · LINE"],
      ["Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36", "Pixel 8 Pro · Android 14 · Chrome 130"],
      ["Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Safari/605.1.15", "macOS · Safari 18.6"],
      ["Mozilla/5.0 (Linux; Android 15; 23127PN0CG Build/AQ3A.240627.003; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/140.0 Mobile Safari/537.36 Barcelona 449.0.0.54.82 Android (35/15; 440dpi; 1080x2400; Xiaomi; 23127PN0CG; houji; qcom; zh_TW; 1)", "Xiaomi 23127PN0CG · Android 15 · Threads"],
      ["Mozilla/5.0 (Linux; Android 17; Pixel 6 Build/CP1A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/150.0 Mobile Safari/537.36 Barcelona 451.0 Android (37/17; 420dpi; 1080x2400; Google/google; Pixel 6; oriole; oriole; zh_TW; 1)", "Google Pixel 6 · Android 17 · Threads"],
      ["Mozilla/5.0 (iPhone; CPU iPhone OS 26_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/23B Barcelona 450.0 (iPhone19,1; iOS 26_1; zh_TW)", "iPhone19,1 · iOS 26.1 · Threads"], // a model newer than the table: its code
    ];
    for (const [ua, want] of cases) expect(deviceModel(ua), ua.slice(0, 60)).toBe(want);
    expect(deviceModel("Googlebot/2.1")).toBeUndefined();
    expect(deviceModel(null)).toBeUndefined();
  });
});

describe("登录码", () => {
  it("every letter carries six digits that sign in once, in the browser they are typed into", () => {
    const issued = issueLoginToken("Code-Reader@Example.com", "zh-hant", "/zh-hant/account")!;
    expect(issued.code).toMatch(/^\d{6}$/);
    const wrong = issued.code === "000000" ? "111111" : "000000";
    expect(redeemLoginCode("code-reader@example.com", wrong)).toEqual({ ok: false, reason: "bad" });
    const r = redeemLoginCode(" CODE-READER@example.com ", `${issued.code.slice(0, 3)} ${issued.code.slice(3)}`);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.nextPath).toBe("/zh-hant/account");
    expect(customerForSession(r.sessionId)?.email).toBe("code-reader@example.com");
    // one letter, one sign-in: neither the code again nor the link
    expect(redeemLoginCode("code-reader@example.com", issued.code)).toEqual({ ok: false, reason: "expired" });
    expect(redeemLoginToken(issued.raw)).toBeNull();
  });

  it("the link spends the code too", () => {
    const issued = issueLoginToken("link-first@example.com", "en", null)!;
    expect(redeemLoginToken(issued.raw)).not.toBeNull();
    expect(redeemLoginCode("link-first@example.com", issued.code)).toEqual({ ok: false, reason: "expired" });
  });

  it(`${CODE_TRIES} wrong codes and the letter's code is dead (its link still works)`, () => {
    const issued = issueLoginToken("guess@example.com", "en", null)!;
    const wrong = issued.code === "999999" ? "888888" : "999999";
    for (let i = 0; i < CODE_TRIES - 1; i++) expect(redeemLoginCode("guess@example.com", wrong)).toEqual({ ok: false, reason: "bad" });
    expect(redeemLoginCode("guess@example.com", wrong)).toEqual({ ok: false, reason: "too_many" });
    expect(redeemLoginCode("guess@example.com", issued.code)).toEqual({ ok: false, reason: "too_many" });
    expect(redeemLoginToken(issued.raw)).not.toBeNull();
    expect(redeemLoginCode("nobody@example.com", "123456")).toEqual({ ok: false, reason: "expired" });
    expect(redeemLoginCode("guess@example.com", "12345")).toEqual({ ok: false, reason: "bad" });
  });

  it("the route signs this browser in and leaves the board's mark", async () => {
    const issued = issueLoginToken("route-code@example.com", "ja", null)!;
    const res = await codePOST(new NextRequest("http://localhost/api/auth/code", {
      method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "198.51.100.77" },
      body: JSON.stringify({ email: "route-code@example.com", code: issued.code }),
    }));
    expect(res.status).toBe(200);
    expect(((await res.json()) as { next: string }).next).toBe("/ja/account");
    expect(res.cookies.get("yf_session")?.value).toMatch(/^[0-9a-f]{64}$/);
    expect(whoFrom(res.cookies.get(WHO_COOKIE)?.value)).toBeGreaterThan(0);
    const bad = await codePOST(new NextRequest("http://localhost/api/auth/code", {
      method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "198.51.100.78" },
      body: JSON.stringify({ email: "route-code@example.com", code: "123456" }),
    }));
    expect(bad.status).toBe(400);
  });

  it("the letter shows the code first — subject, page and text — in every language", () => {
    const link = "https://yaoflow.com/api/auth/verify?t=" + "a".repeat(64) + "&l=zh";
    for (const l of LOCALES) {
      const t = (LOGIN_CODE_T as Record<string, Record<string, string>>)[l]!;
      expect(Object.keys(t).sort(), l).toEqual(Object.keys(LOGIN_CODE_T.zh).sort());
      const m = buildLoginEmail(l, link, "x@example.com", "21:05", "482913");
      expect(m.subject, l).toMatch(/^482913 · .+ · 21:05$/);
      expect(m.html, l).toContain("482913");
      expect(m.html, l).toContain(t.mailLabel);
      expect(m.text, l).toContain(`${t.mailLabel}: 482913`);
      expect(m.html, l).not.toMatch(/\{[a-z]+\}/);
    }
    expect(buildLoginEmail("zh-hant", link, "x@example.com", undefined, "482913").html).toContain("登入碼");
    expect(buildLoginEmail("zh", link, "x@example.com").subject).toBe("登录 YaoFlow"); // no code: as before
  });
});

describe("订单记下浏览器会话", () => {
  it("a free claim now carries the tab it was claimed in", async () => {
    expect(browserSessionOf({ bs: "hmp4btvn1g32" })).toBe("hmp4btvn1g32");
    expect(browserSessionOf({ bs: "nosession" })).toBeUndefined();
    expect(browserSessionOf({ bs: "<script>" })).toBeUndefined();
    const input = JSON.stringify({ question: "這份工作我該不該換", values: [7, 8, 9, 8, 7, 8], castAtMs: Date.now(), tzOffsetMinutes: 480, locale: "zh-hant", bs: "h3c0fr6lltqp" });
    const sid = grantInviteLight("898879", input, "bs-claim@example.com", null, "zh-hant", "deep");
    const rec = await verifyPaidSession(sid);
    expect(rec?.browserSid).toBe("h3c0fr6lltqp");
  });
});

describe("隐私政策写明认人标记与登录码", () => {
  it("every language names yf_who and the six-digit code", () => {
    const all = (l: string) => (l === "zh-hant" ? JSON.stringify(PRIVACY_HANT) : JSON.stringify(PRIVACY.map((s) => (s as unknown as Record<string, unknown>)[l])));
    for (const l of LOCALES) {
      expect(all(l), l).toContain("yf_who");
      expect(all(l), l).toMatch(/6/);
    }
  });
});
