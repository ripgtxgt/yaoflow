import { NextRequest, NextResponse } from "next/server";
import { ADMIN_COOKIE, isAdmin } from "@/lib/admin-auth";
import { peekLetters, PEEK_MAX_IDS } from "@/lib/support-peek";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 10-23 进度表 97 ④: GET /api/admin/support/peek?ids=<inbox id>,<inbox id>… — the support desk's read-only side road when
 * SSH is out (lib/support-peek.ts). Admin cookie, or ?key= like the other back-office routes. Never more than 50 ids.
 */
export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("key");
  if (!(await isAdmin(req.cookies.get(ADMIN_COOKIE)?.value, key))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const ids = (req.nextUrl.searchParams.get("ids") ?? "").split(",").map((s) => s.trim()).filter((s) => /^[0-9a-f-]{20,64}$/i.test(s));
  if (!ids.length) return NextResponse.json({ error: "no_ids" }, { status: 400 });
  if (ids.length > PEEK_MAX_IDS) return NextResponse.json({ error: "too_many_ids", max: PEEK_MAX_IDS }, { status: 400 });
  return NextResponse.json({ now: Date.now(), letters: peekLetters([...new Set(ids)]) }, { headers: { "Cache-Control": "no-store" } });
}
