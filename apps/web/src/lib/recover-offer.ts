import { letterOn } from "./letter-switch";
import { randomBytes } from "node:crypto";
import { createSavedCast, db, emailAlreadySent, mailOptedOut, recordEmail, recordOps } from "./db";
import { isInternalEmail } from "./internal";
import { ownerRecipients, sendEmail } from "./email";
import { featureState } from "./features";
import { hexName } from "./names";
import { resolveServerChart } from "./reading";
import { formatMoney, isCurrency, type Currency } from "./money";
import { unsubUrl } from "./unsub";
import { castDateLabel, normLocale, quoteOf } from "./recover-once";
import { createCheckoutSession, createPassSession, createSubscriptionSession, getCheckoutSession, type CheckoutSession } from "./stripe";
import type { Locale } from "./locales";
import type { LineValue } from "@yaoflow/engine";
import { isTongkaDays, tongkaT, type TongkaDays } from "./tongka";
import { tongkaForAll } from "./subscription";
import { activeMembership } from "./membership";

/**
 * 10-23 进度表 101: under the 通卡 model a single full reading is not sold — an unfinished checkout for one (left over from
 * before, or a stale page) gets no 7-fold letter and its offer page no longer opens a checkout. A pass bought on a cast
 * is a pass (`days` in its metadata) and is offered as one.
 */
const singleRetired = (p: Pick<PendingRow, "kind" | "meta_json">): boolean => {
  if (p.kind !== "deep" && p.kind !== "upgrade") return false;
  if (!tongkaForAll()) return false;
  try { return !(JSON.parse(p.meta_json) as Record<string, string>).days; } catch { return true; }
};

/**
 * 10-15 挽回信改版 (Neil: 「邮件里的链接有效期改成1个小时……挽回的深断价打7折……没有付款并退出页面的第5分钟发送……以客户收到
 * 邮件为准计时1个小时」; chose: one letter only, no day-1/3/5 letters; a click on 「返回」 → 5 minutes later, a closed page →
 * 15 minutes after it was opened (of 417 payments none took longer); expired → the cast is still there at the full price;
 * members get the 30 % too).
 *
 * Every checkout we open (a reading, an upgrade, a membership, the one-off month) is written down here with what it takes
 * to open the same one again, and its 「返回」 link passes through /api/recover/left so we know when they came back unpaid.
 * Each minute the cron (/api/recover/run) sends the one letter to whoever ticked 「沒付完時寄信提醒我」: a link to
 * /<locale>/offer/<token>, good for one hour from the moment the letter is sent, at 70 % of the price they saw (first
 * invoice of a membership). The offer page checks the clock on the server; after the hour the discount is gone and the
 * way back is the ordinary one. One offer per address in 30 days, never to an address that has paid since, never after an
 * unsubscribe. Behind the switch `recover-offer` (lib/features.ts): in preview only our own addresses get it.
 */
export const OFFER_MS = 3_600_000;
export const LEFT_DELAY_MS = 5 * 60_000;
export const CLOSED_DELAY_MS = 15 * 60_000;
export const ROUND_MS = 30 * 86_400_000;
export const OFFER_RATE = 0.7;
const WHOLE = new Set(["TWD", "JPY", "KRW", "CNY", "HKD", "MXN"]);

/** 70 % of a price in minor units, rounded to what people read on the page (whole dollars / yen where that is how prices look). */
export function offerMinor(baseMinor: number, currency: string): number {
  const c = currency.toUpperCase();
  const zeroDecimal = c === "JPY" || c === "KRW";
  const raw = baseMinor * OFFER_RATE;
  if (zeroDecimal) return Math.round(raw);
  if (WHOLE.has(c)) return Math.round(raw / 100) * 100;
  return Math.round(raw);
}

export type CheckoutKind = "deep" | "upgrade" | "month" | "year" | "pass" | "tarot" | "qian" | "hepan" | "nianshu" | "bazi"; // 10-26 bazi = 正緣畫像 (its Stripe kind)

/**
 * 10-23 进度表 113 (Neil: 「为什么会员也有 1 小时 7 折？」→「要改」): only a 通卡 (and the old single reading) gets the hour at
 * 70 %. A membership left unpaid gets the same one letter without a discount — the link for the hour reopens it at the
 * price they saw (the first month's own price included), with one line on a 1-day pass to try first. 111 ③ added the
 * one-off products (塔羅、解籤、合盤、年書) the same way: a reminder at the same price (a 年書 early-bird price is already
 * below the member's 8 折 and takes no further discount).
 */
export const DISCOUNTED_KINDS: ReadonlySet<CheckoutKind> = new Set<CheckoutKind>(["pass", "deep", "upgrade"]);
export const discounted = (kind: CheckoutKind): boolean => DISCOUNTED_KINDS.has(kind);
export const ONE_OFF_KINDS: ReadonlySet<CheckoutKind> = new Set<CheckoutKind>(["tarot", "qian", "hepan", "nianshu", "bazi"]);
export interface PendingRow {
  co: string; session_id: string; kind: CheckoutKind; created: number; left_at: number | null; letter_at: number | null; letter_state: string | null;
  email: string | null; remind: number; locale: string; currency: string; amount: number; product: string; managed: number; methods: string | null; card_hint: number;
  meta_json: string; cancel_url: string; success_url: string;
}
export interface OfferRow {
  token: string; co: string; session_id: string; kind: CheckoutKind; email: string; locale: string; currency: string; base_minor: number; offer_minor: number;
  sent_at: number; expires_at: number; opened_at: number | null; checkout_sid: string | null; used_at: number | null; used_sid: string | null; fallback_url: string | null;
}

let ready = false;
function ensure(): void {
  if (ready) return;
  db().exec(`
    CREATE TABLE IF NOT EXISTS pending_checkouts (
      co TEXT PRIMARY KEY, session_id TEXT, kind TEXT NOT NULL, created INTEGER NOT NULL, left_at INTEGER, letter_at INTEGER, letter_state TEXT,
      email TEXT, remind INTEGER NOT NULL DEFAULT 0, locale TEXT NOT NULL, currency TEXT NOT NULL, amount INTEGER NOT NULL, product TEXT NOT NULL,
      managed INTEGER NOT NULL DEFAULT 0, methods TEXT, card_hint INTEGER NOT NULL DEFAULT 1, meta_json TEXT NOT NULL, cancel_url TEXT NOT NULL, success_url TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_pending_checkouts_created ON pending_checkouts(created);
    CREATE TABLE IF NOT EXISTS recover_offers (
      token TEXT PRIMARY KEY, co TEXT NOT NULL, session_id TEXT NOT NULL, kind TEXT NOT NULL, email TEXT NOT NULL, locale TEXT NOT NULL, currency TEXT NOT NULL,
      base_minor INTEGER NOT NULL, offer_minor INTEGER NOT NULL, sent_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, opened_at INTEGER,
      checkout_sid TEXT, used_at INTEGER, used_sid TEXT, fallback_url TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_recover_offers_email ON recover_offers(email, sent_at);
  `);
  ready = true;
}

export const newCo = (): string => randomBytes(9).toString("base64url");

/** The 「返回」 link of a checkout, through us: we learn they left, then they land where they would have. */
export function leftUrl(origin: string, co: string, to: string): string {
  return `${origin}/api/recover/left?co=${encodeURIComponent(co)}&to=${encodeURIComponent(to)}`;
}

/** Write a checkout down when it is opened (all four kinds). Never throws — a checkout must not fail over this. */
export function notePending(i: {
  co: string; sessionId: string; kind: CheckoutKind; email: string | null; remind: boolean; locale: string; currency: string; amount: number;
  product: string; managed: boolean; methods?: readonly string[] | null; cardHint: boolean; metadata: Record<string, string>; cancelUrl: string; successUrl: string; now?: number;
}): void {
  try {
    ensure();
    db().prepare(`INSERT OR REPLACE INTO pending_checkouts (co, session_id, kind, created, email, remind, locale, currency, amount, product, managed, methods, card_hint, meta_json, cancel_url, success_url)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(i.co, i.sessionId, i.kind, i.now ?? Date.now(), i.email ? i.email.trim().toLowerCase() : null, i.remind ? 1 : 0, i.locale,
      i.currency.toUpperCase(), i.amount, i.product, i.managed ? 1 : 0, i.methods?.length ? i.methods.join("+") : null, i.cardHint ? 1 : 0, JSON.stringify(i.metadata), i.cancelUrl, i.successUrl);
  } catch (e) { recordOps("recover_offer_note", (e instanceof Error ? e.message : "?").slice(0, 120)); }
}

export function markLeft(co: string, now = Date.now()): PendingRow | null {
  ensure();
  db().prepare("UPDATE pending_checkouts SET left_at = COALESCE(left_at, ?) WHERE co = ?").run(now, co);
  return (db().prepare("SELECT * FROM pending_checkouts WHERE co = ?").get(co) ?? null) as PendingRow | null;
}

/** When the letter for one checkout falls due: 5 minutes after 「返回」, else 15 minutes after the page was opened. Pure. */
export function dueAt(p: Pick<PendingRow, "created" | "left_at">): number {
  const closed = p.created + CLOSED_DELAY_MS;
  return p.left_at ? Math.min(p.left_at + LEFT_DELAY_MS, closed) : closed;
}

/* ---------------- who may get one ---------------- */

function paidSince(email: string, since: number): boolean {
  const d = db();
  const e = email.toLowerCase();
  if (d.prepare("SELECT 1 FROM orders o LEFT JOIN customers c ON c.id = o.customer_id WHERE lower(COALESCE(o.email, c.email)) = ? AND o.created_at >= ? AND o.payment_state IN ('paid','refunded','disputed') AND COALESCE(o.amount_cents,0) > 0 LIMIT 1").get(e, since)) return true;
  if (d.prepare("SELECT 1 FROM subscriptions s JOIN customers c ON c.id = s.customer_id WHERE lower(c.email) = ? AND s.created_at >= ? AND s.status NOT IN ('incomplete','incomplete_expired') LIMIT 1").get(e, since)) return true;
  return false;
}
/**
 * Has this address said no to our mail? The reminder is the one letter the reader ticked for at checkout (the box starts
 * unticked), so only a real no stops it: an unsubscribe click (mail_unsubs, by the exact address) or an account that took
 * back its yes — lib/db mailOptedOut, the rule the 10-23 announcement used. `marketing_ok` is 0 by default (never asked)
 * and is not a no: 11 of the 16 reminders skipped as 「unsub」 in the 30 days to 10-23 went to readers who had ticked the
 * box and never unsubscribed (none of the 16 had).
 */
function unsubscribed(email: string): boolean {
  return mailOptedOut(email);
}
/** a 通卡 or a membership running right now on the account with this address */
export function coveredNow(email: string, now = Date.now()): boolean {
  const c = db().prepare("SELECT id FROM customers WHERE lower(email) = ?").get(email.toLowerCase()) as { id: number } | undefined;
  const m = c ? activeMembership(c.id, now) : null;
  return !!m && (!m.period_end || m.period_end > now);
}
const isTestEmail = (email: string) => isInternalEmail(email) || !!db().prepare("SELECT 1 FROM customers WHERE lower(email) = ? AND test_flag = 1").get(email.toLowerCase());

/* ---------------- the cron: one letter per abandoned checkout ---------------- */

export async function runRecoverOffers(now = Date.now(), site = (process.env.SITE_URL ?? "https://yaoflow.com").replace(/\/$/, "")): Promise<{ sent: number; skipped: Record<string, number> }> {
  ensure();
  const state = featureState("recover-offer");
  const skipped: Record<string, number> = {};
  if (state === "off") return { sent: 0, skipped };
  if (!letterOn("recover")) return { sent: 0, skipped }; // 10-23 进度表 108
  const d = db();
  const rows = d.prepare("SELECT * FROM pending_checkouts WHERE letter_at IS NULL AND remind = 1 AND created >= ? ORDER BY created").all(now - 2 * 3_600_000) as unknown as PendingRow[];
  const owners = new Set(ownerRecipients().map((e) => e.toLowerCase()));
  let sent = 0;
  const done = (co: string, why: string) => { d.prepare("UPDATE pending_checkouts SET letter_at = ?, letter_state = ? WHERE co = ?").run(now, why, co); skipped[why] = (skipped[why] ?? 0) + 1; };
  for (const p of rows) {
    if (now < dueAt(p)) continue;
    if (singleRetired(p)) { done(p.co, "single_retired"); continue; }
    let s: CheckoutSession;
    try { s = await getCheckoutSession(p.session_id); } catch { continue; }
    if (s.status === "complete" || s.payment_status === "paid" || s.payment_status === "no_payment_required") { done(p.co, "paid"); continue; }
    const email = (p.email ?? s.customer_details?.email ?? null)?.trim().toLowerCase() ?? null;
    if (!email) { done(p.co, "no_email"); continue; }
    const ours = isTestEmail(email) || owners.has(email);
    // preview: only our own addresses get it; on: everyone but us
    if (state === "preview" ? !ours : ours) { done(p.co, state === "preview" ? "preview_not_ours" : "test_or_owner"); continue; }
    if (paidSince(email, p.created)) { done(p.co, "paid_since"); continue; }
    // 10-24 (Neil: 「这个用户有30天通卡啊」): someone whose 通卡 or membership is still running is not reminded (and gets no 7 折) —
    // they were looking at a second one, not stuck on paying for the first
    if (coveredNow(email, now)) { done(p.co, "covered"); continue; }
    if (unsubscribed(email)) { done(p.co, "unsub"); continue; }
    if (d.prepare("SELECT 1 FROM recover_offers WHERE email = ? AND sent_at >= ? LIMIT 1").get(email, now - ROUND_MS) && state === "on") { done(p.co, "round_30d"); continue; }
    if (emailAlreadySent(`ro:${p.session_id}`, "recover-offer")) { done(p.co, "already"); continue; }
    const token = randomBytes(18).toString("base64url");
    // 10-23 进度表 113: the hour at 70 % for a 通卡 only — a membership or a one-off product is reminded at its own price
    const offer = discounted(p.kind) ? offerMinor(p.amount, p.currency) : p.amount;
    const locale = (normLocale(JSON.parse(p.meta_json).pageLocale) ?? normLocale(p.locale) ?? "zh-hant") as Locale;
    const fallback = fallbackUrl(p, email, site, locale, now);
    // the hour starts when the letter leaves — written first, so the page and the letter agree
    d.prepare(`INSERT INTO recover_offers (token, co, session_id, kind, email, locale, currency, base_minor, offer_minor, sent_at, expires_at, fallback_url) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(token, p.co, p.session_id, p.kind, email, locale, p.currency, p.amount, offer, now, now + OFFER_MS, fallback);
    const { buildRecoverOfferEmail } = await import("./recover-offer-mail");
    const m = buildRecoverOfferEmail({ p, locale, url: `${site}/${locale}/offer/${token}?c=recover-offer`, base: formatMoney(cur(p.currency), p.amount, locale), offer: formatMoney(cur(p.currency), offer, locale), until: untilLabel(now + OFFER_MS, p, locale), unsub: unsubUrl(site, email, locale), passUrl: `${site}/${locale}/account?want=pass&c=recover-remind#membership` });
    recordEmail(`ro:${p.session_id}`, "recover-offer", email, "pending");
    const r = await sendEmail(email, m.subject, m.html, m.text, { kind: "recover", sessionId: `ro:${p.session_id}`, unsubUrl: unsubUrl(site, email, locale), locale });
    recordEmail(`ro:${p.session_id}`, "recover-offer", email, r.ok ? "sent" : "failed", r.error ?? r.id);
    d.prepare("UPDATE pending_checkouts SET letter_at = ?, letter_state = ? WHERE co = ?").run(now, r.ok ? "sent" : "failed", p.co);
    if (r.ok) sent++;
  }
  if (sent || Object.keys(skipped).length) recordOps("recover_offer", `sent ${sent} ${JSON.stringify(skipped)}`);
  return { sent, skipped };
}

const cur = (c: string): Currency => (isCurrency(c.toUpperCase()) ? (c.toUpperCase() as Currency) : "USD");

/**
 * 10-22 (Neil: 「要」): the pass an unfinished pass checkout was for — its days are in the checkout's metadata (1 / 7 /
 * 30; an old one-off month has none and is the 30 天通卡). `mid` lower-cases the first letter for a name set inside a
 * French, Spanish or Portuguese sentence.
 */
export function offerPassName(p: Pick<PendingRow, "meta_json"> | null, locale: string, mid = false): string {
  let days: TongkaDays = 30;
  try { const d = Number((JSON.parse(p?.meta_json ?? "{}") as Record<string, string>).days); if (isTongkaDays(d)) days = d; } catch { /* the old month */ }
  const name = tongkaT(locale).name[days];
  return mid && (locale === "fr" || locale === "es" || locale === "pt") ? name.charAt(0).toLowerCase() + name.slice(1) : name;
}

/** 「HH:MM」 in the reader's own clock (the cast's offset, else Taipei). */
export function untilLabel(at: number, p: Pick<PendingRow, "meta_json">, locale: string): string {
  let tz = 480;
  try { const m = JSON.parse(p.meta_json) as Record<string, string>; if (m.tz !== undefined && Number.isFinite(Number(m.tz))) tz = Number(m.tz); } catch { /* */ }
  const t = new Date(at + tz * 60_000);
  const hm = `${String(t.getUTCHours()).padStart(2, "0")}:${String(t.getUTCMinutes()).padStart(2, "0")}`;
  return locale === "en" ? hm : hm;
}

/** Where the expired link still leads: the same cast at the full price (a saved-cast row, 30 days), the light reading, or the account. */
function fallbackUrl(p: PendingRow, email: string, site: string, locale: Locale, now: number): string {
  const m = JSON.parse(p.meta_json) as Record<string, string>;
  // 10-23 进度表 101: a pass bought on a cast comes back to that cast (the saved figure below), not to the account page
  if (p.kind === "month" || p.kind === "year" || (p.kind === "pass" && !m.values)) return `${site}/${locale}/account?tab=plan&c=recover-offer`;
  // 10-23 进度表 111 ③: a one-off product comes back to its own page (the spread, the lot, the 合盤 or 年書 form)
  if (ONE_OFF_KINDS.has(p.kind)) return p.cancel_url || `${site}/${locale}`;
  if (p.kind === "upgrade") {
    const from = p.cancel_url.match(/[?&]sid=([^&]+)/)?.[1];
    if (from) return `${site}/${locale}/reading?sid=${from}&c=recover-offer`;
  }
  try {
    const values = (m.values ?? "").split(",").map(Number);
    const castAt = Number(m.castAtMs), tz = Number(m.tz);
    if (values.length === 6 && m.question && Number.isFinite(castAt)) {
      const chart = resolveServerChart({ question: m.question, values: values as LineValue[], castAtMs: castAt, tzOffsetMinutes: tz } as never, true);
      const token = randomBytes(24).toString("hex");
      createSavedCast({ token, email, locale, question: m.question, values, castAt, tzOffset: tz, hex: hexName(chart.cast.primary, locale), teaser: m.teaser ?? null, currency: p.currency, origin: "recover" }, now);
      return `${site}/${locale}/cast?saved=${token}&c=recover-offer`;
    }
  } catch { /* fall through */ }
  return `${site}/${locale}/cast`;
}

/* ---------------- the offer page and its checkout ---------------- */

export type OfferView =
  | { state: "open"; o: OfferRow; p: PendingRow; leftMs: number }
  | { state: "expired" | "used"; o: OfferRow; p: PendingRow | null }
  | { state: "none" };

export function offerView(token: string, now = Date.now()): OfferView {
  ensure();
  if (!/^[A-Za-z0-9_-]{16,40}$/.test(token)) return { state: "none" };
  const o = db().prepare("SELECT * FROM recover_offers WHERE token = ?").get(token) as OfferRow | undefined;
  if (!o) return { state: "none" };
  const p = (db().prepare("SELECT * FROM pending_checkouts WHERE co = ?").get(o.co) ?? null) as PendingRow | null;
  if (o.used_at) return { state: "used", o, p };
  // 10-23 进度表 101: an offer on a single full reading made before the 通卡 opened to everyone shows as over, not a price
  if (now >= o.expires_at || !p || singleRetired(p)) return { state: "expired", o, p };
  if (!o.opened_at) db().prepare("UPDATE recover_offers SET opened_at = ? WHERE token = ?").run(now, token);
  return { state: "open", o, p, leftMs: o.expires_at - now };
}

/** What the offer page says the reader asked about (never anything sensitive; a membership has no question). */
export function offerSummary(p: PendingRow, locale: Locale): { date: string; q: string | null; hex: string } | null {
  const m = JSON.parse(p.meta_json) as Record<string, string>;
  const values = (m.values ?? "").split(",").map(Number);
  const castAt = Number(m.castAtMs), tz = Number(m.tz);
  if (values.length !== 6 || !m.question || !Number.isFinite(castAt)) return null;
  try {
    const chart = resolveServerChart({ question: m.question, values: values as LineValue[], castAtMs: castAt, tzOffsetMinutes: tz } as never, true);
    return { date: castDateLabel(castAt, Number.isFinite(tz) ? tz : 480, locale), q: quoteOf(m.question, locale), hex: hexName(chart.cast.primary, locale) };
  } catch { return null; }
}

/**
 * Open the same checkout again at the offer price — only while the hour is running (the server's clock, not the page's).
 * Stripe keeps a checkout page open at least 30 minutes, so one opened at minute 59 can still be paid at the offer price.
 */
type OfferCheckoutResult = { url: string } | { error: "expired" | "used" | "none" | "failed" };
/** 10-24: taps that arrive together (the page's button is a plain form) wait for the one page being made */
const inflight = new Map<string, Promise<OfferCheckoutResult>>();
export async function offerCheckout(token: string, origin: string, now = Date.now()): Promise<OfferCheckoutResult> {
  const running = inflight.get(token);
  if (running) return running;
  const made = offerCheckoutOnce(token, origin, now);
  inflight.set(token, made);
  try { return await made; } finally { inflight.delete(token); }
}

async function offerCheckoutOnce(token: string, origin: string, now: number): Promise<OfferCheckoutResult> {
  const v = offerView(token, now);
  if (v.state !== "open") return { error: v.state === "none" ? "none" : v.state };
  const { o, p } = v;
  if (singleRetired(p)) return { error: "expired" };
  // 10-24: the button tapped again while its page is still open goes back to that same page — one reader's taps made
  // ten Stripe pages in two minutes (seven in one second). A page that has expired or was paid gets a new one as before.
  if (o.checkout_sid) {
    try {
      const prev = await getCheckoutSession(o.checkout_sid);
      if (prev.status === "open" && prev.url) return { url: prev.url };
    } catch { /* make a new one */ }
  }
  const all = JSON.parse(p.meta_json) as Record<string, string>;
  // keys starting with "_" are ours (what it takes to rebuild the checkout), never sent to Stripe
  const meta: Record<string, string> = Object.fromEntries(Object.entries(all).filter(([k]) => !k.startsWith("_") && k !== "remind"));
  meta.ro = token; meta.recover = "1";
  const co = newCo();
  const cancelUrl = leftUrl(origin, co, `${origin}/${o.locale}/offer/${token}`);
  try {
    let s: CheckoutSession;
    if (p.kind === "month" || p.kind === "year") {
      // 10-23 进度表 113: a reminder reopens it at the price they saw — no coupon then
      const off = p.amount - o.offer_minor;
      const coupon = off > 0 ? await recoverCoupon(off, p.currency, token) : null;
      const extra = Number(all._extra) || 0;
      s = await createSubscriptionSession({
        productName: p.product, amountCents: p.amount - extra, currency: p.currency.toLowerCase(), interval: p.kind, customerEmail: o.email, stripeCustomerId: all._scus || null,
        successUrl: p.success_url, cancelUrl, locale: o.locale as Locale, managedPayments: p.managed === 1, cardHint: p.card_hint === 1, couponId: coupon,
        firstMonthExtra: extra > 0 ? { amountMinor: extra, name: all._extraName || p.product } : null, metadata: meta,
      });
    } else if (p.kind === "pass") {
      s = await createPassSession({ amountMinor: o.offer_minor, currency: p.currency.toLowerCase(), productName: p.product, locale: o.locale as Locale, email: o.email, managedPayments: p.managed === 1, cardHint: p.card_hint === 1, successUrl: p.success_url, cancelUrl, metadata: meta });
    } else if (ONE_OFF_KINDS.has(p.kind)) {
      // 10-23 进度表 111 ③: the same one-off checkout again, its own metadata (the spread, the lot, the report) carried over
      s = await createPassSession({ kind: p.kind as "tarot" | "qian" | "hepan" | "nianshu" | "bazi", amountMinor: o.offer_minor, currency: p.currency.toLowerCase(), productName: p.product, locale: o.locale as Locale, email: o.email, managedPayments: p.managed === 1, cardHint: p.card_hint === 1, paymentMethodTypes: p.methods ? p.methods.split("+") : undefined, successUrl: p.success_url, cancelUrl, metadata: meta });
    } else {
      s = await createCheckoutSession({
        productName: p.product, amountCents: o.offer_minor, currency: p.currency.toLowerCase(), successUrl: p.success_url, cancelUrl, locale: o.locale as Locale,
        managedPayments: p.managed === 1, cardHint: p.card_hint === 1, paymentMethodTypes: p.methods ? p.methods.split("+") : undefined, metadata: meta, customerEmail: o.email,
      } as Parameters<typeof createCheckoutSession>[0]);
    }
    if (!s.url) return { error: "failed" };
    db().prepare("UPDATE recover_offers SET checkout_sid = ? WHERE token = ?").run(s.id, token);
    // the offer's own checkout is not chased by another letter
    notePending({ co, sessionId: s.id, kind: p.kind, email: o.email, remind: false, locale: o.locale, currency: p.currency, amount: o.offer_minor, product: p.product, managed: p.managed === 1, methods: p.methods?.split("+") ?? null, cardHint: p.card_hint === 1, metadata: { ...meta, ...Object.fromEntries(Object.entries(all).filter(([k]) => k.startsWith("_"))) }, cancelUrl: p.cancel_url, successUrl: p.success_url, now });
    return { url: s.url };
  } catch (e) {
    recordOps("recover_offer_checkout_fail", `${p.kind} ${(e instanceof Error ? e.message : "?").slice(0, 160)}`);
    return { error: "failed" };
  }
}

async function recoverCoupon(amountOff: number, currency: string, token: string): Promise<string> {
  const { createCreditCoupon } = await import("./stripe");
  return createCreditCoupon(amountOff, currency, `ro:${token}`);
}

/** A paid checkout that carried an offer (metadata.ro) — mark the offer used. Called from fulfilment; never throws. */
export function noteOfferPaid(meta: Record<string, string> | null | undefined, sessionId: string, now = Date.now()): void {
  if (!meta?.ro) return;
  try {
    ensure();
    db().prepare("UPDATE recover_offers SET used_at = COALESCE(used_at, ?), used_sid = COALESCE(used_sid, ?) WHERE token = ?").run(now, sessionId, meta.ro);
  } catch { /* best-effort */ }
}

/** Sweep: offers whose checkout was paid (the fulfilment path may not see metadata) — one Stripe read each, recent only. */
export async function sweepOfferPayments(now = Date.now()): Promise<number> {
  ensure();
  const rows = db().prepare("SELECT token, checkout_sid FROM recover_offers WHERE used_at IS NULL AND checkout_sid IS NOT NULL AND sent_at >= ?").all(now - 3 * 86_400_000) as { token: string; checkout_sid: string }[];
  let n = 0;
  for (const r of rows) {
    try {
      const s = await getCheckoutSession(r.checkout_sid);
      if (s.status === "complete" && s.payment_status !== "unpaid") { noteOfferPaid({ ro: r.token }, r.checkout_sid, now); n++; }
    } catch { /* next time */ }
  }
  return n;
}

export function offerStats(since: number): { sent: number; opened: number; checkout: number; paid: number; expired: number } {
  ensure();
  const one = (sql: string) => (db().prepare(sql).get(since) as { n: number }).n;
  return {
    sent: one("SELECT COUNT(*) n FROM recover_offers WHERE sent_at >= ?"),
    opened: one("SELECT COUNT(*) n FROM recover_offers WHERE sent_at >= ? AND opened_at IS NOT NULL"),
    checkout: one("SELECT COUNT(*) n FROM recover_offers WHERE sent_at >= ? AND checkout_sid IS NOT NULL"),
    paid: one("SELECT COUNT(*) n FROM recover_offers WHERE sent_at >= ? AND used_at IS NOT NULL"),
    expired: one(`SELECT COUNT(*) n FROM recover_offers WHERE sent_at >= ? AND used_at IS NULL AND expires_at < ${Date.now()}`),
  };
}
