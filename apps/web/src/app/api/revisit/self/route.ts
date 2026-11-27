import { NextRequest, NextResponse } from "next/server";
import { customerFromRequest, EMAIL_RE } from "@/lib/auth";
import { isSelfRevisitKind } from "@/lib/db";
import { record } from "@/lib/analytics-server";
import { isLocale } from "@/lib/locales";
import { currentSelfRevisit, isHandSetKind, selfDueAt, selfChoices, selfRefCustomer, selfRefOwned, setSelfRevisit, unsetSelfRevisit } from "@/lib/self-revisit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { headers: { "Cache-Control": "no-store" } };

/**
 * 10-22 进度表 80 看自己的回訪 — the report page's 「到期回來問你」.
 *   GET  ?kind=&ref=            { options, current: { dueAt, hint, plan, status } | null }
 *   POST { kind, ref, option, hint?, plan?, email? }   sets (or moves) the revisit → { ok, dueAt }
 *   POST { kind, ref, cancel: true }            takes it back while it is still pending
 * The report must be the asker's: their account's, or bought with the address they give.
 */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const kind = q.get("kind"), ref = q.get("ref") ?? "", locale = q.get("l") ?? "zh-hant";
  if (!isSelfRevisitKind(kind) || !isHandSetKind(kind) || !ref) return NextResponse.json({ error: "bad" }, { status: 400, ...NO_STORE });
  const cur = currentSelfRevisit(kind, ref);
  return NextResponse.json({
    options: selfChoices(kind, locale),
    current: cur ? { dueAt: cur.due_at, hint: cur.hint ?? null, plan: cur.plan ?? null, status: cur.status, answered: !!cur.outcome } : null,
  }, NO_STORE);
}

export async function POST(req: NextRequest) {
  let b: { kind?: unknown; ref?: unknown; option?: unknown; hint?: unknown; plan?: unknown; email?: unknown; locale?: unknown; cancel?: unknown };
  try { b = (await req.json()) as typeof b; } catch { return NextResponse.json({ error: "bad_json" }, { status: 400 }); }
  const kind = b.kind, ref = typeof b.ref === "string" ? b.ref.slice(0, 80) : "";
  if (!isSelfRevisitKind(kind) || !isHandSetKind(kind) || !ref) return NextResponse.json({ error: "bad" }, { status: 400 });
  const me = customerFromRequest(req);
  const typed = typeof b.email === "string" ? b.email.trim().toLowerCase().slice(0, 200) : "";
  const email = me?.email.toLowerCase() || typed;
  if (!selfRefOwned(kind, ref, { customerId: me?.customerId ?? null, email: email || null })) return NextResponse.json({ error: "not_yours" }, { status: 403 });
  const locale = typeof b.locale === "string" && isLocale(b.locale) ? b.locale : "zh-hant";
  if (b.cancel === true) {
    unsetSelfRevisit(kind, ref);
    return NextResponse.json({ ok: true });
  }
  if (!EMAIL_RE.test(email)) return NextResponse.json({ error: "email" }, { status: 400 });
  const dueAt = selfDueAt(kind, String(b.option ?? ""));
  if (!dueAt) return NextResponse.json({ error: "option" }, { status: 400 });
  const hint = typeof b.hint === "string" ? b.hint.replace(/\s+/g, " ").trim().slice(0, 80) : null;
  // 10-22 进度表 89: 「你打算怎麼做」 — kept for the reader only (「我的」 and the letter); left out = unchanged
  const plan = typeof b.plan === "string" ? b.plan : undefined;
  const r = setSelfRevisit({ kind, ref, email, customerId: me?.customerId ?? selfRefCustomer(kind, ref), locale, dueAt, hint: hint || null, plan });
  record({ t: Date.now(), e: "revisit_set", s: ref.slice(-12), locale, tier: kind, method: `${String(b.option)}:${r}`, path: `/${kind}` });
  return NextResponse.json({ ok: true, dueAt, state: r });
}
