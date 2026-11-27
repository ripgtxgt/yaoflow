import { NextResponse, type NextRequest } from "next/server";
import { chartReader } from "@/lib/chart-reader";
import { ziweiText } from "@/lib/mingli/ziwei/content";
import { canSee } from "@/lib/features";
import { isLocale } from "@/lib/locales";
import { serviceOpenIn } from "@/lib/services";

/** 10-18 进度表 71: the words for one 紫微 chart — the browser sends star and palace names only, never a birth date */
export async function POST(req: NextRequest) {
  if (!(await canSee("ziwei"))) return NextResponse.json({ error: "off" }, { status: 404 });
  // 10-25 (Neil): the plain reading is paid — a 通卡 or a membership, signed in
  const who = await chartReader(req);
  if (!who.covered) return NextResponse.json({ error: "need_pass", signedIn: who.signedIn }, { status: 402 });
  let b: Record<string, unknown>;
  try { b = (await req.json()) as Record<string, unknown>; } catch { return NextResponse.json({ error: "bad" }, { status: 400 }); }
  const s = (v: unknown) => (typeof v === "string" ? v.slice(0, 6) : "");
  const list = (v: unknown, n = 40) => (Array.isArray(v) ? v.slice(0, n) : []);
  const pair = (v: unknown): [string, string] => (Array.isArray(v) ? [s(v[0]), s(v[1])] : ["", ""]);
  // 10-30 进度表 128 ④: any language the 紫微 is open in (the library in that language)
  const locale = typeof b.locale === "string" && isLocale(b.locale) && serviceOpenIn("ziwei", b.locale) ? b.locale : "zh-hant";
  return NextResponse.json(ziweiText({
    pairs: list(b.pairs).map(pair), empty: list(b.empty).map(s), mutagen: list(b.mutagen, 12).map(pair), minor: list(b.minor).map(s),
    yearly: s(b.yearly) || undefined, monthly: s(b.monthly) || undefined,
  }, locale), { headers: { "Cache-Control": "private, no-store" } });
}
