import { NextRequest, NextResponse } from "next/server";
import { customersForLaunch, recordEmail, recordOps } from "@/lib/db";
import { buildLaunchEmail, sendEmail } from "@/lib/email";
import { unsubUrl } from "@/lib/unsub";
import { asLocale } from "@/lib/locales";
import { DEFAULT_CURRENCY, isCurrency, priceLabels, type Currency } from "@/lib/money";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Launch mail #1, sent by hand on launch day (总方案 §8.3):
 *   curl -X POST "$SITE/api/launch/run?dry=1" -H "x-cron-key: $ADMIN_KEY"        # who would get it
 *   curl -X POST "$SITE/api/launch/run?limit=100" -H "x-cron-key: $ADMIN_KEY"    # send, 100 at a time
 * Only customers with marketing_ok = 1 (the launch box, privacy §4); each gets
 * it once (emails table, kind launch-1); ?currency=EUR overrides the price
 * shown, otherwise USD.
 */
export async function POST(req: NextRequest) {
  const key = req.headers.get("x-cron-key");
  if (!process.env.ADMIN_KEY || key !== process.env.ADMIN_KEY) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const dry = req.nextUrl.searchParams.get("dry") === "1";
  const limit = Math.min(Number(req.nextUrl.searchParams.get("limit") ?? 100) || 100, 500);
  const curRaw = (req.nextUrl.searchParams.get("currency") ?? DEFAULT_CURRENCY).toUpperCase();
  const currency: Currency = isCurrency(curRaw) ? curRaw : DEFAULT_CURRENCY;
  const site = (process.env.SITE_URL ?? "https://yaoflow.com").replace(/\/$/, "");
  const KIND = "launch-1";

  const people = customersForLaunch(KIND, limit);
  const curOf = (p: { currency: string | null }): Currency => (isCurrency((p.currency ?? "").toUpperCase()) ? (p.currency!.toUpperCase() as Currency) : currency);
  if (dry) {
    const byLocale: Record<string, number> = {}, byCurrency: Record<string, number> = {};
    let hadDeep = 0;
    for (const p of people) { byLocale[p.locale ?? "?"] = (byLocale[p.locale ?? "?"] ?? 0) + 1; byCurrency[curOf(p)] = (byCurrency[curOf(p)] ?? 0) + 1; if (p.had_deep) hadDeep++; }
    return NextResponse.json({ dry: true, would_send: people.length, byLocale, byCurrency, hadDeep, sample: people.slice(0, 5).map((p) => ({ id: p.id, locale: p.locale, currency: curOf(p), hadDeep: !!p.had_deep, email: p.email.replace(/^(.).*@/, "$1…@") })) });
  }

  let sent = 0, failed = 0;
  for (const p of people) {
    const locale = asLocale(p.locale);
    const mail = buildLaunchEmail({
      locale,
      // 09-21: the price in the currency their own reading was shown in; ?currency= is only the fallback
      priceLabel: priceLabels(curOf(p), locale).one,
      hadDeep: !!p.had_deep,
      accountUrl: `${site}/${locale}/account?c=email-1`,
      castUrl: `${site}/${locale}/cast?c=email-1`,
      unsubUrl: unsubUrl(site, p.email, locale),
    });
    const r = await sendEmail(p.email, mail.subject, mail.html, mail.text, { kind: "launch", sessionId: `launch:${p.id}`, customerId: p.id, unsubUrl: unsubUrl(site, p.email, locale), locale });
    recordEmail(`launch:${p.id}`, KIND, p.email, r.ok ? "sent" : "failed", r.error ?? r.id);
    if (r.ok) sent++; else failed++;
    await new Promise((res) => setTimeout(res, 600)); // Resend's polite pace
  }
  recordOps("launch_mail", `${KIND} sent ${sent} failed ${failed}`);
  return NextResponse.json({ sent, failed, remaining_hint: people.length === limit ? "run again" : "done" });
}
