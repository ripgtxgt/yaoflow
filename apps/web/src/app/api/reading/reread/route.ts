import { NextRequest, NextResponse } from "next/server";
import { rereadAlone, rereadState } from "@/lib/reread";

export const runtime = "nodejs";

/**
 * 10-22 分開 (lib/reread.ts): the one free re-read after the reader split this reading's cast off a matter it did not
 * belong to — the same chart read again with no earlier casts in view, put in the place of the first reading. Plain form
 * post from the reading page, back to it. The reading link is the key; the offer is spent on the first tap.
 */
export async function POST(req: NextRequest) {
  const form = await req.formData();
  const sid = String(form.get("sid") ?? "");
  if (!/^[\w-]{8,120}$/.test(sid)) return NextResponse.json({ error: "bad_sid" }, { status: 400 });
  const rawBack = String(form.get("back") ?? "");
  const origin = (process.env.SITE_URL ?? req.nextUrl.origin).replace(/\/$/, "");
  const back = /^\/[a-z-]+\/reading\?sid=[\w-]+$/.test(rawBack) ? rawBack : null;
  if (!back) return NextResponse.json({ error: "bad_back" }, { status: 400 });
  const to = new URL(back, origin);
  const state = rereadState(sid);
  if (state === "offer") {
    // off the request: the page comes back at once and reloads itself until the new reading is in place (RereadWait)
    void rereadAlone(sid);
    to.searchParams.set("reread", "wait");
  } else if (state === "pending") {
    to.searchParams.set("reread", "wait");
  } else if (state === "done") {
    to.searchParams.set("reread", "1");
  } else {
    return NextResponse.json({ error: "not_offered" }, { status: 404 });
  }
  return NextResponse.redirect(to, { status: 303 });
}
