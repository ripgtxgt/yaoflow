import { NextResponse, type NextRequest } from "next/server";
import { chartReader } from "@/lib/chart-reader";
import { baziText } from "@/lib/mingli/bazi/content";
import { canSee } from "@/lib/features";
import { isLocale } from "@/lib/locales";
import { serviceOpenIn } from "@/lib/services";

/** 10-18 进度表 72: the words for one 八字 chart — the browser sends only names (日柱、十神、強弱), never a birth date */
export async function POST(req: NextRequest) {
  if (!(await canSee("bazi"))) return NextResponse.json({ error: "off" }, { status: 404 });
  // 10-25 (Neil): the plain reading is paid — a 通卡 or a membership, signed in
  const who = await chartReader(req);
  if (!who.covered) return NextResponse.json({ error: "need_pass", signedIn: who.signedIn }, { status: 402 });
  let b: Record<string, unknown>;
  try { b = (await req.json()) as Record<string, unknown>; } catch { return NextResponse.json({ error: "bad" }, { status: 400 }); }
  const s = (v: unknown, n = 8) => (typeof v === "string" ? v.slice(0, n) : "");
  const arr = (v: unknown) => (Array.isArray(v) ? v.slice(0, 12).map((x) => s(x)) : []);
  // 10-30 进度表 128 ④: any language the 八字 is open in (the library in that language)
  const locale = typeof b.locale === "string" && isLocale(b.locale) && serviceOpenIn("bazi", b.locale) ? b.locale : "zh-hant";
  return NextResponse.json(baziText({ day: s(b.day, 2), stem: s(b.stem, 1), level: s(b.level, 2), favour: arr(b.favour), decade: s(b.decade), years: arr(b.years), nayin: arr(b.nayin), gods: arr(b.gods) }, locale), { headers: { "Cache-Control": "private, no-store" } });
}
