import { NextRequest, NextResponse } from "next/server";
import { customerFromRequest } from "@/lib/auth";
import { ADMIN_COOKIE, isAdmin } from "@/lib/admin-auth";
import { sessionRefunded } from "@/lib/db";
import { NIANSHU_TOKEN_RE, cleanQuestion, nianshuReport, reaskNianshu } from "@/lib/mingli/nianshu/report";

export const runtime = "nodejs";

/**
 * 10-21 年書 (同一年只收一次錢) POST {token, question} — the owner of a paid 年書 asks another question: the 答你的問題
 * chapter is rewritten for it, no new payment. 401 not signed in · 403 not the owner · 404 no such paid report (or refunded).
 */
export async function POST(req: NextRequest) {
  let body: { token?: unknown; question?: unknown };
  try { body = (await req.json()) as typeof body; } catch { return NextResponse.json({ error: "bad_json" }, { status: 400 }); }
  const token = typeof body.token === "string" && NIANSHU_TOKEN_RE.test(body.token) ? body.token : null;
  const r = token ? nianshuReport(token) : null;
  if (!token || !r || !r.paid_at || sessionRefunded(r.paid_session)) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const me = customerFromRequest(req);
  if (!me) return NextResponse.json({ error: "login" }, { status: 401 });
  const admin = await isAdmin(req.cookies.get(ADMIN_COOKIE)?.value).catch(() => false);
  if (r.customer_id !== me.customerId && !admin) return NextResponse.json({ error: "not_owner" }, { status: 403 });
  const q = cleanQuestion(body.question);
  if (!q) return NextResponse.json({ error: "empty" }, { status: 400 });
  reaskNianshu(token, q);
  return NextResponse.json({ ok: true });
}
