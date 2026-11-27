import { NextRequest, NextResponse } from "next/server";
import { customerFromRequest } from "@/lib/auth";
import { edgeCountry } from "@/lib/geo";
import { deviceFromUA, touch } from "@/lib/presence";
import { knownFrom, marksFrom } from "@/lib/presence-marks";
import { deviceModel } from "@/lib/ua-brief";
import { boardDevice } from "@/lib/cloud-ip";
import { clientIp } from "@/lib/proxy-hop";
import { bidOf, browserStats } from "@/lib/browsers";

export const runtime = "nodejs";

/**
 * 10-02 实时在线: the page's heartbeat — "this tab is still open, on this page". Every 30 s while visible, once
 * more when the tab goes hidden. Updates the in-memory live board only; nothing is written to the event files,
 * so a reader on one page for ten minutes costs no storage. Same fields as a tracked event, minus anything new.
 */
const LAST = new Map<string, number>();

export async function POST(req: NextRequest) {
  try {
    const b = (await req.json()) as Record<string, unknown>;
    const s = typeof b.s === "string" && /^[a-z0-9]{6,24}$/.test(b.s) ? b.s : null;
    if (!s) return NextResponse.json({ ok: false }, { status: 400 });
    // at most one pulse per tab every 10 s (a tab that misbehaves cannot flood the table)
    const now = Date.now();
    const prev = LAST.get(s) ?? 0;
    if (now - prev < 10_000) return NextResponse.json({ ok: true });
    LAST.set(s, now);
    if (LAST.size > 5000) for (const [k, t] of LAST) if (now - t > 60_000) LAST.delete(k);
    const c = customerFromRequest(req);
    touch({
      s, t: now, e: "pulse",
      path: typeof b.path === "string" ? b.path.slice(0, 80) : null,
      locale: typeof b.locale === "string" ? b.locale.slice(0, 8) : null,
      vt: b.vt === "n" || b.vt === "r" ? b.vt : null,
      vn: typeof b.vn === "number" && Number.isInteger(b.vn) && b.vn >= 1 && b.vn <= 9999 ? b.vn : null,
      hidden: b.hidden === 1 || b.hidden === true,
      customer: c ? { id: c.customerId, email: c.email } : null,
      known: knownFrom(req, !!c),
      // 11-04: a server-room address (cloud / hosting network) is a scanner, filed under 爬虫 (lib/cloud-ip.ts)
      ...boardDevice(clientIp(req.headers), deviceFromUA(req.headers.get("user-agent")), deviceModel(req.headers.get("user-agent")) ?? null, !!c || !!knownFrom(req, !!c), { ua: req.headers.get("user-agent") }),
      country: edgeCountry(req.headers),
      marks: marksFrom(req, !!c),
      bid: bidOf(req),
      bstats: bidOf(req) ? browserStats(bidOf(req)!) : null,
    });
  } catch { /* swallow */ }
  return NextResponse.json({ ok: true });
}
