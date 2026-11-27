import { db } from "./db";
import { cloudOf, HUMAN_EVENTS } from "./cloud-ip";
import { ipsOf } from "./browser-net";

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

export function machineBrowsers(evs: readonly Ev[]): Set<string> {
  const out = new Set<string>();
  try {
    const bidOf = new Map<string, string>();
    for (const e of evs) if (e.b && !bidOf.has(e.s)) bidOf.set(e.s, e.b);
    const candidates = new Set<string>();
    for (const e of evs) if (e.e === "visit_day") { const b = e.b ?? bidOf.get(e.s); if (b) candidates.add(b); }
    if (!candidates.size) return out;
    for (const e of evs) if (HUMAN_EVENTS.has(e.e)) { const b = e.b ?? bidOf.get(e.s); if (b) candidates.delete(b); }
    const d = db();
    const ids = [...candidates];
    for (let i = 0; i < ids.length; i += 400) {
      const chunk = ids.slice(i, i + 400);
      const marks = chunk.map(() => "?").join(",");
      const linked = new Set((d.prepare(`SELECT DISTINCT bid FROM browser_links WHERE bid IN (${marks})`).all(...chunk) as { bid: string }[]).map((r) => r.bid));
      const ips = new Map<string, string[]>();
      for (const r of ipsOf(chunk)) {
        const a = ips.get(r.bid); if (a) a.push(r.ip); else ips.set(r.bid, [r.ip]);
      }
      for (const b of chunk) {
        if (linked.has(b)) continue;
        const list = ips.get(b);
        if (list && list.length && list.every((ip) => cloudOf(ip) !== null)) out.add(b);
      }
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
export function machineBids(bids: readonly string[]): Set<string> {
  const out = new Set<string>();
  try {
    const d = db();
    for (let i = 0; i < bids.length; i += 400) {
      const chunk = bids.slice(i, i + 400);
      const marks = chunk.map(() => "?").join(",");
      const quiet = (d.prepare(`SELECT bid FROM browsers WHERE bid IN (${marks}) AND casts = 0 AND clicks = 0 AND checkouts = 0
        AND NOT EXISTS (SELECT 1 FROM browser_links l WHERE l.bid = browsers.bid)`).all(...chunk) as { bid: string }[]).map((r) => r.bid);
      if (!quiet.length) continue;
      const ips = new Map<string, string[]>();
      for (const r of ipsOf(quiet)) { const a = ips.get(r.bid); if (a) a.push(r.ip); else ips.set(r.bid, [r.ip]); }
      for (const b of quiet) { const l = ips.get(b); if (l && l.length && l.every((ip) => cloudOf(ip) !== null)) out.add(b); }
    }
  } catch { /* no tables: everyone counts */ }
  return out;
}
