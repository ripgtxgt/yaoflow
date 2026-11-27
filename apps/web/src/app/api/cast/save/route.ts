import { NextRequest, NextResponse } from "next/server";
import { paywallOn } from "@/lib/paywall";
import { serverCheckEmail } from "@/lib/email-mx";
import { saveCastForLater } from "@/lib/saved-cast";

export const runtime = "nodejs";

/**
 * 10-02 存到信箱: the reader emails themselves the cast they are not ready to buy (lib/saved-cast.ts has the rules).
 * A per-address cap lives with the data; this keeps one browser from spraying addresses.
 */
const HITS = new Map<string, number[]>();
function limited(key: string, now: number): boolean {
  const list = (HITS.get(key) ?? []).filter((t) => now - t < 3_600_000);
  list.push(now);
  HITS.set(key, list);
  if (HITS.size > 5000) HITS.clear();
  return list.length > 5;
}

export async function POST(req: NextRequest) {
  if (!paywallOn()) return NextResponse.json({ error: "off" }, { status: 503 });
  const now = Date.now();
  if (limited(req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local", now)) return NextResponse.json({ error: "too_many" }, { status: 429 });
  let b: Record<string, unknown>;
  try { b = (await req.json()) as Record<string, unknown>; } catch { return NextResponse.json({ error: "bad_json" }, { status: 400 }); }
  const checked = await serverCheckEmail(typeof b.email === "string" ? b.email : "");
  if (!checked.ok) return NextResponse.json({ error: checked.error, ...(checked.suggestion ? { suggestion: checked.suggestion } : {}) }, { status: 400 });
  const r = await saveCastForLater({
    email: checked.email, question: typeof b.question === "string" ? b.question : "", values: b.values, castAtMs: b.castAtMs, tzOffsetMinutes: b.tzOffsetMinutes,
    locale: typeof b.locale === "string" ? b.locale : "en", teaser: b.teaser, currency: b.currency,
    // 10-12 B②: kept on the 3rd–4th cast of a matter — with the first time the chart names, for the one date letter
    ...(b.matter && typeof b.matter === "object" ? { matter: { first: (b.matter as { first?: unknown }).first } } : {}),
  }, now);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.error === "too_many" ? 429 : r.error === "send_failed" ? 502 : 400 });
  return NextResponse.json({ ok: true });
}
