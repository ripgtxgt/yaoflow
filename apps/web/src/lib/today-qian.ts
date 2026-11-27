import { createHash } from "node:crypto";
import { letterOn } from "./letter-switch";
import { memberLetterEligible } from "./member-letter";
import { db, emailAlreadySent, recordEmail, recordOps } from "./db";
import { activeMembership } from "./membership";
import { flowRightsOf, isPassSubscription } from "./subscription";
import { homeDay } from "./clock";
import { qianByNum, qianSet, qianWording, HK_SETS, isQianSet, type QianEntry } from "./qian";
import { record } from "./analytics-server";
import { toHans } from "./hant";

/**
 * 10-14 进度表 50 今日一籤 (Neil: 「每日一签我们把它作为会员权益来吧……也加一个日历」→「按你的来吧」；10-15「你去做完吧」).
 *
 * Everyone draws one lot a day from our 12 real sets — the same lot all day, fixed by who they are and the date (Taipei
 * day, 00:00), so a refresh never changes it. A browser draws as itself (yf_bid); signed in, the draws belong to the
 * account and follow it across devices (a browser's draws are adopted the first time it is seen signed in).
 * Free: the lot, its title and poem, and this month's calendar. Members and 籤卡 holders (NT$59 for 30 days, paid once,
 * never renewed) also get the plain reading for their own matter (love / work / overall + ask_next — our existing text,
 * no model call), 今日宜／忌, any past day of the calendar, and — if they turn it on — the lot by email at 07:30.
 * Never 吉凶, 神明說, 靈驗, 改運; no points, no streak rewards.
 */
export const TQ_DEFAULT_SET = "liushi-jiazi";
export const CARD_DAYS = 30;
const DAY = 86_400_000;

export { CARD_NAMES, CARD_PRICES, cardMinor } from "./qian-card-price";

let ready = false;
function ensure(): void {
  if (ready) return;
  db().exec(`
    CREATE TABLE IF NOT EXISTS tq_draws (subject TEXT NOT NULL, day TEXT NOT NULL, set_id TEXT NOT NULL, num INTEGER NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (subject, day));
    CREATE INDEX IF NOT EXISTS idx_tq_draws_day ON tq_draws(day);
    CREATE TABLE IF NOT EXISTS tq_prefs (subject TEXT PRIMARY KEY, set_id TEXT, temple TEXT, mail INTEGER NOT NULL DEFAULT 0, mail_on_at INTEGER, updated_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS qian_cards (
      id INTEGER PRIMARY KEY AUTOINCREMENT, customer_id INTEGER NOT NULL, session_id TEXT UNIQUE NOT NULL, starts_at INTEGER NOT NULL, ends_at INTEGER NOT NULL,
      currency TEXT, amount INTEGER, created_at INTEGER NOT NULL, notice_at INTEGER, notice_choice TEXT, refunded_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_qian_cards_customer ON qian_cards(customer_id, ends_at);
  `);
  ready = true;
}

export type Subject = string; // "c:<customer id>" | "b:<browser id>"
export function subjectOf(customerId: number | null | undefined, bid: string | null | undefined): Subject | null {
  if (customerId) return `c:${customerId}`;
  if (bid && /^[0-9a-f]{16}$/.test(bid)) return `b:${bid}`;
  return null;
}

/** A browser's draws and choice become the account's the first time it is seen signed in (the account's own win). */
export function adoptBrowser(customerId: number, bid: string | null | undefined): void {
  if (!bid || !/^[0-9a-f]{16}$/.test(bid)) return;
  ensure();
  const d = db();
  const c = `c:${customerId}`, b = `b:${bid}`;
  d.prepare("INSERT OR IGNORE INTO tq_draws (subject, day, set_id, num, at) SELECT ?, day, set_id, num, at FROM tq_draws WHERE subject = ?").run(c, b);
  d.prepare("INSERT OR IGNORE INTO tq_prefs (subject, set_id, temple, mail, mail_on_at, updated_at) SELECT ?, set_id, temple, 0, NULL, updated_at FROM tq_prefs WHERE subject = ?").run(c, b);
}

export interface Prefs { set: string; temple: string | null; mail: boolean }
export function prefsFor(subject: Subject): Prefs {
  ensure();
  const r = db().prepare("SELECT set_id, temple, mail FROM tq_prefs WHERE subject = ?").get(subject) as { set_id: string | null; temple: string | null; mail: number } | undefined;
  return { set: r?.set_id && isQianSet(r.set_id) ? r.set_id : TQ_DEFAULT_SET, temple: r?.temple ?? null, mail: r?.mail === 1 };
}
export function setPrefs(subject: Subject, p: Partial<Prefs>, now = Date.now()): Prefs {
  ensure();
  const cur = prefsFor(subject);
  const next: Prefs = { set: p.set && isQianSet(p.set) ? p.set : cur.set, temple: p.temple !== undefined ? p.temple : cur.temple, mail: p.mail ?? cur.mail };
  db().prepare(`INSERT INTO tq_prefs (subject, set_id, temple, mail, mail_on_at, updated_at) VALUES (?,?,?,?,?,?)
    ON CONFLICT(subject) DO UPDATE SET set_id = excluded.set_id, temple = excluded.temple, mail = excluded.mail,
      mail_on_at = CASE WHEN excluded.mail = 1 AND tq_prefs.mail = 0 THEN excluded.mail_on_at ELSE tq_prefs.mail_on_at END, updated_at = excluded.updated_at`)
    .run(subject, next.set, next.temple, next.mail ? 1 : 0, next.mail ? now : null, now);
  return next;
}

/** The lot a subject gets on a day from a set — the same every time it is asked (a refresh cannot change it). */
export function lotNumberFor(subject: Subject, day: string, set: string): number {
  const s = qianSet(set);
  const h = createHash("sha256").update(`tq|${subject}|${day}|${s.id}|${process.env.TQ_SALT ?? "yaoflow-today-qian"}`).digest();
  return 1 + (h.readUInt32BE(0) % s.count);
}

export interface Draw { day: string; set: string; num: number; fresh: boolean }
export function drawnOn(subject: Subject, day: string): Draw | null {
  ensure();
  const r = db().prepare("SELECT day, set_id, num FROM tq_draws WHERE subject = ? AND day = ?").get(subject, day) as { day: string; set_id: string; num: number } | undefined;
  return r ? { day: r.day, set: r.set_id, num: r.num, fresh: false } : null;
}

/** Draw today's lot (or return the one already drawn today). Server-side event: today_qian draw_new / draw_back. */
export function drawToday(subject: Subject, now = Date.now(), locale = "zh-hant"): Draw {
  ensure();
  const day = homeDay(now);
  const have = drawnOn(subject, day);
  if (have) return have;
  const set = prefsFor(subject).set;
  const num = lotNumberFor(subject, day, set);
  db().prepare("INSERT OR IGNORE INTO tq_draws (subject, day, set_id, num, at) VALUES (?,?,?,?,?)").run(subject, day, set, num, now);
  const back = (db().prepare("SELECT COUNT(*) AS n FROM tq_draws WHERE subject = ? AND day < ?").get(subject, day) as { n: number }).n > 0;
  try { record({ t: now, e: "today_qian", s: subject.slice(-12), locale, method: back ? "draw_back" : "draw_new" }); } catch { /* analytics never blocks */ }
  return drawnOn(subject, day) ?? { day, set, num, fresh: true };
}

/** This month's draws (YYYY-MM), day → lot. */
export function monthDraws(subject: Subject, ym: string): { day: string; set: string; num: number }[] {
  ensure();
  if (!/^\d{4}-\d{2}$/.test(ym)) return [];
  // plain objects: node:sqlite rows have a null prototype, which a client component cannot be handed (10-15 fix)
  return (db().prepare("SELECT day, set_id AS \"set\", num FROM tq_draws WHERE subject = ? AND day LIKE ? ORDER BY day").all(subject, `${ym}-%`) as { day: string; set: string; num: number }[])
    .map((r) => ({ day: r.day, set: r.set, num: r.num }));
}

/** Days in a row up to today (or yesterday, if today is not drawn yet) — counted for the stats, never rewarded. */
export function streakOf(subject: Subject, now = Date.now()): number {
  ensure();
  const days = new Set((db().prepare("SELECT day FROM tq_draws WHERE subject = ? ORDER BY day DESC LIMIT 400").all(subject) as { day: string }[]).map((r) => r.day));
  let n = 0;
  let t = now;
  if (!days.has(homeDay(t))) t -= DAY;
  while (days.has(homeDay(t))) { n++; t -= DAY; }
  return n;
}

/* ---------------- who sees the full lot ---------------- */

export interface CardRow { id: number; customer_id: number; session_id: string; starts_at: number; ends_at: number; currency: string | null; amount: number | null; notice_at: number | null; notice_choice: string | null }
export function activeCard(customerId: number | null | undefined, now = Date.now()): CardRow | null {
  if (!customerId) return null;
  ensure();
  return (db().prepare("SELECT * FROM qian_cards WHERE customer_id = ? AND starts_at <= ? AND ends_at > ? AND refunded_at IS NULL ORDER BY ends_at DESC LIMIT 1").get(customerId, now, now) ?? null) as CardRow | null;
}
export function latestCard(customerId: number): CardRow | null {
  ensure();
  return (db().prepare("SELECT * FROM qian_cards WHERE customer_id = ? AND refunded_at IS NULL ORDER BY ends_at DESC LIMIT 1").get(customerId) ?? null) as CardRow | null;
}
/**
 * Who sees the full lot. 10-22 进度表 92: a 會員 (or a complimentary one) — "member"; a 通卡 only if it was bought before
 * the split, until it ends — "pass"; a 籤卡 still running — "card" (no longer sold). Everyone else: the lot and its poem.
 */
export type Access = "member" | "pass" | "card" | null;
export function accessOf(customerId: number | null | undefined, now = Date.now()): Access {
  if (!customerId) return null;
  const sub = activeMembership(customerId, now);
  if (sub && flowRightsOf(sub)) return isPassSubscription(sub.stripe_subscription_id) ? "pass" : "member";
  if (activeCard(customerId, now)) return "card";
  return null;
}

/** Record a paid 籤卡 (idempotent by checkout session). A card bought while one runs starts when that one ends. */
export function recordCard(i: { customerId: number; sessionId: string; currency: string | null; amount: number | null; now?: number }): { row: CardRow; created: boolean } {
  ensure();
  const now = i.now ?? Date.now();
  const d = db();
  const have = d.prepare("SELECT * FROM qian_cards WHERE session_id = ?").get(i.sessionId) as CardRow | undefined;
  if (have) return { row: have, created: false };
  const prev = latestCard(i.customerId);
  const start = prev && prev.ends_at > now ? prev.ends_at : now;
  d.prepare("INSERT INTO qian_cards (customer_id, session_id, starts_at, ends_at, currency, amount, created_at) VALUES (?,?,?,?,?,?,?)")
    .run(i.customerId, i.sessionId, start, start + CARD_DAYS * DAY, i.currency, i.amount, now);
  recordOps("qian_card_bought", `cust ${i.customerId} ${i.currency ?? "?"} ${i.amount ?? "?"}${start > now ? " (stacked)" : ""}`);
  try { record({ t: now, e: "today_qian", s: `c:${i.customerId}`, method: prev ? "card_again" : "card_buy" }); } catch { /* */ }
  return { row: d.prepare("SELECT * FROM qian_cards WHERE session_id = ?").get(i.sessionId) as unknown as CardRow, created: true };
}

/* ---------------- the words ---------------- */

/** The reader's kind of matter, from their most recent cast in the last 30 days (no model, nothing stored). */
export function sectionFor(customerId: number | null | undefined, bid: string | null | undefined, now = Date.now()): "love" | "work" | "overall" {
  const d = db();
  const bids: string[] = [];
  if (bid) bids.push(bid);
  if (customerId) for (const r of d.prepare("SELECT bid FROM browser_links WHERE customer_id = ? LIMIT 20").all(customerId) as { bid: string }[]) bids.push(r.bid);
  if (!bids.length) return "overall";
  const r = d.prepare(`SELECT topic FROM cast_log WHERE bid IN (${bids.map(() => "?").join(",")}) AND at >= ? AND topic IS NOT NULL ORDER BY at DESC LIMIT 1`).get(...bids, now - 30 * DAY) as { topic: string } | undefined;
  return r?.topic === "relationship" ? "love" : r?.topic === "career" ? "work" : "overall";
}

export interface LotView {
  set: string; setName: string; num: number; tag: string; title: string; poem: string[];
  /** members and card holders only */
  full?: { section: "love" | "work" | "overall"; text: string; askNext: string; yi: string | null; ji: string | null };
}
export function lotView(draw: { set: string; num: number }, o: { full: boolean; section: "love" | "work" | "overall"; hk: boolean }): LotView | null {
  const e0 = qianByNum(draw.num, draw.set);
  if (!e0) return null;
  const e: QianEntry = qianWording(e0, o.hk || HK_SETS.has(e0.set));
  // 月老聖籤 only speaks of love
  const section = e.set === "yuelao" ? "love" : o.section;
  return {
    set: e.set, setName: qianSet(e.set).name, num: e.num, tag: e.ganzhi ?? e.story ?? "", title: e.title, poem: e.poem,
    ...(o.full ? { full: { section, text: e[section] || e.overall, askNext: e.ask_next, yi: e.yi ?? null, ji: e.ji ?? null } } : {}),
  };
}

/* ---------------- numbers for the digest and the board ---------------- */

export function todayQianStats(now = Date.now()): { dau: number; dauNew: number; week: number; return7: { base: number; back: number }; cards: number; mailOn: number } {
  ensure();
  const d = db();
  const yday = homeDay(now - DAY);
  const dau = (d.prepare("SELECT COUNT(*) AS n FROM tq_draws WHERE day = ?").get(yday) as { n: number }).n;
  const dauNew = (d.prepare("SELECT COUNT(*) AS n FROM tq_draws t WHERE day = ? AND NOT EXISTS (SELECT 1 FROM tq_draws o WHERE o.subject = t.subject AND o.day < t.day)").get(yday) as { n: number }).n;
  const week = (d.prepare("SELECT COUNT(DISTINCT subject) AS n FROM tq_draws WHERE day > ?").get(homeDay(now - 7 * DAY)) as { n: number }).n;
  // 7 日回访: of those whose first draw was 8–14 days ago, how many drew again within the 7 days after it
  const firsts = d.prepare("SELECT subject, MIN(day) AS first FROM tq_draws GROUP BY subject HAVING first BETWEEN ? AND ?").all(homeDay(now - 14 * DAY), homeDay(now - 8 * DAY)) as { subject: string; first: string }[];
  let back = 0;
  for (const f of firsts) {
    const until = homeDay(Date.parse(`${f.first}T12:00:00+08:00`) + 7 * DAY);
    if (d.prepare("SELECT 1 FROM tq_draws WHERE subject = ? AND day > ? AND day <= ? LIMIT 1").get(f.subject, f.first, until)) back++;
  }
  return {
    dau, dauNew, week, return7: { base: firsts.length, back },
    cards: (d.prepare("SELECT COUNT(*) AS n FROM qian_cards WHERE starts_at <= ? AND ends_at > ? AND refunded_at IS NULL").get(now, now) as { n: number }).n,
    mailOn: (d.prepare("SELECT COUNT(*) AS n FROM tq_prefs WHERE mail = 1 AND subject LIKE 'c:%'").get() as { n: number }).n,
  };
}

/* ---------------- the morning letter (07:30 Taipei, opt-in) ---------------- */

export const TQ_MAIL_HOUR = 7, TQ_MAIL_MIN = 30;
export function taipeiMinuteOfDay(now = Date.now()): number {
  const t = new Date(now + 8 * 3_600_000);
  return t.getUTCHours() * 60 + t.getUTCMinutes();
}

export async function runTodayQianMail(now = Date.now(), site = (process.env.SITE_URL ?? "https://yaoflow.com").replace(/\/$/, "")): Promise<{ sent: number; failed: number; skipped: number }> {
  ensure();
  const out = { sent: 0, failed: 0, skipped: 0 };
  if ((process.env.TODAY_QIAN_MAIL ?? "on") === "off") return out;
  if (!letterOn("today_qian")) return out; // 10-23 进度表 108
  const mins = taipeiMinuteOfDay(now);
  if (mins < TQ_MAIL_HOUR * 60 + TQ_MAIL_MIN || mins >= 22 * 60) return out;
  const day = homeDay(now);
  const { buildTodayQianEmail } = await import("./today-qian-mail");
  const rows = db().prepare("SELECT p.subject, c.id AS cid, c.email, c.locale FROM tq_prefs p JOIN customers c ON ('c:' || c.id) = p.subject WHERE p.mail = 1").all() as { subject: string; cid: number; email: string; locale: string | null }[];
  for (const r of rows.slice(0, 2000)) {
    const key = `tq:${r.cid}:${day}`;
    if (emailAlreadySent(key, "today_qian")) continue;
    const access = accessOf(r.cid, now);
    if (!access) { out.skipped++; continue; }
    // 10-22 會員每日信 carries the lot already — no second letter for a member who gets it
    if (memberLetterEligible(r.cid, r.locale, now)) { out.skipped++; continue; }
    const draw = drawToday(r.subject, now, "zh-hant");
    const v = lotView(draw, { full: true, section: sectionFor(r.cid, null, now), hk: false });
    if (!v) { out.skipped++; continue; }
    const locale = r.locale === "zh" ? "zh" : "zh-hant";
    const m = buildTodayQianEmail({ locale, day, lot: v, site, email: r.email });
    recordEmail(key, "today_qian", r.email, "pending");
    const { sendEmail } = await import("./email");
    const res = await sendEmail(r.email, m.subject, m.html, m.text, { kind: "daily", customerId: r.cid, locale, unsubUrl: m.unsubUrl });
    recordEmail(key, "today_qian", r.email, res.ok ? "sent" : "failed", res.error ?? res.id);
    if (res.ok) out.sent++; else out.failed++;
  }
  return out;
}

/* ---------------- 籤卡 ending in three days: the one letter ---------------- */

export async function runCardNotices(now = Date.now(), site = (process.env.SITE_URL ?? "https://yaoflow.com").replace(/\/$/, "")): Promise<{ sent: number; skipped: number }> {
  ensure();
  const out = { sent: 0, skipped: 0 };
  if (!letterOn("qian_card_notice")) return out; // 10-23 进度表 108
  const mins = taipeiMinuteOfDay(now);
  if (mins < 9 * 60 || mins >= 21 * 60) return out;
  const d = db();
  const due = d.prepare(`SELECT q.*, c.email, c.locale FROM qian_cards q JOIN customers c ON c.id = q.customer_id
    WHERE q.notice_at IS NULL AND q.refunded_at IS NULL AND q.ends_at > ? AND q.ends_at <= ?
      AND NOT EXISTS (SELECT 1 FROM qian_cards n WHERE n.customer_id = q.customer_id AND n.starts_at >= q.ends_at - 60000 AND n.id <> q.id)`).all(now, now + 3 * DAY) as (CardRow & { email: string; locale: string | null })[];
  const { buildCardNoticeEmail } = await import("./today-qian-mail");
  const { sendEmail } = await import("./email");
  for (const r of due) {
    d.prepare("UPDATE qian_cards SET notice_at = ? WHERE id = ? AND notice_at IS NULL").run(now, r.id);
    if (activeMembership(r.customer_id, now)) { out.skipped++; continue; }
    const locale = r.locale === "zh" ? "zh" : "zh-hant";
    const m = buildCardNoticeEmail({ locale, endsAt: r.ends_at, site, cardId: r.id });
    const key = `qcard:${r.id}`;
    recordEmail(key, "qian_card_notice", r.email, "pending");
    const res = await sendEmail(r.email, m.subject, m.html, m.text, { kind: "pass_notice", customerId: r.customer_id, locale });
    recordEmail(key, "qian_card_notice", r.email, res.ok ? "sent" : "failed", res.error ?? res.id);
    if (res.ok) out.sent++;
  }
  return out;
}

export function setCardChoice(cardId: number, choice: "again" | "member" | "no"): boolean {
  ensure();
  const r = db().prepare("UPDATE qian_cards SET notice_choice = ? WHERE id = ?").run(choice, cardId);
  return Number((r as unknown as { changes?: number }).changes ?? 0) > 0;
}

/** A paid 籤卡 checkout (kind = qiancard) → the card row. From the buyer's return or the fulfil cron, whichever first. */
export function fulfilCard(s: { id: string; payment_status: string; metadata?: Record<string, string> | null; currency?: string | null; amount_total?: number | null; customer_details?: { email?: string | null } | null }): { ok: true; row: CardRow; created: boolean } | { ok: false; why: string } {
  if (s.metadata?.kind !== "qiancard") return { ok: false, why: "not_card" };
  if (s.payment_status !== "paid") return { ok: false, why: "unpaid" };
  const cid = Number(s.metadata?.cust) || 0;
  let customerId = cid;
  if (!customerId) {
    const email = (s.metadata?.email || s.customer_details?.email || "").toLowerCase();
    const r = email ? (db().prepare("SELECT id FROM customers WHERE lower(email) = ?").get(email) as { id: number } | undefined) : undefined;
    if (!r) return { ok: false, why: "no_customer" };
    customerId = r.id;
  }
  const r = recordCard({ customerId, sessionId: s.id, currency: s.currency ? s.currency.toUpperCase() : null, amount: s.amount_total ?? null });
  return { ok: true, ...r };
}


/** 简体 readers: the same words converted (the lot's text is written in 繁體) */
export function lotToHans(v: LotView): LotView {
  const z = (s: string) => toHans(s);
  return { ...v, setName: z(v.setName), tag: z(v.tag), title: z(v.title), poem: v.poem.map(z),
    ...(v.full ? { full: { ...v.full, text: z(v.full.text), askNext: z(v.full.askNext), yi: v.full.yi ? z(v.full.yi) : null, ji: v.full.ji ? z(v.full.ji) : null } } : {}) };
}
