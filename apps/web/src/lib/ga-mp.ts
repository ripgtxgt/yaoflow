import { createHash } from "node:crypto";
import { db, recordOps } from "./db";
import { GA_ID } from "./ga";
import { ZERO_DECIMAL } from "./money";

/**
 * 10-27 purchases into Google Analytics from the server (Measurement Protocol) — the browser never sees a paid order
 * reliably (Stripe's redirect, closed tabs), our orders table does. Each paid order is sent once as `purchase`, a
 * refund once as `refund`; never an email or a name — the transaction id is a hash of our order id.
 *
 * Which visit it belongs to: when the reader starts checkout, /api/track keeps their GA client id and session id (from
 * the _ga cookies on our own domain) against the tab's session tag — the same tag the order keeps (orders.browser_sid).
 * A reader with no GA cookie (EEA default, blocked) is sent under a stand-in id, so the revenue still counts.
 * Off until GA_MP_SECRET is set on the server.
 */
const SESSION_COOKIE = `_ga_${GA_ID.slice(2)}`;

let ready = false;
function ensure(): void {
  if (ready) return;
  db().exec(`CREATE TABLE IF NOT EXISTS ga_clients (sid TEXT PRIMARY KEY, cid TEXT NOT NULL, gsid TEXT, at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS ga_sent (order_id TEXT NOT NULL, kind TEXT NOT NULL, at INTEGER NOT NULL, ok INTEGER NOT NULL, PRIMARY KEY (order_id, kind));`);
  ready = true;
}

/** "GA1.1.123.456" → "123.456" */
export function gaClientId(cookie: string | undefined | null): string | null {
  const m = cookie?.match(/^GA\d\.\d\.(\d+\.\d+)$/);
  return m ? m[1] : null;
}
/** "GS1.1.1730000000.3.1…" or "GS2.1.s1730000000$o3$g1…" → "1730000000" */
export function gaSessionId(cookie: string | undefined | null): string | null {
  const m = cookie?.match(/^GS1\.\d\.(\d+)\./) ?? cookie?.match(/^GS2\.\d\.s(\d+)/);
  return m ? m[1] : null;
}

/** at checkout_start: remember which GA visitor this tab is */
export function noteGaClient(sid: string | undefined, cookies: { get(n: string): { value: string } | undefined }): void {
  try {
    if (!sid || sid === "anon") return;
    const cid = gaClientId(cookies.get("_ga")?.value);
    if (!cid) return;
    ensure();
    db().prepare("INSERT INTO ga_clients (sid, cid, gsid, at) VALUES (?,?,?,?) ON CONFLICT(sid) DO UPDATE SET cid = excluded.cid, gsid = COALESCE(excluded.gsid, ga_clients.gsid), at = excluded.at")
      .run(sid, cid, gaSessionId(cookies.get(SESSION_COOKIE)?.value), Date.now());
  } catch { /* never in the way */ }
}

const major = (cents: number, cur: string) => ((ZERO_DECIMAL as Set<string>).has(cur.toUpperCase()) ? cents : cents / 100);
const hashId = (s: string) => createHash("sha256").update(`yf:${s}`).digest("hex").slice(0, 16);
/** a stand-in client id for a reader GA never saw — stable per order, never a person */
const standIn = (s: string) => `${parseInt(hashId(s).slice(0, 8), 16)}.${parseInt(hashId(s).slice(8, 16), 16) % 2_000_000_000}`;

interface Row { session_id: string; tier: string; amount_cents: number; currency: string; created_at: number; browser_sid: string | null; status: string; refunded_at: number | null }

export function mpBody(r: Row, kind: "purchase" | "refund", client: { cid: string; gsid: string | null } | null) {
  const cur = r.currency.toUpperCase(), value = major(r.amount_cents, cur);
  const at = kind === "refund" && r.refunded_at ? r.refunded_at : r.created_at;
  return {
    client_id: client?.cid ?? standIn(r.session_id),
    timestamp_micros: at * 1000,
    non_personalized_ads: true,
    events: [{
      name: kind,
      params: {
        transaction_id: hashId(r.session_id),
        value, currency: cur,
        items: [{ item_id: r.tier, item_name: r.tier, price: value, quantity: 1 }],
        ...(client?.gsid ? { session_id: client.gsid } : {}),
        engagement_time_msec: 1,
      },
    }],
  };
}

/** the hourly sweep: paid orders of the last 3 days not yet sent, refunds of the last 30 */
export async function sweepGaPurchases(now = Date.now(), opts: { dry?: boolean; fetcher?: typeof fetch } = {}): Promise<{ on: boolean; purchases: number; refunds: number; failed: number }> {
  const secret = process.env.GA_MP_SECRET;
  ensure();
  const NOT_TEST = "(customer_id IS NULL OR customer_id NOT IN (SELECT id FROM customers WHERE test_flag = 1)) AND COALESCE(test_flag, 0) = 0";
  const paid = db().prepare(`SELECT session_id, tier, amount_cents, currency, created_at, browser_sid, status, refunded_at FROM orders
      WHERE created_at >= ? AND amount_cents > 0 AND currency IS NOT NULL AND status IN ('paid','refunded','disputed') AND ${NOT_TEST}
        AND session_id NOT IN (SELECT order_id FROM ga_sent WHERE kind = 'purchase' AND ok = 1)`).all(now - 3 * 86_400_000) as unknown as Row[];
  const refunded = db().prepare(`SELECT session_id, tier, amount_cents, currency, created_at, browser_sid, status, refunded_at FROM orders
      WHERE refunded_at >= ? AND amount_cents > 0 AND currency IS NOT NULL AND status = 'refunded' AND ${NOT_TEST}
        AND session_id IN (SELECT order_id FROM ga_sent WHERE kind = 'purchase' AND ok = 1)
        AND session_id NOT IN (SELECT order_id FROM ga_sent WHERE kind = 'refund' AND ok = 1)`).all(now - 30 * 86_400_000) as unknown as Row[];
  const out = { on: !!secret, purchases: 0, refunds: 0, failed: 0 };
  if (!secret || opts.dry) { out.purchases = paid.length; out.refunds = refunded.length; return out; }
  const f = opts.fetcher ?? fetch;
  const client = (sid: string | null) => (sid ? (db().prepare("SELECT cid, gsid FROM ga_clients WHERE sid = ?").get(sid) as { cid: string; gsid: string | null } | undefined) ?? null : null);
  const send = async (r: Row, kind: "purchase" | "refund") => {
    let ok = false;
    try {
      const res = await f(`https://www.google-analytics.com/mp/collect?measurement_id=${GA_ID}&api_secret=${encodeURIComponent(secret)}`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(mpBody(r, kind, client(r.browser_sid))), signal: AbortSignal.timeout(10_000),
      });
      ok = res.status >= 200 && res.status < 300;
    } catch { ok = false; }
    db().prepare("INSERT INTO ga_sent (order_id, kind, at, ok) VALUES (?,?,?,?) ON CONFLICT(order_id, kind) DO UPDATE SET at = excluded.at, ok = excluded.ok").run(r.session_id, kind, Date.now(), ok ? 1 : 0);
    if (ok) out[kind === "purchase" ? "purchases" : "refunds"]++; else out.failed++;
  };
  for (const r of paid) await send(r, "purchase");
  for (const r of refunded) await send(r, "refund");
  if (out.purchases || out.refunds || out.failed) recordOps("ga_mp", `purchases ${out.purchases} refunds ${out.refunds} failed ${out.failed}`);
  return out;
}
