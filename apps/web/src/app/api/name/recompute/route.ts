import { NextRequest, NextResponse } from "next/server";
import { birthFromBody } from "@/lib/mingli/bazi/report";
import { chartFromBirth } from "@/lib/mingli/bazi/today";
import type { BirthInput } from "@/lib/mingli/birth/normalize";
import { NAME_TOKEN_RE, recomputeNameReport } from "@/lib/mingli/name/report";

export const runtime = "nodejs";

/**
 * 10-29 进度表 122 寶寶取名參考 bought on a 預產期: POST {token, input, gender} once the baby is born → the 喜用 from the
 * real birth time and the report written again, once, free. The token link is the key (as for the report page).
 *   → 200 {ok: true} · 400 {error: "bad_birth"|"token"} · 409 {error: "not_allowed"} (not a 預產期 report, or done once)
 */
export async function POST(req: NextRequest) {
  const b = (await req.json().catch(() => ({}))) as { token?: unknown; input?: unknown; gender?: unknown };
  const token = typeof b.token === "string" && NAME_TOKEN_RE.test(b.token) ? b.token : null;
  if (!token) return NextResponse.json({ error: "token" }, { status: 400 });
  const birth = birthFromBody(b.input, b.gender);
  if ("error" in birth) return NextResponse.json({ error: "bad_birth" }, { status: 400 });
  const chart = chartFromBirth(b.input as BirthInput, birth.gender);
  if (!chart) return NextResponse.json({ error: "bad_birth" }, { status: 400 });
  return recomputeNameReport(token, chart) ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "not_allowed" }, { status: 409 });
}
