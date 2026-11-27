import { db } from "../db";
import { activeMembership } from "../membership";
import { flowRightsOf, isPassSubscription } from "../subscription";
import { PASS_SPLIT_AT } from "../sub-plan";

/**
 * 10-22 进度表 92／93 — how a deep report's 運勢 chapters show (八字「一生大運」「現在這步大運與今年」, 紫微「已走過的大限
 * 回顧」「現在與下一步大限」; 星盤's 「這個月的行運」 is computed on the page and follows `live`).
 * The report is always written whole (92 ③); only the page decides what it shows, from the report's OWNER (not whoever
 * opens the link) and how the report was paid for:
 *
 *   open    the owner is a member now (or a 通卡 bought before the split is running) · or the report was made under a
 *           通卡 before the split · or it was not made under a pass or a membership at all (a tester's, a one-off
 *           purchase): everything, as written
 *   dated   93: made under a membership (or a complimentary one) that has since ended — the chapters stay, each opens
 *           with 「國曆 X 月版」 and a link to resume (the monthly rewrite stopped there)
 *   locked  92: made under a 通卡 bought after the split, and the owner is not a member now — the chapter's title, two
 *           lines, and 「會員可看，每月按當下的流月重寫」; becoming a member opens it at once (nothing is rewritten)
 *
 * Server only.
 */
export type FlowMode = "open" | "dated" | "locked";
export interface FlowView {
  mode: FlowMode;
  /** "2026 年 10 月" — the month the chapters were written for (dated only) */
  month: string | null;
  /** the owner holds the 運勢 side right now (member, complimentary, or a pre-split pass) */
  live: boolean;
}

export interface FlowRow { customer_id: number | null; paid_session: string | null; created_at: number; chart_json?: string | null }

/** how a report was paid for: under a 通卡, under a membership (or a complimentary one), or otherwise */
export function madeUnder(paidSession: string | null | undefined): "pass" | "member" | "other" {
  const s = paidSession ?? "";
  if (!s.startsWith("member:")) return "other";
  const id = /^member:(\d+)$/.exec(s)?.[1];
  if (!id) return "member";
  try {
    const row = db().prepare("SELECT stripe_subscription_id FROM subscriptions WHERE id = ?").get(Number(id)) as { stripe_subscription_id: string } | undefined;
    return row && isPassSubscription(row.stripe_subscription_id) ? "pass" : "member";
  } catch { return "member"; }
}

/** the month a report was written for: its facts' 「國曆 YYYY 年 M 月」 (a monthly rewrite), else the Taipei month it was made */
export function writtenMonth(r: Pick<FlowRow, "created_at" | "chart_json">): string {
  try {
    const asOf = r.chart_json ? (JSON.parse(r.chart_json) as { asOf?: string }).asOf : undefined;
    const m = asOf ? /(\d{4}) 年 (\d{1,2}) 月/.exec(asOf) : null;
    if (m) return `${m[1]} 年 ${Number(m[2])} 月`;
  } catch { /* facts unreadable: fall back to the date */ }
  const d = new Date(r.created_at + 8 * 3_600_000);
  return `${d.getUTCFullYear()} 年 ${d.getUTCMonth() + 1} 月`;
}

/** the owner holds the 運勢 side right now */
export const ownerLive = (customerId: number | null | undefined, now = Date.now()): boolean =>
  !!customerId && flowRightsOf(activeMembership(customerId, now));

export function flowView(r: FlowRow, now = Date.now()): FlowView {
  const live = ownerLive(r.customer_id, now);
  if (live) return { mode: "open", month: null, live };
  const how = madeUnder(r.paid_session);
  if (how === "member") return { mode: "dated", month: writtenMonth(r), live };
  if (how === "pass" && r.created_at >= PASS_SPLIT_AT) return { mode: "locked", month: null, live };
  return { mode: "open", month: null, live };
}

/** the 運勢 chapters of each system's deep report */
export const FLOW_CHAPTERS = { bazi: ["dayun", "dangqian"], ziwei: ["guoqu", "xianzai"] } as const;

/** the first two lines of a chapter: up to `n` characters, ending at a sentence or clause mark when one is near */
export function teaser(text: string, n = 64): string {
  const t = text.replace(/\s+/g, " ").trim();
  if ([...t].length <= n) return t;
  const head = [...t].slice(0, n).join("");
  const cut = Math.max(head.lastIndexOf("。"), head.lastIndexOf("，"), head.lastIndexOf("；"));
  return `${cut >= n / 2 ? head.slice(0, cut) : head}……`;
}
