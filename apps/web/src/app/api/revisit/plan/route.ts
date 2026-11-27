import { NextRequest, NextResponse } from "next/server";
import { revisitBySession, setRevisitPlan } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 10-22 进度表 89 (设计稿 R7「你打算怎麼做？（一句，只給你自己看）」): the paid reading page writes the reader's own plan on
 * its revisit. The reading's session id is the credential (as for the page itself). POST { sid, plan } → { ok }
 */
export async function POST(req: NextRequest) {
  let b: { sid?: unknown; plan?: unknown };
  try { b = (await req.json()) as typeof b; } catch { return NextResponse.json({ error: "bad_json" }, { status: 400 }); }
  const sid = typeof b.sid === "string" && b.sid.length <= 300 ? b.sid : "";
  const r = sid ? revisitBySession(sid) : null;
  if (!r) return NextResponse.json({ error: "no_revisit" }, { status: 404 });
  if (r.outcome) return NextResponse.json({ error: "answered" }, { status: 409 });
  setRevisitPlan(r.id, typeof b.plan === "string" ? b.plan : "");
  return NextResponse.json({ ok: true });
}
