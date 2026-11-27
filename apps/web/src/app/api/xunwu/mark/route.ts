import { NextRequest, NextResponse } from "next/server";
import { ADMIN_COOKIE } from "@/lib/admin-auth";
import { featureVisible } from "@/lib/features";
import { hkReader } from "@/lib/register";
import { backHelp } from "@/lib/xunwu";
import type { XwRegion } from "@/lib/xunwu-text";
import { isLocale } from "@/lib/locales";
import { markBack, markClick, xunwuByToken, XW_TOKEN_RE } from "@/lib/xunwu-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HITS = new Map<string, number[]>();
function limited(ip: string): boolean {
  const now = Date.now();
  const list = (HITS.get(ip) ?? []).filter((t) => now - t < 600_000);
  list.push(now);
  HITS.set(ip, list);
  if (HITS.size > 4000) HITS.clear();
  return list.length > 60;
}

/**
 * 10-29 进度表 127 尋物 — two counts on a cast this browser holds the token of: 「用六爻細看」 tapped (act "cast"), and the
 * revisit card's answer (act "found" | "not"). 「還沒」 gets the steps back, and the way into 六爻. Counts only.
 */
export async function POST(req: NextRequest) {
  if (!(await featureVisible("xunwu", req.cookies.get(ADMIN_COOKIE)?.value))) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (limited(ip)) return NextResponse.json({ error: "fast" }, { status: 429 });
  let b: { tk?: unknown; act?: unknown; locale?: unknown };
  try { b = (await req.json()) as typeof b; } catch { return NextResponse.json({ error: "bad_json" }, { status: 400 }); }
  const tk = typeof b.tk === "string" && XW_TOKEN_RE.test(b.tk) ? b.tk : null;
  if (!tk) return NextResponse.json({ error: "bad_token" }, { status: 400 });
  if (b.act === "cast") return NextResponse.json({ ok: markClick(tk) });
  if (b.act !== "found" && b.act !== "not") return NextResponse.json({ error: "bad_act" }, { status: 400 });
  const row = xunwuByToken(tk);
  if (!row) return NextResponse.json({ error: "not_found" }, { status: 404 });
  markBack(tk, b.act === "found");
  if (b.act === "found") return NextResponse.json({ ok: true });
  const locale = isLocale(b.locale) ? b.locale : "zh-hant";
  const region: XwRegion = locale === "zh" ? "cn" : locale === "zh-hant" && hkReader(req.headers) ? "hk" : "tw";
  return NextResponse.json({ ok: true, ...backHelp({ token: tk, cat: row.cat, place: row.place, ago: row.ago, locale, region }) }, { headers: { "Cache-Control": "private, no-store" } });
}
