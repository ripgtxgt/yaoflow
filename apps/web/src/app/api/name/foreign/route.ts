import { NextRequest, NextResponse } from "next/server";
import { jaName, koName } from "@/lib/mingli/name/foreign";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 10-30 进度表 128 ⑥: 姓名判断 (ja) / 성명학 (ko) — the numbers for one name. POST so the name never sits in a URL (logs,
 * analytics). Nothing is stored.
 */
const clip = (v: unknown, n: number) => (typeof v === "string" ? [...v.replace(/[<>"'&\s]/g, "")].slice(0, n).join("") : "");
export async function POST(req: NextRequest) {
  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return NextResponse.json({ error: "bad_json" }, { status: 400 }); }
  const s = clip(b.s, 4), g = clip(b.g, 6);
  if (!s || !g) return NextResponse.json({ error: "empty" }, { status: 400 });
  if (b.l === "ja") return NextResponse.json({ ja: jaName(s, g) });
  if (b.l === "ko") return NextResponse.json({ ko: koName(clip(b.s, 2), clip(b.g, 4), clip(b.sh, 2), clip(b.gh, 4)) });
  return NextResponse.json({ error: "bad_locale" }, { status: 400 });
}
