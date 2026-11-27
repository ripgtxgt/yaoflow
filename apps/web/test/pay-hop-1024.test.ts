import { describe, expect, it, vi } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { PendingRow } from "../src/lib/recover-offer";

/**
 * 10-24 (Neil 转来 #2915：「完全没办法付款，支付宝一直在跳转页面不动」): inside WeChat / QQ a payment page goes through our
 * hop page first (Alipay cannot be reached from in there); opened in a browser the same link goes straight on to Stripe.
 * Also: the offer page's button no longer makes a new Stripe page on every tap, and a membership reminder in yuan says a
 * membership takes a card. Stripe (fetch) is stubbed.
 */
process.env.STRIPE_SECRET_KEY = "sk_test_1024hop";
process.env.SITE_URL = "https://yaoflow.com";
const made: string[] = [];
vi.stubGlobal("fetch", vi.fn(async (url: string | URL, init?: { method?: string }) => {
  const path = String(url).replace("https://api.stripe.com/v1", "");
  const method = init?.method ?? "GET";
  if (method === "POST" && path === "/checkout/sessions") {
    await new Promise((r) => setTimeout(r, 20)); // a real round trip takes a moment — taps arrive meanwhile
    const id = `cs_test_hop_${made.length + 1}`;
    made.push(id);
    return Response.json({ id, url: `https://checkout.stripe.com/c/pay/${id}#fid`, status: "open", payment_status: "unpaid", metadata: {} });
  }
  const m = path.match(/^\/checkout\/sessions\/(cs_test_[A-Za-z0-9_]+)$/);
  if (m) return Response.json({ id: m[1], url: `https://checkout.stripe.com/c/pay/${m[1]}#fid`, status: "open", payment_status: "unpaid", metadata: {} });
  return new Response("{}", { status: 404 });
}));

const { blocksAppHandoff, handoffApp, isStripeCheckoutUrl, payHop } = await import("../src/lib/inapp-pay");
const { PAY_HOP_T } = await import("../src/lib/dict/pay-hop");
const { db, upsertCustomer } = await import("../src/lib/db");
const ro = await import("../src/lib/recover-offer");
const { buildRecoverOfferEmail } = await import("../src/lib/recover-offer-mail");
const { tongkaT } = await import("../src/lib/tongka");

const WECHAT_IOS = "Mozilla/5.0 (iPhone; CPU iPhone OS 26_6_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.78(0x18004e33) NetType/4G Language/zh_CN";
const WECHAT_ANDROID = "Mozilla/5.0 (Linux; Android 14; V2309A Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0.6723.103 Mobile Safari/537.36 XWEB/1300333 MMWEBSDK/20241103 MicroMessenger/8.0.54.2760(0x28003637) WeChat/arm64 Weixin NetType/WIFI Language/zh_CN ABI/arm64";
const QQ_IOS = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 QQ/9.0.65.611 V1_IPH_SQ_9.0.65_1_APP_A Pixel/1290 Core/WKWebView NetType/WIFI QBWebViewType/1 WKType/1";
const QQ_BROWSER = "Mozilla/5.0 (Linux; U; Android 13; zh-cn; 22081212C Build/TKQ1.220829.002) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/109.0.5414.86 MQQBrowser/14.6 Mobile Safari/537.36 COVC/046701";
const SAFARI = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.6.1 Mobile/15E148 Safari/604.1";
const THREADS = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Barcelona 405.0.0.31.89 (iPhone16,2; iOS 18_6; zh_TW; zh-Hant; scale=3.00; 1179x2556; 789012345) NW/3";
const STRIPE = "https://checkout.stripe.com/c/pay/cs_live_a1B2c3#fidkdWxOYHwnPyd1blpxYHZxWjA0";
const req = (ua: string) => ({ headers: new Headers({ "user-agent": ua }) });

describe("微信／QQ 里打开付款：先到我们的中转页", () => {
  it("WeChat (iPhone, Android) and QQ's own browser are told apart from real browsers — QQ Browser and Threads are not held", () => {
    for (const ua of [WECHAT_IOS, WECHAT_ANDROID, QQ_IOS]) expect(blocksAppHandoff(ua)).toBe(true);
    for (const ua of [QQ_BROWSER, SAFARI, THREADS, "", null, undefined]) expect(blocksAppHandoff(ua)).toBe(false);
    expect(handoffApp(WECHAT_ANDROID)).toBe("wechat");
    expect(handoffApp(QQ_IOS)).toBe("qq");
    expect(handoffApp(SAFARI)).toBeNull();
  });
  it("only a Stripe Checkout page is ever sent on to", () => {
    expect(isStripeCheckoutUrl(STRIPE)).toBe(true);
    for (const u of ["https://evil.example/c/pay/cs_live_x", "https://checkout.stripe.com.evil.com/c/pay/x", "javascript:alert(1)", "http://checkout.stripe.com/c/pay/x", "https://checkout.stripe.com/c/pay/x\"><script>", 42, null]) {
      expect(isStripeCheckoutUrl(u)).toBe(false);
    }
  });
  it("from WeChat the route hands back the hop page; from Safari the Stripe page; our own pages are left alone", () => {
    expect(payHop(req(WECHAT_IOS), STRIPE, "zh")).toBe(`https://yaoflow.com/zh/pay?u=${encodeURIComponent(STRIPE)}`);
    expect(payHop(req(QQ_IOS), STRIPE, "zh-hant")).toBe(`https://yaoflow.com/zh-hant/pay?u=${encodeURIComponent(STRIPE)}`);
    expect(payHop(req(SAFARI), STRIPE, "zh")).toBe(STRIPE);
    expect(payHop(req(WECHAT_IOS), "/zh/reading?sid=gf_x", "zh")).toBe("/zh/reading?sid=gf_x");
    expect(payHop(req(WECHAT_IOS), null, "zh")).toBeNull();
    expect(payHop(req(WECHAT_IOS), STRIPE, "../x")).toBe(`https://yaoflow.com/zh/pay?u=${encodeURIComponent(STRIPE)}`);
  });
  it("every checkout route goes through payHop (no route hands a bare Stripe page back)", () => {
    const files: string[] = [];
    const walk = (dir: string) => { for (const n of readdirSync(dir)) { const p = join(dir, n); if (statSync(p).isDirectory()) walk(p); else if (/\.(ts|tsx)$/.test(n)) files.push(p); } };
    walk(join(__dirname, "../src/app/api"));
    walk(join(__dirname, "../src/lib/checkout"));
    const bare = files.filter((f) => /url:\s*(s|session|retry)\.url\b|NextResponse\.redirect\(\s*r\.(url|redirect)\b/.test(readFileSync(f, "utf8")));
    expect(bare).toEqual([]);
  });
  it("the hop page's words: nine languages, the same keys, the app named everywhere it is meant to be", () => {
    const keys = (o: object) => Object.keys(o).sort().join();
    expect(Object.keys(PAY_HOP_T)).toHaveLength(9);
    for (const [l, t] of Object.entries(PAY_HOP_T)) {
      expect(keys(t), l).toBe(keys(PAY_HOP_T.en!));
      for (const k of ["title", "lead", "cardNote", "after"] as const) expect(t[k], `${l} ${k}`).toContain("{app}");
      expect(t.appName.wechat.length).toBeGreaterThan(1);
      expect(t.appName.qq).toBe("QQ");
    }
    expect(PAY_HOP_T.zh!.title.replace("{app}", PAY_HOP_T.zh!.appName.wechat)).toBe("微信里没办法跳到支付宝");
  });
});

describe("挽回 7 折页：连点不再开一堆付款页", () => {
  it("taps that arrive together, and taps after, all go to the one Stripe page while it is open", async () => {
    upsertCustomer("hop1024@reader1024.net", "zh");
    ro.notePending({ co: "coHOP1024", sessionId: "cs_test_hop_orig", kind: "pass", email: "hop1024@reader1024.net", remind: true, locale: "zh", currency: "cny", amount: 990, product: "1 日通卡",
      managed: false, cardHint: true, metadata: { locale: "zh", currency: "CNY", kind: "pass", days: "1" }, cancelUrl: "https://yaoflow.com/zh/account", successUrl: "https://yaoflow.com/zh/account?pass={CHECKOUT_SESSION_ID}", now: Date.now() - 20 * 60_000 });
    db().prepare("INSERT INTO recover_offers (token, co, session_id, kind, email, locale, currency, base_minor, offer_minor, sent_at, expires_at, fallback_url) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)")
      .run("tokHOP1024000000001", "coHOP1024", "cs_test_hop_orig", "pass", "hop1024@reader1024.net", "zh", "CNY", 990, 690, Date.now() - 10 * 60_000, Date.now() + 50 * 60_000, null);
    const together = await Promise.all(Array.from({ length: 7 }, () => ro.offerCheckout("tokHOP1024000000001", "https://yaoflow.com")));
    expect(made).toHaveLength(1);
    for (const r of together) expect(r).toEqual({ url: `https://checkout.stripe.com/c/pay/${made[0]}#fid` });
    const later = await ro.offerCheckout("tokHOP1024000000001", "https://yaoflow.com");
    expect(made).toHaveLength(1);
    expect(later).toEqual({ url: `https://checkout.stripe.com/c/pay/${made[0]}#fid` });
  });
});

describe("会员提醒信（人民币）：会员只能刷卡，支付宝买通卡", () => {
  const p = (currency: string) => ({ kind: "month", currency, product: "YaoFlow 会员", meta_json: "{}" }) as unknown as PendingRow;
  const mail = (currency: string) => buildRecoverOfferEmail({ p: p(currency), locale: "zh", url: "https://yaoflow.com/zh/offer/x", base: "¥49", offer: "¥49", until: "21:30", unsub: "https://u", passUrl: "https://yaoflow.com/zh/account?want=pass" });
  it("in yuan the letter says a membership takes a card and the passes take Alipay — in any other money it does not", () => {
    expect(mail("CNY").text).toContain(tongkaT("zh").memberCardOnly);
    expect(mail("TWD").text).not.toContain(tongkaT("zh").memberCardOnly);
  });
  it("every language has the line", () => {
    for (const l of ["zh-hant", "zh", "en", "ja", "ko", "fr", "de", "es", "pt"]) expect(tongkaT(l).memberCardOnly).toMatch(/Alipay|支付寶|支付宝|알리페이/);
  });
});
