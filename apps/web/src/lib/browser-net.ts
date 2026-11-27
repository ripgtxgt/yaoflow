import { db, recordOps } from "./db";
import { clientIp } from "./proxy-hop";
import { deviceModel, uaBrief } from "./ua-brief";
import { deviceFromUA } from "./presence";

/**
 * 10-31 进度表 130 (Neil: 「访客、客户这里，我需要显示出 IP、浏览器、设备、国家和地区，有没有类似痕迹和设备」 → 条款改了、存完整 IP):
 * per browser (yf_bid), the network address and device it came from — one row per (browser, IP, user agent), first and
 * last seen, how many times. Country / region / city / timezone come from Cloudflare's visitor-location headers
 * (cf-ipcountry always; cf-region, cf-ipcity, cf-timezone once the "Add visitor location headers" managed transform is
 * on). After NET_KEEP_DAYS a row keeps its place but loses the address (city and device stay), as the privacy policy says.
 * Written at most once per ten minutes per row. 11-27: a self-declared bot that runs our scripts is recorded too (device
 * "bot") — before, it left no row, and a browser with no row on file counted as a person (lib/machine-visit.ts).
 */
export const NET_KEEP_DAYS = 180;

let ready = false;
function ensure(): void {
  if (ready) return;
  db().exec(`CREATE TABLE IF NOT EXISTS browser_net (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      bid       TEXT NOT NULL,
      ip        TEXT NOT NULL,
      ua_key    TEXT NOT NULL,
      first_at  INTEGER NOT NULL,
      last_at   INTEGER NOT NULL,
      hits      INTEGER NOT NULL DEFAULT 1,
      country   TEXT, region TEXT, city TEXT, tz TEXT,
      os        TEXT, app TEXT, device TEXT, model TEXT, lang TEXT, ua TEXT
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_bnet_key ON browser_net(bid, ip, ua_key);
    CREATE INDEX IF NOT EXISTS idx_bnet_ip ON browser_net(ip);
    CREATE INDEX IF NOT EXISTS idx_bnet_last ON browser_net(last_at);
    CREATE INDEX IF NOT EXISTS idx_bnet_model ON browser_net(model);`);
  ready = true;
}

const hash = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); };
const hdr = (h: Headers, k: string, max = 60) => { const v = h.get(k)?.trim(); if (!v) return null; try { return decodeURIComponent(v).slice(0, max); } catch { return v.slice(0, max); } };

export type NetFacts = { ip: string; country: string | null; region: string | null; city: string | null; tz: string | null; os: string | null; app: string | null; device: string | null; model: string | null; lang: string | null; ua: string | null };

/** What the request says about where and on what it came from; null with no address. */
export function netFacts(headers: Headers): NetFacts | null {
  const ip = clientIp(headers);
  const ua = headers.get("user-agent");
  if (!ip) return null;
  const dev = deviceFromUA(ua);
  const brief = uaBrief(ua) ?? "";
  const [os, ...app] = brief.split(" · ");
  const cc = headers.get("cf-ipcountry")?.trim().toUpperCase();
  return {
    ip: ip.slice(0, 64),
    country: cc && /^[A-Z]{2}$/.test(cc) && cc !== "XX" ? cc : null,
    region: hdr(headers, "cf-region"), city: hdr(headers, "cf-ipcity"), tz: hdr(headers, "cf-timezone", 40),
    os: os || null, app: app.join(" · ") || null, device: dev ?? null, model: deviceModel(ua) ?? null,
    lang: headers.get("accept-language")?.split(",")[0]?.trim().slice(0, 16) || null,
    ua: ua ? ua.slice(0, 300) : null,
  };
}

const LAST = new Map<string, number>();
/** Note this browser's address and device (track / cast log); at most one write per ten minutes per row. */
export function noteNet(bid: string | null | undefined, headers: Headers, now = Date.now()): void {
  if (!bid) return;
  try {
    const f = netFacts(headers);
    if (!f) return;
    const key = hash(f.ua ?? "");
    const k = `${bid}|${f.ip}|${key}`;
    if ((LAST.get(k) ?? 0) > now - 10 * 60_000) return;
    LAST.set(k, now);
    if (LAST.size > 50_000) LAST.clear();
    ensure();
    db().prepare(`INSERT INTO browser_net (bid, ip, ua_key, first_at, last_at, hits, country, region, city, tz, os, app, device, model, lang, ua)
      VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(bid, ip, ua_key) DO UPDATE SET last_at = excluded.last_at, hits = hits + 1,
        country = COALESCE(excluded.country, country), region = COALESCE(excluded.region, region), city = COALESCE(excluded.city, city),
        tz = COALESCE(excluded.tz, tz), lang = COALESCE(excluded.lang, lang)`)
      .run(bid, f.ip, key, now, now, f.country, f.region, f.city, f.tz, f.os, f.app, f.device, f.model, f.lang, f.ua);
  } catch { /* best-effort */ }
}

export type NetRow = { bid: string; ip: string; first_at: number; last_at: number; hits: number; country: string | null; region: string | null; city: string | null; tz: string | null; os: string | null; app: string | null; device: string | null; model: string | null; lang: string | null; ua: string | null };

/** 11-06 (lib/machine-visit.ts): every address each of these browsers was seen on — no row cap */
export function ipsOf(bids: string[]): { bid: string; ip: string }[] {
  if (!bids.length) return [];
  ensure();
  return db().prepare(`SELECT bid, ip FROM browser_net WHERE bid IN (${bids.map(() => "?").join(",")})`).all(...bids) as { bid: string; ip: string }[];
}

/** 11-27 (lib/machine-visit.ts): every user agent each of these browsers was seen with (rows past NET_KEEP_DAYS have none) */
export function uasOf(bids: string[]): { bid: string; ua: string | null }[] {
  if (!bids.length) return [];
  ensure();
  return db().prepare(`SELECT bid, ua FROM browser_net WHERE bid IN (${bids.map(() => "?").join(",")})`).all(...bids) as { bid: string; ua: string | null }[];
}

/** Every address/device row of these browsers, latest first. */
export function netOf(bids: string[]): NetRow[] {
  if (!bids.length) return [];
  ensure();
  const ph = bids.map(() => "?").join(",");
  return db().prepare(`SELECT bid, ip, first_at, last_at, hits, country, region, city, tz, os, app, device, model, lang, ua FROM browser_net WHERE bid IN (${ph}) ORDER BY last_at DESC LIMIT 200`).all(...bids) as NetRow[];
}

export type Twin = { bid: string; why: string; last_at: number; customer_id: number | null; email: string | null; casts: number };

/**
 * 相似痕迹: other browsers seen on the same IP address (within 30 days of each other), or with the same device model and
 * system on the same /24 network — the same person on another browser or app, or someone in the same home/office.
 */
export function twinsOf(bids: string[], now = Date.now()): Twin[] {
  if (!bids.length) return [];
  ensure();
  const mine = netOf(bids);
  const own = new Set(bids);
  const out = new Map<string, Twin>();
  const d = db();
  const info = (bid: string) => d.prepare(
    `SELECT l.customer_id, c.email, (SELECT casts FROM browsers WHERE bid = ?) AS casts FROM browser_links l LEFT JOIN customers c ON c.id = l.customer_id WHERE l.bid = ? ORDER BY l.last_at DESC LIMIT 1`,
  ).get(bid, bid) as { customer_id: number; email: string | null; casts: number | null } | undefined;
  const castsOf = (bid: string) => (d.prepare("SELECT casts FROM browsers WHERE bid = ?").get(bid) as { casts: number } | undefined)?.casts ?? 0;
  const add = (bid: string, why: string, at: number) => {
    if (own.has(bid)) return;
    const prev = out.get(bid);
    if (prev) { if (!prev.why.includes(why)) prev.why += `；${why}`; prev.last_at = Math.max(prev.last_at, at); return; }
    const i = info(bid);
    out.set(bid, { bid, why, last_at: at, customer_id: i?.customer_id ?? null, email: i?.email ?? null, casts: i?.casts ?? castsOf(bid) });
  };
  for (const r of mine) {
    if (!r.ip) continue;
    for (const o of d.prepare("SELECT bid, last_at, model FROM browser_net WHERE ip = ? AND last_at > ? AND device IS NOT 'bot' LIMIT 50").all(r.ip, r.first_at - 30 * 86_400_000) as { bid: string; last_at: number; model: string | null }[])
      add(o.bid, `同一个 IP ${r.ip}${o.model && o.model === r.model ? "，同一型号设备" : ""}`, o.last_at);
    const net = r.ip.includes(".") ? r.ip.split(".").slice(0, 3).join(".") + "." : null;
    if (net && r.model && /iPhone|Galaxy|Pixel|SM-|iPad/.test(r.model)) {
      for (const o of d.prepare("SELECT bid, last_at, ip FROM browser_net WHERE ip LIKE ? AND model = ? AND last_at > ? LIMIT 50").all(`${net}%`, r.model, now - 90 * 86_400_000) as { bid: string; last_at: number; ip: string }[])
        if (o.ip !== r.ip) add(o.bid, `同网段 ${net}x、同一型号 ${r.model}`, o.last_at);
    }
  }
  return [...out.values()].sort((a, b) => b.last_at - a.last_at).slice(0, 30);
}

/** Housekeeping (daily): rows older than NET_KEEP_DAYS keep city and device, lose the address. */
export function scrubNet(now = Date.now()): number {
  ensure();
  const r = db().prepare("UPDATE OR REPLACE browser_net SET ip = '', ua = NULL WHERE last_at < ? AND ip != ''").run(now - NET_KEEP_DAYS * 86_400_000);
  const n = Number((r as unknown as { changes?: number }).changes ?? 0);
  if (n) recordOps("net_scrub", `rows=${n}`);
  return n;
}

/** Account deletion / 删除这个浏览器的记录: these browsers' address rows go. */
export function eraseNet(bids: string[]): void {
  if (!bids.length) return;
  ensure();
  db().prepare(`DELETE FROM browser_net WHERE bid IN (${bids.map(() => "?").join(",")})`).run(...bids);
}

/** tests */
export function resetNetThrottle(): void { LAST.clear(); }
