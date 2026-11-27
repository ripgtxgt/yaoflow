import { db, mailOptedOut, recordOps } from "./db";
import { buildCampaignEmail, ownerRecipients, sendEmail } from "./email";
import { isInternalEmail } from "./internal";
import { countryFromTimeZone, detectCurrency, firstMonthMinor, formatMoney, isCurrency, PRICES, TONGKA_PRICES, type Currency } from "./money";
import { marketingBoxStartsTicked } from "./consent";
import { unsubUrl } from "./unsub";
import { toHans } from "./hant";
import { homeMinute } from "./clock";
import { checkEmail } from "./email-check";

/**
 * 10-23 进度表 107 ③ 分群与群发 — the 10-23 announcement (lib/announce-1023.ts) made into a tool: pick people by what they
 * are to us now, write the letter once in 繁體 (简体 is converted unless written too), see it, send it to ourselves,
 * then let it go out in batches. The same rules as the announcement, always: never our own people or test accounts,
 * never an address that bounced or called us spam, never anyone who unsubscribed, and where the law wants a yes first
 * (lib/consent.ts) only those who gave one; every letter carries the one-click unsubscribe. Each address once per
 * campaign (an `emails` row is claimed before the send). Only customers with an address are written to.
 *
 * The letter's own marks (lib/email.ts buildCampaignEmail): a blank line between paragraphs, 「- 」 for a list, **bold**.
 * Prices in the reader's money: {1日通卡} {1日通卡首张} {7天通卡} {30天通卡} {会员月费} {会员首月} (繁體 spellings too).
 * A part for one group only: 【只给会员】…【/只给】 — 会员 / 通卡 / 非会员 / 付过钱 / 没付过钱 (只給 too).
 */

export type Standing = "all" | "member_renewing" | "member_closing" | "pass_now" | "pass_ending" | "paid_once_lapsed" | "free_only";
export const STANDINGS: readonly Standing[] = ["all", "member_renewing", "member_closing", "pass_now", "pass_ending", "paid_once_lapsed", "free_only"];
export const STANDING_ZH: Record<Standing, string> = {
  all: "全部能寄的人", member_renewing: "会员 · 续订中", member_closing: "会员 · 已关续订", pass_now: "通卡在用",
  pass_ending: "通卡 N 天内到期", paid_once_lapsed: "只买过一次、N 天没回来", free_only: "只用过免费",
};
export const PRODUCTS_USED: Record<string, { name: string; sql: string }> = {
  liuyao: { name: "六爻", sql: "SELECT DISTINCT customer_id AS c FROM casts WHERE customer_id IS NOT NULL" },
  tarot: { name: "塔罗", sql: "SELECT DISTINCT customer_id AS c FROM tarot_draws WHERE customer_id IS NOT NULL" },
  jieqian: { name: "解籤", sql: "SELECT DISTINCT customer_id AS c FROM qian_draws WHERE customer_id IS NOT NULL" },
  jiaobei: { name: "擲筊", sql: "SELECT DISTINCT customer_id AS c FROM jiaobei_asks WHERE customer_id IS NOT NULL" },
  bazi: { name: "八字", sql: "SELECT DISTINCT customer_id AS c FROM bazi_reports WHERE customer_id IS NOT NULL" },
  ziwei: { name: "紫微", sql: "SELECT DISTINCT customer_id AS c FROM ziwei_reports WHERE customer_id IS NOT NULL" },
  astro: { name: "星盘", sql: "SELECT DISTINCT customer_id AS c FROM astro_reports WHERE customer_id IS NOT NULL" },
  hepan: { name: "合盘", sql: "SELECT DISTINCT customer_id AS c FROM hepan_reports WHERE customer_id IS NOT NULL" },
  nianshu: { name: "年书", sql: "SELECT DISTINCT customer_id AS c FROM nianshu_reports WHERE customer_id IS NOT NULL" },
  qa: { name: "命盘问答", sql: "SELECT DISTINCT customer_id AS c FROM mingli_qa WHERE customer_id IS NOT NULL" },
};

export interface Segment { standing: Standing; days?: number; locale: "all" | "zh-hant" | "zh"; currency: string; product: string }
export const DEFAULT_SEGMENT: Segment = { standing: "all", locale: "all", currency: "all", product: "all" };

export function segmentFrom(x: Record<string, unknown>): Segment {
  const standing = STANDINGS.includes(x.standing as Standing) ? (x.standing as Standing) : "all";
  const days = Math.min(Math.max(Number(x.days) || 0, 0), 365);
  const locale = x.locale === "zh" || x.locale === "zh-hant" ? x.locale : "all";
  const currency = typeof x.currency === "string" && /^[A-Z]{3}$/.test(x.currency) ? x.currency : "all";
  const product = typeof x.product === "string" && x.product in PRODUCTS_USED ? x.product : "all";
  return { standing, ...(days ? { days } : {}), locale, currency, product };
}
export function segmentLine(s: Segment): string {
  const st = STANDING_ZH[s.standing].replace("N 天", `${s.days ?? (s.standing === "pass_ending" ? 3 : 30)} 天`);
  return [st, s.locale === "all" ? null : s.locale === "zh" ? "简体" : "繁体", s.currency === "all" ? null : s.currency, s.product === "all" ? null : `用过${PRODUCTS_USED[s.product]?.name ?? s.product}`].filter(Boolean).join(" · ");
}

type L = "zh-hant" | "zh";
export interface Recipient { email: string; customerId: number; locale: L; currency: Currency; member: boolean; pass: boolean; paid: boolean }
export interface Audience { recipients: Recipient[]; skipped: Record<string, number> }

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const many = <T,>(sql: string, ...a: unknown[]): T[] => { try { return db().prepare(sql).all(...(a as never[])) as T[]; } catch { return []; } };

/** who a segment reaches now, after the fixed exclusions — counts in `skipped` (never an address shown) */
export function audience(seg: Segment, now = Date.now()): Audience {
  const skipped: Record<string, number> = {};
  const skip = (why: string) => { skipped[why] = (skipped[why] ?? 0) + 1; };
  const owners = new Set(ownerRecipients());
  const unreachable = new Set(many<{ e: string }>("SELECT DISTINCT lower(email) AS e FROM mail_log WHERE bounced_at IS NOT NULL OR complained_at IS NOT NULL").map((r) => r.e));
  const subs = many<{ cid: number; sid: string; status: string; cape: number; cancel_at: number | null; pe: number | null }>(
    "SELECT customer_id AS cid, stripe_subscription_id AS sid, status, cancel_at_period_end AS cape, cancel_at, period_end AS pe FROM subscriptions");
  const liveSub = (s: (typeof subs)[number]) => s.sid.startsWith("sub_") && ["active", "trialing", "past_due"].includes(s.status) && (s.pe ?? Infinity) > now;
  const livePass = (s: (typeof subs)[number]) => s.sid.startsWith("pass_") && s.status === "active" && (s.pe ?? 0) > now;
  const renewing = new Set(subs.filter((s) => liveSub(s) && !s.cape && s.cancel_at == null).map((s) => s.cid));
  const closing = new Set(subs.filter((s) => liveSub(s) && (s.cape || s.cancel_at != null)).map((s) => s.cid));
  const passNow = new Set(subs.filter(livePass).map((s) => s.cid));
  const passDays = seg.days ?? 3;
  const passEnding = new Set(subs.filter((s) => livePass(s) && (s.pe ?? 0) <= now + passDays * 86_400_000).map((s) => s.cid));
  // what each customer paid for: single orders and passes / memberships bought (a comp or a granted pass is not money)
  const charges = new Map<number, number>();
  const lastMoney = new Map<number, { cur: string; at: number }>();
  const note = (cid: number | null, cur: string | null, at: number) => {
    if (cid == null) return;
    charges.set(cid, (charges.get(cid) ?? 0) + 1);
    const c = (cur ?? "").toUpperCase();
    if (isCurrency(c) && at >= (lastMoney.get(cid)?.at ?? 0)) lastMoney.set(cid, { cur: c, at });
  };
  // a pass bought since 10-22 is an order row AND a pass_<session tail> row — counted once, from the order; an older
  // one-off month has only the subscriptions row
  const passOrderTails = new Set<string>();
  for (const r of many<{ cid: number | null; cur: string | null; at: number; tier: string; sid: string }>("SELECT customer_id AS cid, currency AS cur, created_at AS at, tier, session_id AS sid FROM orders WHERE COALESCE(amount_cents, 0) > 0 AND (payment_state IN ('paid', 'refunded', 'disputed') OR (payment_state IS NULL AND status = 'paid'))")) {
    if (r.tier.startsWith("pass_")) passOrderTails.add(r.sid.slice(-40));
    note(r.cid, r.cur, r.at);
  }
  for (const r of many<{ cid: number; cur: string | null; at: number; sid: string }>("SELECT customer_id AS cid, currency AS cur, created_at AS at, stripe_subscription_id AS sid FROM subscriptions WHERE (substr(stripe_subscription_id, 1, 4) = 'sub_' OR substr(stripe_subscription_id, 1, 5) = 'pass_') AND COALESCE(amount_minor, 0) > 0 AND status NOT IN ('incomplete', 'incomplete_expired')")) {
    if (r.sid.startsWith("pass_") && passOrderTails.has(r.sid.slice(5))) continue;
    note(r.cid, r.cur, r.at);
  }
  const used = seg.product !== "all" ? new Set(many<{ c: number }>(PRODUCTS_USED[seg.product]!.sql).map((r) => r.c)) : null;
  const edgeOf = (() => { try { return db().prepare("SELECT edge_country AS edge, card_country AS card FROM orders WHERE customer_id = ? AND (edge_country IS NOT NULL OR card_country IS NOT NULL) ORDER BY created_at DESC LIMIT 1"); } catch { return null; } })();
  const lapsedDays = seg.days ?? 30;

  const out: Recipient[] = [];
  for (const c of many<{ id: number; e: string; locale: string | null; tz: string | null; t: number | null; m: number | null; seen: number | null }>(
    "SELECT id, lower(trim(email)) AS e, locale, tz, test_flag AS t, marketing_ok AS m, last_seen AS seen FROM customers WHERE email IS NOT NULL ORDER BY id")) {
    const e = c.e;
    // 10-23: and what the typo check flags (gmail.con, edu-tw … bounce; gmai.com is a stranger's catch-all)
    if (!EMAIL_RE.test(e) || !checkEmail(e).ok) { skip("bad_address"); continue; }
    if (c.t === 1 || isInternalEmail(e) || e.endsWith("@yaoflow.com") || owners.has(e)) { skip("internal_or_test"); continue; }
    if (unreachable.has(e)) { skip("bounced_or_complained"); continue; }
    if (mailOptedOut(e)) { skip("unsubscribed"); continue; }
    const edge = edgeOf?.get(c.id) as { edge: string | null; card: string | null } | undefined;
    const countries = [countryFromTimeZone(c.tz), edge?.edge ?? null, edge?.card ?? null];
    if (!marketingBoxStartsTicked(...countries) && c.m !== 1) { skip("consent_region"); continue; }
    const member = renewing.has(c.id) || closing.has(c.id);
    const pass = passNow.has(c.id);
    const paidN = charges.get(c.id) ?? 0;
    const inStanding =
      seg.standing === "all" ? true
      : seg.standing === "member_renewing" ? renewing.has(c.id)
      : seg.standing === "member_closing" ? closing.has(c.id)
      : seg.standing === "pass_now" ? pass
      : seg.standing === "pass_ending" ? passEnding.has(c.id) && !member
      : seg.standing === "paid_once_lapsed" ? paidN === 1 && !member && !pass && (c.seen ?? 0) < now - lapsedDays * 86_400_000
      : paidN === 0 && !member && !pass;
    if (!inStanding) continue;
    const locale: L = c.locale === "zh" ? "zh" : "zh-hant";
    if (seg.locale !== "all" && seg.locale !== locale) continue;
    const currency = (lastMoney.get(c.id)?.cur as Currency | undefined) ?? detectCurrency({ timeZone: c.tz, edgeCountry: countries.find(Boolean) ?? null, language: locale === "zh" ? "zh-CN" : "zh-TW" });
    if (seg.currency !== "all" && seg.currency !== currency) continue;
    if (used && !used.has(c.id)) continue;
    out.push({ email: e, customerId: c.id, locale, currency, member, pass, paid: paidN > 0 });
  }
  return { recipients: out, skipped };
}

/* ---------------- the letter ---------------- */

const PRICE_TOKENS = (currency: Currency, locale: L): Record<string, string> => {
  const f = (minor: number) => formatMoney(currency, minor, locale);
  const p = { p1: f(TONGKA_PRICES[1][currency]), p1first: f(PRICES[currency].one), p7: f(TONGKA_PRICES[7][currency]), p30: f(TONGKA_PRICES[30][currency]), month: f(PRICES[currency].month), first: f(firstMonthMinor(currency)) };
  return {
    "1日通卡": p.p1, "1日通卡首张": p.p1first, "1日通卡首張": p.p1first, "7天通卡": p.p7, "30天通卡": p.p30,
    "会员月费": p.month, "會員月費": p.month, "会员首月": p.first, "會員首月": p.first,
  };
};
const GROUP_OK: Record<string, (r: Pick<Recipient, "member" | "pass" | "paid">) => boolean> = {
  会员: (r) => r.member, 會員: (r) => r.member, 通卡: (r) => r.pass, 非会员: (r) => !r.member, 非會員: (r) => !r.member,
  付过钱: (r) => r.paid, 付過錢: (r) => r.paid, 没付过钱: (r) => !r.paid, 沒付過錢: (r) => !r.paid,
};
/** the body for one reader: their groups' parts kept, the others dropped; the prices in their money */
export function fillBody(body: string, r: Pick<Recipient, "member" | "pass" | "paid" | "currency" | "locale">): string {
  const kept = body.replace(/【只[给給]([^】]+)】([\s\S]*?)【\/只[给給]】/g, (_, who: string, part: string) => (GROUP_OK[who.trim()]?.(r) ? part : ""));
  const tokens = PRICE_TOKENS(r.currency, r.locale);
  return kept.replace(/\{([^{}\s]{2,8})\}/g, (m, k: string) => tokens[k] ?? m).replace(/\n{3,}/g, "\n\n").trim();
}
/** what is left unfilled — a token or a group block the letter will not understand (shown before anything is sent) */
export function unknownMarks(body: string): string[] {
  const out = new Set<string>();
  for (const m of body.matchAll(/\{([^{}]*)\}/g)) if (!(m[1]! in PRICE_TOKENS("TWD", "zh-hant"))) out.add(`{${m[1]}}`);
  for (const m of body.matchAll(/【只[给給]([^】]+)】/g)) if (!GROUP_OK[m[1]!.trim()]) out.add(`【只给${m[1]}】`);
  const opens = (body.match(/【只[给給][^】/]+】/g) ?? []).length, closes = (body.match(/【\/只[给給]】/g) ?? []).length;
  if (opens !== closes) out.add("【只给】没有成对");
  return [...out];
}

/* ---------------- the campaign rows ---------------- */

let ready = false;
function ensure(): void {
  if (ready) return;
  db().exec(`
    CREATE TABLE IF NOT EXISTS campaigns (
      id INTEGER PRIMARY KEY AUTOINCREMENT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, name TEXT NOT NULL,
      segment_json TEXT NOT NULL, subject_hant TEXT NOT NULL, subject_hans TEXT, body_hant TEXT NOT NULL, body_hans TEXT,
      status TEXT NOT NULL DEFAULT 'draft', tested_at INTEGER, scheduled_at INTEGER, started_at INTEGER, finished_at INTEGER,
      planned INTEGER, sent INTEGER NOT NULL DEFAULT 0, failed INTEGER NOT NULL DEFAULT 0, per_run INTEGER NOT NULL DEFAULT 150, note TEXT
    );
  `);
  ready = true;
}
export interface Campaign {
  id: number; created_at: number; updated_at: number; name: string; segment_json: string; subject_hant: string; subject_hans: string | null;
  body_hant: string; body_hans: string | null; status: "draft" | "scheduled" | "sending" | "done" | "stopped"; tested_at: number | null;
  scheduled_at: number | null; started_at: number | null; finished_at: number | null; planned: number | null; sent: number; failed: number; per_run: number; note: string | null;
}
export const segmentOf = (c: Pick<Campaign, "segment_json">): Segment => { try { return segmentFrom(JSON.parse(c.segment_json) as Record<string, unknown>); } catch { return DEFAULT_SEGMENT; } };

export function campaign(id: number): Campaign | null { ensure(); return (db().prepare("SELECT * FROM campaigns WHERE id = ?").get(id) as Campaign | undefined) ?? null; }
export function campaigns(limit = 50): Campaign[] { ensure(); return db().prepare("SELECT * FROM campaigns ORDER BY id DESC LIMIT ?").all(limit) as unknown as Campaign[]; }

/** a new draft, or an edit of a draft (a campaign that has started sending is not edited) */
export function saveCampaign(i: { id?: number | null; name: string; segment: Segment; subjectHant: string; subjectHans?: string | null; bodyHant: string; bodyHans?: string | null; perRun?: number }, now = Date.now()): number {
  ensure();
  const vals = [i.name.trim().slice(0, 80) || "未命名", JSON.stringify(i.segment), i.subjectHant.trim().slice(0, 140), i.subjectHans?.trim() ? i.subjectHans.trim().slice(0, 140) : null,
    i.bodyHant.slice(0, 20_000), i.bodyHans?.trim() ? i.bodyHans.slice(0, 20_000) : null, Math.min(Math.max(i.perRun ?? 150, 10), 400)];
  if (i.id) {
    const c = campaign(i.id);
    if (!c || c.status !== "draft") throw new Error("not_a_draft");
    // an edit after the test needs a new test
    db().prepare("UPDATE campaigns SET name = ?, segment_json = ?, subject_hant = ?, subject_hans = ?, body_hant = ?, body_hans = ?, per_run = ?, tested_at = NULL, updated_at = ? WHERE id = ?").run(...vals, now, i.id);
    return i.id;
  }
  const r = db().prepare("INSERT INTO campaigns (created_at, updated_at, name, segment_json, subject_hant, subject_hans, body_hant, body_hans, per_run) VALUES (?,?,?,?,?,?,?,?,?)").run(now, now, ...vals) as unknown as { lastInsertRowid: number | bigint };
  return Number(r.lastInsertRowid);
}

/** the letter one reader gets */
export function campaignMail(c: Pick<Campaign, "subject_hant" | "subject_hans" | "body_hant" | "body_hans">, r: Pick<Recipient, "email" | "locale" | "currency" | "member" | "pass" | "paid">, site: string, subjectPrefix = "") {
  const hans = r.locale === "zh";
  const subject = hans ? (c.subject_hans ?? toHans(c.subject_hant)) : c.subject_hant;
  const body = hans ? (c.body_hans ?? toHans(c.body_hant)) : c.body_hant;
  const mail = buildCampaignEmail({ locale: r.locale, subject: `${subjectPrefix}${fillBody(subject, r)}`, body: fillBody(body, r), unsubUrl: unsubUrl(site, r.email, r.locale) });
  return mail;
}

/** to us only (DIGEST_TO), two versions: 繁體 for a member holding a pass (every part shows), 简体 for someone who never paid */
export async function testCampaign(id: number, site: string, now = Date.now()): Promise<{ sent: number }> {
  const c = campaign(id);
  if (!c) throw new Error("no_campaign");
  const to = ownerRecipients();
  const variants = [
    { prefix: "[测试·繁体·会员＋通卡] ", r: { email: to[0]!, locale: "zh-hant" as const, currency: "TWD" as Currency, member: true, pass: true, paid: true } },
    { prefix: "[测试·简体·没付过钱] ", r: { email: to[0]!, locale: "zh" as const, currency: "CNY" as Currency, member: false, pass: false, paid: false } },
  ];
  let sent = 0;
  for (const v of variants) {
    const m = campaignMail(c, v.r, site, v.prefix);
    const res = await sendEmail(to, m.subject, m.html, m.text, { kind: "test", locale: v.r.locale, unsubUrl: unsubUrl(site, to[0]!, v.r.locale) });
    if (res.ok) sent++;
  }
  if (sent) db().prepare("UPDATE campaigns SET tested_at = ?, updated_at = ? WHERE id = ?").run(now, now, id);
  recordOps("campaign_test", `#${id} 测试信 ${sent} 封寄给我们`);
  return { sent };
}

/** let it go: from `at` on, in batches (the 10-minute cron, Taipei 09:00–21:00). Only a tested draft. */
export function scheduleCampaign(id: number, at: number, now = Date.now()): { ok: boolean; error?: string; planned?: number } {
  const c = campaign(id);
  if (!c) return { ok: false, error: "no_campaign" };
  if (c.status !== "draft") return { ok: false, error: "not_a_draft" };
  if (!c.tested_at) return { ok: false, error: "not_tested" };
  if (unknownMarks(c.body_hant).length || (c.body_hans && unknownMarks(c.body_hans).length)) return { ok: false, error: "unknown_marks" };
  const planned = audience(segmentOf(c), now).recipients.length;
  db().prepare("UPDATE campaigns SET status = 'scheduled', scheduled_at = ?, planned = ?, updated_at = ? WHERE id = ?").run(Math.max(at, now), planned, now, id);
  recordOps("campaign_scheduled", `#${id} ${c.name} → ${planned} 人，${homeMinute(Math.max(at, now))} 起`);
  return { ok: true, planned };
}
export function stopCampaign(id: number, now = Date.now()): boolean {
  ensure();
  const r = db().prepare("UPDATE campaigns SET status = 'stopped', finished_at = ?, updated_at = ? WHERE id = ? AND status IN ('scheduled', 'sending')").run(now, now, id) as unknown as { changes?: number };
  return Number(r.changes ?? 0) > 0;
}

let RUNNING = false;
/**
 * One batch of every campaign that is due: at most `per_run` letters each, `pace` ms apart, in the Taipei day only. The
 * audience is read again each batch — someone who unsubscribed since the last batch is not written to. Each address is
 * claimed in `emails` (campaign:<id>:<address>) before its letter; a failed one is tried again next batch.
 */
export async function runCampaigns(site: string, opts: { now?: number; pace?: number; anyHour?: boolean; only?: number } = {}): Promise<{ id: number; sent: number; failed: number; left: number }[]> {
  ensure();
  if (RUNNING) return [];
  const now = opts.now ?? Date.now();
  const hour = new Date(now + 8 * 3_600_000).getUTCHours();
  if (!opts.anyHour && (hour < 9 || hour >= 21)) return [];
  RUNNING = true;
  const out: { id: number; sent: number; failed: number; left: number }[] = [];
  try {
    const due = db().prepare("SELECT * FROM campaigns WHERE status IN ('scheduled', 'sending') AND scheduled_at <= ? ORDER BY id").all(now) as unknown as Campaign[];
    const d = db();
    const claim = d.prepare("INSERT INTO emails (session_id, kind, email, sent_at, status, detail) VALUES (?, 'campaign', ?, ?, 'sending', NULL) ON CONFLICT(session_id, kind) DO UPDATE SET status = 'sending', sent_at = excluded.sent_at WHERE emails.status = 'failed'");
    const done = d.prepare("UPDATE emails SET status = ?, detail = ?, sent_at = ? WHERE session_id = ? AND kind = 'campaign'");
    for (const c of due) {
      if (opts.only && c.id !== opts.only) continue;
      const already = new Set((d.prepare("SELECT session_id AS s FROM emails WHERE kind = 'campaign' AND session_id LIKE ? AND status IN ('sent', 'sending')").all(`campaign:${c.id}:%`) as { s: string }[]).map((r) => r.s));
      const todo = audience(segmentOf(c), now).recipients.filter((r) => !already.has(`campaign:${c.id}:${r.email}`));
      if (c.status === "scheduled") d.prepare("UPDATE campaigns SET status = 'sending', started_at = COALESCE(started_at, ?), updated_at = ? WHERE id = ?").run(now, now, c.id);
      let sent = 0, failed = 0;
      for (const r of todo.slice(0, c.per_run)) {
        // stopped half-way through: the rest stays unsent
        if ((d.prepare("SELECT status FROM campaigns WHERE id = ?").get(c.id) as { status: string }).status === "stopped") break;
        const sid = `campaign:${c.id}:${r.email}`;
        if (Number((claim.run(sid, r.email, Date.now()) as unknown as { changes?: number }).changes ?? 0) === 0) continue;
        let res: { ok: boolean; id?: string; error?: string };
        try {
          const m = campaignMail(c, r, site);
          res = await sendEmail(r.email, m.subject, m.html, m.text, { kind: "campaign", locale: r.locale, unsubUrl: unsubUrl(site, r.email, r.locale), sessionId: sid, customerId: r.customerId });
        } catch (e) { res = { ok: false, error: e instanceof Error ? e.message : String(e) }; }
        done.run(res.ok ? "sent" : "failed", (res.ok ? res.id : res.error)?.slice(0, 200) ?? null, Date.now(), sid);
        if (res.ok) sent++; else failed++;
        if (opts.pace !== 0) await new Promise((ok) => setTimeout(ok, opts.pace ?? 1200));
      }
      const left = Math.max(0, todo.length - sent - failed);
      const totals = d.prepare("SELECT SUM(status = 'sent') AS s, SUM(status = 'failed') AS f FROM emails WHERE kind = 'campaign' AND session_id LIKE ?").get(`campaign:${c.id}:%`) as { s: number | null; f: number | null };
      d.prepare(`UPDATE campaigns SET sent = ?, failed = ?, updated_at = ?${left === 0 && failed === 0 ? ", status = CASE WHEN status = 'stopped' THEN status ELSE 'done' END, finished_at = ?" : ""} WHERE id = ?`)
        .run(...([totals.s ?? 0, totals.f ?? 0, Date.now(), ...(left === 0 && failed === 0 ? [Date.now()] : []), c.id] as number[]));
      recordOps("campaign_send", `#${c.id} 寄出 ${sent}，失败 ${failed}，还剩 ${left}`);
      out.push({ id: c.id, sent, failed, left });
    }
  } finally { RUNNING = false; }
  return out;
}

/** what a campaign did: sent, opened, unsubscribed since it began (of its own recipients), replies to support */
export function campaignStats(c: Campaign): { sent: number; failed: number; opened: number; unsubs: number; replies: number } {
  const d = db();
  const like = `campaign:${c.id}:%`;
  // the prefix is built here: node:sqlite binds a JS number as REAL, and 'campaign:' || 5 would read 'campaign:5.0'
  const pre = `campaign:${c.id}:`;
  const opened = (d.prepare("SELECT COUNT(*) AS n FROM mail_log WHERE kind = 'campaign' AND session_id LIKE ? AND opened_at IS NOT NULL").get(like) as { n: number }).n;
  const since = c.started_at ?? c.scheduled_at ?? c.created_at;
  let unsubs = 0;
  try {
    unsubs = (d.prepare(`SELECT COUNT(*) AS n FROM mail_unsubs u WHERE u.at >= ? AND EXISTS (SELECT 1 FROM emails e WHERE e.kind = 'campaign' AND e.session_id = ? || u.email AND e.status = 'sent')`).get(since, pre) as { n: number }).n;
  } catch { /* no unsubscribe yet anywhere */ }
  let replies = 0;
  try {
    replies = (d.prepare(`SELECT COUNT(*) AS n FROM support_inbox s WHERE s.received_at >= ? AND EXISTS (SELECT 1 FROM emails e WHERE e.kind = 'campaign' AND e.session_id = ? || lower(s.from_addr) AND e.status = 'sent')`).get(since, pre) as { n: number }).n;
  } catch { /* the inbox's own table, when it is there */ }
  return { sent: c.sent, failed: c.failed, opened, unsubs, replies };
}
