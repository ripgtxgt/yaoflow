import { NextRequest, NextResponse } from "next/server";
import { REVISIT_DAYS, setTarotRevisit, TAROT_TOKEN_RE, tarotDraw } from "@/lib/tarot";
import { record } from "@/lib/analytics-server";
import { customerFromRequest } from "@/lib/auth";
import { serverCheckEmail } from "@/lib/email-mx";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 10-16 进度表 68 到期回訪: the reader picks when to be asked what happened (2 weeks / a month / 3 months) and, optionally,
 * what would count as an answer. Changeable until the letter has gone.
 * 10-22 进度表 90 (设计稿 R7「付不付費都給回訪」): a free spread may be asked too — with the account's address, or one typed
 * here (kept on the draw for this one letter). 进度表 89: `plan`, 「你打算怎麼做」, only for the reader.
 */
const HITS = new Map<string, number[]>();
function limited(key: string, now: number): boolean {
  const list = (HITS.get(key) ?? []).filter((t) => now - t < 3_600_000);
  list.push(now);
  HITS.set(key, list);
  if (HITS.size > 5000) HITS.clear();
  return list.length > 20;
}

export async function POST(req: NextRequest) {
  let body: { token?: unknown; days?: unknown; outcome?: unknown; plan?: unknown; email?: unknown };
  try { body = (await req.json()) as typeof body; } catch { return NextResponse.json({ error: "bad_json" }, { status: 400 }); }
  const now = Date.now();
  if (limited(req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local", now)) return NextResponse.json({ error: "too_many" }, { status: 429 });
  const token = typeof body.token === "string" && TAROT_TOKEN_RE.test(body.token) ? body.token : null;
  const d = token ? tarotDraw(token) : null;
  if (!token || !d) return NextResponse.json({ error: "no_draw" }, { status: 404 });
  const days = Number(body.days);
  if (!(REVISIT_DAYS as readonly number[]).includes(days)) return NextResponse.json({ error: "bad_days" }, { status: 400 });
  // the address: the draw's own (a paid spread's, or one given before), the signed-in account's, or one typed now
  let email: string | null = d.email ?? null;
  const me = customerFromRequest(req);
  if (!email && me?.email) email = me.email.toLowerCase();
  if (!email && typeof body.email === "string" && body.email.trim()) {
    const checked = await serverCheckEmail(body.email);
    if (!checked.ok) return NextResponse.json({ error: checked.error, ...(checked.suggestion ? { suggestion: checked.suggestion } : {}) }, { status: 400 });
    email = checked.email;
  }
  if (!email) return NextResponse.json({ error: "no_email" }, { status: 409 });
  const outcome = typeof body.outcome === "string" ? body.outcome.replace(/\s+/g, " ").trim().slice(0, 80) : "";
  const plan = typeof body.plan === "string" ? body.plan : undefined;
  if (!setTarotRevisit(token, days, outcome, now, { plan, email, customerId: me?.customerId ?? null })) return NextResponse.json({ error: "sent" }, { status: 409 });
  record({ t: now, e: "tarot", s: token.slice(-12), locale: d.locale, method: `revisit_set:${days}${d.paid_at ? "" : ":free"}` });
  return NextResponse.json({ ok: true, due: tarotDraw(token)?.revisit_due ?? null });
}
