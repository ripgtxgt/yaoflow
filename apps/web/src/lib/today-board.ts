import { freemem, loadavg, totalmem, cpus } from "node:os";
import { db, liveMoney } from "./db";
import { chargesIn, type Charges } from "./admin-money";
import { deliveryCounts, type DeliveryCounts } from "./deliveries";
import { homeDayStart } from "./clock";
import { inboxOldestOpen, inboxOpenCount } from "./inbound";
import { checkStates } from "./ops-checks";

/**
 * 10-23 进度表 108 ③ 「今天」 (/admin/today): today's money, new people, deliveries, the revisit queue, support's open
 * letters, and what looks wrong — each a link to where it is handled. The day is Taipei's (北京时间 00:00 on). The
 * counts are 105's (lib/admin-money.ts chargesIn, lib/deliveries.ts): one per charge, a pass once, renewals not counted,
 * our own test accounts left out — the same numbers as the overview and the product pages.
 */

const DAY = 86_400_000;
const one = (sql: string, ...a: unknown[]): number => {
  try { return Number((db().prepare(sql).get(...(a as never[])) as { v: number | null } | undefined)?.v ?? 0); } catch { return 0; }
};
const NOT_TEST = "(customer_id IS NULL OR customer_id NOT IN (SELECT id FROM customers WHERE test_flag = 1))";

export interface Alert { id: string; level: "bad" | "watch" | "ok"; title: string; line: string; href: string }
export interface TodayBoard {
  since: number;
  charges: Charges; chargesYesterday: Charges;
  money: { gross: number; net: number; refunds: number } | null;
  people: { newAccounts: number; firstPay: number; yesterdayNew: number };
  deliveries: DeliveryCounts;
  revisits: { queued: number; oldestDue: number | null; sentToday: number; answeredToday: number };
  inbox: { open: number; oldest: number | null };
  alerts: Alert[];
}

/** today's (or the given day's) board */
export function todayBoard(now = Date.now()): TodayBoard {
  const since = homeDayStart(now);
  const ySince = since - DAY;
  const charges = chargesIn(since, now);
  const chargesYesterday = chargesIn(ySince, since);
  let money: TodayBoard["money"] = null;
  try { const m = liveMoney(since, now); money = { gross: m.sales.gross, net: m.net, refunds: m.refunds.n }; } catch { /* the ledger is not there in a fresh database */ }
  const people = {
    newAccounts: one("SELECT COUNT(*) AS v FROM customers WHERE first_seen >= ? AND COALESCE(test_flag, 0) = 0", since),
    yesterdayNew: one("SELECT COUNT(*) AS v FROM customers WHERE first_seen >= ? AND first_seen < ? AND COALESCE(test_flag, 0) = 0", ySince, since),
    // someone whose first payment ever is today: an order, a pass or a membership
    firstPay: one(`SELECT COUNT(*) AS v FROM (
        SELECT customer_id AS c, MIN(at) AS first FROM (
          SELECT customer_id, created_at AS at FROM orders WHERE COALESCE(amount_cents, 0) > 0 AND (payment_state IN ('paid', 'refunded', 'disputed') OR (payment_state IS NULL AND status = 'paid')) AND customer_id IS NOT NULL
          UNION ALL SELECT customer_id, created_at FROM subscriptions WHERE COALESCE(amount_minor, 0) > 0 AND (substr(stripe_subscription_id, 1, 4) = 'sub_' OR substr(stripe_subscription_id, 1, 5) = 'pass_') AND status NOT IN ('incomplete', 'incomplete_expired')
        ) GROUP BY customer_id
      ) f WHERE f.first >= ? AND f.c NOT IN (SELECT id FROM customers WHERE test_flag = 1)`, since),
  };
  const deliveries = deliveryCounts(since, now);
  const revisits = {
    queued: one(`SELECT COUNT(*) AS v FROM revisits WHERE status = 'pending' AND due_at <= ? AND ${NOT_TEST}`, now),
    oldestDue: one(`SELECT MIN(due_at) AS v FROM revisits WHERE status = 'pending' AND due_at <= ? AND ${NOT_TEST}`, now) || null,
    sentToday: one(`SELECT COUNT(*) AS v FROM mail_log WHERE kind = 'revisit' AND created_at >= ? AND ${NOT_TEST}`, since),
    answeredToday: one(`SELECT COUNT(*) AS v FROM revisits WHERE outcome_at >= ? AND ${NOT_TEST}`, since),
  };
  let inbox = { open: 0, oldest: null as number | null };
  try { inbox = { open: inboxOpenCount(), oldest: inboxOldestOpen() }; } catch { /* the inbox table is made on first mail */ }
  return { since, charges, chargesYesterday, money, people, deliveries, revisits, inbox, alerts: alerts(now, since) };
}

const pct = (r: number) => `${(Math.round(r * 1000) / 10).toFixed(1)}%`;

/**
 * 10-23 (Neil: 「这些我要怎么处理呢」 — the server card listed wallet_sweep_fail 5, bazi_report_part_fail 3 … and nothing
 * said whether any of it was still wrong): today's errors split into what already fixed itself and what did not.
 *   - a retry on the next run, or a fallback the reader got instead (HEALS);
 *   - a report chapter refused by the checks and written again: fixed when that report is `done` now;
 *   - anything else is left to look at, by name.
 * Only the second kind turns the card yellow.
 */
const HEALS: Record<string, string> = {
  wallet_sweep_fail: "付款扫单下一分钟重扫", sub_sync_fail: "会员状态下一轮重同步", teaser_fail: "免费摘要用了备用文字",
  thread_model_fail: "归到哪件事改用规则", matter_model_fail: "归到哪件事改用规则", daily_line_fail: "每日一句用了备用",
  mingli_qa_fail: "命盘问答有一题没答成（读者看到「再试一次」，不扣次数）",
};
/** the draw's personal reading exists by now (the page wrote it again on the next open) */
const PERSONAL_TABLE: Record<string, string> = { tarot_personal_fail: "tarot_draws", qian_personal_fail: "qian_draws" };
// 10-24 (Neil 问「要看：塔罗个人解读没写出来 1、命盘问答没答出来 1、报告还在补写 1」——三件其实都已经好了):
// a 命盘问答 answer that failed its checks is not kept and not counted against the reader (they see 「再試一次」) — nothing
// to do; a tarot / 解籤 personal reading is open only while that draw still has no reading
const NEEDS: Record<string, string> = {
  tarot_personal_fail: "塔罗个人解读没写出来", qian_personal_fail: "解籤个人解读没写出来",
  gen_fail: "六爻解读没写出来",
};
const REPORT_ERR = /^(bazi|ziwei|astro|hepan|nianshu)_report_(?:part_fail|incomplete)$/;
export interface ErrorSplit { healed: { label: string; n: number }[]; open: { label: string; n: number }[] }
export function splitErrors(since: number): ErrorSplit {
  const rows = (() => {
    try { return db().prepare("SELECT kind, detail, at FROM ops_events WHERE at >= ? AND (kind LIKE '%fail%' OR kind LIKE '%error%' OR kind LIKE '%_report_incomplete')").all(since) as { kind: string; detail: string | null; at: number }[]; }
    catch { return []; }
  })();
  const status = new Map<string, string | null>();
  const reportDone = (sys: string, tail: string): boolean => {
    const k = `${sys} ${tail}`;
    if (!status.has(k)) {
      let s: string | null = null;
      try { s = (db().prepare(`SELECT status FROM ${sys}_reports WHERE token LIKE ? LIMIT 1`).get(`%${tail}`) as { status: string } | undefined)?.status ?? null; } catch { /* table not made */ }
      status.set(k, s);
    }
    return status.get(k) === "done";
  };
  const healed = new Map<string, number>(), open = new Map<string, number>();
  const add = (m: Map<string, number>, label: string) => m.set(label, (m.get(label) ?? 0) + 1);
  // 10-30 (Neil, the board: 「服务器 · 要看：ga_data_fail 1」): the hourly GA read timed out once; the next hour's read
  // went through. Fixed when the cached reports are newer than the failure (lib/ga-data.ts).
  let gaAt: number | null | undefined;
  const gaFresh = (at: number): boolean => {
    if (gaAt === undefined) { try { gaAt = (db().prepare("SELECT at FROM ga_reports WHERE key = 'all'").get() as { at: number } | undefined)?.at ?? null; } catch { gaAt = null; } }
    return gaAt != null && gaAt > at;
  };
  for (const r of rows) {
    if (HEALS[r.kind]) { add(healed, HEALS[r.kind]!); continue; }
    if (r.kind === "ga_data_fail") { if (gaFresh(r.at)) add(healed, "GA 数据读取超时，下一次已读到"); else add(open, "GA 数据读不到（后台 GA 区块是旧数据）"); continue; }
    const rep = REPORT_ERR.exec(r.kind);
    if (rep) {
      // 10-24: `…_report_incomplete` writes 「deep 520968 missing B」 — the token tail is any six-hex word, not only the first
      const tail = /\b[0-9a-f]{6}\b/i.exec(r.detail ?? "")?.[0];
      if (tail && reportDone(rep[1]!, tail)) add(healed, "报告章节重写，已写完");
      else add(open, "报告还在补写（每 10 分钟自动补一次）");
      continue;
    }
    const pt = PERSONAL_TABLE[r.kind];
    const ptail = pt ? /^[0-9a-f]{6}\b/i.exec(r.detail ?? "")?.[0] : undefined;
    if (pt && ptail) {
      let written = false;
      try { written = !!db().prepare(`SELECT 1 FROM ${pt} WHERE token LIKE ? AND personal_json IS NOT NULL LIMIT 1`).get(`%${ptail}`); } catch { /* table not made */ }
      if (written) { add(healed, `${NEEDS[r.kind]!.replace("没写出来", "")}重写后已写好`); continue; }
    }
    add(open, NEEDS[r.kind] ?? r.kind);
  }
  const list = (m: Map<string, number>) => [...m].map(([label, n]) => ({ label, n })).sort((a, b) => b.n - a.n);
  return { healed: list(healed), open: list(open) };
}

/** a count today against the seven days before (per day): up when it is at least `min` and twice the usual */
function rising(today: number, week: number, min: number): { up: boolean; avg: number } {
  const avg = week / 7;
  return { up: today >= min && today > 2 * avg, avg: Math.round(avg * 10) / 10 };
}

export function alerts(now = Date.now(), since = homeDayStart(now)): Alert[] {
  const out: Alert[] = [];
  const wk = since - 7 * DAY;
  // 寄信失败 — the sender said no (mail_log) or a run could not send (emails)
  const failedMail = one(`SELECT COUNT(*) AS v FROM mail_log WHERE failed_at >= ? AND ${NOT_TEST}`, since) + one("SELECT COUNT(*) AS v FROM emails WHERE status = 'failed' AND sent_at >= ?", since);
  out.push({ id: "mail_fail", level: failedMail >= 5 ? "bad" : failedMail > 0 ? "watch" : "ok", title: "寄信失败", line: failedMail ? `今天 ${failedMail} 封没寄出去` : "今天没有", href: "/admin/letters#kinds" });
  // 退信／投诉 — 10-23 (Neil saw this red and asked 「这些我要怎么处理呢」): a share of what was sent, not a raw count. The
  // announcement day sent 1,458 letters; its 7 were 0.5% against 0.7% the week before, yet the count alone read red.
  // Red only when the share doubled and reached 1% (three at least), or spam complaints reached 0.3% (two at least).
  // Nothing to do by hand either way: a bounced or complaining address is left out of every later mass letter
  // (lib/campaigns.ts, lib/announce-1023.ts) and a complaint is recorded as an unsubscribe (app/api/resend/webhook).
  const bounceToday = one(`SELECT COUNT(*) AS v FROM mail_log WHERE (bounced_at >= ? OR complained_at >= ?) AND ${NOT_TEST}`, since, since);
  const bounceWeek = one(`SELECT COUNT(*) AS v FROM mail_log WHERE ((bounced_at >= ? AND bounced_at < ?) OR (complained_at >= ? AND complained_at < ?)) AND ${NOT_TEST}`, wk, since, wk, since);
  const complainedToday = one(`SELECT COUNT(*) AS v FROM mail_log WHERE complained_at >= ? AND ${NOT_TEST}`, since);
  const sentToday = one(`SELECT COUNT(*) AS v FROM mail_log WHERE created_at >= ? AND ${NOT_TEST}`, since);
  const sentWeek = one(`SELECT COUNT(*) AS v FROM mail_log WHERE created_at >= ? AND created_at < ? AND ${NOT_TEST}`, wk, since);
  const shareToday = bounceToday / Math.max(sentToday, 1), shareWeek = bounceWeek / Math.max(sentWeek, 1);
  const bounceBad = (bounceToday >= 3 && shareToday >= Math.max(2 * shareWeek, 0.01)) || (complainedToday >= 2 && complainedToday / Math.max(sentToday, 1) >= 0.003);
  out.push({
    id: "bounce", level: bounceBad ? "bad" : bounceToday > 0 ? "watch" : "ok", title: "退信／投诉",
    line: bounceToday
      ? `今天 ${bounceToday} 起${complainedToday ? `（投诉 ${complainedToday}）` : ""}，占今天寄出 ${sentToday} 封的 ${pct(shareToday)} · 前 7 天 ${pct(shareWeek)} · 这些地址以后群发自动跳过`
      : `今天没有 · 前 7 天 ${pct(shareWeek)}`,
    href: "/admin/letters#kinds",
  });
  // 结账失败 — a card declined, a check not passed, another error (A / B / D); C is someone who never tried
  const failedCo = (from: number, to: number) => one("SELECT COUNT(*) AS v FROM checkout_audit WHERE created >= ? AND created < ? AND cls IN ('A', 'B', 'D') AND test = 0", from, to);
  const coToday = failedCo(since, now + 1), coWeek = failedCo(wk, since);
  const c = rising(coToday, coWeek, 3);
  out.push({ id: "checkout", level: c.up ? "bad" : coToday > 0 ? "watch" : "ok", title: "结账失败", line: `今天 ${coToday}（卡被拒、验证没过、其他错误）· 前 7 天平均每天 ${c.avg}`, href: "/admin/checkout" });
  // 碰上限的人
  const caps = (() => {
    try {
      const tests = new Set((db().prepare("SELECT id FROM customers WHERE test_flag = 1").all() as { id: number }[]).map((r) => r.id));
      const ids = (db().prepare("SELECT detail FROM ops_events WHERE kind = 'cap_hit' AND at >= ?").all(since) as { detail: string | null }[])
        .map((r) => Number(/^cust (\d+)/.exec(r.detail ?? "")?.[1] ?? 0)).filter((x) => x && !tests.has(x));
      return new Set(ids).size;
    } catch { return 0; }
  })();
  out.push({ id: "caps", level: caps >= 3 ? "bad" : caps > 0 ? "watch" : "ok", title: "碰到上限的人", line: caps ? `今天 ${caps} 人（正常用的人碰到就该放宽）` : "今天没有", href: "/admin/limits" });
  // 服务器 — the scheduled checks that failed, errors written today, load and memory
  let failedChecks: string[] = [];
  try { failedChecks = checkStates().filter((s) => s.ok === false).map((s) => s.title); } catch { /* none set up */ }
  const errs = splitErrors(since);
  const nOpen = errs.open.reduce((a, e) => a + e.n, 0), nHealed = errs.healed.reduce((a, e) => a + e.n, 0);
  const load = loadavg()[0] ?? 0, cores = Math.max(1, cpus().length);
  const memFree = freemem() / totalmem();
  const serverBad = failedChecks.length > 0 || load > cores * 1.5 || memFree < 0.08;
  const serverWatch = nOpen > 0 || load > cores || memFree < 0.15;
  const named = (xs: { label: string; n: number }[], max: number) => xs.slice(0, max).map((e) => `${e.label} ${e.n}`).join("、") + (xs.length > max ? " 等" : "");
  out.push({
    id: "server", level: serverBad ? "bad" : serverWatch ? "watch" : "ok", title: "服务器",
    line: [
      `负载 ${load.toFixed(2)}（${cores} 核）`, `空闲内存 ${Math.round(memFree * 100)}%`,
      failedChecks.length ? `定时核对没过：${failedChecks.join("、")}` : null,
      nOpen ? `要看：${named(errs.open, 4)}` : null,
      nHealed ? `${nOpen ? "另有" : "今天"} ${nHealed} 个出错已自动补上（${named(errs.healed, 3)}）` : null,
    ].filter(Boolean).join(" · "),
    href: "/admin/live",
  });
  return out;
}
