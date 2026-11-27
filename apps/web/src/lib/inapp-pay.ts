/**
 * 10-24 (Neil 转来 #2915 的截图：「完全没办法付款，支付宝一直在跳转页面不动」): WeChat (and QQ) do not let a web page hand
 * over to the Alipay app. Inside them Stripe's Alipay button spins and then fails — that reader's two tries both came back
 * `generic_decline`, nothing charged — and Apple Pay is off as well; only a card goes through. Of the CNY checkouts paid
 * by Alipay so far (26), 25 came from a browser or Threads' own browser; WeChat's first 8 checkouts (10-23, one reader)
 * paid nothing.
 *
 * So a payment page asked for from inside WeChat / QQ is sent to ours first (/<locale>/pay?u=<the Stripe page>): it says
 * why, points at 「···」→「在浏览器打开」, copies the link, or carries on with a card right there. The same link opened in a
 * real browser goes straight on to Stripe (app/[locale]/pay/page.tsx), so 「在浏览器打开」 lands on the payment page itself.
 * Client-safe (no db): the page and the checkout routes both use it.
 */

/** WeChat (MicroMessenger, also WeCom) or QQ's own browser — not QQ Browser the app (MQQBrowser), which is a real browser */
export function blocksAppHandoff(ua: string | null | undefined): boolean {
  if (!ua) return false;
  return /MicroMessenger\//i.test(ua) || /(?:^|[\s;(])QQ\/\d/.test(ua);
}

export function handoffApp(ua: string | null | undefined): "wechat" | "qq" | null {
  if (!ua) return null;
  if (/MicroMessenger\//i.test(ua)) return "wechat";
  return /(?:^|[\s;(])QQ\/\d/.test(ua) ? "qq" : null;
}

/** a Stripe Checkout page (the only place the hop page will send anyone) */
export function isStripeCheckoutUrl(u: unknown): u is string {
  return typeof u === "string" && u.length < 4000 && /^https:\/\/checkout\.stripe\.com\/[^\s"'<>\\]+$/.test(u);
}

const site = () => (process.env.SITE_URL ?? "https://yaoflow.com").replace(/\/$/, "");
const safeLocale = (l: string | null | undefined) => (l && /^[a-z]{2}(-[a-z]{2,4})?$/.test(l) ? l : "zh");

/** our hop page for this Stripe page (absolute, so a redirect can use it too) */
export function payHopLink(url: string, locale: string | null | undefined): string {
  return `${site()}/${safeLocale(locale)}/pay?u=${encodeURIComponent(url)}`;
}

/**
 * What a checkout route hands back: the Stripe page itself, or — when the request came from inside WeChat / QQ — our hop
 * page in front of it. Anything that is not a Stripe Checkout page (a report path, a member's free reading) is left alone.
 */
export function payHop<T extends string | null | undefined>(req: { headers: Headers }, url: T, locale: string | null | undefined): T | string {
  if (!url || !isStripeCheckoutUrl(url) || !blocksAppHandoff(req.headers.get("user-agent"))) return url;
  return payHopLink(url, locale);
}
