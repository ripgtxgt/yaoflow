import { customerEmailById } from "./db";

/**
 * 10-30 (board: 「退信／投訴 今天 1 起」): a reader signed in as so***@gmail.com paid a 1-day pass at Stripe and typed
 * the address there as gmail.clm. The reading came up on the page, but the delivery letter went to the address Stripe
 * collected and bounced — and the revisit letter would have followed it. The account she was signed in to is the
 * address she proved she can read (she signed in through it); the one typed into Stripe's form is not. So a reading
 * bought while signed in is mailed to the account; the Stripe address stays on the order and still gets Stripe's
 * receipt. Nobody signed in: the address on the order, as before.
 */
export function deliveryAddress(rec: { email?: string | null; customerId?: number | null }): string | null {
  if (rec.customerId) {
    try {
      const acct = customerEmailById(rec.customerId);
      if (acct) return acct;
    } catch { /* fall back to the order's address */ }
  }
  return rec.email ?? null;
}
