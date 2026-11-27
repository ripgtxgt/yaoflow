import { NextRequest, NextResponse } from "next/server";
import { ADMIN_COOKIE, isAdmin } from "@/lib/admin-auth";
import { inboxGet, inboxMark } from "@/lib/inbound";
import { sendReaderReply, type AutoRow } from "@/lib/support-auto";
import { draftKey, sendOnce, sentRecently } from "@/lib/reply-once";
import { db, recordOps } from "@/lib/db";

export const runtime = "nodejs";

/**
 * 10-18 客服实时自动处理: the "发送" button under a draft on /admin/inbox. Neil reads the draft the desk wrote
 * (or types his own), fixes it, and it goes to the reader from support@, threaded onto their letter — the same
 * road the automatic answers take, so one Resend tag family (support_*) covers every letter we send readers.
 *
 * 10-23 进度表 99 (客服 #510, 10-22 21:24): the same letter went out twice — two taps, two requests, two sends. One letter
 * per draft now (lib/reply-once.ts): a second request with the same words joins the send already running, or, within
 * five minutes of one that finished, comes back without sending. The page then says 「这封五分钟内已经发过」 (`again=1`).
 */
export async function POST(req: NextRequest) {
  const form = await req.formData();
  const key = String(form.get("key") ?? "");
  if (!(await isAdmin(req.cookies.get(ADMIN_COOKIE)?.value, key || null))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const id = String(form.get("id") ?? "");
  if (!/^[0-9a-f-]{20,64}$/i.test(id)) return NextResponse.json({ error: "bad_id" }, { status: 400 });
  const body = String(form.get("body") ?? "").replace(/\r\n/g, "\n").trim();
  if (body.length < 10) return NextResponse.json({ error: "empty_body" }, { status: 400 });
  if (/\/api\/revisit\/outcome/.test(body)) return NextResponse.json({ error: "outcome_link_forbidden" }, { status: 400 });
  const row = inboxGet(id) as AutoRow | null;
  if (!row) return NextResponse.json({ error: "no_such_letter" }, { status: 404 });
  const url = new URL("/admin/inbox", (process.env.SITE_URL ?? req.nextUrl.origin).replace(/\/$/, ""));
  url.searchParams.set("sent", id.slice(0, 8));

  const already = sentRecently(row, body);
  if (already) {
    recordOps("support_manual_dup", `${id.slice(0, 8)} same draft within 5 min — not sent again (${already})`);
    url.searchParams.set("again", "1");
    return NextResponse.redirect(url, { status: 303 });
  }
  const { result, joined } = sendOnce(draftKey(id, body), () => sendReaderReply(row, body, "support_manual"));
  const r = await result;
  if (!r.ok) {
    if (!joined) recordOps("support_manual_fail", `${id.slice(0, 8)}: ${r.error}`);
    return NextResponse.json({ error: r.error }, { status: 502 });
  }
  if (joined) {
    recordOps("support_manual_dup", `${id.slice(0, 8)} joined the send in flight (${r.id})`);
    url.searchParams.set("again", "1");
    return NextResponse.redirect(url, { status: 303 });
  }
  inboxMark(id, true, `Neil 从后台发出回信 Resend ${r.id}`);
  db().prepare("UPDATE support_inbox SET auto_reply_id = ?, auto_draft = ? WHERE id = ?").run(r.id ?? null, body, id);
  recordOps("support_manual", `${id.slice(0, 8)} replied ${r.id}`);
  return NextResponse.redirect(url, { status: 303 });
}
