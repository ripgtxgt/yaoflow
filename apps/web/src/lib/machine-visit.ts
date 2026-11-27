import { db } from "./db";
import { cloudOf, HUMAN_EVENTS } from "./cloud-ip";
import { ipsOf, uasOf } from "./browser-net";
import { machineUa } from "./machine-ua";

export { machineUa };

/**
 * 11-27 (Sakura：「为什么在我后台，很多机器的流量被判定是真人访客呢」): the cloud-network rule below misses a scraper that
 * runs our scripts from home lines (residential proxies). 11-27 brought 133 such "visitors" on /ja — no referrer, one page,
 * desktop Chrome 119/120 · Firefox 120/121 · Edge 119 two years out of date, and our own font stylesheet blocked before
 * the page started (client_error "res:LINK jp.css"). Each is a sign on its own; a quiet browser (never cast, tapped a
 * price, paid, claimed, never linked to a customer) showing one of them is a machine:
 *   - its user agent says bot / crawler / headless (it ran our scripts, so it is a rendering crawler);
 *   - every user agent it used is a desktop browser about two years out of date — browsers update themselves, and the
 *     last versions an old system can run (Chrome 109 on Windows 7/8, 116 and 128 on old macOS, Firefox ESR 115) are spared;
 *   - it reported one of our own stylesheets failing to load before the page started: scrapers block CSS and fonts.
 */
/**
 * one of our own stylesheets (the CJK font sheets, Next's css chunks) reported as failing before the page started — the
 * error script's "res:LINK jp.css?v=…" / "res:LINK 027e7750….css"; another host's file carries its host and a slash
 */
export const isBlockedSheet = (e: { e: string; method?: string }) => e.e === "client_error" && /^res:LINK [^/\s]+$/.test(e.method ?? "");

/** machine by its addresses or its user agents: every address a cloud network, or every user agent a machine's */
function machineByNet(bids: string[], now: number): Set<string> {
  const out = new Set<string>();
  const ips = new Map<string, string[]>();
  for (const r of ipsOf(bids)) { const a = ips.get(r.bid); if (a) a.push(r.ip); else ips.set(r.bid, [r.ip]); }
  for (const b of bids) { const l = ips.get(b)?.filter(Boolean); if (l && l.length && l.every((ip) => cloudOf(ip) !== null)) out.add(b); }
  const uas = new Map<string, (string | null)[]>();
  for (const r of uasOf(bids.filter((b) => !out.has(b)))) { const a = uas.get(r.bid); if (a) a.push(r.ua); else uas.set(r.bid, [r.ua]); }
  for (const [b, l] of uas) { const known = l.filter((u): u is string => !!u); if (known.length && known.every((u) => machineUa(u, now) !== null)) out.add(b); }
  return out;
}

/**
 * 11-06 (Neil：「今天的独立访客是不是加了爬虫的数据呢」→「要」): a browser that opened pages only from server-room
 * networks and did nothing a person does is a link checker (WeChat/QQ on 腾讯云, Huawei's on 华为云 …), not a visitor.
 * 11-06: 315 of 462 visit_days. Same rule as the live board (lib/cloud-ip.ts boardDevice): every address it was seen on
 * is a cloud network, and it never cast, tapped a price, paid, claimed — nor was it ever linked to a customer.
 *
 * Addresses are kept per browser since 10-31 (browser_net, 进度表 130); a browser with no address on file is a visitor,
 * so days before that stay as they were.
 */
type Ev = { e: string; s: string; b?: string };

export function machineBrowsers(evs: readonly Ev[], now = Date.now()): Set<string> {
  const out = new Set<string>();
  try {
    const bidOf = new Map<string, string>();
    for (const e of evs) if (e.b && !bidOf.has(e.s)) bidOf.set(e.s, e.b);
    const candidates = new Set<string>();
    for (const e of evs) if (e.e === "visit_day") { const b = e.b ?? bidOf.get(e.s); if (b) candidates.add(b); }
    if (!candidates.size) return out;
    const sheetBlocked = new Set<string>();
    for (const e of evs) {
      const b = e.b ?? bidOf.get(e.s);
      if (!b) continue;
      if (HUMAN_EVENTS.has(e.e)) candidates.delete(b);
      else if (isBlockedSheet(e)) sheetBlocked.add(b);
    }
    const d = db();
    const ids = [...candidates];
    for (let i = 0; i < ids.length; i += 400) {
      const chunk = ids.slice(i, i + 400);
      const marks = chunk.map(() => "?").join(",");
      const linked = new Set((d.prepare(`SELECT DISTINCT bid FROM browser_links WHERE bid IN (${marks})`).all(...chunk) as { bid: string }[]).map((r) => r.bid));
      const quiet = chunk.filter((b) => !linked.has(b));
      for (const b of quiet) if (sheetBlocked.has(b)) out.add(b);
      for (const b of machineByNet(quiet.filter((b) => !out.has(b)), now)) out.add(b);
    }
  } catch { /* no tables (a fresh test database): everyone counts */ }
  return out;
}

/** a visit_day from one of `machines` */
export const isMachineVisit = (e: Ev, machines: ReadonlySet<string>, bidOf?: ReadonlyMap<string, string>): boolean => {
  const b = e.b ?? bidOf?.get(e.s);
  return !!b && machines.has(b);
};

/**
 * 11-08 (Neil：「先做1到5吧」→ ③): the same rule for pages that read the browsers table rather than events (按人看) — a
 * browser that never cast, tapped a price or went to checkout, was never filed under a customer, and was seen only on
 * server-room addresses.
 */
export function machineBids(bids: readonly string[], now = Date.now()): Set<string> {
  const out = new Set<string>();
  try {
    const d = db();
    for (let i = 0; i < bids.length; i += 400) {
      const chunk = bids.slice(i, i + 400);
      const marks = chunk.map(() => "?").join(",");
      const quiet = (d.prepare(`SELECT bid FROM browsers WHERE bid IN (${marks}) AND casts = 0 AND clicks = 0 AND checkouts = 0
        AND NOT EXISTS (SELECT 1 FROM browser_links l WHERE l.bid = browsers.bid)`).all(...chunk) as { bid: string }[]).map((r) => r.bid);
      if (!quiet.length) continue;
      for (const b of machineByNet(quiet, now)) out.add(b);
    }
  } catch { /* no tables: everyone counts */ }
  return out;
}
