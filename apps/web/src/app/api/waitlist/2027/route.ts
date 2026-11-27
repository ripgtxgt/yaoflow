import { NextRequest, NextResponse } from "next/server";
import { joinYearWaitlist, YEAR_KINDS, type YearKind } from "@/lib/db";
import { asLocale } from "@/lib/locales";
import { record } from "@/lib/analytics-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HITS = new Map<string, number[]>();
function limited(ip: string): boolean {
  const now = Date.now();
  const list = (HITS.get(ip) ?? []).filter((t) => now - t < 600_000);
  list.push(now);
  HITS.set(ip, list);
  if (HITS.size > 4000) HITS.clear();
  return list.length > 8;
}

const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[a-z]{2,24}$/i;

/**
 * 10-12 「2027，這件事的年卦」预约 (进度表 §四 38): an address and the kind of matter. No payment, no account, no letter
 * now — the one letter comes when the product opens (and that send goes past Neil first).
 */
export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (limited(ip)) return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  let body: { email?: unknown; kind?: unknown; locale?: unknown; via?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "bad_json" }, { status: 400 }); }
  const email = typeof body.email === "string" ? body.email.trim() : "";
  if (!EMAIL.test(email)) return NextResponse.json({ error: "bad_email" }, { status: 400 });
  const kind = (YEAR_KINDS as readonly string[]).includes(String(body.kind)) ? (body.kind as YearKind) : null;
  if (!kind) return NextResponse.json({ error: "bad_kind" }, { status: 400 });
  const locale = asLocale(typeof body.locale === "string" ? body.locale : "zh-hant");
  const via = typeof body.via === "string" && /^[a-z0-9_-]{1,40}$/i.test(body.via) ? body.via : null;
  const r = joinYearWaitlist(email, kind, locale, via);
  record({ t: Date.now(), e: "year_waitlist", s: "waitlist", locale, method: `${kind}:${r}`, path: "/nian-gua-2027", ...(via ? { c: via } : {}) });
  return NextResponse.json({ ok: true, again: r === "again" });
}
