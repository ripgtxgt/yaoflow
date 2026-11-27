import { NextRequest, NextResponse } from "next/server";
import { applyMailEvent, claimMailEvent, mailLogEmail, recordOps, recordUnsub } from "@/lib/db";
import { parseMailEvent, verifySvix } from "@/lib/resend-webhook";
import { handleReceived } from "@/lib/inbound";
import { supportAutoHandle } from "@/lib/support-auto";

export const runtime = "nodejs";

/**
 * Resend → us: what became of each email (delivered, opened, bounced,
 * complained, failed). Signature checked against RESEND_WEBHOOK_SECRET;
 * without the secret the endpoint refuses everything. Timestamps and counts
 * are all that is kept — no IP address, no mail client (see mail_log).
 */
export async function POST(req: NextRequest) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "webhook_not_configured" }, { status: 503 });
  const payload = await req.text();
  const ok = verifySvix(payload, {
    id: req.headers.get("svix-id"),
    timestamp: req.headers.get("svix-timestamp"),
    signature: req.headers.get("svix-signature"),
  }, secret);
  if (!ok) return NextResponse.json({ error: "bad_signature" }, { status: 400 });

  let json: unknown;
  try {
    json = JSON.parse(payload);
  } catch {
    return NextResponse.json({ error: "bad_json" }, { status: 400 });
  }
  // 09-29 客服来信: mail to @yaoflow.com arrives through Resend now. Kept and forwarded idempotently per email;
  // an error answers 500 so Svix retries (Resend also keeps the mail on its side).
  const j = json as { type?: unknown; data?: { email_id?: unknown } };
  if (j?.type === "email.received") {
    const id = typeof j.data?.email_id === "string" ? j.data.email_id : "";
    if (!id) return NextResponse.json({ received: true, ignored: true });
    const r = await handleReceived(id);
    // 10-18 客服实时自动处理: the desk reads the letter now, after Svix has its answer (SUPPORT_AUTO off/dry/on; lib/support-auto.ts).
    // Not awaited on purpose — the model call takes seconds and a retried webhook finds the letter already claimed.
    if (r === "kept") void supportAutoHandle(id).catch((e) => recordOps("support_auto_fail", `${id.slice(0, 8)} webhook: ${e instanceof Error ? e.message.slice(0, 160) : "?"}`));
    return r === "error" ? NextResponse.json({ error: "inbound_failed" }, { status: 500 }) : NextResponse.json({ received: true, inbound: r });
  }
  const ev = parseMailEvent(json);
  if (!ev) return NextResponse.json({ received: true, ignored: true });

  // Svix retries until it sees a 2xx; the same delivery must count once
  const svixId = req.headers.get("svix-id")!;
  if (!claimMailEvent(svixId, ev.emailId, ev.type, ev.at)) return NextResponse.json({ received: true, duplicate: true });

  const result = applyMailEvent(ev);
  if (ev.type === "email.bounced" || ev.type === "email.complained" || ev.type === "email.failed") {
    recordOps(`mail_${ev.type.slice(6)}`, `${ev.kind ?? "other"} ${ev.emailId}${ev.note ? " " + ev.note : ""}`);
  }
  // 10-23: a spam complaint is a no to everything optional — recorded as an unsubscribe, so the nudges, offers and mass
  // letters (all of which read mailOptedOut) stop too, not only the mass letters that already skip a complaint
  if (ev.type === "email.complained") {
    const to = ev.to?.trim() || mailLogEmail(ev.emailId);
    if (to) recordUnsub(to, "complaint", ev.at);
  }
  return NextResponse.json({ received: true, result });
}
