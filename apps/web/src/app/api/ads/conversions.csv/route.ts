import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { adsClickStats, adsConversionsCsv, noteAdsFetch } from "@/lib/ads-conversions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 11-27 T-007 Google Ads 付费转化 (lib/ads-conversions.ts) — the file Google Ads fetches on its schedule
 * (工具 → 转化 → 上传 → 定期上传 → 来源 HTTPS, with this URL and the user name / password below).
 *   ADS_CSV_USER / ADS_CSV_PASS   Basic Auth; without the password the endpoint is off (503)
 *   ADS_CONVERSION_NAME           the conversion action's name in Google Ads, exactly as written there
 * An admin can look with x-cron-key: ADMIN_KEY (?stats=1 for the counts only).
 */
const same = (a: string, b: string) => {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

function authorized(req: NextRequest): boolean {
  const admin = process.env.ADMIN_KEY, key = req.headers.get("x-cron-key");
  if (admin && key && same(key, admin)) return true;
  const pass = process.env.ADS_CSV_PASS, user = process.env.ADS_CSV_USER ?? "yaoflow-ads";
  const m = /^Basic\s+(.+)$/i.exec(req.headers.get("authorization") ?? "");
  if (!pass || !m) return false;
  const raw = Buffer.from(m[1]!, "base64").toString("utf8");
  const i = raw.indexOf(":");
  return i > 0 && same(raw.slice(0, i), user) && same(raw.slice(i + 1), pass);
}

export async function GET(req: NextRequest) {
  if (!process.env.ADS_CSV_PASS && !req.headers.get("x-cron-key")) return NextResponse.json({ error: "off" }, { status: 503 });
  if (!authorized(req)) {
    noteAdsFetch(0, false);
    return new NextResponse("unauthorized", { status: 401, headers: { "www-authenticate": 'Basic realm="yaoflow-ads"' } });
  }
  if (req.nextUrl.searchParams.get("stats") === "1") return NextResponse.json(adsClickStats());
  const { csv, rows } = adsConversionsCsv(process.env.ADS_CONVERSION_NAME || "YaoFlow Purchase");
  noteAdsFetch(rows, true);
  return new NextResponse(csv, { headers: { "content-type": "text/csv; charset=utf-8", "cache-control": "no-store" } });
}
