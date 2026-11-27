import { NextRequest, NextResponse } from "next/server";
import { resolveCast, type LineValue } from "@yaoflow/engine";
import { customerFromRequest } from "@/lib/auth";
import { cancelSelfRevisit, db } from "@/lib/db";
import { record } from "@/lib/analytics-server";
import { serverCheckEmail } from "@/lib/email-mx";
import { isCrisis } from "@/lib/crisis";
import { hexName } from "@/lib/names";
import { FREE_DAYS, scheduleFreeCastRevisit, type FreeDays } from "@/lib/self-revisit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 10-22 进度表 90 免費讀者也給回訪 (设计稿 R7「付不付費都給回訪」, Neil 10-22「可以」): under a free 六爻 reading the reader
 * picks when to be asked what happened (2 週 / 1 個月 / 3 個月), what would count, what they mean to do. The row rides in
 * `revisits` (kind "cast"), so 77's one-letter-per-address run and its caps carry it; the answer scores itself.
 *   POST { question, values, days, hint?, plan?, email?, locale }   → { ok, ref, dueAt }
 *   POST { cancel: true, ref }                                       takes it back while it is still pending
 * Chinese pages only (the letter is written in 繁／简). Only the question, the figure's name and the address are kept.
 */
const HITS = new Map<string, number[]>();
function limited(key: string, now: number): boolean {
  const list = (HITS.get(key) ?? []).filter((t) => now - t < 3_600_000);
  list.push(now);
  HITS.set(key, list);
  if (HITS.size > 5000) HITS.clear();
  return list.length > 10;
}
const PER_ADDRESS_PER_DAY = 5;

export async function POST(req: NextRequest) {
  let b: { question?: unknown; values?: unknown; days?: unknown; hint?: unknown; plan?: unknown; email?: unknown; locale?: unknown; cancel?: unknown; ref?: unknown };
  try { b = (await req.json()) as typeof b; } catch { return NextResponse.json({ error: "bad_json" }, { status: 400 }); }
  if (b.cancel === true) {
    const ref = typeof b.ref === "string" && /^[0-9a-f]{24}$/.test(b.ref) ? b.ref : null;
    if (!ref) return NextResponse.json({ error: "bad" }, { status: 400 });
    cancelSelfRevisit("cast", ref);
    return NextResponse.json({ ok: true });
  }
  const now = Date.now();
  if (limited(req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local", now)) return NextResponse.json({ error: "too_many" }, { status: 429 });
  const locale = b.locale === "zh" ? "zh" : b.locale === "zh-hant" ? "zh-hant" : null;
  if (!locale) return NextResponse.json({ error: "locale" }, { status: 400 });
  const question = typeof b.question === "string" ? b.question.replace(/\s+/g, " ").trim().slice(0, 200) : "";
  if (question.length < 2) return NextResponse.json({ error: "question" }, { status: 400 });
  if (isCrisis(question)) return NextResponse.json({ error: "crisis" }, { status: 400 });
  const values = Array.isArray(b.values) && b.values.length === 6 && b.values.every((v) => v === 6 || v === 7 || v === 8 || v === 9) ? (b.values as LineValue[]) : null;
  if (!values) return NextResponse.json({ error: "values" }, { status: 400 });
  const days = Number(b.days);
  if (!(FREE_DAYS as readonly number[]).includes(days)) return NextResponse.json({ error: "days" }, { status: 400 });

  const me = customerFromRequest(req);
  let email = me?.email?.toLowerCase() ?? "";
  if (!email) {
    const checked = await serverCheckEmail(typeof b.email === "string" ? b.email : "");
    if (!checked.ok) return NextResponse.json({ error: checked.error, ...(checked.suggestion ? { suggestion: checked.suggestion } : {}) }, { status: 400 });
    email = checked.email;
  }
  const today = (db().prepare("SELECT COUNT(*) AS n FROM revisits WHERE kind = 'cast' AND lower(email) = ? AND created_at > ?").get(email, now - 86_400_000) as { n: number }).n;
  if (today >= PER_ADDRESS_PER_DAY) return NextResponse.json({ error: "too_many" }, { status: 429 });

  let name: string | null = null;
  try { name = hexName(resolveCast(values).primary, locale); } catch { name = null; }
  const r = scheduleFreeCastRevisit({
    question, hexName: name, days: days as FreeDays,
    hint: typeof b.hint === "string" ? b.hint : null, plan: typeof b.plan === "string" ? b.plan : null,
    email, customerId: me?.customerId ?? null, locale,
  }, now);
  record({ t: now, e: "revisit_set", s: r.ref.slice(-12), locale, tier: "cast", method: `free:${days}`, path: "/cast" });
  return NextResponse.json({ ok: true, ref: r.ref, dueAt: r.dueAt });
}
