import { NextRequest, NextResponse } from "next/server";
import { ADMIN_COOKIE } from "@/lib/admin-auth";
import { featureVisible } from "@/lib/features";
import { customerFromRequest } from "@/lib/auth";
import { deviceFor, keepDevice } from "@/lib/device";
import { bidOf } from "@/lib/browsers";
import { cleanQuestion, qiuqianTemples } from "@/lib/jiaobei";
import { saveQiuqianDraw } from "@/lib/qiuqian-log";

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
const int = (x: unknown, max: number) => (typeof x === "number" && Number.isInteger(x) && x >= 0 && x <= max ? x : null);

/**
 * 10-23 进度表 106 ②: a confirmed lot of 线上求籤 is filed (lib/qiuqian-log.ts) — which temple, which lot, how many tosses
 * to be allowed to draw, how many lots put back. The draw itself stays in the browser; only a temple and a lot number the
 * page offers are believed. The matter is kept only when the reader wrote one. POST {temple, num, asks, redraws, question?, locale}
 */
export async function POST(req: NextRequest) {
  if (!(await featureVisible("jiaobei", req.cookies.get(ADMIN_COOKIE)?.value))) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (limited(ip)) return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  let body: { temple?: unknown; num?: unknown; asks?: unknown; redraws?: unknown; question?: unknown; locale?: unknown };
  try { body = (await req.json()) as typeof body; } catch { return NextResponse.json({ error: "bad_json" }, { status: 400 }); }
  const t = qiuqianTemples().find((x) => x.id === body.temple);
  const num = int(body.num, 1000);
  if (!t || !num || num > t.count) return NextResponse.json({ error: "bad_lot" }, { status: 400 });
  const asks = int(body.asks, 50) ?? 1;
  const redraws = int(body.redraws, 200) ?? 0;
  const question = typeof body.question === "string" ? cleanQuestion(body.question) : "";
  const me = customerFromRequest(req);
  const dev = deviceFor(req);
  // 10-25: filed under the browser id (yf_bid), like 六爻 and payments
  const token = saveQiuqianDraw({ temple: t.id, setId: t.set, num, asks, redraws, question: [...question].length >= 2 ? question : null, locale: body.locale === "zh" ? "zh" : "zh-hant", bid: bidOf(req) ?? dev.id, customerId: me?.customerId ?? null });
  return keepDevice(NextResponse.json({ ok: true, token }), dev);
}
