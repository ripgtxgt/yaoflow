import { NextRequest, NextResponse } from "next/server";
import { customerFromRequest } from "@/lib/auth";
import { ADMIN_COOKIE, isAdmin } from "@/lib/admin-auth";
import { sessionRefunded } from "@/lib/db";
import { ZIWEI_TOKEN_RE, cleanQuestion, reaskZiweiReport, ziweiReport } from "@/lib/mingli/ziwei/report";

export const runtime = "nodejs";

/**
 * 10-20 (同一年只收一次錢, as the 八字 年書) POST {token, question} — the owner of a paid 紫微年書 asks this year's question
 * again: chapter 8 is rewritten for it, no new payment. 401 not signed in · 403 not the owner · 404 no such paid 年書.
 */
export async function POST(req: NextRequest) {
  let body: { token?: unknown; question?: unknown };
  try { body = (await req.json()) as typeof body; } catch { return NextResponse.json({ error: "bad_json" }, { status: 400 }); }
  const token = typeof body.token === "string" && ZIWEI_TOKEN_RE.test(body.token) ? body.token : null;
  const r = token ? ziweiReport(token) : null;
  if (!token || !r || r.kind !== "year" || !r.paid_at || sessionRefunded(r.paid_session)) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const me = customerFromRequest(req);
  if (!me) return NextResponse.json({ error: "login" }, { status: 401 });
  const admin = await isAdmin(req.cookies.get(ADMIN_COOKIE)?.value).catch(() => false);
  if (r.customer_id !== me.customerId && !admin) return NextResponse.json({ error: "not_owner" }, { status: 403 });
  const q = cleanQuestion(body.question);
  if (!q) return NextResponse.json({ error: "empty" }, { status: 400 });
  reaskZiweiReport(token, q);
  return NextResponse.json({ ok: true });
}
