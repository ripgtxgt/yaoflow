import { db, recordOps } from "./db";
import { buildNianshuEarlyEmail, ownerRecipients, sendEmail } from "./email";
import { planAnnounce, type AnnounceRecipient } from "./announce-1023";
import { formatMoney, nianshuMinor, type Currency } from "./money";
import { unsubUrl } from "./unsub";
import { homeMinute } from "./clock";

/**
 * 10-23 进度表 112 年书早鸟信 (Neil: 「年书早鸟的，按照目前我们所有的邮箱，除了内部邮箱」; the copy: 「内容没有问题」).
 * The audience is the 10-23 announcement's (lib/announce-1023.ts planAnnounce — every reader address we hold, less our
 * own, bounced or spam-flagged, unsubscribed (those who unsubscribed after the announcement too), and where the law wants
 * a yes first, anyone without one), each address once for THIS letter, less anyone who has already bought a 2027 年書.
 * Prices in the reader's own money: the early-bird price next to the full one.
 *
 * Nothing goes out by itself. 10-31 two test letters to Neil (?test=1); the batches from 11/1 10:00 Taipei only, and
 * only when run by hand after Neil says yes (?send=1&confirm=nianshu_early_1101). Each address is claimed in `emails`
 * (kind nianshu_early_1101) before its letter, so two runs never write twice.
 */

export const NIANSHU_EARLY_KIND = "nianshu_early_1101";
/** 2026-11-01 10:00 Taipei: the 2027 年書 is on sale from 11/1, and the letter says 「今天開賣了」 */
export const NIANSHU_EARLY_FROM = Date.parse("2026-11-01T02:00:00Z");
const YEAR = 2027;

export interface EarlyPlan { candidates: number; recipients: AnnounceRecipient[]; skipped: Record<string, number> }

export function planNianshuEarly(now = Date.now()): EarlyPlan {
  const base = planAnnounce(now, { sentKind: NIANSHU_EARLY_KIND });
  const skipped = { ...base.skipped };
  const d = db();
  let buyers = new Set<string>(), buyerIds = new Set<number>();
  try {
    const rows = d.prepare("SELECT lower(trim(email)) AS e, customer_id AS cid FROM nianshu_reports WHERE year = ? AND paid_at IS NOT NULL").all(YEAR) as { e: string | null; cid: number | null }[];
    buyers = new Set(rows.map((r) => r.e).filter((e): e is string => !!e));
    buyerIds = new Set(rows.map((r) => r.cid).filter((c): c is number => c != null));
  } catch { /* no 年書 sold yet: the table is made on first use */ }
  const recipients = base.recipients.filter((r) => {
    if (buyers.has(r.email) || (r.customerId != null && buyerIds.has(r.customerId))) { skipped.bought_2027 = (skipped.bought_2027 ?? 0) + 1; return false; }
    return true;
  });
  return { candidates: base.candidates, recipients, skipped };
}

/** counts only — never an address */
export function summarizeEarly(plan: EarlyPlan) {
  const by = (f: (r: AnnounceRecipient) => string) => plan.recipients.reduce<Record<string, number>>((o, r) => { const k = f(r); o[k] = (o[k] ?? 0) + 1; return o; }, {});
  return { candidates: plan.candidates, recipients: plan.recipients.length, skipped: plan.skipped, byLocale: by((r) => r.locale), byCurrency: by((r) => r.currency), byGroup: by((r) => r.group) };
}

export function earlyMailFor(r: Pick<AnnounceRecipient, "email" | "locale" | "currency">, site: string, subjectPrefix = "") {
  const f = (minor: number) => formatMoney(r.currency as Currency, minor, r.locale);
  return buildNianshuEarlyEmail({
    locale: r.locale, early: f(nianshuMinor(r.currency as Currency, true)), regular: f(nianshuMinor(r.currency as Currency)),
    url: `${site}/${r.locale}/nianshu?c=nianshu-early`, unsubUrl: unsubUrl(site, r.email, r.locale), subjectPrefix,
  });
}

/** 10-31: the letters Neil reads before anyone else gets one — to the owner addresses only, nothing recorded */
export async function sendNianshuEarlyTests(site: string): Promise<{ sent: number }> {
  const to = ownerRecipients();
  const variants: { prefix: string; locale: "zh-hant" | "zh"; currency: Currency }[] = [
    { prefix: "[测试·繁体·台币] ", locale: "zh-hant", currency: "TWD" },
    { prefix: "[测试·繁体·港币] ", locale: "zh-hant", currency: "HKD" },
    { prefix: "[测试·简体·人民币] ", locale: "zh", currency: "CNY" },
    { prefix: "[测试·繁体·美元] ", locale: "zh-hant", currency: "USD" },
  ];
  let sent = 0;
  for (const v of variants) {
    const m = earlyMailFor({ email: to[0]!, locale: v.locale, currency: v.currency }, site, v.prefix);
    const r = await sendEmail(to, m.subject, m.html, m.text, { kind: "test", locale: v.locale, unsubUrl: unsubUrl(site, to[0]!, v.locale) });
    if (r.ok) sent++;
  }
  recordOps("nianshu_early_test", `寄出 ${sent} 封测试给 Neil（${homeMinute(Date.now())}）`);
  return { sent };
}

/**
 * The real send, one batch: from 11/1 10:00 Taipei, in the Taipei day (09:00–21:00), at most `limit` letters `pace` ms
 * apart. Returns what was sent and what is left.
 */
export async function sendNianshuEarly(site: string, opts: { limit?: number; pace?: number; now?: number } = {}): Promise<{ sent: number; failed: number; left: number; refused?: string }> {
  const now = opts.now ?? Date.now();
  if (now < NIANSHU_EARLY_FROM) return { sent: 0, failed: 0, left: -1, refused: "before_1101" };
  const hour = new Date(now + 8 * 3_600_000).getUTCHours();
  if (hour < 9 || hour >= 21) return { sent: 0, failed: 0, left: -1, refused: "night" };
  const plan = planNianshuEarly(now);
  const d = db();
  const claim = d.prepare("INSERT INTO emails (session_id, kind, email, sent_at, status, detail) VALUES (?,?,?,?, 'sending', NULL) ON CONFLICT(session_id, kind) DO UPDATE SET status = 'sending', sent_at = excluded.sent_at WHERE emails.status = 'failed'");
  const done = d.prepare("UPDATE emails SET status = ?, detail = ?, sent_at = ? WHERE session_id = ? AND kind = ?");
  let sent = 0, failed = 0;
  const batch = plan.recipients.slice(0, Math.max(0, opts.limit ?? 40));
  for (const r of batch) {
    const sid = `nianshu-early:${r.email}`;
    if (Number((claim.run(sid, NIANSHU_EARLY_KIND, r.email, Date.now()) as unknown as { changes?: number }).changes ?? 0) === 0) continue;
    let res: { ok: boolean; id?: string; error?: string };
    try {
      const m = earlyMailFor(r, site);
      res = await sendEmail(r.email, m.subject, m.html, m.text, { kind: NIANSHU_EARLY_KIND, locale: r.locale, unsubUrl: unsubUrl(site, r.email, r.locale), sessionId: sid, customerId: r.customerId });
    } catch (e) { res = { ok: false, error: e instanceof Error ? e.message : String(e) }; }
    done.run(res.ok ? "sent" : "failed", (res.ok ? res.id : res.error)?.slice(0, 200) ?? null, Date.now(), sid, NIANSHU_EARLY_KIND);
    if (res.ok) sent++; else failed++;
    if (opts.pace !== 0) await new Promise((ok) => setTimeout(ok, opts.pace ?? 1200));
  }
  recordOps("nianshu_early_send", `寄出 ${sent}，失败 ${failed}，还剩 ${Math.max(0, plan.recipients.length - batch.length)}`);
  return { sent, failed, left: Math.max(0, plan.recipients.length - batch.length) };
}
