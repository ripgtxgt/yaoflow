import { letterOn } from "./letter-switch";
import { randomBytes } from "node:crypto";
import { createSavedCast, db, mailOptedOut, recordEmail, recordOps } from "./db";
import { buildRecoverSeqEmail, ownerRecipients, sendEmail } from "./email";
import { hexName } from "./names";
import { resolveServerChart } from "./reading";
import { formatMoney, isCurrency, PASS_PRICES, PRICES, type Currency } from "./money";
import { tongkaForAll } from "./subscription";
import { unsubUrl } from "./unsub";
import { FOLLOWUP_LIMIT } from "./followup-limit";
import { DEEP_PER_MONTH, MEMBER_FOLLOWUP_LIMIT } from "./sub-plan";
import { castDateLabel, normLocale, quoteOf } from "./recover-once";
import type { ListedSession } from "./stripe";
import type { Locale } from "./locales";
import type { LineValue } from "@yaoflow/engine";

/**
 * 10-12 挽回信序列 (进度表 §一「付款没完成的挽回信」; Neil 10-04: 「1小时后发邮件，然后1天，3天，5天后」→ 10-12 「做 1–4」,
 * with the box 「沒付完時寄信提醒我」 under the pay buttons). The rules, as settled on 10-04:
 *   - only a checkout whose reader ticked the box (metadata.remind = "1") and left an address;
 *   - from the moment they went to pay: 1 hour, 1 day, 3 days, 5 days — sent only between 9:00 and 21:00 their time;
 *     a letter held back by the clock goes at the next run in hours, a step that has fallen a whole step behind is
 *     skipped rather than sent late (so two never land together);
 *   - stops at any payment from that address after the checkout, at an unsubscribe, after the fourth;
 *   - a membership or the one month: the hour letter only; a top-up pack or a lot's reading: none;
 *   - not for a cast they saved to their inbox (that letter promised its own one reminder);
 *   - one round per address in 30 days: a new checkout within 30 days of a round's first letter starts no new round.
 * The link is the same as the one-off letter's (lib/recover-once.ts): an upgrade goes back to the light reading, a full
 * reading to the same figure (a saved-cast row, 30 days), a membership to the account page.
 */
export const SEQ_KIND = "recover-seq";
export const SEQ_OFFSETS_MS = [3_600_000, 86_400_000, 3 * 86_400_000, 5 * 86_400_000] as const;
export const SEQ_ROUND_MS = 30 * 86_400_000;
const DAY = 86_400_000;

export type SeqKind = "deep" | "upgrade" | "member";
export interface SeqDue { sessionId: string; email: string; step: 1 | 2 | 3 | 4; kind: SeqKind; skip: number[]; s: ListedSession }

/** The reader's hour now: from the cast's own offset, else the device's time zone, else Taipei. */
export function localHour(m: Record<string, string>, now: number): number {
  const tz = Number(m.tz);
  if (m.tz !== undefined && Number.isFinite(tz) && Math.abs(tz) <= 14 * 60) return Math.floor((((now + tz * 60_000) % DAY) + DAY) % DAY / 3_600_000);
  try {
    if (m.tzname) return Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hourCycle: "h23", timeZone: m.tzname }).format(now));
  } catch { /* unknown zone */ }
  return Math.floor((((now + 480 * 60_000) % DAY) + DAY) % DAY / 3_600_000);
}

/** Which step is due for one session, given the steps already sent or skipped — or null. Pure, for the tests. */
export function dueStep(created: number, done: Set<number>, member: boolean, now: number): { step: 1 | 2 | 3 | 4; skip: number[] } | null {
  const steps = member ? [1] : [1, 2, 3, 4];
  // the furthest step whose time has come
  let latest = 0;
  for (const k of steps) if (now >= created + SEQ_OFFSETS_MS[k - 1]!) latest = k;
  if (!latest || done.has(latest)) return null;
  // the one before it is still open: if its own window is not yet over, send that one; else skip it
  const skip: number[] = [];
  for (let k = 1; k < latest; k++) if (!done.has(k)) skip.push(k);
  return { step: latest as 1 | 2 | 3 | 4, skip };
}

export function planSeq(sessions: ListedSession[], now = Date.now()): { due: SeqDue[]; skipped: Record<string, number> } {
  const d = db();
  const owners = new Set(ownerRecipients());
  const custRows = d.prepare("SELECT id, lower(email) AS e, test_flag AS t FROM customers").all() as { id: number; e: string; t: number | null }[];
  const custById = new Map(custRows.map((r) => [r.id, r]));
  const testEmails = new Set(custRows.filter((r) => r.t === 1).map((r) => r.e));
  const lastPaid = new Map<string, number>();
  const paid = (e: string | null, t: number) => { if (e && t > (lastPaid.get(e) ?? 0)) lastPaid.set(e, t); };
  for (const r of d.prepare("SELECT lower(COALESCE(o.email, c.email)) AS e, o.created_at AS t FROM orders o LEFT JOIN customers c ON c.id = o.customer_id WHERE o.payment_state IN ('paid','refunded','disputed') AND COALESCE(o.amount_cents,0) > 0").all() as { e: string | null; t: number }[]) paid(r.e, r.t);
  for (const r of d.prepare("SELECT lower(c.email) AS e, s.created_at AS t FROM subscriptions s JOIN customers c ON c.id = s.customer_id WHERE (s.stripe_subscription_id LIKE 'sub_%' OR s.stripe_subscription_id LIKE 'pass_%') AND s.status NOT IN ('incomplete','incomplete_expired')").all() as { e: string | null; t: number }[]) paid(r.e, r.t);
  for (const r of d.prepare("SELECT lower(c.email) AS e, p.created_at AS t FROM member_packs p JOIN customers c ON c.id = p.customer_id").all() as { e: string | null; t: number }[]) paid(r.e, r.t);
  // 10-13 bug (Neil: 「这个邮件会不会发得太频繁了」): runSeq writes `seq:<checkout id>` but this read the bare id, so a
  // sent step was never seen and the hour letter went out again every hour — 6 readers got 5–10 each. Read what is written.
  const sentStmt = d.prepare("SELECT kind FROM emails WHERE session_id = ? AND kind LIKE 'recover-seq-%'");
  // and a backstop that does not depend on that key: never two of these letters to one address within 20 hours
  const recentStmt = d.prepare("SELECT 1 FROM emails WHERE lower(email) = ? AND kind LIKE 'recover-seq-%' AND status = 'sent' AND sent_at > ? LIMIT 1");
  const roundStmt = d.prepare("SELECT session_id AS sid, sent_at AS t FROM emails WHERE lower(email) = ? AND kind = 'recover-seq-1' AND status = 'sent' AND sent_at >= ? ORDER BY sent_at DESC");
  const savedStmt = d.prepare("SELECT 1 FROM saved_casts WHERE lower(email) = ? AND cast_at = ? AND origin IS NULL LIMIT 1");
  const unsubbed = (e: string) => mailOptedOut(e); // 10-23 进度表 103: the exact address (lib/db.ts mail_unsubs)

  const skipped: Record<string, number> = {};
  const skip = (why: string) => { skipped[why] = (skipped[why] ?? 0) + 1; };
  const singlesGone = tongkaForAll();
  const due: SeqDue[] = [];
  for (const s of sessions) {
    const m = s.metadata ?? {};
    if (m.remind !== "1") continue;
    if (s.payment_status === "paid" || s.payment_status === "no_payment_required") continue;
    if (m.kind === "pack" || m.kind === "qian" || m.kind === "qiancard" || m.kind === "tarot" || m.kind === "bazi" || m.kind === "ziwei" || m.kind === "astro" || m.kind === "hepan" || m.kind === "nianshu" || m.kind === "name" || m.kind === "alipay_probe" || m.test === "1") { skip("kind"); continue; }
    const created = s.created * 1000;
    if (now - created > 6 * DAY) continue;
    const raw = s.customer_email ?? s.customer_details?.email ?? (m.cust ? custById.get(Number(m.cust))?.e : null) ?? m.email ?? null;
    const email = raw ? raw.trim().toLowerCase() : null;
    if (!email) { skip("no_email"); continue; }
    if (testEmails.has(email) || owners.has(email)) { skip("test_or_owner"); continue; }
    if ((lastPaid.get(email) ?? 0) >= created) { skip("paid"); continue; }
    if (s.status === "open" && now - created < 3_600_000) continue;
    const done = new Set((sentStmt.all(`seq:${s.id}`) as { kind: string }[]).map((r) => Number(r.kind.slice(-1))));
    if (done.has(4)) continue;
    // one round per address in 30 days: an earlier round's first letter on another checkout blocks a new round
    if (!done.size) {
      const round = (roundStmt.all(email, now - SEQ_ROUND_MS) as { sid: string; t: number }[]).find((r) => r.sid !== `seq:${s.id}`);
      if (round) { skip("round_30d"); continue; }
    }
    // 10-24 (Neil: 「会员是会员，通卡是通卡」): a pass checkout is not a membership — its one letter is the hour offer
    // (lib/recover-offer.ts, named for the pass); this sequence's member letter would call it 會員
    if (m.kind === "pass") { skip("pass_offer"); continue; }
    const member = s.mode === "subscription";
    // 10-23 进度表 101: a single reading is no longer sold once the 通卡 is open to everyone — no letter quotes one
    if (!member && singlesGone) { skip("single_retired"); continue; }
    if (!member && Number.isFinite(Number(m.castAtMs)) && savedStmt.get(email, Number(m.castAtMs))) { skip("saved_promise"); continue; }
    const step = dueStep(created, done, member, now);
    if (!step) continue;
    if (recentStmt.get(email, now - 20 * 3_600_000)) { skip("recent_20h"); continue; }
    const h = localHour(m, now);
    if (h < 9 || h >= 21) { skip("night"); continue; }
    if (unsubbed(email)) { skip("unsub"); continue; }
    const kind: SeqKind = member ? "member" : m.upgrade === "1" ? "upgrade" : "deep";
    due.push({ sessionId: s.id, email, step: step.step, kind, skip: step.skip, s });
  }
  return { due, skipped };
}

/** The letter for one due step — and, for a full reading, the saved-cast row its link opens (made when `persist`). */
export function seqMailFor(x: SeqDue, site: string, persist: boolean, now = Date.now()): { subject: string; html: string; text: string; url: string } | null {
  const m = x.s.metadata ?? {};
  const locale: Locale = normLocale(m.pageLocale) ?? normLocale(m.locale) ?? normLocale(x.s.locale) ?? "zh-hant";
  const cur = (x.s.currency ?? m.currency ?? "").toUpperCase();
  const currency: Currency = isCurrency(cur) ? cur : "USD";
  const unsub = unsubUrl(site, x.email, locale);
  if (x.kind === "member") {
    const url = `${site}/${locale}/account?tab=member&c=recover-seq`;
    const mail = buildRecoverSeqEmail({
      locale, step: 1, kind: "member", date: "", q: null, hex: "", price: "", url, unsubUrl: unsub, n: FOLLOWUP_LIMIT,
      month: formatMoney(currency, PRICES[currency].month, locale), pass: formatMoney(currency, PASS_PRICES[currency], locale), deep: DEEP_PER_MONTH, fu: MEMBER_FOLLOWUP_LIMIT,
    });
    return { ...mail, url };
  }
  const values = (m.values ?? "").split(",").map(Number);
  const castAt = Number(m.castAtMs);
  const tz = Number(m.tz);
  if (values.length !== 6 || !values.every((v) => v >= 6 && v <= 9) || !Number.isFinite(castAt) || !Number.isFinite(tz) || !m.question) return null;
  const chart = resolveServerChart({ question: m.question, values: values as LineValue[], castAtMs: castAt, tzOffsetMinutes: tz } as never, true);
  const hex = hexName(chart.cast.primary, locale);
  const price = formatMoney(currency, x.s.amount_total ?? PRICES[currency].deep, locale);
  let url: string;
  const lightSid = x.kind === "upgrade" ? lightSessionFor(x.email, castAt) : null;
  if (lightSid) {
    url = `${site}/${locale}/reading?sid=${encodeURIComponent(lightSid)}&c=recover-seq`;
  } else {
    const token = persist ? randomBytes(24).toString("hex") : "0".repeat(48);
    if (persist) createSavedCast({ token, email: x.email, locale, question: m.question, values, castAt, tzOffset: tz, hex, teaser: m.teaser ?? null, currency, origin: "recover" }, now);
    url = `${site}/${locale}/cast?saved=${token}&c=recover-seq`;
  }
  const mail = buildRecoverSeqEmail({
    locale, step: x.step, kind: lightSid ? "upgrade" : "deep", date: castDateLabel(castAt, tz, locale), q: quoteOf(m.question, locale), hex,
    price, url, unsubUrl: unsub, n: FOLLOWUP_LIMIT,
  });
  return { ...mail, url };
}

/** The light reading an upgrade checkout came from (its own order, or the free grant it was claimed through). */
function lightSessionFor(email: string, castAt: number): string | null {
  const d = db();
  const o = d.prepare("SELECT o.session_id AS sid FROM orders o JOIN casts c ON c.id = o.cast_id LEFT JOIN customers cu ON cu.id = o.customer_id WHERE (lower(o.email) = ? OR lower(cu.email) = ?) AND c.cast_at = ? AND o.tier = 'one' ORDER BY o.created_at DESC LIMIT 1")
    .get(email, email, castAt) as { sid: string } | undefined;
  if (o) return o.sid;
  const g = d.prepare("SELECT redeem_session_id AS sid FROM grants WHERE lower(claimed_email) = ? AND redeem_session_id IS NOT NULL AND input_json LIKE ? ORDER BY used_at DESC LIMIT 1")
    .get(email, `%"castAtMs":${castAt}%`) as { sid: string } | undefined;
  return g?.sid ?? null;
}

/** The cron's pass: due letters sent (at most 40 a run), skipped steps written down so they never go late. */
export async function runSeq(sessions: ListedSession[], site: string, opts: { dry?: boolean; now?: number } = {}): Promise<{ sent: number; failed: number; due: number; skipped: Record<string, number> }> {
  const now = opts.now ?? Date.now();
  if (!opts.dry && !letterOn("recover")) return { sent: 0, failed: 0, due: 0, skipped: { off: 1 } }; // 10-23 进度表 108
  const plan = planSeq(sessions, now);
  let sent = 0, failed = 0;
  for (const x of plan.due.slice(0, 40)) {
    if (opts.dry) continue;
    for (const k of x.skip) recordEmail(`seq:${x.sessionId}`, `${SEQ_KIND}-${k}`, x.email, "skipped", "late");
    let mail: ReturnType<typeof seqMailFor>;
    try { mail = seqMailFor(x, site, true, now); } catch (e) { mail = null; recordOps("recover_seq_err", String(e instanceof Error ? e.message : e).slice(0, 120)); }
    if (!mail) { recordEmail(`seq:${x.sessionId}`, `${SEQ_KIND}-${x.step}`, x.email, "skipped", "no_cast"); continue; }
    const locale = normLocale(x.s.metadata?.pageLocale) ?? normLocale(x.s.metadata?.locale) ?? "zh-hant";
    const r = await sendEmail(x.email, mail.subject, mail.html, mail.text, { kind: "recover", sessionId: `seq:${x.sessionId}:${x.step}`, unsubUrl: unsubUrl(site, x.email, locale), locale });
    recordEmail(`seq:${x.sessionId}`, `${SEQ_KIND}-${x.step}`, x.email, r.ok ? "sent" : "failed", r.error ?? r.id);
    if (r.ok) sent++; else failed++;
  }
  if (!opts.dry && (sent || failed)) recordOps("recover_seq", `sent ${sent} failed ${failed} due ${plan.due.length} ${JSON.stringify(plan.skipped)}`);
  return { sent, failed, due: plan.due.length, skipped: plan.skipped };
}
