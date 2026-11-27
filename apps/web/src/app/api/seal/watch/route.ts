import { serverCheckEmail } from "@/lib/email-mx";
import { NextRequest, NextResponse } from "next/server";
import { sealData, watchSeal } from "@/lib/db";
import { record } from "@/lib/analytics-server";
import { asLocale } from "@/lib/locales";
import { sealState } from "@/lib/seal";

export const runtime = "nodejs";


/** naive per-IP brake: a curious stranger, not a mailing list (09-21) */
const HITS = new Map<string, number[]>();
function limited(ip: string): boolean {
  const now = Date.now();
  const list = (HITS.get(ip) ?? []).filter((t) => now - t < 600_000);
  list.push(now);
  HITS.set(ip, list);
  if (HITS.size > 4000) HITS.clear();
  return list.length > 10;
}

/**
 * 封卦 (09-21, A1): "tell me when it settles". Stores an address against one
 * unsettled seal; the revisit cron writes once, when the person who cast it
 * says how it went. No account, no list, no second letter.
 */
export async function POST(req: NextRequest) {
  let body: { id?: unknown; email?: unknown; locale?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "bad_json" }, { status: 400 });
  }
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (limited(ip)) return NextResponse.json({ error: "rate_limited" }, { status: 429 });

  const id = Number(body.id);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "bad_id" }, { status: 400 });
  const checked = await serverCheckEmail(typeof body.email === "string" ? body.email : ""); // 09-26 邮箱校对
  if (!checked.ok) return NextResponse.json({ error: checked.error, suggestion: checked.suggestion }, { status: 400 });
  const email = checked.email;

  const d = sealData(id);
  if (!d) return NextResponse.json({ error: "unknown" }, { status: 404 });
  // a settled seal has nothing left to announce
  if (sealState(d) === "hit" || sealState(d) === "miss") return NextResponse.json({ ok: true, settled: true });

  const added = watchSeal(id, email, asLocale(body.locale));
  if (added) record({ t: Date.now(), e: "seal_watch", s: `seal${id}`, locale: asLocale(body.locale), path: "/seal" });
  return NextResponse.json({ ok: true });
}
