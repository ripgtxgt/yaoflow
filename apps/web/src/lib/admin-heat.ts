import { readEvents, readEventsBetween } from "./analytics-server";
import { afterTeaser, clickHeat, HEAT_SINCE, scrollHeat } from "./heat";
import { bringNewStats, giftRewardsEarned, paidBrowserSessions } from "./db";
import { bringNew } from "./bring-new";
import { AB_RUNS_FROM, AB_RUNS_TO, endedTestStats } from "./ab-stats";
import { refresh, swr } from "./swr";

/** 10-14: everything the page reads, in one piece so it can be kept */
function heatData(d: number) {
  // 10-15 进度表 60: the day window once; the ended tests over their own fixed run only (they ended 10-07 — reading
  // from their start up to today grew by a day every day)
  const inD = readEvents(d);
  const since = Date.now() - d * 86_400_000;
  const evs = inD.filter((e) => e.t >= HEAT_SINCE);
  const at = afterTeaser(evs, paidBrowserSessions(HEAT_SINCE));
  const scroll = scrollHeat(evs);
  const clicks = clickHeat(evs);
  // 09-26 带新: every event of the window (page views predate the heat log), and the database side of each chain
  const brought = bringNew(inD, paidBrowserSessions(since));
  const chains = bringNewStats(since);
  const giftThanks = giftRewardsEarned(since);
  // 10-13: the ended tests are counted over their own run, whatever the day window above (lib/ab-stats.ts AB_RUNS)
  const ended = endedTestStats(readEventsBetween(AB_RUNS_FROM, AB_RUNS_TO + 86_400_000), paidBrowserSessions(AB_RUNS_FROM));
  return { at, scroll, clicks, brought, chains, giftThanks, ended };
}


/** 10-14 后台变卡: the heat page's readings, kept 3 minutes, served stale up to 60 while recomputed (lib/swr.ts) */
export function heatReadings(d: number) {
  return swr(`heat|${d}`, 3 * 60_000, 60 * 60_000, () => heatData(d));
}
/** the cron's warm-up for the default (7-day) view */
export function warmHeat(): void {
  refresh("heat|7", () => heatData(7));
}
