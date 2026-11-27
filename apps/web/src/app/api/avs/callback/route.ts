import { NextRequest, NextResponse } from "next/server";
import { recordOps } from "@/lib/db";
import { saveAvsCallback, verifyAvsSignature } from "@/lib/avs";

export const runtime = "nodejs";

/**
 * avs → us (11-10): every status change of a 拙伯 video we ordered (lib/avs.ts). Signed with AVS_EXT_TOKEN over the
 * raw body (`X-AVS-Signature: sha256=<hex>`); without the token the endpoint refuses everything, and a body that
 * does not verify is never parsed. Answers 200 once the row is kept, so avs need not send it again.
 */
const MAX_BODY = 256 * 1024;

export async function POST(req: NextRequest) {
  const token = process.env.AVS_EXT_TOKEN;
  if (!token) return NextResponse.json({ error: "avs_not_configured" }, { status: 503 });
  const raw = await req.text();
  if (raw.length > MAX_BODY) return NextResponse.json({ error: "too_large" }, { status: 413 });
  if (!verifyAvsSignature(raw, req.headers.get("x-avs-signature"), token)) {
    return NextResponse.json({ error: "bad_signature" }, { status: 401 });
  }
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "bad_json" }, { status: 400 });
  }
  const saved = saveAvsCallback(json, raw);
  if (!saved) return NextResponse.json({ received: true, ignored: true });
  if (saved.changed) recordOps("avs_status", `${saved.id} ${saved.status}`);
  return NextResponse.json({ received: true, id: saved.id, status: saved.status });
}
