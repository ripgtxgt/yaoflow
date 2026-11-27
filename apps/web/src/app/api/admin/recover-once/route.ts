import { NextRequest, NextResponse } from "next/server";
import { recordOps } from "@/lib/db";
import { ownerRecipients, sendEmail } from "@/lib/email";
import { listCheckoutSessions } from "@/lib/stripe";
import { RECOVER_SINCE, planRecover, recoverMailFor, sendRecover, type RecoverItem } from "@/lib/recover-once";
import { tongkaForAll } from "@/lib/subscription";
import type { LineValue } from "@yaoflow/engine";

export const runtime = "nodejs";
export const maxDuration = 600;

/**
 * 10-04 挽回信 (Neil: 「91人你现在全部补发一封」) — run by hand, from the server:
 *   yaoflow-cron.sh api/admin/recover-once              # dry run: who would get which letter, and why the rest would not
 *   yaoflow-cron.sh "api/admin/recover-once?sample=1"   # the three letters (zh-hant, made-up cast) to the owner address
 *   yaoflow-cron.sh "api/admin/recover-once?send=1"     # send; each address once (emails table, kind recover-1)
 * The dry run never shows an address or a question: counts, and each letter rendered with the question left out.
 */
export async function POST(req: NextRequest) {
  const key = req.headers.get("x-cron-key");
  if (!process.env.ADMIN_KEY || key !== process.env.ADMIN_KEY) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const sp = req.nextUrl.searchParams;
  const site = (process.env.SITE_URL ?? "https://yaoflow.com").replace(/\/$/, "");

  if (sp.get("sample") === "1") {
    const to = ownerRecipients()[0]!;
    const cast = { question: "這次面試能過嗎", values: [7, 8, 9, 7, 8, 8] as LineValue[], castAt: Date.now() - 5 * 86_400_000, tz: 480, teaser: null };
    const base = { email: to, customerId: null, sessionId: "sample", locale: "zh-hant" as const, currency: "TWD" as const, alipay: false, q: cast.question };
    const samples: RecoverItem[] = [
      { ...base, group: "upgrade", usdSorry: true, cast, lightSid: "sample" },
      { ...base, group: "deep", usdSorry: false, cast },
      { ...base, group: "member", usdSorry: false, q: null },
    ];
    let sent = 0;
    for (const it of samples) {
      const mail = recoverMailFor(it, site, it.group === "deep");
      const html = it.group === "upgrade" ? mail.html.replace(mail.url, `${site}/zh-hant/cast?c=recover1`) : mail.html;
      const r = await sendEmail(to, `[樣本] ${mail.subject}`, html, mail.text, { kind: "test", locale: "zh-hant" });
      if (r.ok) sent++;
    }
    return NextResponse.json({ sample: true, sent });
  }

  const sessions = await listCheckoutSessions(Math.floor(RECOVER_SINCE / 1000));
  const plan = planRecover(sessions, Date.now(), tongkaForAll());

  if (sp.get("send") === "1") {
    const limit = Math.min(Number(sp.get("limit") ?? 500) || 500, 500);
    const out = await sendRecover(plan, site, limit);
    return NextResponse.json({ ...out, planned: plan.items.length, skipped: plan.skipped });
  }

  // dry run: counts, and one rendering per (group, language) with the question left out
  const count = (f: (x: RecoverItem) => string) => plan.items.reduce<Record<string, number>>((o, x) => { const k = f(x); o[k] = (o[k] ?? 0) + 1; return o; }, {});
  const previews: Record<string, { subject: string; text: string }> = {};
  for (const it of plan.items) {
    const k = `${it.group}/${it.locale}${it.usdSorry ? "/usd" : ""}${it.alipay ? "/alipay" : ""}`;
    if (previews[k]) continue;
    const mail = recoverMailFor({ ...it, email: "reader@example.com", q: it.q ? "（问题略）" : null }, site, false);
    previews[k] = { subject: mail.subject, text: mail.text.replace(/https:\/\/[^\s]+/g, "<link>") };
  }
  recordOps("recover_once_dry", `${plan.items.length} of ${plan.candidates}`);
  return NextResponse.json({
    dry: true, sessions: sessions.length, candidates: plan.candidates, would_send: plan.items.length, skipped: plan.skipped,
    byGroup: count((x) => x.group), byLocale: count((x) => x.locale), byCurrency: count((x) => x.currency),
    usdSorry: plan.items.filter((x) => x.usdSorry).length, alipay: plan.items.filter((x) => x.alipay).length,
    noQuote: plan.items.filter((x) => x.group !== "member" && !x.q).length, noTeaser: plan.items.filter((x) => x.group === "deep" && !x.cast?.teaser).length,
    previews,
  });
}
