import type { TrackedEvent } from "./analytics-server";

/**
 * 热区 (09-23) — turns page_leave / heat_click / price_seen into the three
 * pictures the /admin/heat page draws. Pure, so the test can feed it events.
 */

export const HEAT_SINCE = Date.UTC(2026, 8, 23, 9, 0); // the instrumentation went live after this

export const PAGE_GROUPS: [string, RegExp][] = [
  ["首页", /^\/[a-z-]+\/?$/],
  ["起卦页", /^\/[a-z-]+\/cast/],
  ["解读页", /^\/[a-z-]+\/reading/],
  ["64 卦页", /^\/[a-z-]+\/gua\//],
  ["今天的三卦", /^\/[a-z-]+\/today/],
  ["分享页", /^\/[a-z-]+\/share\//],
  ["账户页", /^\/[a-z-]+\/account/],
];
export const DEPTH_BANDS = [25, 50, 75, 90] as const;

const median = (xs: number[]) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]!; };

export function scrollHeat(evs: TrackedEvent[]) {
  return PAGE_GROUPS.map(([name, re]) => {
    const leaves = evs.filter((e) => e.e === "page_leave" && re.test(e.path ?? "") && typeof e.depth === "number");
    const n = leaves.length;
    return {
      name, n,
      bands: DEPTH_BANDS.map((b) => (n ? leaves.filter((e) => (e.depth ?? 0) >= b).length / n : 0)),
      medianMs: median(leaves.map((e) => e.ms ?? 0)),
    };
  }).filter((g) => g.n > 0);
}

export function clickHeat(evs: TrackedEvent[]) {
  const m = new Map<string, Set<string>>();
  for (const e of evs) if (e.e === "heat_click" && e.method) { const s = m.get(e.method) ?? new Set(); s.add(e.s); m.set(e.method, s); }
  return [...m.entries()].map(([name, s]) => ({ name, sessions: s.size })).sort((a, b) => b.sessions - a.sessions);
}

/** The step 70% leave at: after the free line, did the price row come into view, and did they tap it? */
export function afterTeaser(evs: TrackedEvent[], paid: Set<string> = new Set()) {
  const by = new Map<string, TrackedEvent[]>();
  for (const e of evs) { const l = by.get(e.s) ?? []; l.push(e); by.set(e.s, l); }
  let teased = 0, seen = 0, clicked = 0, seenNotClicked = 0, notSeen = 0, checkout = 0, bought = 0, checkoutBack = 0;
  const dwellNotClicked: number[] = [];
  const seenMs: number[] = [];
  const bySrc = new Map<string, { teased: number; seen: number; clicked: number }>();
  for (const l of by.values()) {
    if (!l.some((e) => e.e === "teaser_shown")) continue;
    teased += 1;
    const s = l.some((e) => e.e === "price_seen");
    const c = l.some((e) => e.e === "reading_click" || e.e === "checkout_start" || e.e === "sub_redeem");
    if (s) seen += 1; else notSeen += 1;
    if (c) clicked += 1;
    if (s && !c) seenNotClicked += 1;
    // 09-26: past the click — went to Stripe, came back without paying, paid (orders.browser_sid joins the order to this browser)
    const co = l.find((e) => e.e === "checkout_start");
    const p = paid.has(l[0]!.s);
    if (co) { checkout += 1; if (p) bought += 1; else if (l.some((e) => e.e === "page_view" && e.t > co.t)) checkoutBack += 1; }
    else if (p) bought += 1;
    const ps = l.find((e) => e.e === "price_seen");
    if (ps?.ms != null) seenMs.push(ps.ms);
    if (!c) { const leave = l.filter((e) => e.e === "page_leave" && /\/cast/.test(e.path ?? "")).pop(); if (leave?.ms != null) dwellNotClicked.push(leave.ms); }
    const src = l.find((e) => e.c)?.c ?? "—";
    const b = bySrc.get(src) ?? { teased: 0, seen: 0, clicked: 0 };
    b.teased += 1; if (s) b.seen += 1; if (c) b.clicked += 1;
    bySrc.set(src, b);
  }
  return {
    teased, seen, clicked, seenNotClicked, notSeen, checkout, bought, checkoutBack,
    medianMsToPrice: median(seenMs),
    medianDwellNotClicked: median(dwellNotClicked),
    bySource: [...bySrc.entries()].map(([c, v]) => ({ c, ...v })).sort((a, b) => b.teased - a.teased).slice(0, 6),
  };
}
