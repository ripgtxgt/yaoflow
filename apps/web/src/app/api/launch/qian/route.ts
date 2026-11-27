import { NextRequest, NextResponse } from "next/server";
import { customersForQianLaunch, recordEmail, recordOps } from "@/lib/db";
import { buildQianLaunchEmail, ownerRecipients, sendEmail } from "@/lib/email";
import { unsubUrl } from "@/lib/unsub";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * 10-13 解籤上线信 (Neil: 「草稿就可以了，你设置去发吧」; scope agreed the same day: only readers who kept 「告訴我新功能和動態」
 * ticked — privacy §4 — the rest hear of it as one line in the letters they already get, lib/email qianMention).
 *   curl -X POST "$SITE/api/launch/qian?dry=1"  -H "x-cron-key: $ADMIN_KEY"   # who would get it
 *   curl -X POST "$SITE/api/launch/qian?self=1" -H "x-cron-key: $ADMIN_KEY"   # one copy to the owner, nothing recorded
 *   curl -X POST "$SITE/api/launch/qian?limit=150" -H "x-cron-key: $ADMIN_KEY" # send; run again until "done"
 */
const KIND = "launch-qian";

export async function POST(req: NextRequest) {
  const key = req.headers.get("x-cron-key");
  if (!process.env.ADMIN_KEY || key !== process.env.ADMIN_KEY) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const site = (process.env.SITE_URL ?? "https://yaoflow.com").replace(/\/$/, "");
  const url = `${site}/zh-hant/jieqian?c=launch-qian`;
  const sp = req.nextUrl.searchParams;

  if (sp.get("self") === "1") {
    const to = ownerRecipients()[0];
    if (!to) return NextResponse.json({ error: "no_owner" }, { status: 500 });
    const mail = buildQianLaunchEmail({ url, unsubUrl: unsubUrl(site, to, "zh-hant") });
    const r = await sendEmail(to, `［預覽］${mail.subject}`, mail.html, mail.text, { kind: "test", sessionId: "launch-qian:preview", locale: "zh-hant" });
    return NextResponse.json({ preview: r.ok, error: r.error ?? null });
  }

  const limit = Math.min(Number(sp.get("limit") ?? 150) || 150, 500);
  const people = customersForQianLaunch(KIND, sp.get("dry") === "1" ? 5000 : limit);
  if (sp.get("dry") === "1") return NextResponse.json({ dry: true, would_send: people.length });

  let sent = 0, failed = 0;
  for (const p of people) {
    const un = unsubUrl(site, p.email, "zh-hant");
    const mail = buildQianLaunchEmail({ url, unsubUrl: un });
    const r = await sendEmail(p.email, mail.subject, mail.html, mail.text, { kind: "launch", sessionId: `launch-qian:${p.id}`, customerId: p.id, unsubUrl: un, locale: "zh-hant" });
    recordEmail(`launch-qian:${p.id}`, KIND, p.email, r.ok ? "sent" : "failed", r.error ?? r.id);
    if (r.ok) sent++; else failed++;
    await new Promise((res) => setTimeout(res, 600)); // Resend's polite pace
  }
  recordOps("launch_mail", `${KIND} sent ${sent} failed ${failed}`);
  return NextResponse.json({ sent, failed, remaining_hint: people.length === limit ? "run again" : "done" });
}
