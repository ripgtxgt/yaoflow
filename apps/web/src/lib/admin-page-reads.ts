import { qianStats } from "./db";
import { customerChannels } from "./admin-customer-channels";
import { recentCounts } from "./admin-recent";
import { chargesIn, firstDayPassFollowups } from "./admin-money";
import { deliveryCounts } from "./deliveries";
import { orderSplitSince } from "./daily-who";
import { groupFunnels, moneyLine } from "./admin-groups";
import { LIVE_SINCE } from "./live";
import { refresh, swr } from "./swr";

/**
 * 10-30 (Neil: 后台冷启动 10 秒，查慢在哪里): the /admin overview's own cached readings, in one place so the 10-minute
 * cron can warm them like the event readings (lib/admin-bundle.ts warmAdmin). Before this they were cached on the page
 * only (fresh 2 min, served stale up to 30 min): after half an hour without a visit, or right after a deploy, the first
 * click computed all of them while it waited — 客户来源 0.6 s, 解籤 0.5 s and the rest, on top of loading the page.
 * Same keys and lifetimes as before; the page reads them through `pageRead`.
 */
export type PageWindow = { window: number; live: boolean; since: number };
const M = 60_000;
const defs = (w: PageWindow, now: number) => ({
  charges: { key: `charges105|${w.window}|${w.live}`, fresh: 2 * M, stale: 30 * M, f: () => chargesIn(w.since, now) },
  deliveries: { key: `deliv105|${w.window}|${w.live}`, fresh: 2 * M, stale: 30 * M, f: () => deliveryCounts(w.since, now) },
  firstDayPass: { key: "fdp105", fresh: 2 * M, stale: 30 * M, f: () => firstDayPassFollowups() },
  recentCounts: { key: `recent1024|${w.window}|${w.live}`, fresh: M, stale: 10 * M, f: () => recentCounts(w.since) },
  groups: { key: `groups94|${w.window}|${w.live}`, fresh: 2 * M, stale: 30 * M, f: () => groupFunnels(w.since) },
  money: { key: `money94|${w.window}|${w.live}`, fresh: 2 * M, stale: 30 * M, f: () => moneyLine(w.since) },
  orderSplit: { key: `orderSplit|${w.window}|${w.live}`, fresh: 2 * M, stale: 30 * M, f: () => orderSplitSince(w.since) },
  qianStats: { key: `qianStats|${w.window}|${w.live}`, fresh: 2 * M, stale: 30 * M, f: () => qianStats(w.since) },
  customerChannels: { key: "customerChannels", fresh: 2 * M, stale: 30 * M, f: () => customerChannels() },
});
type Defs = ReturnType<typeof defs>;

export function pageRead<K extends keyof Defs>(k: K, w: PageWindow, now = Date.now()): ReturnType<Defs[K]["f"]> {
  const d = defs(w, now)[k];
  return swr(d.key, d.fresh, d.stale, d.f as () => ReturnType<Defs[K]["f"]>);
}

/** The cron's warm-up for the default (live) window — the one /admin opens on. */
export function warmAdminPage(now = Date.now()): void {
  const w: PageWindow = { window: Math.max(1, Math.ceil((now - LIVE_SINCE) / 86400_000)), live: true, since: LIVE_SINCE };
  for (const d of Object.values(defs(w, now))) refresh(d.key, d.f as () => unknown);
}
