import { NextRequest, NextResponse } from "next/server";
import { customerFromRequest } from "@/lib/auth";
import { ADMIN_COOKIE } from "@/lib/admin-auth";
import { featureVisible } from "@/lib/features";
import { can, rightsFor } from "@/lib/entitlements";
import { db } from "@/lib/db";
import { birthFromBody } from "@/lib/mingli/bazi/report";
import { hepanPeopleFromBody } from "@/lib/mingli/hepan/report";
import { pastLife, together } from "@/lib/mingli/fun/stories";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * 10-29 进度表 126: POST /api/fun/pastlife {input, gender, locale} · /api/fun/together {a: {input, gender}, b, locale}
 *   → 200 {text} · 401 {error: "login"} · 403 {error: "rights"} (a 通卡 or a 會員 — right chart_report) · 429 {error: "cap"}
 *   (12 new pieces a day) · 400 bad_birth · 502 {error: "write"}
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params;
  if (kind !== "pastlife" && kind !== "together") return NextResponse.json({ error: "kind" }, { status: 404 });
  if (!(await featureVisible("fun", req.cookies.get(ADMIN_COOKIE)?.value))) return NextResponse.json({ error: "off" }, { status: 404 });
  const me = customerFromRequest(req);
  if (!me) return NextResponse.json({ error: "login" }, { status: 401 });
  if (!can(await rightsFor(me.customerId), "chart_report")) return NextResponse.json({ error: "rights" }, { status: 403 });
  try {
    const n = (db().prepare("SELECT COUNT(*) AS n FROM fun_texts WHERE customer_id = ? AND created_at > ?").get(me.customerId, Date.now() - 86_400_000) as { n: number }).n;
    if (n >= 12) return NextResponse.json({ error: "cap" }, { status: 429 });
  } catch { /* the table comes with the first piece */ }
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const locale = b.locale === "zh" ? "zh" : "zh-hant";
  if (kind === "pastlife") {
    const birth = birthFromBody(b.input, b.gender);
    if ("error" in birth) return NextResponse.json({ error: "bad_birth" }, { status: 400 });
    const t = await pastLife(birth.n, birth.gender, locale, me.customerId).catch(() => null);
    return t ? NextResponse.json({ text: t }) : NextResponse.json({ error: "write" }, { status: 502 });
  }
  const pp = hepanPeopleFromBody(b.a, b.b);
  if ("error" in pp) return NextResponse.json({ error: "bad_birth" }, { status: 400 });
  const t = await together(pp.a, pp.b, locale, me.customerId).catch(() => null);
  return t ? NextResponse.json({ text: t }) : NextResponse.json({ error: "write" }, { status: 502 });
}
