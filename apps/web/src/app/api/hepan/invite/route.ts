import { NextRequest, NextResponse } from "next/server";
import { ADMIN_COOKIE } from "@/lib/admin-auth";
import { featureVisible } from "@/lib/features";
import { recordOps } from "@/lib/db";
import { INVITE_ID_RE } from "@/lib/mingli/hepan/invite-link";
import { inviteFacts, storeInviteFacts } from "@/lib/mingli/hepan/invite";
import { hepanFacts, hepanPeopleFromBody } from "@/lib/mingli/hepan/report";
import { isLocale } from "@/lib/locales";
import { serviceOpenIn } from "@/lib/services";

export const runtime = "nodejs";

/**
 * 10-21 合盤邀請 (lib/mingli/hepan/invite-link.ts has the whole flow).
 *   POST {id, a: {input, gender}, b: {input, gender}, locale}  — sent once by TA's browser when TA has filled in:
 *        a = the inviter (from the link), b = TA. The server computes the pair's facts and keeps only those under id.
 *        → 200 {ok: true} · 200 {ok: true, exists: true} (already filled) · 400 {error: "bad_id" | "bad_birth", field}
 *   GET  ?id=  — the inviter's browser asks whether TA has filled in → 200 {filled: false} · 200 {filled: true, facts, at}
 * Both follow the hepan switch (preview: admin browsers only).
 */
export async function GET(req: NextRequest) {
  if (!(await featureVisible("hepan", req.cookies.get(ADMIN_COOKIE)?.value))) return NextResponse.json({ error: "off" }, { status: 404 });
  const id = req.nextUrl.searchParams.get("id") ?? "";
  if (!INVITE_ID_RE.test(id)) return NextResponse.json({ error: "bad_id" }, { status: 400 });
  const r = inviteFacts(id);
  return NextResponse.json(r ? { filled: true, facts: r.facts, at: r.at, locale: r.locale } : { filled: false }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(req: NextRequest) {
  if (!(await featureVisible("hepan", req.cookies.get(ADMIN_COOKIE)?.value))) return NextResponse.json({ error: "off" }, { status: 404 });
  let body: { id?: unknown; a?: unknown; b?: unknown; locale?: unknown };
  try { body = (await req.json()) as typeof body; } catch { return NextResponse.json({ error: "bad_json" }, { status: 400 }); }
  const id = typeof body.id === "string" && INVITE_ID_RE.test(body.id) ? body.id : null;
  if (!id) return NextResponse.json({ error: "bad_id" }, { status: 400 });
  const people = hepanPeopleFromBody(body.a, body.b);
  if ("error" in people) return NextResponse.json({ error: "bad_birth", field: people.error }, { status: 400 });
  // 10-30 进度表 128 ④: the language TA filled in (any the 合盤 is open in) — only a note beside the facts
  const locale = typeof body.locale === "string" && isLocale(body.locale) && serviceOpenIn("hepan", body.locale) ? body.locale : body.locale === "zh" ? "zh" : "zh-hant";
  let facts;
  try { facts = hepanFacts(people.a, people.b); } catch { return NextResponse.json({ error: "bad_birth", field: "chart" }, { status: 400 }); }
  const r = storeInviteFacts(id, locale, facts);
  if (r === "bad") return NextResponse.json({ error: "bad_id" }, { status: 400 });
  if (r === "exists") recordOps("hepan_invite_again", id.slice(-6));
  return NextResponse.json({ ok: true, ...(r === "exists" ? { exists: true } : {}) });
}
