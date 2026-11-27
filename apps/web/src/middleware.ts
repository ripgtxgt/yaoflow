import { NextRequest, NextResponse } from "next/server";
import { ADMIN_COOKIE, ADMIN_COOKIE_OPTIONS, adminToken } from "@/lib/admin-auth";
import { DEFAULT_LOCALE, LOCALES, type Locale } from "./lib/locales";

/** Set by the language menu when someone switches by hand — the only signal stronger than the browser's own list. */
export const LANG_COOKIE = "yf_lang";

/**
 * Redirect / to the visitor's language: a hand-picked preference (cookie)
 * first, then Accept-Language. Deep links always carry a locale.
 * Traditional-script Chinese (zh-TW, zh-HK, zh-Hant) goes to zh-hant; any
 * other zh to zh; the six other languages match on their primary subtag;
 * everything else lands on English.
 */
export function pickLocale(accept: string): Locale {
  const tags = accept
    .split(",")
    .map((part) => {
      const [tag, ...params] = part.trim().split(";");
      const q = params.map((p) => p.trim()).find((p) => p.startsWith("q="));
      return { tag: (tag ?? "").toLowerCase(), q: q ? Number(q.slice(2)) : 1 };
    })
    .filter((x) => x.tag)
    .sort((a, b) => b.q - a.q);
  for (const { tag } of tags) {
    if (/^zh(-(hant|tw|hk|mo))/.test(tag)) return "zh-hant";
    if (tag.startsWith("zh")) return "zh";
    const primary = tag.split("-")[0] as Locale;
    if (primary !== "zh" && (LOCALES as readonly string[]).includes(primary)) return primary;
  }
  return DEFAULT_LOCALE;
}

/**
 * Which Chinese script the browser wants, if it has an opinion (09-17).
 * The first zh tag in quality order decides; a bare "zh" is ambiguous and
 * falls back to the country the edge saw. No zh tag at all → null.
 */
export function chineseScript(accept: string, country: string | null): "zh" | "zh-hant" | null {
  const tags = accept
    .split(",")
    .map((part) => {
      const [tag, ...params] = part.trim().split(";");
      const q = params.map((p) => p.trim()).find((p) => p.startsWith("q="));
      return { tag: (tag ?? "").toLowerCase(), q: q ? Number(q.slice(2)) : 1 };
    })
    .filter((x) => x.tag.startsWith("zh"))
    .sort((a, b) => b.q - a.q);
  const first = tags[0]?.tag;
  if (!first) return null;
  if (/^zh(-(hant|tw|hk|mo))/.test(first)) return "zh-hant";
  if (/^zh(-(hans|cn|sg|my))/.test(first)) return "zh";
  const c = (country ?? "").toUpperCase();
  if (c === "TW" || c === "HK" || c === "MO") return "zh-hant";
  if (c === "CN" || c === "SG" || c === "MY") return "zh";
  return null;
}

/**
 * Pages whose content is bound to the locale they were made in — a delivered
 * reading, a share card, a proof, a pair, a case, an account — are never
 * script-corrected; the reader opened exactly the thing they were sent.
 */
// 11-01: the page names under app/[locale] (a bare /cast is one of ours without its language)
const BARE_ROUTE = /^(?:about|account|ask|bazi|cases|cast|dream|for|fun|glossary|gua|hepan|how-to-ask|huangli|jiaobei|jieqian|login|matter|name|nian-gua-2027|nianshu|offer|outcomes|pair|pay|privacy|proof|qian|qiuqian|reading|seal|services|share|taisui|tarot|terms|timing|today|today-qian|xingpan|xunwu|yunshi|zeri|zhengyuan|ziwei)$/;
const ZH_HANT_ONLY = /^\/(for|qian|jieqian)(\/|$)/;
const SCRIPT_FIXED = /^\/(reading|share|proof|pair|cases|account|login|auth|for|qian|jieqian)(\/|$)/; // /for: scene pages exist in zh-hant only; 籤 pages too (11-01)

/**
 * 10-03 按人看 (lib/browsers.ts): the browser's random id, given on its first page so the very first tracked event
 * already carries it. Web Crypto (the middleware runs on the edge). ~400 days, httpOnly; the privacy policy says so.
 */
const BID_COOKIE = "yf_bid";
/**
 * 10-23 进度表 109 ① 活动连结: a link's ?promo=<CODE> is kept for seven days (the checkout reads it and puts the
 * campaign's coupon on Stripe's page when it is good for what is bought — lib/promos.ts). Only a well-formed code is kept;
 * whether it exists is the checkout's question.
 */
const PROMO_COOKIE = "yf_promo";
function withPromo(req: NextRequest, res: NextResponse): NextResponse {
  const code = (req.nextUrl.searchParams.get("promo") ?? "").trim().toUpperCase();
  if (/^[A-Z0-9][A-Z0-9_-]{2,23}$/.test(code)) res.cookies.set(PROMO_COOKIE, code, { path: "/", httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 7 * 86_400 });
  return res;
}
function withBid(req: NextRequest, res: NextResponse): NextResponse {
  withPromo(req, res);
  if (/^[0-9a-f]{16}$/.test(req.cookies.get(BID_COOKIE)?.value ?? "")) return res;
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  const bid = Array.from(bytes, (x) => x.toString(16).padStart(2, "0")).join("");
  res.cookies.set(BID_COOKIE, bid, { path: "/", httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 400 * 86_400 });
  return res;
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  // 09-18: the dashboard's old `?key=` links become a cookie session and the
  // key leaves the URL — history, referrers and pasted links stop carrying it
  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    const key = req.nextUrl.searchParams.get("key");
    if (key && process.env.ADMIN_KEY && key === process.env.ADMIN_KEY) {
      const token = await adminToken();
      const clean = new URL(req.url);
      clean.searchParams.delete("key");
      const res = NextResponse.redirect(clean, 303);
      if (token) res.cookies.set(ADMIN_COOKIE, token, ADMIN_COOKIE_OPTIONS);
      return res;
    }
    return NextResponse.next();
  }
  if (pathname === "/") {
    const chosen = req.cookies.get(LANG_COOKIE)?.value;
    const locale = chosen && (LOCALES as readonly string[]).includes(chosen)
      ? (chosen as Locale)
      : pickLocale(req.headers.get("accept-language") ?? "");
    // keep the query string: a promotion link is yaoflow.com?c=xhs and the
    // campaign tag must survive the language redirect
    const res = NextResponse.redirect(new URL(`/${locale}${req.nextUrl.search}`, req.url));
    // the answer depends on the language header and the saved choice — say so, so no cache hands one reader's language to the next
    res.headers.set("Vary", "Accept-Language, Cookie");
    return withBid(req, res);
  }


  // 11-06 (bug patrol: React #419 on /zh/account): the account page sends a signed-out visitor to the login page, but
  // by then the layout has started streaming, so the redirect arrives inside a 200 page and the browser logs #419 first.
  // With no session cookie at all, send them here instead — a plain 307 before any page is drawn.
  const acct = /^\/([a-z-]+)\/account\/?$/.exec(pathname);
  if (acct && (LOCALES as readonly string[]).includes(acct[1]!) && !req.cookies.get("yf_session")?.value) {
    const to = new URL(`/${acct[1]}/login`, req.url);
    to.searchParams.set("next", `/${acct[1]}/account${req.nextUrl.search}`);
    return withBid(req, NextResponse.redirect(to, 307));
  }

  // 11-01 进度表 132 ① (GSC 404 ×36, first seen 10-24): Google found our pages without their language — /cast, /bazi,
  // /services/daily … (a bare link somewhere), and 簡體 links to the 籤 pages that exist in 繁體 only. A bare page
  // name goes to the reader's language for good (301); 籤 and scene pages go to zh-hant. Anything else stays a 404.
  const first = pathname.split("/")[1] ?? "";
  if (!(LOCALES as readonly string[]).includes(first) && BARE_ROUTE.test(first)) {
    const zhOnly = ZH_HANT_ONLY.test(pathname);
    const chosen = req.cookies.get(LANG_COOKIE)?.value;
    const locale = zhOnly ? "zh-hant" : chosen && (LOCALES as readonly string[]).includes(chosen) ? chosen : pickLocale(req.headers.get("accept-language") ?? "");
    const res = NextResponse.redirect(new URL(`/${locale}${pathname}${req.nextUrl.search}`, req.url), 301);
    res.headers.set("Vary", "Accept-Language, Cookie");
    return withBid(req, res);
  }
  if (/^\/zh\/(qian|jieqian)(\/|$)/.test(pathname)) {
    return withBid(req, NextResponse.redirect(new URL(`/zh-hant${pathname.slice(3)}${req.nextUrl.search}`, req.url), 301));
  }

  // 09-17: a mainland reader clicking a 繁體 promotion link (Threads posts link
  // /zh-hant) landed on Traditional pages and got a Traditional reading. The
  // two Chinese locales are the same language in two scripts, so a deep link
  // into one is corrected to the script the browser asks for — unless the
  // reader picked a language by hand (cookie), or the page is content-bound.
  const m = /^\/(zh|zh-hant)(\/.*)?$/.exec(pathname);
  if (m && !req.cookies.get(LANG_COOKIE)) {
    const rest = m[2] ?? "";
    if (!SCRIPT_FIXED.test(rest)) {
      const want = chineseScript(req.headers.get("accept-language") ?? "", req.headers.get("cf-ipcountry"));
      if (want && want !== m[1]) {
        return withBid(req, NextResponse.redirect(new URL(`/${want}${rest}${req.nextUrl.search}`, req.url), 307));
      }
    }
  }
  // every other page: pass the path down so a 404 boundary (which gets no
  // params) can still answer in the reader's language
  const headers = new Headers(req.headers);
  headers.set("x-pathname", pathname);
  return withBid(req, NextResponse.next({ request: { headers } }));
}

export const config = {
  // pages only — never static assets, images, or the API
  matcher: ["/", "/admin", "/admin/:path*", "/((?!_next/|api/|admin|.*\\.[a-zA-Z0-9]+$).*)"],
};
