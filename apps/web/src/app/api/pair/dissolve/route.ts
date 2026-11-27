import { NextRequest, NextResponse } from "next/server";
import { dissolvePair, pairByToken } from "@/lib/db";
import { TOKEN_RE } from "@/lib/grants";
import { pairRole } from "@/lib/pairs";

export const runtime = "nodejs";

/** Either side may end the joint view. Both readings stay where they are; only the pairing goes. */
export async function POST(req: NextRequest) {
  let body: { token?: unknown; sid?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "bad_json" }, { status: 400 });
  }
  const token = typeof body.token === "string" ? body.token : "";
  const sid = typeof body.sid === "string" ? body.sid : "";
  if (!TOKEN_RE.test(token)) return NextResponse.json({ error: "bad_token" }, { status: 400 });
  const p = pairByToken(token);
  if (!p) return NextResponse.json({ error: "unknown_token" }, { status: 404 });
  if (!pairRole(p, sid)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  dissolvePair(token);
  return NextResponse.json({ ok: true });
}
