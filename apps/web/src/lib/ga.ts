/**
 * 10-27 (Neil: 「用我的瀏覽器去對接一下 Google Analytics…有效的數據和我們的後台做一下融合」) — Google Analytics 4, beside
 * our own statistics (lib/track.ts → /api/track), never instead of them.
 *
 * What Google gets: a page path with every reader-specific part folded away, the channel tags (utm_*, c, via) and the
 * NAMES of the things people tap (the same event names our own statistics keep). Never a question, an email, a birth
 * date, a token in a URL, or the free-text "method" of an event that is not a plain code. Ads features are all off.
 * Visitors in the EEA, the UK and Switzerland get no _ga cookie by default (consent mode: analytics_storage denied
 * there — Google still models the counts from cookieless pings).
 */
export const GA_ID = "G-JD3RZN5P2R";
export const GA_PROPERTY = "560953946";

/** EEA + UK + CH: where analytics cookies wait for consent (we have no banner, so they stay off there) */
export const GA_CONSENT_REGIONS = [
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL",
  "PL", "PT", "RO", "SK", "SI", "ES", "SE", "IS", "LI", "NO", "GB", "CH",
];

/** the query parameters a page_location may keep: where the visit came from, nothing about the reader */
const KEEP = /^(utm_(source|medium|campaign|term|content|id)|c|via|gclid|src)$/;

/** a path segment that is someone's own thing — a token, an id, a code — folds to ":id" */
function foldSegment(s: string): string {
  if (!s) return s;
  if (/^\d{3,}$/.test(s)) return ":id"; // numeric ids (a cast, a matter, a report)
  if (/^[A-Za-z0-9_-]{12,}$/.test(s) && /\d/.test(s)) return ":id"; // tokens
  if (s.length > 40) return ":id";
  return s;
}

export function cleanPath(pathname: string): string {
  return pathname.split("/").map(foldSegment).join("/");
}

/** origin + folded path + only the channel parameters */
export function cleanLocation(href: string): string {
  try {
    const u = new URL(href);
    const q = new URLSearchParams();
    u.searchParams.forEach((v, k) => { if (KEEP.test(k) && /^[\w.\-~]{1,60}$/.test(v)) q.set(k, v); });
    const qs = q.toString();
    return `${u.origin}${cleanPath(u.pathname)}${qs ? `?${qs}` : ""}`;
  } catch {
    return "";
  }
}

/** a referrer reduced to its site: never a path (it may be one of our own reading links) */
export function cleanReferrer(ref: string): string {
  try { return ref ? `${new URL(ref).origin}/` : ""; } catch { return ""; }
}

/** our events that would only be noise in GA (it measures these itself, or they say nothing there) */
const SKIP = new Set(["page_view", "page_leave", "heat_click", "client_error", "visit_day", "purchase"]);
/** GA's own names, where one fits: they unlock GA's built-in reports */
const RENAME: Record<string, string> = { checkout_start: "begin_checkout", share_click: "share", gift_claim: "sign_up" };

/** the parameters an event of ours may carry to GA: short codes only */
export function gaEventFor(event: string, extra: { locale?: string; tier?: string; method?: string; hex?: number; cur?: string }): { name: string; params: Record<string, string | number> } | null {
  if (SKIP.has(event)) return null;
  const code = (s: unknown) => (typeof s === "string" && /^[\w:.\-]{1,40}$/.test(s) ? s : undefined);
  const params: Record<string, string | number> = {};
  const detail = code(extra.method), product = code(extra.tier), lang = code(extra.locale), cur = code(extra.cur);
  if (detail) params.detail = detail;
  if (product) params.product = product;
  if (lang) params.site_lang = lang;
  if (cur) params.currency = cur.toUpperCase();
  if (typeof extra.hex === "number" && extra.hex >= 1 && extra.hex <= 64) params.hexagram = extra.hex;
  return { name: RENAME[event] ?? event, params };
}

type Gtag = (...a: unknown[]) => void;
/** send one event to GA if the tag is on this page; silent otherwise */
export function gaSend(event: string, extra: Parameters<typeof gaEventFor>[1]): void {
  try {
    const g = (globalThis as unknown as { gtag?: Gtag }).gtag;
    if (typeof g !== "function") return;
    const ev = gaEventFor(event, extra);
    if (ev) g("event", ev.name, ev.params);
  } catch { /* analytics never breaks the page */ }
}

/**
 * the <head> script: consent defaults, then the tag (an admin browser counts as internal).
 * 10-29 (Neil: 「怎么还是有啊」— React #418 「HTML」 on every page): the tag used to be added to <head> on the window's load
 * event, but React hydrates in slices after load on a slow phone, found a <script> in <head> it had not rendered, and
 * threw the page's HTML away. Now GaTag calls window.__yfGaLoad from its first effect — after React has hydrated — and
 * the tag goes at the end of <body>; ten seconds is the fallback for a page whose app never starts.
 */
export function gaBootstrap(internal: boolean): string {
  return `(function(){
window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}window.gtag=gtag;
var deny={ad_storage:"denied",ad_user_data:"denied",ad_personalization:"denied"};
gtag("consent","default",Object.assign({analytics_storage:"granted",wait_for_update:0},deny));
gtag("consent","default",Object.assign({analytics_storage:"denied",region:${JSON.stringify(GA_CONSENT_REGIONS)}},deny));
gtag("set","ads_data_redaction",true);gtag("set","url_passthrough",false);
var internal=${internal ? "true" : "false"};try{if(localStorage.getItem("yf_internal")==="1")internal=true}catch(e){}
gtag("js",new Date());
gtag("config",${JSON.stringify(GA_ID)},Object.assign({send_page_view:false,allow_google_signals:false,allow_ad_personalization_signals:false},internal?{traffic_type:"internal"}:{}));
var done=false;function load(){if(done)return;done=true;var s=document.createElement("script");s.async=true;s.src="https://www.googletagmanager.com/gtag/js?id=${GA_ID}";document.body.appendChild(s)}
window.__yfGaLoad=load;setTimeout(load,10000);
})()`;
}
