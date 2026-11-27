import { randomBytes } from "node:crypto";
import type { NextRequest, NextResponse } from "next/server";
import { claimQianDraws, db } from "./db";
import type { TrackedEvent } from "./analytics-server";
import { setWhoCookie } from "./who-mark";

/**
 * 10-03 按人看 (Neil: 「有没有可能把一个人的标识从第一次进入，到第几天回访，第几次摇卦，都能精准的识别出来呢」→「做吧」).
 *
 * `yf_bid` is a random id for one browser (a first-party, httpOnly cookie, ~400 days — the most a browser keeps one).
 * Every tracked event now carries it (`b`), so one browser's visits join up across days: where it first came from, which
 * days it came back, how many casts, what it tapped, when it paid. The events never carry the question; since 10-03 the
 * casts themselves (question included) are kept in the cast log under the same id (lib/cast-log.ts, privacy policy).
 * When the browser does something only one customer can (pays, claims a reading, spends an allowance, signs in), the id
 * is filed under that customer (`browser_links`), so a customer's anonymous days before that moment join their history,
 * and a customer who uses two browsers (Threads' own and Safari) becomes one person. Erasing the customer drops the link.
 * The privacy policy says so (the visit-dates paragraph).
 *
 * A browser is not a person: another phone, cleared data or a private window is a new id until it is filed again.
 */
export const BID_COOKIE = "yf_bid";
export const BID_MAX_AGE_S = 400 * 86_400;
export const BID_RE = /^[0-9a-f]{16}$/;

export const newBid = (): string => randomBytes(8).toString("hex");

export function bidOf(req: Pick<NextRequest, "cookies">): string | null {
  const v = req.cookies.get(BID_COOKIE)?.value;
  return v && BID_RE.test(v) ? v : null;
}

export const bidCookieOptions = { path: "/", httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", maxAge: BID_MAX_AGE_S };

/** The request's browser id, minting one on the response when it has none (cookies blocked → a new one each time). */
export function ensureBid(req: Pick<NextRequest, "cookies">, res: NextResponse): string {
  const have = bidOf(req);
  if (have) return have;
  const b = newBid();
  res.cookies.set(BID_COOKIE, b, bidCookieOptions);
  return b;
}

/* ---------------- what one browser has done ---------------- */

const SEEN_TABS = new Set<string>();

/** Counters and first-touch facts for one browser, from one tracked event. Best-effort: analytics never breaks a page. */
export function noteBrowserEvent(bid: string, ev: TrackedEvent): void {
  try {
    const d = db();
    d.prepare(
      `INSERT INTO browsers (bid, first_at, first_c, first_ref, first_path, first_locale, last_at) VALUES (?,?,?,?,?,?,?)
       ON CONFLICT(bid) DO UPDATE SET last_at = MAX(browsers.last_at, excluded.last_at)`,
    ).run(bid, ev.t, ev.c ?? null, ev.ref ?? null, ev.path ?? null, ev.locale ?? null, ev.t);
    if (ev.s && ev.s !== "anon" && !SEEN_TABS.has(ev.s)) {
      d.prepare("INSERT OR IGNORE INTO tab_browsers (s, bid, at) VALUES (?,?,?)").run(ev.s, bid, ev.t);
      SEEN_TABS.add(ev.s);
      if (SEEN_TABS.size > 20_000) SEEN_TABS.clear();
    }
    if (ev.e === "visit_day" && ev.td) {
      d.prepare(
        `UPDATE browsers SET days = days + (CASE WHEN last_day IS NULL OR last_day <> ? THEN 1 ELSE 0 END), last_day = ?,
           first_day = COALESCE(first_day, ?) WHERE bid = ?`,
      ).run(ev.td, ev.td, ev.fd ?? ev.td, bid);
    } else if (ev.e === "cast_complete") d.prepare("UPDATE browsers SET casts = casts + 1 WHERE bid = ?").run(bid);
    else if (ev.e === "teaser_shown") d.prepare("UPDATE browsers SET teased = teased + 1 WHERE bid = ?").run(bid);
    else if (ev.e === "reading_click" && !(ev.method ?? "").startsWith("wallet")) d.prepare("UPDATE browsers SET clicks = clicks + 1 WHERE bid = ?").run(bid);
    else if (ev.e === "checkout_start") d.prepare("UPDATE browsers SET checkouts = checkouts + 1 WHERE bid = ?").run(bid);
  } catch {
    /* analytics must never break the product */
  }
}

export interface BrowserRow {
  bid: string; first_at: number; first_day: string | null; first_c: string | null; first_ref: string | null; first_path: string | null;
  first_locale: string | null; last_at: number; last_day: string | null; days: number; casts: number; teased: number; clicks: number; checkouts: number;
}

export function browserRow(bid: string): BrowserRow | null {
  return (db().prepare("SELECT * FROM browsers WHERE bid = ?").get(bid) as unknown as BrowserRow | undefined) ?? null;
}

/** For the live board: the browser's totals, looked up at most every 20 s per browser. */
export interface BrowserStats { firstDay: string; firstFrom: string | null; casts: number; days: number }
const STATS = new Map<string, { at: number; v: BrowserStats | null }>();
export function browserStats(bid: string, now = Date.now()): BrowserStats | null {
  const hit = STATS.get(bid);
  if (hit && now - hit.at < 20_000) return hit.v;
  let v: BrowserStats | null = null;
  try {
    const r = browserRow(bid);
    if (r) v = { firstDay: r.first_day ?? new Date(r.first_at + 8 * 3_600_000).toISOString().slice(0, 10), firstFrom: r.first_c ?? r.first_ref ?? null, casts: r.casts, days: r.days };
  } catch { /* best-effort */ }
  STATS.set(bid, { at: now, v });
  if (STATS.size > 5000) STATS.clear();
  return v;
}

/* ---------------- whose browser ---------------- */

export function linkBrowser(bid: string, customerId: number, how: string, now = Date.now()): void {
  db().prepare(
    `INSERT INTO browser_links (bid, customer_id, first_at, last_at, how) VALUES (?,?,?,?,?)
     ON CONFLICT(bid, customer_id) DO UPDATE SET last_at = excluded.last_at`,
  ).run(bid, customerId, now, now, how.slice(0, 20));
  // 10-31 进度表 131: casting needs no account again — what this browser cast before reaches 「我的」 now (lib/adopt-casts.ts)
  if (process.env.VITEST !== "true" || process.env.ADOPT_IN_TESTS === "1") {
    void import("./adopt-casts").then((m) => m.adoptBrowserCasts(bid, customerId, now)).catch(() => { /* best-effort */ });
  }
  // 11-05 进度表 136: the 本命卦 this browser took goes with it
  try { void import("./bmg-store").then((m) => m.adoptBmg(bid, customerId)).catch(() => { /* best-effort */ }); } catch { /* best-effort */ }
}

const SIGNED_IN = new Set<string>();
/**
 * 10-03 每日按身份 (lib/daily-who.ts): a browser that is signed in is its customer's — also when the sign-in is older
 * than the browser id (a member signed in since September never signs in again, so was never filed). Once per process
 * per pair; the privacy policy's "filed under your account once you … sign in on this browser" already says it.
 */
export function noteSignedIn(bid: string, customerId: number, now = Date.now()): void {
  const k = `${bid}:${customerId}`;
  if (SIGNED_IN.has(k)) return;
  SIGNED_IN.add(k);
  if (SIGNED_IN.size > 20_000) SIGNED_IN.clear();
  try { linkBrowser(bid, customerId, "signed-in", now); } catch { /* best-effort */ }
}

/**
 * The moment a browser proves whose it is (paid, claimed, spent an allowance, signed in): the board's yf_who mark, and
 * this browser's id filed under the customer. Never a sign-in by itself.
 */
export function markCustomer(req: Pick<NextRequest, "cookies">, res: NextResponse, customerId: number | null | undefined, how: string): NextResponse {
  if (!customerId || customerId <= 0) return res;
  setWhoCookie(res, customerId);
  try { linkBrowser(ensureBid(req, res), customerId, how); } catch { /* best-effort */ }
  // 10-12 解籤收尾 ③: lots this browser drew before anyone knew whose it was are theirs too (yf_dv, the device cookie)
  try {
    const dev = req.cookies.get("yf_dv")?.value ?? "";
    if (/^[0-9a-f]{24}$/.test(dev)) claimQianDraws(dev, customerId);
  } catch { /* best-effort */ }
  return res;
}

export function browsersOfCustomer(customerId: number): { bid: string; how: string | null; first_at: number }[] {
  return db().prepare("SELECT bid, how, first_at FROM browser_links WHERE customer_id = ? ORDER BY first_at").all(customerId) as unknown as { bid: string; how: string | null; first_at: number }[];
}

export function customersOfBrowser(bid: string): { customer_id: number; email: string | null; how: string | null }[] {
  return db().prepare(
    "SELECT l.customer_id, c.email, l.how FROM browser_links l LEFT JOIN customers c ON c.id = l.customer_id WHERE l.bid = ? ORDER BY l.first_at",
  ).all(bid) as unknown as { customer_id: number; email: string | null; how: string | null }[];
}

/** The tab sessions of these browsers (an order's browser_sid is one of these). */
export function tabsOfBrowsers(bids: string[]): Map<string, string> {
  if (!bids.length) return new Map();
  const ph = bids.map(() => "?").join(",");
  const rows = db().prepare(`SELECT s, bid FROM tab_browsers WHERE bid IN (${ph})`).all(...bids) as { s: string; bid: string }[];
  return new Map(rows.map((r) => [r.s, r.bid]));
}
