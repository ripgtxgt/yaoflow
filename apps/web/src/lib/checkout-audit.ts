import { createHash } from "node:crypto";
import { db, recordOps } from "./db";
import { LIVE_SINCE } from "./live";
import { isInternalEmail } from "./internal";
import { stripeListSince, type ChargeLite, type IntentLite, type ListedSession } from "./stripe";

/**
 * 10-14 进度表 49 结账失败原因看板 (Neil: 「做1吧」; 10/20 前上线，赶 10/21 新版会员体系讨论).
 *
 * Read-only mirror of every payment page opened since real money started (lib/live.ts LIVE_SINCE): Stripe Checkout
 * sessions, plus the in-page Apple Pay / Google Pay sheets (PaymentIntents with metadata.kind = wallet). Each one that
 * did not end in a payment is put in one class:
 *   A 卡被拒        a failed attempt with a decline (card_declined, insufficient_funds, do_not_honor …)
 *   B 验证没过      3-D Secure started and not finished, or authentication_required
 *   C 没尝试付款    the page expired with no attempt at all (saw the price or the methods and left)
 *   D 其他错误      processing_error, an Alipay hand-off that failed or timed out, …
 *   E 之后又付成    the same browser, address or account paid within 24 hours (a save, not a loss — and whether a
 *                   recover letter for that session had gone out)
 * Nothing about the checkout itself changes. The board shows counts only: no address, no card digits; a single row is
 * named by the tail of its session id. Addresses are kept only as a one-way hash, to find E.
 *
 * Limitation: a subscription checkout that expired carries no PaymentIntent, so Stripe gives no attempt to see —
 * those count as C (flagged `sub_blind`, and the board says so).
 */
export type CoClass = "ok" | "A" | "B" | "C" | "D" | "E" | "open";
export const CLASS_LABEL: Record<CoClass, string> = {
  ok: "付成", A: "A 卡被拒", B: "B 验证没过", C: "C 进了页面没尝试", D: "D 其他错误", E: "E 之后又付成", open: "还开着",
};

const AUTH = new Set(["authentication_required", "payment_intent_authentication_failure", "authentication_not_handled"]);
const OPEN_MS = 24 * 3_600_000;

export interface Attempt { failed: boolean; code: string | null; decline: string | null; type: string | null; threeDs: string | null }

/** One page's verdict from what Stripe recorded. Pure — the tests drive it directly. */
export function classify(i: { paid: boolean; stillOpen: boolean; attempts: Attempt[]; intent?: { status: string; errCode: string | null; errDecline: string | null; action: boolean } | null }): { cls: CoClass; attempted: boolean; code: string | null; threeDs: boolean } {
  const threeDs = i.attempts.some((a) => !!a.threeDs) || !!i.intent?.action;
  if (i.paid) return { cls: "ok", attempted: true, code: null, threeDs };
  const failed = i.attempts.filter((a) => a.failed);
  const last = failed[0] ?? null; // newest first
  const errCode = i.intent?.errCode ?? null, errDecline = i.intent?.errDecline ?? null;
  const code = last ? (last.decline && last.decline !== "generic_decline" ? last.decline : last.code ?? last.decline) : errDecline ?? errCode;
  const authFail = failed.some((a) => AUTH.has(a.decline ?? "") || AUTH.has(a.code ?? "") || (!!a.threeDs && !/^(authenticated|attempt_acknowledged|exempted)$/.test(a.threeDs)))
    || AUTH.has(errCode ?? "") || AUTH.has(errDecline ?? "")
    || (!failed.length && (i.intent?.status === "requires_action" || !!i.intent?.action));
  if (authFail) return { cls: "B", attempted: true, code: code ?? "authentication_required", threeDs: true };
  const isDecline = (a: { code: string | null; decline: string | null; type: string | null }) =>
    a.code === "card_declined" || a.code === "payment_method_provider_decline" || a.code === "expired_card" || a.code === "incorrect_cvc" || a.code === "incorrect_number"
    || ((a.type === "card" || a.type === "link") && !!a.decline && a.code !== "processing_error");
  if (failed.some(isDecline) || (!failed.length && errCode && isDecline({ code: errCode, decline: errDecline, type: "card" }))) return { cls: "A", attempted: true, code, threeDs };
  if (failed.length || errCode) return { cls: "D", attempted: true, code, threeDs };
  if (i.stillOpen) return { cls: "open", attempted: false, code: null, threeDs };
  return { cls: "C", attempted: false, code: null, threeDs };
}

export const emailKey = (e: string | null | undefined): string | null => (e && e.includes("@") ? createHash("sha256").update(e.trim().toLowerCase()).digest("hex").slice(0, 24) : null);

/** The kind of thing being bought, from what our own checkout routes put in metadata. */
export function tierOf(meta: Record<string, string>, mode: string | undefined): string {
  if (mode === "subscription") return meta.plan === "year" ? "sub_year" : "sub";
  const k = meta.kind;
  // 10-22 进度表 94: a 通卡 says how many days (1 / 7 / 30); the old one-off month, and sessions without it, stay "pass"
  if (k === "pass") return ["1", "7", "30"].includes(meta.days ?? "") ? `pass_${meta.days}d` : "pass";
  if (k === "qiancard") return "qiancard";
  if (k === "tarot") return "tarot"; // 10-16 进度表 68
  if (k === "bazi") return "bazi"; // 10-18 八字④ 流年報告
  if (k === "ziwei") return "ziwei"; // 10-20 紫微年書
  if (k === "astro") return "astro"; // 10-20 星盤年報
  if (k === "hepan") return "hepan"; // 10-20 合盤報告
  if (k === "nianshu") return "nianshu"; // 10-21 三合一年書
  if (k === "pack" || (meta.units && meta.size)) return "pack";
  if (k && /qian/.test(k)) return "qian";
  if (meta.qian_personal || meta.qp) return "qian";
  return meta.tier === "one" ? "light" : meta.tier === "deep" ? "deep" : meta.tier ?? k ?? "other";
}

export interface AuditRow {
  id: string; source: "checkout" | "wallet"; created: number; status: string; paid: number; cls: CoClass; attempted: number;
  attempts: number; code: string | null; three_ds: number; method: string | null; currency: string | null; amount: number | null;
  tier: string; country: string | null; channel: string | null; device: string | null; app: string | null;
  bs: string | null; bid: string | null; cust: number | null; ekey: string | null; paid_at: number | null; test: number; sub_blind: number;
  recovered_by: string | null; letter: number;
  /** when the rescuing page was paid (E only; not stored) */
  recovered_at?: number | null;
}

function ensure(): void {
  db().exec(`CREATE TABLE IF NOT EXISTS checkout_audit (
    id TEXT PRIMARY KEY, source TEXT NOT NULL, created INTEGER NOT NULL, status TEXT, paid INTEGER NOT NULL DEFAULT 0, cls TEXT NOT NULL,
    attempted INTEGER NOT NULL DEFAULT 0, attempts INTEGER NOT NULL DEFAULT 0, code TEXT, three_ds INTEGER NOT NULL DEFAULT 0, method TEXT,
    currency TEXT, amount INTEGER, tier TEXT, country TEXT, channel TEXT, device TEXT, app TEXT, bs TEXT, bid TEXT, cust INTEGER, ekey TEXT,
    paid_at INTEGER, test INTEGER NOT NULL DEFAULT 0, sub_blind INTEGER NOT NULL DEFAULT 0, recovered_by TEXT, letter INTEGER NOT NULL DEFAULT 0,
    synced_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_checkout_audit_created ON checkout_audit(created);`);
}

const methodOf = (c: ChargeLite | undefined): string | null => {
  if (!c) return null;
  const t = c.payment_method_details?.type ?? null;
  const w = c.payment_method_details?.card?.wallet?.type ?? null;
  return w === "apple_pay" ? "apple_pay" : w === "google_pay" ? "google_pay" : w === "link" || t === "link" ? "link" : t;
};
const attemptOf = (c: ChargeLite): Attempt => ({
  failed: c.status === "failed", code: c.failure_code ?? null, decline: c.outcome?.reason ?? null,
  type: c.payment_method_details?.type ?? null, threeDs: c.payment_method_details?.card?.three_d_secure?.result ?? null,
});

function deviceFor(bs: string | null, dv: string | undefined): { device: string | null; app: string | null; bid: string | null } {
  const d = db();
  const bid = bs ? ((d.prepare("SELECT bid FROM tab_browsers WHERE s = ?").get(bs) as { bid: string } | undefined)?.bid ?? null) : null;
  if (dv && /^[a-z]+:[a-z]+$/.test(dv)) { const [device, app] = dv.split(":"); return { device: device!, app: app!, bid }; }
  if (!bs) return { device: null, app: null, bid };
  const r = d.prepare("SELECT device, app FROM cast_log WHERE s = ? AND device IS NOT NULL ORDER BY at DESC LIMIT 1").get(bs) as { device: string; app: string | null } | undefined;
  return { device: r?.device ?? null, app: r?.app ?? null, bid };
}

function isTest(email: string | null, cust: number | null): boolean {
  if (isInternalEmail(email)) return true;
  const d = db();
  if (cust && d.prepare("SELECT 1 FROM customers WHERE id = ? AND test_flag = 1").get(cust)) return true;
  if (email && d.prepare("SELECT 1 FROM customers WHERE lower(email) = lower(?) AND test_flag = 1").get(email)) return true;
  return false;
}

/** Build the rows from what Stripe returned. Separate from the fetching so the tests can feed it. */
export function buildRows(sessions: ListedSession[], charges: ChargeLite[], intents: IntentLite[], now = Date.now()): AuditRow[] {
  const byPi = new Map<string, ChargeLite[]>();
  for (const c of charges) { if (!c.payment_intent) continue; const l = byPi.get(c.payment_intent) ?? []; l.push(c); byPi.set(c.payment_intent, l); }
  for (const l of byPi.values()) l.sort((a, b) => b.created - a.created);
  const piById = new Map(intents.map((p) => [p.id, p]));
  const rows: AuditRow[] = [];
  const base = (meta: Record<string, string>, email: string | null) => {
    const cust = meta.cust && /^\d+$/.test(meta.cust) ? Number(meta.cust) : null;
    const bs = meta.bs && /^[a-z0-9]{6,24}$/.test(meta.bs) ? meta.bs : null;
    const dv = deviceFor(bs, meta.dv);
    return { cust, bs, ...dv, country: meta.country ?? null, channel: meta.c ?? null, ekey: emailKey(email), test: isTest(email, cust) ? 1 : 0 };
  };
  for (const s of sessions) {
    if ((s as { livemode?: boolean }).livemode === false) continue;
    const meta = s.metadata ?? {};
    const email = s.customer_details?.email ?? s.customer_email ?? null;
    const paid = s.status === "complete" && s.payment_status !== "unpaid";
    const pi = s.payment_intent ?? null;
    const ch = pi ? byPi.get(pi) ?? [] : [];
    const intent = pi ? piById.get(pi) : undefined;
    const v = classify({
      paid, stillOpen: s.status === "open" && now - s.created * 1000 < OPEN_MS, attempts: ch.map(attemptOf),
      // a Checkout session only gets a PaymentIntent once the buyer confirms: one with no charge and no error is a bank
      // check (3-D Secure) or a redirect that was started and never finished
      intent: intent ? { status: intent.status, errCode: intent.last_payment_error?.code ?? null, errDecline: intent.last_payment_error?.decline_code ?? null, action: !!intent.next_action || (!paid && !ch.length && !intent.last_payment_error) }
        : pi && !paid && !ch.length ? { status: "unknown", errCode: null, errDecline: null, action: true } : null,
    });
    const ok = ch.find((c) => c.status === "succeeded");
    rows.push({
      id: s.id, source: "checkout", created: s.created * 1000, status: s.status, paid: paid ? 1 : 0, cls: v.cls, attempted: v.attempted ? 1 : 0,
      attempts: ch.length, code: v.code, three_ds: v.threeDs ? 1 : 0, method: paid ? methodOf(ok) ?? (s.mode === "subscription" ? "card*" : null) : null,
      currency: s.currency ? s.currency.toUpperCase() : null, amount: s.amount_total ?? null, tier: tierOf(meta, s.mode),
      ...base(meta, email), paid_at: ok ? ok.created * 1000 : paid ? s.created * 1000 : null,
      sub_blind: s.mode === "subscription" && !paid ? 1 : 0, recovered_by: null, letter: 0,
    });
  }
  for (const p of intents) {
    if (p.metadata?.kind !== "wallet" || p.livemode === false) continue;
    const ch = byPi.get(p.id) ?? [];
    const paid = p.status === "succeeded";
    const v = classify({
      paid, stillOpen: !paid && p.status !== "canceled" && now - p.created * 1000 < OPEN_MS && !p.last_payment_error, attempts: ch.map(attemptOf),
      intent: { status: p.status, errCode: p.last_payment_error?.code ?? null, errDecline: p.last_payment_error?.decline_code ?? null, action: !!p.next_action },
    });
    const ok = ch.find((c) => c.status === "succeeded");
    rows.push({
      id: p.id, source: "wallet", created: p.created * 1000, status: p.status, paid: paid ? 1 : 0, cls: v.cls, attempted: v.attempted ? 1 : 0,
      attempts: ch.length, code: v.code, three_ds: v.threeDs ? 1 : 0, method: paid ? methodOf(ok) : null,
      currency: p.currency.toUpperCase(), amount: p.amount, tier: tierOf(p.metadata, "payment"),
      ...base(p.metadata, p.receipt_email ?? null), paid_at: ok ? ok.created * 1000 : null, sub_blind: 0, recovered_by: null, letter: 0,
    });
  }
  markRecovered(rows);
  return rows;
}

/** E: a later paid page within 24 hours by the same browser, address or account. */
export function markRecovered(rows: AuditRow[]): void {
  const paid = rows.filter((r) => r.paid).sort((a, b) => a.created - b.created);
  for (const r of rows) {
    if (r.paid || r.cls === "open") continue;
    const hit = paid.find((p) => p.created > r.created && p.created - r.created <= OPEN_MS
      && ((r.bid && p.bid === r.bid) || (r.bs && p.bs === r.bs) || (r.ekey && p.ekey === r.ekey) || (r.cust && p.cust === r.cust)));
    if (hit) { r.recovered_by = r.cls; r.cls = "E"; r.recovered_at = hit.paid_at ?? hit.created; }
  }
}

function save(rows: AuditRow[], now = Date.now()): void {
  ensure();
  const d = db();
  // a recover letter for this page (the 10-04 one-off 「recover:」 or the 10-12 sequence 「seq:」) sent before the rescue was paid
  const letterQ = d.prepare("SELECT 1 FROM emails WHERE session_id IN (?, ?, ?) AND kind LIKE 'recover%' AND status = 'sent' AND sent_at <= ? LIMIT 1");
  const st = d.prepare(`INSERT INTO checkout_audit (id, source, created, status, paid, cls, attempted, attempts, code, three_ds, method, currency, amount, tier, country, channel, device, app, bs, bid, cust, ekey, paid_at, test, sub_blind, recovered_by, letter, synced_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET status=excluded.status, paid=excluded.paid, cls=excluded.cls, attempted=excluded.attempted, attempts=excluded.attempts, code=excluded.code,
      three_ds=excluded.three_ds, method=excluded.method, device=COALESCE(excluded.device, checkout_audit.device), app=COALESCE(excluded.app, checkout_audit.app),
      bid=COALESCE(excluded.bid, checkout_audit.bid), paid_at=excluded.paid_at, test=excluded.test, sub_blind=excluded.sub_blind, recovered_by=excluded.recovered_by, letter=excluded.letter, synced_at=excluded.synced_at`);
  d.exec("BEGIN");
  try {
    for (const r of rows) {
      const letter = r.cls === "E" && letterQ.get(`seq:${r.id}`, `recover:${r.id}`, `ro:${r.id}`, r.recovered_at ?? now) ? 1 : 0;
      st.run(r.id, r.source, r.created, r.status, r.paid, r.cls, r.attempted, r.attempts, r.code, r.three_ds, r.method, r.currency, r.amount, r.tier, r.country, r.channel, r.device, r.app, r.bs, r.bid, r.cust, r.ekey, r.paid_at, r.test, r.sub_blind, r.recovered_by, letter, now);
    }
    d.exec("COMMIT");
  } catch (e) { d.exec("ROLLBACK"); throw e; }
}

/**
 * Pull and classify. `sinceMs` defaults to the last 3 days (the hourly run); the first run ever — or `full` — reaches
 * back to LIVE_SINCE (09-21). E looks one day further back than it saves, so a page and its rescue are seen together.
 */
export async function syncCheckoutAudit(o: { full?: boolean; now?: number } = {}): Promise<{ rows: number; since: number }> {
  ensure();
  const now = o.now ?? Date.now();
  const have = (db().prepare("SELECT COUNT(*) AS n FROM checkout_audit").get() as { n: number }).n;
  const since = o.full || have === 0 ? LIVE_SINCE : Math.max(LIVE_SINCE, now - 3 * 86_400_000);
  const sec = Math.floor(since / 1000);
  const [sessions, charges, intents] = await Promise.all([
    stripeListSince<ListedSession>("/checkout/sessions", sec),
    stripeListSince<ChargeLite>("/charges", sec - 86_400),
    stripeListSince<IntentLite>("/payment_intents", sec - 86_400),
  ]);
  const rows = buildRows(sessions, charges, intents, now);
  save(rows, now);
  return { rows: rows.length, since };
}

export async function runCheckoutAudit(now = Date.now()): Promise<void> {
  try {
    const r = await syncCheckoutAudit({ now });
    if (r.since <= LIVE_SINCE) recordOps("checkout_audit", `backfill ${r.rows} rows`);
  } catch (e) {
    recordOps("checkout_audit", `sync failed: ${e instanceof Error ? e.message.slice(0, 160) : "?"}`);
  }
}

/* ---------------- reading the board ---------------- */

export interface Dist { key: string; opened: number; attempted: number; paid: number; A: number; B: number; C: number; D: number; E: number }
export interface Board {
  since: number; total: Dist; bySource: Dist[]; byCurrency: Dist[]; byCountry: Dist[]; byDevice: Dist[]; byApp: Dist[]; byTier: Dist[]; byChannel: Dist[];
  declines: { code: string; n: number }[]; methods: { method: string; n: number }[]; subBlind: number; eLetters: number; lastSync: number | null;
  recent: { tail: string; at: number; cls: CoClass; code: string | null; currency: string | null; tier: string; device: string | null; app: string | null; source: string }[];
}

const empty = (key: string): Dist => ({ key, opened: 0, attempted: 0, paid: 0, A: 0, B: 0, C: 0, D: 0, E: 0 });
function add(d: Dist, r: Pick<AuditRow, "cls" | "attempted" | "paid">): void {
  d.opened++;
  if (r.attempted) d.attempted++;
  if (r.paid) d.paid++;
  if (r.cls === "A" || r.cls === "B" || r.cls === "C" || r.cls === "D" || r.cls === "E") d[r.cls]++;
}
const APP_LABEL = (r: { app: string | null }) => (r.app == null ? "未知" : r.app === "browser" ? "一般浏览器" : `应用内：${r.app}`);

export function checkoutBoard(days: number, now = Date.now(), withTest = false): Board {
  ensure();
  const since = Math.max(LIVE_SINCE, now - days * 86_400_000);
  const rows = db().prepare(`SELECT * FROM checkout_audit WHERE created >= ? AND cls <> 'open' ${withTest ? "" : "AND test = 0"} ORDER BY created DESC`).all(since) as unknown as (AuditRow & { synced_at: number })[];
  const group = (f: (r: AuditRow) => string) => {
    const m = new Map<string, Dist>();
    for (const r of rows) { const k = f(r); const g = m.get(k) ?? empty(k); add(g, r); m.set(k, g); }
    return [...m.values()].sort((a, b) => b.opened - a.opened);
  };
  const total = empty("全部");
  for (const r of rows) add(total, r);
  const dec = new Map<string, number>();
  for (const r of rows) if (r.code && !r.paid) dec.set(r.code, (dec.get(r.code) ?? 0) + 1);
  const meth = new Map<string, number>();
  for (const r of rows) if (r.paid) meth.set(r.method ?? "未知", (meth.get(r.method ?? "未知") ?? 0) + 1);
  const lastSync = (db().prepare("SELECT MAX(synced_at) AS v FROM checkout_audit").get() as { v: number | null }).v;
  return {
    since, total,
    bySource: group((r) => (r.source === "wallet" ? "页内钱包（Apple/Google Pay）" : "Stripe 结账页")),
    byCurrency: group((r) => r.currency ?? "未知"),
    byCountry: group((r) => r.country ?? "未知"),
    byDevice: group((r) => r.device ?? "未知"),
    byApp: group(APP_LABEL),
    byTier: group((r) => r.tier),
    byChannel: group((r) => r.channel ?? "（无）"),
    declines: [...dec.entries()].map(([code, n]) => ({ code, n })).sort((a, b) => b.n - a.n).slice(0, 10),
    methods: [...meth.entries()].map(([method, n]) => ({ method, n })).sort((a, b) => b.n - a.n),
    subBlind: rows.filter((r) => r.sub_blind && r.cls === "C").length,
    eLetters: rows.filter((r) => r.cls === "E" && r.letter).length,
    lastSync,
    recent: rows.filter((r) => !r.paid).slice(0, 40).map((r) => ({ tail: r.id.slice(-6), at: r.created, cls: r.cls, code: r.code, currency: r.currency, tier: r.tier, device: r.device, app: r.app, source: r.source })),
  };
}

export const pct = (a: number, n: number): string => (n ? `${Math.round((1000 * a) / n) / 10}%` : "—");

/** Two lines for the weekly digest (进度表 49 ④). */
export function checkoutDigestLines(now = Date.now()): string[] {
  const b = checkoutBoard(7, now);
  const t = b.total;
  const lost = t.opened - t.paid;
  const tw = b.byCurrency.find((x) => x.key === "TWD");
  return [
    `结账成功率 ${pct(t.paid, t.opened)}（打开 ${t.opened} → 有付款尝试 ${t.attempted} → 付成 ${t.paid}）${tw ? ` · TWD ${pct(tw.paid, tw.opened)}（${tw.paid}/${tw.opened}）` : ""}`,
    `没付成 ${lost}：C 进了页面没尝试 ${t.C}（占打开 ${pct(t.C, t.opened)}）· A 卡被拒 ${t.A} · B 验证没过 ${t.B} · D 其他 ${t.D} · E 之后又付成 ${t.E}${b.declines.length ? ` · 拒付原因前三：${b.declines.slice(0, 3).map((d) => `${d.code} ${d.n}`).join("、")}` : ""}`,
  ];
}
