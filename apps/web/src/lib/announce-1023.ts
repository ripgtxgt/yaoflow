import { db, mailOptedOut, recordOps } from "./db";
import { buildAnnounceEmail, ownerRecipients, sendEmail } from "./email";
import { isInternalEmail } from "./internal";
import { countryFromTimeZone, detectCurrency, firstMonthMinor, formatMoney, isCurrency, PRICES, TONGKA_PRICES, type Currency } from "./money";
import { marketingBoxStartsTicked } from "./consent";
import { unsubUrl } from "./unsub";
import { homeMinute } from "./clock";
import { checkEmail } from "./email-check";

/**
 * 10-23 进度表 103 公告信 (Neil: 「要发给除了内部人员的所有邮箱」): one letter, once, to every reader address we hold —
 * customers first, plus the few addresses only an order, a revisit, an unfinished checkout or a 7-fold offer knows —
 * less: our own people and test accounts; addresses that bounced or marked us as spam (they cannot be reached, and
 * writing again to a spam complaint hurts every later letter); anyone who unsubscribed; and, where
 * the law wants a yes first (EU/EEA, UK, Switzerland, Canada, Korea — lib/consent.ts), anyone who never gave one.
 * Not written to either: an address we only hold because the reader saved a cast to their mailbox — that letter said
 * the next-day reminder was the only one (lib/dict/saved-cast.ts fFoot).
 * Prices are in the reader's own money (their latest purchase, else what the site would show them); the pass holder's
 * and the member's line go only to them. Each address once: an `emails` row (kind announce_1023) is claimed before the
 * send, so two runs never write twice.
 */

export const ANNOUNCE_KIND = "announce_1023";
type L = "zh-hant" | "zh";
export type AnnounceGroup = "member" | "pass" | "paid" | "free" | "other";
export interface AnnounceRecipient { email: string; customerId: number | null; locale: L; currency: Currency; member: boolean; pass: boolean; group: AnnounceGroup; /** ticked 「告诉我新功能」 (marketing_ok = 1) */ newsYes?: boolean }
export interface AnnouncePlan { candidates: number; recipients: AnnounceRecipient[]; skipped: Record<string, number> }

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const lower = (s: string) => s.trim().toLowerCase();
const loc = (x: string | null | undefined): L => (x === "zh" ? "zh" : "zh-hant");

export function announcePrices(currency: Currency, locale: L) {
  const f = (minor: number) => formatMoney(currency, minor, locale);
  return {
    p1: f(TONGKA_PRICES[1][currency]), p1first: f(PRICES[currency].one), p7: f(TONGKA_PRICES[7][currency]), p30: f(TONGKA_PRICES[30][currency]),
    one: f(PRICES[currency].one), month: f(PRICES[currency].month), first: f(firstMonthMinor(currency)),
  };
}

/** `sentKind`: the letter whose earlier sends count as done (10-23 进度表 112 reuses this audience for the 年書 letter) */
export function planAnnounce(now = Date.now(), opts: { sentKind?: string } = {}): AnnouncePlan {
  const d = db();
  const skipped: Record<string, number> = {};
  const skip = (why: string) => { skipped[why] = (skipped[why] ?? 0) + 1; };
  const owners = new Set(ownerRecipients().map(lower));
  const internal = (e: string) => isInternalEmail(e) || e.endsWith("@yaoflow.com") || owners.has(e);
  const unreachable = new Set((d.prepare("SELECT DISTINCT lower(email) AS e FROM mail_log WHERE bounced_at IS NOT NULL OR complained_at IS NOT NULL").all() as { e: string }[]).map((r) => r.e));
  const sent = new Set((d.prepare("SELECT lower(email) AS e FROM emails WHERE kind = ? AND status IN ('sent','sending')").all(opts.sentKind ?? ANNOUNCE_KIND) as { e: string }[]).map((r) => r.e));

  // what each customer holds now, and the money of their latest purchase
  const live = d.prepare("SELECT customer_id AS cid, stripe_subscription_id AS sid FROM subscriptions WHERE status IN ('active','trialing','past_due') AND period_end > ?").all(now) as { cid: number; sid: string }[];
  const members = new Set(live.filter((r) => !r.sid.startsWith("pass_")).map((r) => r.cid));
  const passes = new Set(live.filter((r) => r.sid.startsWith("pass_")).map((r) => r.cid));
  const lastMoney = new Map<number, { cur: string; at: number }>();
  const paid = new Set<number>();
  const note = (cid: number | null, cur: string | null, at: number) => {
    if (cid == null) return;
    paid.add(cid);
    const c = (cur ?? "").toUpperCase();
    if (isCurrency(c) && at >= (lastMoney.get(cid)?.at ?? 0)) lastMoney.set(cid, { cur: c, at });
  };
  for (const r of d.prepare("SELECT customer_id AS cid, currency AS cur, created_at AS at FROM orders WHERE COALESCE(amount_cents,0) > 0 AND (payment_state IN ('paid','refunded','disputed') OR (payment_state IS NULL AND status = 'paid'))").all() as { cid: number | null; cur: string | null; at: number }[]) note(r.cid, r.cur, r.at);
  for (const r of d.prepare("SELECT customer_id AS cid, currency AS cur, created_at AS at FROM subscriptions WHERE stripe_subscription_id LIKE 'sub_%' OR stripe_subscription_id LIKE 'pass_%'").all() as { cid: number; cur: string | null; at: number }[]) note(r.cid, r.cur, r.at);
  for (const r of d.prepare("SELECT customer_id AS cid, currency AS cur, created_at AS at FROM member_packs").all() as { cid: number; cur: string | null; at: number }[]) note(r.cid, r.cur, r.at);
  const edgeOf = d.prepare("SELECT edge_country AS edge, card_country AS card FROM orders WHERE customer_id = ? AND (edge_country IS NOT NULL OR card_country IS NOT NULL) ORDER BY created_at DESC LIMIT 1");

  const out: AnnounceRecipient[] = [];
  const seen = new Set<string>();
  const consider = (e: string, i: { customerId: number | null; locale: L; tz: string | null; test: boolean; marketing: number | null; countries: (string | null)[]; currency: Currency | null; group: AnnounceGroup }) => {
    if (seen.has(e)) return;
    seen.add(e);
    // 10-23: the typo check too (lib/email-check.ts) — gmail.con, icloud.con, edu-tw bounced on this letter, and gmai.com
    // is a stranger's catch-all that took it; the 年書 letter (进度表 112, 11/1) reads this same plan
    if (!EMAIL_RE.test(e) || !checkEmail(e).ok) return skip("bad_address");
    if (i.test || internal(e)) return skip("internal_or_test");
    if (unreachable.has(e)) return skip("bounced_or_complained");
    // marketing_ok is 0 by default (never asked); an unsubscribe is 0 with a marketing_at — mailOptedOut reads both
    if (mailOptedOut(e)) return skip("unsubscribed");
    if (!marketingBoxStartsTicked(...i.countries) && i.marketing !== 1) return skip("consent_region");
    if (sent.has(e)) return skip("already_sent");
    const currency = i.currency ?? detectCurrency({ timeZone: i.tz, edgeCountry: i.countries.find(Boolean) ?? null, language: i.locale === "zh" ? "zh-CN" : "zh-TW" });
    const member = i.customerId != null && members.has(i.customerId);
    const pass = i.customerId != null && passes.has(i.customerId);
    out.push({ email: e, customerId: i.customerId, locale: i.locale, currency, member, pass, group: member ? "member" : pass ? "pass" : i.group, newsYes: i.marketing === 1 });
  };

  const customers = d.prepare("SELECT id, lower(trim(email)) AS e, locale, tz, test_flag AS t, marketing_ok AS m FROM customers WHERE email IS NOT NULL ORDER BY id").all() as { id: number; e: string; locale: string | null; tz: string | null; t: number | null; m: number | null }[];
  const custEmails = new Set(customers.map((c) => c.e));
  for (const c of customers) {
    const edge = edgeOf.get(c.id) as { edge: string | null; card: string | null } | undefined;
    consider(c.e, {
      customerId: c.id, locale: loc(c.locale), tz: c.tz, test: c.t === 1, marketing: c.m,
      countries: [countryFromTimeZone(c.tz), edge?.edge ?? null, edge?.card ?? null],
      currency: (lastMoney.get(c.id)?.cur as Currency | undefined) ?? null,
      group: paid.has(c.id) ? "paid" : "free",
    });
  }
  // the few reader addresses that never became a customer row
  const extra = (sql: string) => { try { return d.prepare(sql).all() as { e: string | null; locale?: string | null; currency?: string | null; meta?: string | null }[]; } catch { return []; } };
  const extras = [
    ...extra("SELECT lower(trim(email)) AS e, NULL AS locale, currency FROM orders WHERE email IS NOT NULL AND COALESCE(amount_cents,0) > 0"),
    ...extra("SELECT lower(trim(email)) AS e, locale, NULL AS currency FROM revisits WHERE email IS NOT NULL"),
    ...extra("SELECT lower(trim(email)) AS e, locale, currency, meta_json AS meta FROM pending_checkouts WHERE email IS NOT NULL"),
    ...extra("SELECT lower(trim(email)) AS e, locale, currency FROM recover_offers"),
  ];
  for (const x of extras) {
    if (!x.e || custEmails.has(x.e)) continue;
    let countries: (string | null)[] = [];
    try { const m = x.meta ? (JSON.parse(x.meta) as Record<string, string>) : {}; countries = [m.country ?? null, countryFromTimeZone(m.tzname)]; } catch { /* */ }
    const cur = (x.currency ?? "").toUpperCase();
    consider(x.e, { customerId: null, locale: loc(x.locale), tz: null, test: false, marketing: null, countries, currency: isCurrency(cur) ? cur : null, group: "other" });
  }
  // a cast saved to the mailbox: that letter promised one reminder only
  for (const r of extra("SELECT DISTINCT lower(trim(email)) AS e FROM saved_casts WHERE email IS NOT NULL")) {
    if (r.e && !seen.has(r.e)) { seen.add(r.e); skip("saved_cast_promise"); }
  }
  return { candidates: seen.size, recipients: out, skipped };
}

/** Counts only — what the dry run and the admin page show (never an address). */
export function summarize(plan: AnnouncePlan) {
  const by = <K extends string>(f: (r: AnnounceRecipient) => K) => plan.recipients.reduce<Record<string, number>>((o, r) => { const k = f(r); o[k] = (o[k] ?? 0) + 1; return o; }, {});
  return { candidates: plan.candidates, recipients: plan.recipients.length, skipped: plan.skipped, byGroup: by((r) => r.group), byLocale: by((r) => r.locale), byCurrency: by((r) => r.currency), memberLine: plan.recipients.filter((r) => r.member).length, passLine: plan.recipients.filter((r) => r.pass).length, saidYesToNews: plan.recipients.filter((r) => r.newsYes).length };
}

export function announceMailFor(r: Pick<AnnounceRecipient, "email" | "locale" | "currency" | "member" | "pass">, site: string, subjectPrefix = "") {
  return buildAnnounceEmail({ locale: r.locale, prices: announcePrices(r.currency, r.locale), pass: r.pass, member: r.member, site, unsubUrl: unsubUrl(site, r.email, r.locale), subjectPrefix });
}

/** The two letters Neil reads before anyone else gets one (进度表 103 ④) — to the owner addresses only, nothing recorded. */
export async function sendAnnounceTests(site: string): Promise<{ sent: number }> {
  const to = ownerRecipients();
  const variants: (Omit<AnnounceRecipient, "email" | "customerId" | "group"> & { prefix: string })[] = [
    { prefix: "[测试·繁体·会员＋通卡两段都显示] ", locale: "zh-hant", currency: "TWD", member: true, pass: true },
    { prefix: "[测试·简体·非会员] ", locale: "zh", currency: "CNY", member: false, pass: false },
  ];
  let sent = 0;
  for (const v of variants) {
    const m = announceMailFor({ ...v, email: to[0]! }, site, v.prefix);
    const r = await sendEmail(to, m.subject, m.html, m.text, { kind: "test", locale: v.locale, unsubUrl: unsubUrl(site, to[0]!, v.locale) });
    if (r.ok) sent++;
  }
  recordOps("announce_test", `寄出 ${sent} 封测试给 Neil（${homeMinute(Date.now())}）`);
  return { sent };
}

/**
 * The real send, in batches: at most `limit` letters a run, `pace` ms apart (Resend's 2 a second, with room), only in the
 * Taipei day (09:00–21:00) unless `anyHour`. Each address is claimed in `emails` before its letter goes, so a second run
 * at the same time skips it. Returns what was sent and what is left.
 */
export async function sendAnnounce(site: string, opts: { limit?: number; pace?: number; anyHour?: boolean; now?: number } = {}): Promise<{ sent: number; failed: number; left: number; refused?: string }> {
  const now = opts.now ?? Date.now();
  const hour = new Date(now + 8 * 3_600_000).getUTCHours();
  if (!opts.anyHour && (hour < 9 || hour >= 21)) return { sent: 0, failed: 0, left: -1, refused: "night" };
  const plan = planAnnounce(now);
  const d = db();
  // claim the address: a new row, or one whose earlier try failed — never one that is sent or being sent
  const claim = d.prepare("INSERT INTO emails (session_id, kind, email, sent_at, status, detail) VALUES (?,?,?,?, 'sending', NULL) ON CONFLICT(session_id, kind) DO UPDATE SET status = 'sending', sent_at = excluded.sent_at WHERE emails.status = 'failed'");
  const done = d.prepare("UPDATE emails SET status = ?, detail = ?, sent_at = ? WHERE session_id = ? AND kind = ?");
  let sent = 0, failed = 0;
  const batch = plan.recipients.slice(0, Math.max(0, opts.limit ?? 40));
  for (const r of batch) {
    const sid = `announce:${r.email}`;
    if (Number((claim.run(sid, ANNOUNCE_KIND, r.email, Date.now()) as unknown as { changes?: number }).changes ?? 0) === 0) continue;
    let res: { ok: boolean; id?: string; error?: string };
    try {
      const m = announceMailFor(r, site);
      res = await sendEmail(r.email, m.subject, m.html, m.text, { kind: ANNOUNCE_KIND, locale: r.locale, unsubUrl: unsubUrl(site, r.email, r.locale), sessionId: sid, customerId: r.customerId });
    } catch (e) { res = { ok: false, error: e instanceof Error ? e.message : String(e) }; }
    done.run(res.ok ? "sent" : "failed", (res.ok ? res.id : res.error)?.slice(0, 200) ?? null, Date.now(), sid, ANNOUNCE_KIND);
    if (res.ok) sent++; else failed++;
    if (opts.pace !== 0) await new Promise((ok) => setTimeout(ok, opts.pace ?? 1200));
  }
  recordOps("announce_send", `寄出 ${sent}，失败 ${failed}，还剩 ${Math.max(0, plan.recipients.length - batch.length)}`);
  return { sent, failed, left: Math.max(0, plan.recipients.length - batch.length) };
}

/** For the weekly digest: how the letter did (sent, opened, unsubscribed since, replies to support). */
export function announceStats(): { sent: number; failed: number; opened: number; unsubs: number; replies: number; firstAt: number | null } | null {
  const d = db();
  const s = d.prepare("SELECT SUM(status = 'sent') AS sent, SUM(status = 'failed') AS failed, MIN(sent_at) AS firstAt FROM emails WHERE kind = ?").get(ANNOUNCE_KIND) as { sent: number | null; failed: number | null; firstAt: number | null };
  if (!s.sent && !s.failed) return null;
  const opened = (d.prepare("SELECT COUNT(*) AS n FROM mail_log WHERE kind = ? AND opened_at IS NOT NULL").get(ANNOUNCE_KIND) as { n: number }).n;
  const unsubs = (d.prepare("SELECT COUNT(*) AS n FROM mail_unsubs WHERE source = 'link' AND at >= ?").get(s.firstAt ?? 0) as { n: number }).n;
  let replies = 0;
  try { replies = (d.prepare("SELECT COUNT(*) AS n FROM support_inbox WHERE received_at >= ? AND (subject LIKE '%幾項更新%' OR subject LIKE '%几项更新%')").get(s.firstAt ?? 0) as { n: number }).n; } catch { /* no inbox table */ }
  return { sent: s.sent ?? 0, failed: s.failed ?? 0, opened, unsubs, replies, firstAt: s.firstAt };
}
