import { activeMembership } from "./membership";
import { isPassSubscription } from "./subscription";
import { customersOfBrowser } from "./browsers";

/**
 * 11-10 (Neil, #3639: a member signed out by a stray tap on 「登出」, then bought a 1 日通卡 on a 解籤 page as a guest — a
 * pass she did not need): a browser that is not signed in but is known to belong to a member — the 「這台裝置是誰」 mark
 * set at sign-in or payment (yf_who), or a customer this browser is linked to — is shown 「你是會員，登入就能用」 in place of
 * the passes. Only a yes or no leaves the server; never who.
 */
export function browserIsMember(whoId: number | null, bid: string | null, now = Date.now()): boolean {
  const ids = new Set<number>();
  if (whoId) ids.add(whoId);
  if (bid) { try { for (const c of customersOfBrowser(bid)) ids.add(c.customer_id); } catch { /* no links */ } }
  for (const id of ids) {
    const sub = activeMembership(id, now);
    if (sub && !isPassSubscription(sub.stripe_subscription_id)) return true;
  }
  return false;
}
