import { NextRequest, NextResponse } from "next/server";
import { ADMIN_COOKIE } from "@/lib/admin-auth";
import { featureVisible } from "@/lib/features";
import { customerFromRequest } from "@/lib/auth";
import { bidOf } from "@/lib/browsers";
import { hkReader } from "@/lib/register";
import { buildCard, hourBranch, meihua } from "@/lib/xunwu";
import { isAgo, isCat, isPlace, type XwRegion } from "@/lib/xunwu-text";
import { isLocale } from "@/lib/locales";
import { isForeign } from "@/lib/l10n/core";
import { castsToday, DAY_LIMIT, diceOf, SAME_MS, sameThing, saveCast, xunwuByToken } from "@/lib/xunwu-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 每個 IP 每 10 分鐘 30 次 — the same guard as the 擲筊 endpoint */
const HITS = new Map<string, number[]>();
function limited(ip: string): boolean {
  const now = Date.now();
  const list = (HITS.get(ip) ?? []).filter((t) => now - t < 600_000);
  list.push(now);
  HITS.set(ip, list);
  if (HITS.size > 4000) HITS.clear();
  return list.length > 30;
}
const NO_STORE = { "Cache-Control": "private, no-store" };

/**
 * 10-29 进度表 127 尋物 — no account needed (Neil: 「这个可以例外」). The dice are thrown in the browser; this files the
 * throw and answers with the card, worked out from the tables (lib/xunwu.ts), never a model. The same thing (category +
 * last place) from the same browser within 24 hours gets its first card back; ten new throws a day per browser.
 */
export async function POST(req: NextRequest) {
  if (!(await featureVisible("xunwu", req.cookies.get(ADMIN_COOKIE)?.value))) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (limited(ip)) return NextResponse.json({ error: "fast" }, { status: 429, headers: NO_STORE });
  let b: { cat?: unknown; place?: unknown; ago?: unknown; dice?: unknown; h?: unknown; locale?: unknown; again?: unknown };
  try { b = (await req.json()) as typeof b; } catch { return NextResponse.json({ error: "bad_json" }, { status: 400 }); }
  const { cat, place, ago } = b;
  if (!isCat(cat) || !isPlace(place) || !isAgo(ago)) return NextResponse.json({ error: "bad_input" }, { status: 400 });
  const dice = Array.isArray(b.dice) && b.dice.length === 3 && b.dice.every((x) => Number.isInteger(x) && (x as number) >= 1 && (x as number) <= 6)
    ? (b.dice as [number, number, number]) : null;
  const h = typeof b.h === "number" && Number.isInteger(b.h) && b.h >= 0 && b.h <= 23 ? b.h : null;
  if (!dice || h === null) return NextResponse.json({ error: "bad_input" }, { status: 400 });
  // 10-29 进度表 128: every language; the steps are Taiwan / Hong Kong / mainland on Chinese pages, the reader's country elsewhere
  const locale = isLocale(b.locale) ? b.locale : "zh-hant";
  const region: XwRegion = locale === "zh" ? "cn" : locale === "zh-hant" && hkReader(req.headers) ? "hk" : "tw";
  const bid = bidOf(req);

  // the same thing again within a day: what it came to the first time stands (同一件事接受第一次的結果) — found by this
  // browser's id, or by the token the page kept (a browser that blocks our cookie still has its own storage)
  const kept = typeof b.again === "string" ? xunwuByToken(b.again) : null;
  const first = (kept && kept.cat === cat && kept.place === place && Date.now() - kept.created_at < SAME_MS ? kept : null) ?? (bid ? sameThing(bid, cat, place) : null);
  if (first) {
    return NextResponse.json({ card: buildCard({ token: first.token, same: true, at: first.created_at, cat, place, ago: first.ago, dice: diceOf(first), hour: first.hour, locale, region }) }, { headers: NO_STORE });
  }
  if (bid && castsToday(bid) >= DAY_LIMIT) return NextResponse.json({ error: "day" }, { status: 429, headers: NO_STORE });

  const hour = hourBranch(h);
  const m = meihua(dice[0] + dice[1] + dice[2], hour);
  let customerId: number | null = null;
  try { customerId = customerFromRequest(req)?.customerId ?? null; } catch { /* signed out is the usual case here */ }
  const now = Date.now();
  const token = saveCast({ bid, customerId, locale, region: isForeign(locale) ? "intl" : region, cat, place, ago, dice, hour, hex: m.hex, changed: m.changed, tier: m.tier, rel: m.rel, toward: m.toward }, now);
  return NextResponse.json({ card: buildCard({ token, same: false, at: now, cat, place, ago, dice, hour, locale, region }) }, { headers: NO_STORE });
}
