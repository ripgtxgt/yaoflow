import { NextRequest, NextResponse } from "next/server";
import { ADMIN_COOKIE } from "@/lib/admin-auth";
import { featureVisible } from "@/lib/features";
import { customerFromRequest } from "@/lib/auth";
import { deviceFor, keepDevice } from "@/lib/device";
import { bidOf } from "@/lib/browsers";
import { cleanQuestion, type Sign } from "@/lib/jiaobei";
import { saveJiaobeiAsk } from "@/lib/pre-cast";
import { isLocale } from "@/lib/locales";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HITS = new Map<string, number[]>();
function limited(ip: string): boolean {
  const now = Date.now();
  const list = (HITS.get(ip) ?? []).filter((t) => now - t < 600_000);
  list.push(now);
  HITS.set(ip, list);
  if (HITS.size > 4000) HITS.clear();
  return list.length > 30;
}
const SIGNS = new Set<Sign>(["sheng", "xiao", "yin"]);

/**
 * 10-17 承接: a finished 擲筊 on a written-down matter is kept, so the cast that follows can carry it (lib/pre-cast.ts).
 * The tosses themselves happen in the browser; this only files how it ended. Nothing is kept without a question.
 */
export async function POST(req: NextRequest) {
  if (!(await featureVisible("jiaobei", req.cookies.get(ADMIN_COOKIE)?.value))) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (limited(ip)) return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  let body: { question?: unknown; rule?: unknown; seq?: unknown; locale?: unknown };
  try { body = (await req.json()) as typeof body; } catch { return NextResponse.json({ error: "bad_json" }, { status: 400 }); }
  const question = typeof body.question === "string" ? cleanQuestion(body.question) : "";
  if ([...question].length < 2) return NextResponse.json({ error: "question_required" }, { status: 400 });
  const rule = body.rule === 3 ? 3 : 1;
  const seq = Array.isArray(body.seq) ? body.seq.filter((x): x is Sign => typeof x === "string" && SIGNS.has(x as Sign)).slice(0, 12) : [];
  if (!seq.length || (rule === 1 && seq.length !== 1)) return NextResponse.json({ error: "bad_seq" }, { status: 400 });
  const me = customerFromRequest(req);
  const dev = deviceFor(req);
  // 10-25: the browser id (yf_bid), the one 六爻 and payments are filed under — the device id never matched them
  const token = saveJiaobeiAsk({ question, rule, seq, locale: isLocale(body.locale) ? body.locale : "zh-hant" /* 10-30 进度表 128 ⑤: every language */, bid: bidOf(req) ?? dev.id, customerId: me?.customerId ?? null });
  return keepDevice(NextResponse.json({ token }), dev);
}
