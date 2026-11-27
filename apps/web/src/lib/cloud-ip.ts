import data from "@/data/cloud-ranges.json";
import { machineUa } from "./machine-ua";

/**
 * 11-04 (Neil：「要做」): is this address in a cloud / hosting provider's network? A page opened from a server room is a
 * link scanner, a preview fetcher or a crawler with a real browser — not a reader. The live board files it under 爬虫.
 * Data: src/data/cloud-ranges.json (scripts/build-cloud-ranges.ts, public BGP prefixes per AS number). Server only.
 */
const D = data as unknown as { names: string[]; v4: [number, number, number][]; v6: [string, number, number][] };

function v4Int(ip: string): number | null {
  const p = ip.split(".");
  if (p.length !== 4) return null;
  let n = 0;
  for (const x of p) { const v = Number(x); if (!Number.isInteger(v) || v < 0 || v > 255) return null; n = n * 256 + v; }
  return n;
}

function v6Big(ip: string): bigint | null {
  const s = ip.split("%")[0]!.toLowerCase();
  if (!/^[0-9a-f:]+$/.test(s)) return null;
  const [head, tail] = s.split("::") as [string, string | undefined];
  const h = head ? head.split(":") : [];
  const t = tail !== undefined ? (tail ? tail.split(":") : []) : [];
  if (tail === undefined && h.length !== 8) return null;
  const groups = [...h, ...Array(8 - h.length - t.length).fill("0"), ...t];
  if (groups.length !== 8) return null;
  return groups.reduce((a, g) => (a << 16n) + BigInt(parseInt(g || "0", 16)), 0n);
}

let V6: { base: bigint; mask: bigint; i: number }[] | null = null;
function v6Table() {
  if (V6) return V6;
  V6 = [];
  for (const [ip, bits, i] of D.v6) {
    const b = v6Big(ip);
    if (b === null) continue;
    const mask = bits === 0 ? 0n : ((1n << BigInt(bits)) - 1n) << BigInt(128 - bits);
    V6.push({ base: b & mask, mask, i });
  }
  return V6;
}

/**
 * 11-06 (Neil：「要」): our own bug patrol runs from Anthropic's network 160.79.104.0/21 (ARIN: Anthropic, PBC) — the
 * prefix list filed it under Google Cloud. Named for what it is, ahead of the provider table.
 */
const OWN: [number, number, string][] = [[0xa04f6800, 0xa04f6fff, "自家 AI 巡检（Anthropic）"]];

/** the provider's name (「腾讯云」「AWS」…), or null for an ordinary network */
export function cloudOf(ip: string | null | undefined): string | null {
  const s = (ip ?? "").trim();
  if (!s) return null;
  if (!s.includes(":")) { const n = v4Int(s); if (n !== null) for (const [a, b, name] of OWN) if (a <= n && n <= b) return name; }
  if (s.includes(":")) {
    if (s.startsWith("::ffff:")) return cloudOf(s.slice(7));
    const b = v6Big(s);
    if (b === null) return null;
    for (const r of v6Table()) if ((b & r.mask) === r.base) return D.names[r.i] ?? null;
    return null;
  }
  const n = v4Int(s);
  if (n === null) return null;
  let lo = 0, hi = D.v4.length - 1, hit: number | null = null;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const r = D.v4[mid]!;
    if (r[0] <= n) { if (n <= r[1]) hit = r[2]; lo = mid + 1; } else hi = mid - 1;
  }
  if (hit !== null) return D.names[hit] ?? null;
  // ranges can nest: a wider block that starts earlier — a short scan back covers it
  for (let k = Math.min(hi, D.v4.length - 1); k >= 0 && k > hi - 64; k--) { const r = D.v4[k]!; if (r[0] <= n && n <= r[1]) return D.names[r[2]] ?? null; }
  return null;
}

/** what only a person does: a cast, a priced tap, checkout, a claim — a server-room address that does these is a reader on a VPN */
export const HUMAN_EVENTS = new Set(["cast_complete", "reading_click", "checkout_start", "purchase", "gift_claim", "share_click", "followup", "sub_intent"]);

/**
 * the live board's device class and model line for a request. A server-room address is a 爬虫, named by its network —
 * unless the visitor shows a person (signed in, known, or casting / paying): 255 of 950 browsers 10-31..11-04 came from
 * cloud networks (scanners, mostly 腾讯云／华为云) and 5 of those cast — readers behind a VPN hosted in a data centre.
 *
 * 11-27 (Sakura：「现在还是有异常的访问」): the same signs the visitor counts use (lib/machine-visit.ts) — a desktop
 * browser about a year and a half out of date (`ua`), or our own stylesheet blocked before the page started
 * (`sheetBlocked`) — file a visitor on a home line under 爬虫 too, until it does something a person does.
 */
export function boardDevice<D extends string | null>(ip: string | null | undefined, uaDevice: D, uaModel: string | null, human = false, more: { ua?: string | null; sheetBlocked?: boolean } = {}): { device: D | "bot"; model: string | null; human: boolean } {
  const cloud = cloudOf(ip);
  if (!cloud) {
    if (!human && uaDevice !== "bot") {
      if (more.sheetBlocked) return { device: "bot", model: `自动化浏览器 · 样式表被拦${uaModel ? ` · ${uaModel}` : ""}`, human: false };
      if (machineUa(more.ua) === "stale") return { device: "bot", model: `自动化浏览器 · 旧版本${uaModel ? ` · ${uaModel}` : ""}`, human: false };
    }
    return { device: uaDevice, model: uaModel, human };
  }
  if (human) return { device: uaDevice, model: `${uaModel ? `${uaModel} · ` : ""}机房网络 ${cloud}（多半是 VPN）`, human: true };
  return { device: "bot", model: `机房 · ${cloud}${uaModel ? ` · ${uaModel}` : ""}`, human: false };
}
