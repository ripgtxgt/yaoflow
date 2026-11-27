import { NextRequest, NextResponse } from "next/server";
import { customerFromRequest } from "@/lib/auth";
import { PROFILE_MAX, cleanProfile, deleteAllProfiles, deleteProfile, listProfiles, saveProfiles, type StoredProfile } from "@/lib/birth-profiles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { headers: { "Cache-Control": "no-store" } };

/**
 * 10-22 进度表 76 ⑤ 生辰檔案 — the signed-in reader's birth profiles.
 *   GET            { signedIn, profiles }         (signed out: { signedIn: false, profiles: [] }, 200 — the chart pages ask on every visit)
 *   PUT  {profiles} upsert (each checked; at most PROFILE_MAX kept) → { ok, profiles }
 *   DELETE ?id=    one; ?all=1 every one             → { ok }
 */
export async function GET(req: NextRequest) {
  const c = customerFromRequest(req);
  if (!c) return NextResponse.json({ signedIn: false, profiles: [] }, NO_STORE);
  return NextResponse.json({ signedIn: true, profiles: listProfiles(c.customerId) }, NO_STORE);
}

export async function PUT(req: NextRequest) {
  const c = customerFromRequest(req);
  if (!c) return NextResponse.json({ ok: false, error: "signed_out" }, { status: 401, ...NO_STORE });
  let body: { profiles?: unknown[] } = {};
  try { body = (await req.json()) as { profiles?: unknown[] }; } catch { /* empty */ }
  const list: StoredProfile[] = [];
  for (const raw of Array.isArray(body.profiles) ? body.profiles.slice(0, PROFILE_MAX) : []) {
    const p = cleanProfile(raw);
    if (p) list.push(p);
  }
  if (!list.length) return NextResponse.json({ ok: false, error: "bad_profile" }, { status: 400, ...NO_STORE });
  return NextResponse.json({ ok: true, profiles: saveProfiles(c.customerId, list) }, NO_STORE);
}

export async function DELETE(req: NextRequest) {
  const c = customerFromRequest(req);
  if (!c) return NextResponse.json({ ok: false, error: "signed_out" }, { status: 401, ...NO_STORE });
  const sp = req.nextUrl.searchParams;
  if (sp.get("all") === "1") return NextResponse.json({ ok: true, n: deleteAllProfiles(c.customerId) }, NO_STORE);
  const id = sp.get("id") ?? "";
  if (!/^[a-z0-9]{4,16}$/.test(id)) return NextResponse.json({ ok: false, error: "bad_id" }, { status: 400, ...NO_STORE });
  return NextResponse.json({ ok: true, gone: deleteProfile(c.customerId, id) }, NO_STORE);
}
