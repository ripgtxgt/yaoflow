import { db, latestSubscription, recordOps } from "@/lib/db";
import { LIVE_STATUSES } from "@/lib/subscription";

/**
 * 10-22 同一个人 (Neil 看 #1621 / #1733：「我们的系统目前有判断两个账号是同一个人的能力吗」→「把这两个做完吧」).
 *
 * Until now the four clues that one person owns two accounts — the card they pay with (orders.card_fp, Stripe's
 * identifier of a card / wallet card / Alipay account, never a number), an address recorded as the other account's
 * alternate (customers.alt_emails), an order paid with the other account's address, and a browser filed under both
 * (browser_links) — were read together only by the first-purchase guarantee (db.ts guaranteeIdentity). The customer
 * page showed none of it, and nothing could join two accounts.
 *
 *   kinCandidates(id)  — the other accounts these clues point at, each with its reasons, for the page to show.
 *   mergeCustomers()   — the owner's decision, by hand: every row of `from` becomes `into`'s, `from`'s addresses become
 *                        `into`'s alternates, `from` is deleted, and a record is kept (customer_merges). Not undone by
 *                        code; the record holds what moved.
 *   mergedInto(id)     — where a deleted id went, so an old link to /admin/customers/<id> still lands somewhere.
 *
 * A merged address keeps resolving to the surviving account because db.ts upsertCustomer / customerIdByEmail look in
 * alt_emails too (same change) — otherwise her next sign-in with that address would quietly make a new account.
 */

export type KinWhy =
  | { kind: "card"; fp: string; orders: number }
  | { kind: "alt_email"; email: string; held_by: "this" | "other" | "both" }
  | { kind: "order_email"; email: string; orders: number; held_by: "this" | "other" }
  | { kind: "stripe_customer"; id: string }
  | { kind: "browser"; browsers: number; how: string[] };

export interface KinCandidate {
  id: number;
  email: string;
  locale: string | null;
  firstSeen: number;
  lastSeen: number;
  /** a card, an address or a Stripe customer in common — not just a browser, which a household can share */
  strong: boolean;
  why: KinWhy[];
  paidOrders: number;
  casts: number;
  /** a live membership (its plan), else null */
  member: string | null;
}

const KIN_CAP = 12;

/** Other accounts the clues tie to this one, strongest first. Our own test accounts never appear. */
export function kinCandidates(customerId: number): KinCandidate[] {
  const d = db();
  const me = d.prepare("SELECT id, email, alt_emails FROM customers WHERE id = ?").get(customerId) as { id: number; email: string; alt_emails: string | null } | undefined;
  if (!me) return [];
  const myEmail = me.email.toLowerCase();
  const myAlts = (me.alt_emails ?? "").split(/[,\s]+/).map((a) => a.toLowerCase()).filter((a) => a.includes("@") && a !== myEmail);
  const found = new Map<number, KinWhy[]>();
  const add = (id: number | null | undefined, why: KinWhy) => {
    if (!id || id === customerId) return;
    const list = found.get(id) ?? [];
    // one line per kind+key
    const key = JSON.stringify([why.kind, "fp" in why ? why.fp : "email" in why ? why.email : "id" in why ? why.id : ""]);
    if (list.some((w) => JSON.stringify([w.kind, "fp" in w ? w.fp : "email" in w ? w.email : "id" in w ? w.id : ""]) === key)) return;
    list.push(why);
    found.set(id, list);
  };

  // 1. the same payment method
  const cards = d.prepare(
    `SELECT o2.customer_id AS id, o.card_fp AS fp, COUNT(DISTINCT o2.session_id) AS n
       FROM orders o JOIN orders o2 ON o2.card_fp = o.card_fp AND o2.customer_id IS NOT NULL AND o2.customer_id <> o.customer_id
      WHERE o.customer_id = ? AND o.card_fp IS NOT NULL AND o.card_fp <> ''
      GROUP BY o2.customer_id, o.card_fp`,
  ).all(customerId) as { id: number; fp: string; n: number }[];
  for (const r of cards) add(r.id, { kind: "card", fp: r.fp, orders: r.n });

  // 2. an address one account holds as the other's alternate
  const likeAlt = (e: string) => `%,${e},%`;
  for (const a of myAlts) {
    const own = d.prepare("SELECT id FROM customers WHERE lower(email) = ?").get(a) as { id: number } | undefined;
    if (own) add(own.id, { kind: "alt_email", email: a, held_by: "this" });
    for (const r of d.prepare("SELECT id FROM customers WHERE id <> ? AND (',' || lower(COALESCE(alt_emails,'')) || ',') LIKE ?").all(customerId, likeAlt(a)) as { id: number }[]) add(r.id, { kind: "alt_email", email: a, held_by: "both" });
  }
  for (const r of d.prepare("SELECT id FROM customers WHERE id <> ? AND (',' || lower(COALESCE(alt_emails,'')) || ',') LIKE ?").all(customerId, likeAlt(myEmail)) as { id: number }[]) add(r.id, { kind: "alt_email", email: myEmail, held_by: "other" });

  // 3. an order under one account paid with the other's address
  const mineForeign = d.prepare(
    `SELECT c.id, lower(o.email) AS email, COUNT(*) AS n FROM orders o JOIN customers c ON lower(c.email) = lower(o.email)
      WHERE o.customer_id = ? AND o.email IS NOT NULL AND lower(o.email) <> ? AND c.id <> ? GROUP BY c.id`,
  ).all(customerId, myEmail, customerId) as { id: number; email: string; n: number }[];
  for (const r of mineForeign) add(r.id, { kind: "order_email", email: r.email, orders: r.n, held_by: "this" });
  const theirsMine = d.prepare(
    "SELECT customer_id AS id, COUNT(*) AS n FROM orders WHERE lower(email) = ? AND customer_id IS NOT NULL AND customer_id <> ? GROUP BY customer_id",
  ).all(myEmail, customerId) as { id: number; n: number }[];
  for (const r of theirsMine) add(r.id, { kind: "order_email", email: myEmail, orders: r.n, held_by: "other" });

  // 4. the same Stripe customer behind two memberships
  const sc = d.prepare(
    `SELECT s2.customer_id AS id, s.stripe_customer_id AS sid FROM subscriptions s
       JOIN subscriptions s2 ON s2.stripe_customer_id = s.stripe_customer_id AND s2.customer_id <> s.customer_id
      WHERE s.customer_id = ? AND s.stripe_customer_id IS NOT NULL GROUP BY s2.customer_id`,
  ).all(customerId) as { id: number; sid: string }[];
  for (const r of sc) add(r.id, { kind: "stripe_customer", id: r.sid });

  // 5. a browser filed under both (weak on its own: a family shares a phone)
  const bro = d.prepare(
    `SELECT l2.customer_id AS id, COUNT(DISTINCT l.bid) AS n, GROUP_CONCAT(DISTINCT l2.how) AS how
       FROM browser_links l JOIN browser_links l2 ON l2.bid = l.bid AND l2.customer_id <> l.customer_id
      WHERE l.customer_id = ? GROUP BY l2.customer_id`,
  ).all(customerId) as { id: number; n: number; how: string | null }[];
  for (const r of bro) add(r.id, { kind: "browser", browsers: r.n, how: [...new Set((r.how ?? "").split(",").filter(Boolean))] });

  const out: KinCandidate[] = [];
  for (const [id, why] of found) {
    const c = d.prepare("SELECT id, email, locale, first_seen, last_seen, test_flag FROM customers WHERE id = ?").get(id) as
      { id: number; email: string; locale: string | null; first_seen: number; last_seen: number; test_flag: number | null } | undefined;
    if (!c || c.test_flag === 1) continue;
    const paid = (d.prepare("SELECT COUNT(*) AS v FROM orders WHERE customer_id = ? AND payment_state IN ('paid','refunded','disputed') AND COALESCE(amount_cents,0) > 0").get(id) as { v: number }).v;
    const casts = (d.prepare("SELECT COUNT(*) AS v FROM casts WHERE customer_id = ?").get(id) as { v: number }).v;
    const sub = latestSubscription(id);
    const strong = why.some((w) => w.kind !== "browser");
    out.push({ id, email: c.email, locale: c.locale, firstSeen: c.first_seen, lastSeen: c.last_seen, strong, why, paidOrders: paid, casts, member: sub && LIVE_STATUSES.has(sub.status) ? sub.plan : null });
  }
  out.sort((a, b) => Number(b.strong) - Number(a.strong) || b.why.length - a.why.length || b.lastSeen - a.lastSeen);
  return out.slice(0, KIN_CAP);
}

/* ---------------- merge ---------------- */

let ensured = false;
function ensureTable(): void {
  if (ensured) return;
  db().exec(`CREATE TABLE IF NOT EXISTS customer_merges (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      at          INTEGER NOT NULL,
      into_id     INTEGER NOT NULL,
      from_id     INTEGER NOT NULL,
      from_email  TEXT NOT NULL,
      reason      TEXT NOT NULL,
      by          TEXT,
      moved_json  TEXT NOT NULL,
      from_json   TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_customer_merges_from ON customer_merges(from_id);`);
  ensured = true;
}

/** every column that names a customer, in every table — found at run time so a table added later is not missed */
const CUSTOMER_COL = /^(a_|b_|from_|claimed_|referrer_|referred_)?customer_id$/;
export function customerColumns(): { table: string; column: string }[] {
  const d = db();
  const out: { table: string; column: string }[] = [];
  for (const t of d.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name <> 'customer_merges'").all() as { name: string }[]) {
    for (const c of d.prepare(`PRAGMA table_info("${t.name}")`).all() as { name: string }[]) if (CUSTOMER_COL.test(c.name)) out.push({ table: t.name, column: c.name });
  }
  return out;
}

export type MergeResult =
  | { ok: true; into: number; from: number; fromEmail: string; moved: Record<string, number>; dropped: Record<string, number> }
  | { ok: false; why: "same" | "not_found" | "test_mismatch" | "no_reason" };

/**
 * `from` becomes part of `into`. In one transaction: every row that names `from` is re-pointed (a row a unique rule
 * refuses — the same browser already filed under both, a friend already recorded as referred — is a duplicate of one
 * `into` has, and is dropped); `into` keeps the earlier first_seen, the later last_seen / last_login, its own locale,
 * and takes `from`'s address and alternates as its alternates; `from` is deleted; the record says what moved.
 * One of them being our test account and the other not is refused — a shared test phone must not swallow a reader.
 */
export function mergeCustomers(i: { into: number; from: number; reason: string; by?: string | null }): MergeResult {
  ensureTable();
  const d = db();
  const reason = i.reason.trim().slice(0, 200);
  if (!reason) return { ok: false, why: "no_reason" };
  if (i.into === i.from) return { ok: false, why: "same" };
  const row = (id: number) => d.prepare("SELECT * FROM customers WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  const A = row(i.into), B = row(i.from);
  if (!A || !B) return { ok: false, why: "not_found" };
  if ((A.test_flag === 1) !== (B.test_flag === 1)) return { ok: false, why: "test_mismatch" };

  const moved: Record<string, number> = {}, dropped: Record<string, number> = {};
  d.exec("BEGIN IMMEDIATE");
  try {
    for (const { table, column } of customerColumns()) {
      const changes = (r: unknown) => Number((r as { changes?: number | bigint }).changes ?? 0);
      const n = changes(d.prepare(`UPDATE OR IGNORE "${table}" SET "${column}" = ? WHERE "${column}" = ?`).run(i.into, i.from));
      if (n) moved[`${table}.${column}`] = n;
      const left = changes(d.prepare(`DELETE FROM "${table}" WHERE "${column}" = ?`).run(i.from));
      if (left) dropped[`${table}.${column}`] = left;
    }
    const low = (s: unknown) => String(s ?? "").toLowerCase();
    const alts = new Set<string>();
    for (const s of [A.alt_emails, B.email, B.alt_emails]) for (const a of low(s).split(/[,\s]+/)) if (a.includes("@") && a !== low(A.email)) alts.add(a);
    const num = (v: unknown) => (typeof v === "number" ? v : null);
    const maxN = (a: unknown, b: unknown) => { const x = num(a), y = num(b); return x === null ? y : y === null ? x : Math.max(x, y); };
    const minN = (a: unknown, b: unknown) => { const x = num(a), y = num(b); return x === null ? y : y === null ? x : Math.min(x, y); };
    const note = [A.note, B.note ? `（并入自 #${i.from} ${String(B.email)}）${String(B.note)}` : null].filter(Boolean).join(" / ") || null;
    d.prepare(
      `UPDATE customers SET alt_emails = ?, first_seen = ?, last_seen = ?, last_login_at = ?, locale = COALESCE(locale, ?),
         marketing_ok = MAX(marketing_ok, ?), marketing_at = COALESCE(marketing_at, ?), note = ?,
         orders_count = orders_count + ?, spend_cents = spend_cents + ?, headsup_off = COALESCE(headsup_off, ?),
         tz = COALESCE(tz, ?), tz_at = COALESCE(tz_at, ?)
       WHERE id = ?`,
    ).run([...alts].join(","), minN(A.first_seen, B.first_seen), maxN(A.last_seen, B.last_seen), maxN(A.last_login_at, B.last_login_at), B.locale ?? null,
      num(B.marketing_ok) ?? 0, num(B.marketing_at), note, num(B.orders_count) ?? 0, num(B.spend_cents) ?? 0, num(B.headsup_off), B.tz ?? null, num(B.tz_at), i.into);
    d.prepare("DELETE FROM customers WHERE id = ?").run(i.from);
    d.prepare("INSERT INTO customer_merges (at, into_id, from_id, from_email, reason, by, moved_json, from_json) VALUES (?,?,?,?,?,?,?,?)")
      .run(Date.now(), i.into, i.from, String(B.email), reason, i.by ?? null, JSON.stringify({ moved, dropped }), JSON.stringify(B));
    d.exec("COMMIT");
  } catch (e) {
    d.exec("ROLLBACK");
    throw e;
  }
  recordOps("customer_merge", `#${i.from} → #${i.into} ${reason} · ${Object.entries(moved).map(([k, v]) => `${k.split(".")[0]} ${v}`).join(", ") || "nothing to move"}`);
  return { ok: true, into: i.into, from: i.from, fromEmail: String(B.email), moved, dropped };
}

/** The account a deleted id was merged into (following a chain), or null. */
export function mergedInto(id: number): number | null {
  ensureTable();
  let cur = id;
  for (let hop = 0; hop < 10; hop++) {
    const r = db().prepare("SELECT into_id FROM customer_merges WHERE from_id = ? ORDER BY at DESC LIMIT 1").get(cur) as { into_id: number } | undefined;
    if (!r) return hop === 0 ? null : cur;
    cur = r.into_id;
  }
  return cur;
}

/** The merges that built this account, newest first — the page lists them under the clues. */
export function mergesInto(id: number): { at: number; from_id: number; from_email: string; reason: string; by: string | null; moved: Record<string, number> }[] {
  ensureTable();
  return (db().prepare("SELECT at, from_id, from_email, reason, by, moved_json FROM customer_merges WHERE into_id = ? ORDER BY at DESC").all(id) as
    { at: number; from_id: number; from_email: string; reason: string; by: string | null; moved_json: string }[])
    .map((r) => ({ ...r, moved: (JSON.parse(r.moved_json) as { moved: Record<string, number> }).moved }));
}
