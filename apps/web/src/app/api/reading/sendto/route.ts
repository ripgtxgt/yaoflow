import { NextRequest, NextResponse } from "next/server";
import { clearSessionCookies, customerFromRequest } from "@/lib/auth";
import { dropPaySessions } from "@/lib/db";
import { serverCheckEmail } from "@/lib/email-mx";
import { sendReadingTo } from "@/lib/reading-mail";

export const runtime = "nodejs";

const HITS = new Map<string, number[]>();
function limited(key: string): boolean {
  const now = Date.now();
  const list = (HITS.get(key) ?? []).filter((t) => now - t < 3_600_000);
  list.push(now);
  HITS.set(key, list);
  if (HITS.size > 2000) HITS.clear();
  return list.length > 4;
}

/** 09-26: send a wallet-paid reading to another address (see lib/reading-mail). */
export async function POST(req: NextRequest) {
  let body: { sid?: unknown; email?: unknown };
  try { body = (await req.json()) as typeof body; } catch { return NextResponse.json({ error: "bad_json" }, { status: 400 }); }
  const sid = typeof body.sid === "string" ? body.sid : "";
  if (limited(sid)) return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  const checked = await serverCheckEmail(typeof body.email === "string" ? body.email : "");
  if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 400 });
  const me = customerFromRequest(req);
  // 10-02 付款后自动登录: a session that only the payment made proves no address — send-to works as it did before
  // sign-in (the order moves to the address typed), and that session ends, so the browser is not left signed in to
  // the wallet sheet's address, which no longer holds the reading
  const payOnly = me?.via === "pay";
  const r = await sendReadingTo(sid, checked.email, payOnly ? null : me?.customerId ?? null);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.error === "not_found" ? 404 : 409 });
  const res = NextResponse.json({ ok: true, email: r.email, ...(payOnly ? { signedOut: true } : {}) });
  if (payOnly && me) { dropPaySessions(me.customerId); clearSessionCookies(res); }
  return res;
}
