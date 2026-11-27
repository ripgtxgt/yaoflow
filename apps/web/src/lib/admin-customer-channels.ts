import { db } from "./db";
import { readEvents } from "./analytics-server";

/**
 * 09-29 (用户数据与需求全面分析 §5): where the readers who stay came from.
 *
 * The events stay anonymous — the privacy policy says they carry no identity,
 * and adding a customer id to them would break that. What links an account to
 * its first visit is already on the order: the campaign tag the buyer arrived
 * with (orders.campaign) and the browser session of that order
 * (orders.browser_sid), which is the `s` of the anonymous events. So: for each
 * customer, their earliest order that says where it came from; else the first
 * page view of that order's browser session; else a share code; else unknown.
 */

export interface ChannelRow { source: string; customers: number; heavy: number; members: number; payers: number; casts: number }

export function normalizeSource(raw: string | null | undefined): string {
  const c = (raw ?? "").toLowerCase();
  if (!c || c === "—") return "（没有标记）";
  if (/threads/.test(c)) return "Threads";
  if (/(^|~)ig\b|instagram/.test(c)) return "Instagram";
  if (/fb|facebook/.test(c)) return "Facebook";
  if (/pinterest/.test(c)) return "Pinterest";
  if (/google|bing|search\.app|yahoo|duckduckgo/.test(c)) return "搜索";
  if (/^(today|daily|dailymail)$/.test(c)) return "每日三卦";
  if (/^dm$/.test(c)) return "私信";
  if (/^(story|proof|share)$/.test(c)) return "分享图 / 应验卡";
  if (/mail/.test(c)) return "邮件";
  if (/pixnet|dcard|ptt/.test(c)) return "论坛 / 部落格";
  return c.startsWith("~ref:") ? `其他网站` : c;
}

export function customerChannels(days = 120): ChannelRow[] {
  const d = db();
  const firstView = new Map<string, string>();
  for (const e of readEvents(days, { only: ["page_view"] })) {
    if (e.e !== "page_view" || firstView.has(e.s)) continue;
    firstView.set(e.s, e.c ?? (e.via && /^[6-9]{6}$/.test(e.via) ? "share" : e.ref ? `~ref:${e.ref}` : ""));
  }
  const orders = d.prepare(
    "SELECT customer_id, campaign, browser_sid, via FROM orders WHERE customer_id IS NOT NULL ORDER BY created_at ASC",
  ).all() as { customer_id: number; campaign: string | null; browser_sid: string | null; via: string | null }[];
  const src = new Map<number, string>();
  const pending = new Map<number, string>();
  for (const o of orders) {
    if (src.has(o.customer_id)) continue;
    const s = o.campaign ?? (o.browser_sid ? firstView.get(o.browser_sid) : undefined) ?? (o.via && /^[6-9]{6}$/.test(o.via) ? "share" : undefined);
    if (s) src.set(o.customer_id, s);
    else if (!pending.has(o.customer_id)) pending.set(o.customer_id, "");
  }
  const casts = new Map((d.prepare("SELECT customer_id, COUNT(*) AS n FROM casts WHERE customer_id IS NOT NULL GROUP BY 1").all() as { customer_id: number; n: number }[]).map((r) => [r.customer_id, r.n]));
  const members = new Set((d.prepare("SELECT DISTINCT customer_id FROM subscriptions WHERE customer_id IS NOT NULL AND substr(stripe_subscription_id,1,5) <> 'comp_'").all() as { customer_id: number }[]).map((r) => r.customer_id));
  const payers = new Set((d.prepare("SELECT DISTINCT customer_id FROM orders WHERE customer_id IS NOT NULL AND payment_state = 'paid'").all() as { customer_id: number }[]).map((r) => r.customer_id));
  const rows = new Map<string, ChannelRow>();
  const ids = new Set<number>([...src.keys(), ...pending.keys(), ...casts.keys()]);
  for (const id of ids) {
    const key = normalizeSource(src.get(id));
    const r = rows.get(key) ?? { source: key, customers: 0, heavy: 0, members: 0, payers: 0, casts: 0 };
    const n = casts.get(id) ?? 0;
    r.customers++; r.casts += n;
    if (n >= 6) r.heavy++;
    if (members.has(id)) r.members++;
    if (payers.has(id) || members.has(id)) r.payers++;
    rows.set(key, r);
  }
  return [...rows.values()].sort((a, b) => b.heavy - a.heavy || b.customers - a.customers);
}
