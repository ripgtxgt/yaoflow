import { customerEmailById, customerLocaleById, db, emailAlreadySent, mailOptedOut, recordEmail, recordOps } from "./db";
import { allowanceWindow, entitlementFor } from "./subscription";
import { latestSubscription } from "./db";
import { buildPackOfferEmail, sendEmail } from "./email";
import { unsubUrl } from "./unsub";
import { asLocale, type Locale } from "./locales";
import { formatMoney, isCurrency, packMinor, priceMinor, type Currency } from "./money";
import { DEEP_PER_MONTH, PACK_SMALL_UNITS, PACK_UNITS } from "./sub-plan";

/**
 * 09-29 会员增购包邮件 (Neil: 「给额度用完的会员和只剩下 2 次以下的会员发一封……以后只要会员额度只剩下
 * 2 次以下就自动发这个邮件」). Once per member per allowance period: when the period's own full readings
 * are down to 2 or fewer. Not to a complimentary member, not to someone who already holds more than 2
 * bought readings or cannot buy another pack this period, not to anyone who unsubscribed, never to our
 * own test accounts. It is commercial mail: unsubscribe link + List-Unsubscribe, (광고) in Korean.
 *
 * The automatic sweep runs only with PACK_OFFER_AUTO=on (the fulfil cron, every 10 minutes).
 */
export const PACK_OFFER_AT = 2;
export const packOfferAuto = (): boolean => process.env.PACK_OFFER_AUTO === "on";

// 10-23 进度表 103: by the exact address now (lib/db.ts mail_unsubs), not the masked ops line
const unsubscribed = (email: string): boolean => mailOptedOut(email);

const site = () => (process.env.SITE_URL ?? "https://yaoflow.com").replace(/\/$/, "");
const keyFor = (subId: number, since: number) => `pack_offer:${subId}:${since}`;

export interface PackOfferCandidate { customerId: number; email: string; locale: Locale; left: number; key: string; reset: number; currency: Currency }

/** Whether this member should get the letter now — and everything the letter needs. */
export async function packOfferFor(customerId: number, now = Date.now()): Promise<PackOfferCandidate | null> {
  const sub = latestSubscription(customerId);
  if (!sub) return null;
  const ent = await entitlementFor(customerId);
  if (!ent.active || ent.comp || !ent.packBuyable) return null;
  const packLeft = ent.packLeft ?? 0;
  if (packLeft > PACK_OFFER_AT) return null;
  const left = Math.max(0, ent.deepLeft - packLeft);
  if (left > PACK_OFFER_AT) return null;
  // marketing_ok defaults to 0 for everyone who never ticked the box, so it cannot tell an unsubscribe apart;
  // an unsubscribe click is logged (masked, "1…@163.com") — the same rule the launch letter used
  const u = db().prepare("SELECT marketing_ok AS ok, marketing_at AS at FROM customers WHERE id = ?").get(customerId) as { ok: number; at: number | null } | undefined;
  if (u && u.ok === 0 && u.at != null) return null;
  const test = db().prepare("SELECT COALESCE(test_flag,0) AS t FROM customers WHERE id = ?").get(customerId) as { t: number } | undefined;
  if (!test || test.t === 1) return null;
  const email = customerEmailById(customerId);
  if (!email || /@example\.com$/i.test(email)) return null;
  if (unsubscribed(email)) return null;
  const bounced = db().prepare("SELECT 1 FROM mail_log WHERE lower(email) = lower(?) AND (bounced_at IS NOT NULL OR complained_at IS NOT NULL) LIMIT 1").get(email);
  if (bounced) return null;
  const w = allowanceWindow(sub, now);
  const key = keyFor(sub.id, w.since);
  if (emailAlreadySent(key, "pack_offer")) return null;
  const cur = (ent.subCurrency ?? "").toUpperCase();
  return { customerId, email, locale: asLocale(customerLocaleById(customerId) ?? "zh-hant"), left, key, reset: ent.resetsAt ?? w.until, currency: isCurrency(cur) ? cur : "USD" };
}

/** The letter's numbers: pack price, per reading, fifteen extras one by one, and the saving. */
export function packOfferNumbers(currency: Currency, locale: Locale) {
  const pack = packMinor(currency);
  const one = priceMinor(currency, "one"); // a member's extra full reading costs the light price
  const fifteen = one * PACK_UNITS;
  const save = fifteen - pack;
  const f = (m: number) => formatMoney(currency, m, locale);
  // per reading: whole units where prices are whole (NT$47, not NT$46.60); cents where they are not (US$1.87)
  const whole = ["TWD", "HKD", "CNY", "MXN"].includes(currency);
  const per = whole ? Math.round(pack / PACK_UNITS / 100) * 100 : Math.round(pack / PACK_UNITS);
  // 10-02 小包: named too, for whoever needs only a few
  const small = packMinor(currency, "small");
  const smallPer = whole ? Math.round(small / PACK_SMALL_UNITS / 100) * 100 : Math.round(small / PACK_SMALL_UNITS);
  return { price: f(pack), per: f(per), one: f(one), fifteen: f(fifteen), save: f(save), pct: Math.round((save / fifteen) * 100), smallPrice: f(small), smallPer: f(smallPer) };
}

function dateIn(ms: number, locale: Locale): string {
  const d = new Date(ms + 8 * 3_600_000); // the house clock, UTC+8 — every member so far is in it
  const y = d.getUTCFullYear(), m = d.getUTCMonth() + 1, day = d.getUTCDate();
  return locale === "zh" || locale === "zh-hant" || locale === "ja" ? `${m} 月 ${day} 日` : locale === "ko" ? `${m}월 ${day}일` : `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function packOfferLetter(c: PackOfferCandidate) {
  return buildPackOfferEmail({
    locale: c.locale, left: c.left, cap: DEEP_PER_MONTH, reset: dateIn(c.reset, c.locale), ...packOfferNumbers(c.currency, c.locale),
    accountUrl: `${site()}/${c.locale}/account#membership`, unsubUrl: unsubUrl(site(), c.email, c.locale),
  });
}

export async function sendPackOffer(c: PackOfferCandidate): Promise<boolean> {
  const m = packOfferLetter(c);
  recordEmail(c.key, "pack_offer", c.email, "pending");
  const r = await sendEmail(c.email, m.subject, m.html, m.text, { kind: "pack_offer", sessionId: c.key, customerId: c.customerId, locale: c.locale, unsubUrl: unsubUrl(site(), c.email, c.locale) });
  recordEmail(c.key, "pack_offer", c.email, r.ok ? "sent" : "failed", r.error ?? r.id);
  recordOps("pack_offer", `cust ${c.customerId} left ${c.left} ${r.ok ? "sent" : "failed"}`);
  return r.ok;
}

/** Every live member who is due now. */
export async function packOfferCandidates(now = Date.now()): Promise<PackOfferCandidate[]> {
  const ids = (db().prepare(
    `SELECT DISTINCT customer_id AS id FROM subscriptions WHERE status IN ('active','trialing','past_due')`,
  ).all() as { id: number }[]).map((r) => r.id);
  const out: PackOfferCandidate[] = [];
  for (const id of ids) {
    const c = await packOfferFor(id, now).catch(() => null);
    if (c) out.push(c);
  }
  return out;
}

/** The cron's sweep — a no-op unless PACK_OFFER_AUTO=on. */
export async function runPackOffers(): Promise<{ sent: number; failed: number }> {
  const out = { sent: 0, failed: 0 };
  if (!packOfferAuto()) return out;
  for (const c of await packOfferCandidates()) {
    if (await sendPackOffer(c)) out.sent += 1; else out.failed += 1;
  }
  return out;
}
