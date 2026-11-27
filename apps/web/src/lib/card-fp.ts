import { getCheckoutSession, getPaymentIntent } from "./stripe";
import { orderBySession, ordersNeedingCardFp, recordOps, saveCardFp, setOrderPaymentIntent } from "./db";

/**
 * 10-07 首次付费保证补洞 (Neil: 「现在弄好」). A one-tap refund is once per person, and until today a person was an
 * account plus its email addresses — a new address bought a second refund. Stripe gives every payment method a stable
 * identifier of its own (a card's `fingerprint`, the same for a wallet card on one device, an Alipay account's
 * `fingerprint`); it is not a card number and cannot be turned back into one. We keep it per order, prefixed by the
 * method ("card:…", "alipay:…"), and lib/db guaranteeIdentity counts it as the same person.
 *
 * It is read three ways: right after a payment is recorded (fire and forget), by the fulfil cron's sweep (every
 * 10 minutes, newest first — which also fills in the orders from before today), and on demand by the guarantee
 * route for the order about to be refunded. An order Stripe cannot give one for (Link, an old sandbox session) is
 * marked '' and not asked again.
 */

type Details = Record<string, unknown> & { type?: string };

/** The method's identifier from a charge's payment_method_details, e.g. "card:Xy12…" / "alipay:…" — null when it has none. */
export function fingerprintOf(charge: unknown): string | null {
  if (!charge || typeof charge !== "object") return null;
  const pmd = (charge as { payment_method_details?: Details | null }).payment_method_details;
  if (!pmd || typeof pmd !== "object") return null;
  const type = typeof pmd.type === "string" ? pmd.type : null;
  if (!type) return null;
  const inner = pmd[type];
  if (!inner || typeof inner !== "object") return null;
  const x = inner as { fingerprint?: unknown; buyer_id?: unknown };
  const f = typeof x.fingerprint === "string" && x.fingerprint ? x.fingerprint : typeof x.buyer_id === "string" && x.buyer_id ? x.buyer_id : null;
  return f ? `${type}:${f}`.slice(0, 120) : null;
}

const FAILED = new Set<string>(); // transient failures in this process: not retried until the next restart

/** A failure Stripe will answer the same way every time (gone, sandbox, malformed) — mark it and move on. */
const permanent = (msg: string): boolean => /\s(400|404):|resource_missing|No such|bad payment intent id/i.test(msg);

/** Look up and store this order's payment method identifier if it is not known yet; returns it ('' = none, null = could not ask). */
export async function ensureOrderCardFp(sessionId: string): Promise<string | null> {
  const o = orderBySession(sessionId);
  if (!o) return null;
  if (o.card_fp !== null && o.card_fp !== undefined) return o.card_fp;
  if (!process.env.STRIPE_SECRET_KEY) return null;
  try {
    let pi = o.payment_intent ?? (sessionId.startsWith("pi_") ? sessionId : null);
    if (!pi && sessionId.startsWith("cs_")) {
      const s = await getCheckoutSession(sessionId);
      pi = typeof s.payment_intent === "string" ? s.payment_intent : null;
      if (pi) setOrderPaymentIntent(sessionId, pi);
    }
    if (!pi) { saveCardFp(sessionId, ""); return ""; }
    const full = await getPaymentIntent(pi);
    const fp = fingerprintOf(full.latest_charge) ?? "";
    saveCardFp(sessionId, fp);
    return fp;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (permanent(msg)) { saveCardFp(sessionId, ""); return ""; }
    FAILED.add(sessionId);
    return null;
  }
}

/** Right after a payment is recorded: look it up in the background (never delays the page). */
export function rememberCardFp(sessionId: string): void {
  void ensureOrderCardFp(sessionId).catch(() => null);
}

/** The cron's share: up to `limit` orders without an identifier yet, within `budgetMs`. */
export async function sweepCardFps(limit = 30, budgetMs = 25_000, pauseMs = 120): Promise<{ looked: number; found: number; none: number; failed: number }> {
  const out = { looked: 0, found: 0, none: 0, failed: 0 };
  if (!process.env.STRIPE_SECRET_KEY) return out;
  const t0 = Date.now();
  for (const r of ordersNeedingCardFp(limit + FAILED.size).filter((x) => !FAILED.has(x.session_id)).slice(0, limit)) {
    if (Date.now() - t0 > budgetMs) break;
    const fp = await ensureOrderCardFp(r.session_id);
    out.looked += 1;
    if (fp === null) out.failed += 1; else if (fp) out.found += 1; else out.none += 1;
    if (pauseMs) await new Promise((res) => setTimeout(res, pauseMs));
  }
  if (out.looked) recordOps("card_fp_sweep", `looked=${out.looked} found=${out.found} none=${out.none} failed=${out.failed}`);
  return out;
}
