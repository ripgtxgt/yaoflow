import { db, type MemberRow } from "./db";
import { periodUse, type PeriodUse } from "./sub-recap";
import { isCurrency, tongkaMinor } from "./money";
import { dayStart } from "./caps";
import { isTongkaDays, type TongkaDays } from "./tongka";

/**
 * 10-22 进度表 94 第一批 — the numbers the members page needs since the 通卡 switch: what a member or pass holder used
 * this period (and how often they met a cap), the passes sold, how many of them became members, and the first-payment
 * guarantee. Server only; read-only.
 */

const DAY = 86_400_000;
const isPassId = (id: string) => id.startsWith("pass_");
const isCompId = (id: string) => id.startsWith("comp_");

/** the pass's length (an old one-off month has none → 30) */
export const passDaysOfRow = (m: Pick<MemberRow, "pass_days">): TongkaDays => (isTongkaDays(m.pass_days) ? m.pass_days : 30);
export const passName = (days: TongkaDays): string => (days === 1 ? "1 日通卡" : `${days} 天通卡`);

/** what was used since `since`, with the times a cap was met (ops `cap_hit`: one line per kind and reason every ten minutes) */
export function usageWithCaps(customerId: number, since: number, now = Date.now()): PeriodUse & { capHits: number } {
  const u = periodUse(customerId, since, now);
  const capHits = Number((db().prepare("SELECT COUNT(*) AS v FROM ops_events WHERE kind = 'cap_hit' AND at >= ? AND detail LIKE ?").get(since, `cust ${customerId} %`) as { v: number }).v ?? 0);
  return { ...u, capHits };
}

export const usageLine = (u: PeriodUse & { capHits?: number }): string => {
  const bits = [
    u.deep ? `深断 ${u.deep}` : null, u.tarot ? `塔罗 ${u.tarot}` : null, u.qian ? `解籤 ${u.qian}` : null,
    u.report ? `报告 ${u.report}` : null, u.qa ? `问答 ${u.qa}` : null,
  ].filter(Boolean);
  return `${bits.join(" · ") || "没用"}${u.capHits ? ` · 碰上限 ${u.capHits}` : ""}`;
};

export interface PassSales { tier: string; days: TongkaDays; today: number; week: number; firstWeek: number; refundedWeek: number }

/** passes sold today (Beijing day) and in the last 7 days, per length; the first-price 1-day ones; refunds among them */
export function passSales(showTest: boolean, now = Date.now()): PassSales[] {
  const today = dayStart(now), week = now - 7 * DAY;
  const rows = db().prepare(
    `SELECT o.tier, o.created_at, o.amount_cents, o.currency, o.payment_state FROM orders o LEFT JOIN customers c ON c.id = o.customer_id
      WHERE o.tier IN ('pass_1d','pass_7d','pass_30d') AND o.created_at >= ? AND o.payment_state IN ('paid','refunded','disputed')
        AND (? = 1 OR COALESCE(c.test_flag, 0) = 0)`,
  ).all(week, showTest ? 1 : 0) as { tier: string; created_at: number; amount_cents: number | null; currency: string | null; payment_state: string }[];
  return ([1, 7, 30] as TongkaDays[]).map((days) => {
    const tier = `pass_${days}d`;
    const mine = rows.filter((r) => r.tier === tier);
    const first = (r: (typeof rows)[number]) => {
      const cur = (r.currency ?? "").toUpperCase();
      return days === 1 && isCurrency(cur) && r.amount_cents === tongkaMinor(cur, 1, true) && tongkaMinor(cur, 1, true) !== tongkaMinor(cur, 1, false);
    };
    return {
      tier, days, today: mine.filter((r) => r.created_at >= today).length, week: mine.length,
      firstWeek: mine.filter(first).length, refundedWeek: mine.filter((r) => r.payment_state === "refunded").length,
    };
  });
}

/** pass holders who later opened a membership; how many took the pass's unused days off the first invoice, and how much */
export function passToMember(members: MemberRow[]): { converted: number; credited: number; credit: Record<string, number> } {
  const firstPass = new Map<number, number>();
  for (const m of members) if (isPassId(m.stripe_subscription_id)) firstPass.set(m.customer_id, Math.min(firstPass.get(m.customer_id) ?? Infinity, m.created_at));
  const converted = new Set<number>();
  for (const m of members) {
    if (isPassId(m.stripe_subscription_id) || isCompId(m.stripe_subscription_id)) continue;
    const p = firstPass.get(m.customer_id);
    if (p != null && m.created_at > p) converted.add(m.customer_id);
  }
  const d = db();
  const done = d.prepare("SELECT at, detail FROM ops_events WHERE kind = 'pass_credited' ORDER BY at").all() as { at: number; detail: string | null }[];
  const credit: Record<string, number> = {};
  let credited = 0;
  for (const e of done) {
    const passId = (e.detail ?? "").trim();
    const row = members.find((m) => m.stripe_subscription_id === passId);
    if (!row) continue;
    credited++;
    // the offer made at checkout: 「cust {id} {CUR} {minor} ({n}d left)」 — the latest one before the credit
    const offer = d.prepare("SELECT detail FROM ops_events WHERE kind = 'pass_credit_offer' AND at <= ? AND detail LIKE ? ORDER BY at DESC LIMIT 1").get(e.at, `cust ${row.customer_id} %`) as { detail: string } | undefined;
    const m = offer?.detail.match(/^cust \d+ ([A-Z]{3}) (\d+)/);
    if (m) credit[m[1]!] = (credit[m[1]!] ?? 0) + Number(m[2]);
  }
  return { converted: converted.size, credited, credit };
}

/** the first-payment guarantee since `since`: one-tap refunds made, and refusals by reason (ops `guarantee_denied`) */
export function guaranteeStats(since: number): { refunded: number; refundedPass: number; denied: Record<string, number> } {
  const d = db();
  const refunded = Number((d.prepare("SELECT COUNT(*) AS v FROM orders WHERE refund_reason = 'guarantee' AND created_at >= ?").get(since) as { v: number }).v ?? 0);
  const refundedPass = Number((d.prepare("SELECT COUNT(*) AS v FROM orders WHERE refund_reason = 'guarantee' AND tier = 'pass_1d' AND created_at >= ?").get(since) as { v: number }).v ?? 0);
  const denied: Record<string, number> = {};
  for (const r of d.prepare("SELECT detail FROM ops_events WHERE kind = 'guarantee_denied' AND at >= ?").all(since) as { detail: string | null }[]) {
    const why = (r.detail ?? "").split(/\s+/)[1] ?? "?";
    denied[why] = (denied[why] ?? 0) + 1;
  }
  return { refunded, refundedPass, denied };
}
export const GUARANTEE_WHY: Record<string, string> = {
  used: "这个人已经退过一次", not_first: "不是第一次付费", not_covered: "这种不在保证里", over_used: "已经用了两份以上", expired: "过了 24 小时",
};

export interface Returned { customerId: number; email: string; leftAt: number; backAt: number; backTo: string }

/** members who left (their renewing plan ended) and later came back — as a member again, or with a pass */
export function returnedAfterLeaving(members: MemberRow[], now = Date.now()): Returned[] {
  const out: Returned[] = [];
  const byCust = new Map<number, MemberRow[]>();
  for (const m of members) byCust.set(m.customer_id, [...(byCust.get(m.customer_id) ?? []), m]);
  for (const [cid, rows] of byCust) {
    const endOf = (m: MemberRow) => m.cancel_at ?? m.period_end ?? m.updated_at;
    const left = rows
      .filter((m) => !isPassId(m.stripe_subscription_id) && !isCompId(m.stripe_subscription_id))
      .filter((m) => (m.status !== "active" && m.status !== "trialing") || (endOf(m) ?? now) < now)
      .sort((a, b) => (endOf(a) ?? 0) - (endOf(b) ?? 0))[0];
    if (!left) continue;
    const leftAt = endOf(left) ?? left.updated_at;
    const back = rows.filter((m) => m.id !== left.id && m.created_at > leftAt && !isCompId(m.stripe_subscription_id)).sort((a, b) => a.created_at - b.created_at)[0];
    if (!back) continue;
    out.push({
      customerId: cid, email: left.email, leftAt, backAt: back.created_at,
      backTo: isPassId(back.stripe_subscription_id) ? passName(passDaysOfRow(back)) : back.plan === "year" ? "会员 · 年付" : "会员 · 月付",
    });
  }
  return out.sort((a, b) => b.backAt - a.backAt);
}
