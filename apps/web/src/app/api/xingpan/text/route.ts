import { NextResponse, type NextRequest } from "next/server";
import { chartReader } from "@/lib/chart-reader";
import { astroText } from "@/lib/mingli/astro/content";
import { canSee } from "@/lib/features";
import { isLocale } from "@/lib/locales";
import { serviceOpenIn } from "@/lib/services";

/** 10-18 进度表 74: the words for one 星盤 — the browser sends planet, sign and house names only, never a birth moment */
export async function POST(req: NextRequest) {
  if (!(await canSee("astro"))) return NextResponse.json({ error: "off" }, { status: 404 });
  // 10-25 (Neil): the plain reading is paid — a 通卡 or a membership, signed in
  const who = await chartReader(req);
  if (!who.covered) return NextResponse.json({ error: "need_pass", signedIn: who.signedIn }, { status: 402 });
  let b: Record<string, unknown>;
  try { b = (await req.json()) as Record<string, unknown>; } catch { return NextResponse.json({ error: "bad" }, { status: 400 }); }
  const s = (v: unknown) => (typeof v === "string" ? v.slice(0, 6) : "");
  const list = (v: unknown, n = 20) => (Array.isArray(v) ? v.slice(0, n) : []);
  // 10-30 进度表 128 ④: the words in the page's language (the library is translated: lib/mingli/astro/content.ts xIn)
  const locale = typeof b.locale === "string" && isLocale(b.locale) && serviceOpenIn("xingpan", b.locale) ? b.locale : "zh-hant";
  return NextResponse.json(astroText({
    ps: list(b.ps).map((x) => (Array.isArray(x) ? [s(x[0]), s(x[1])] : ["", ""]) as [string, string]),
    ph: list(b.ph).map((x) => (Array.isArray(x) ? [s(x[0]), Number(x[1]) | 0] : ["", 0]) as [string, number]),
    rising: s(b.rising) || undefined, node: s(b.node) || undefined,
    aspects: list(b.aspects, 5).map((x) => (Array.isArray(x) ? [s(x[0]), s(x[1]), s(x[2])] : ["", "", ""]) as [string, string, string]),
  }, locale), { headers: { "Cache-Control": "private, no-store" } });
}
