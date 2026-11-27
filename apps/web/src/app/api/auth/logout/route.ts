import { NextRequest, NextResponse } from "next/server";
import { clearSessionCookies, endSession } from "@/lib/auth";
import { asLocale } from "@/lib/locales";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  endSession(req);
  const site = (process.env.SITE_URL ?? req.nextUrl.origin).replace(/\/$/, "");
  let locale = "en";
  try {
    const body = (await req.json()) as { locale?: unknown };
    locale = asLocale(body.locale);
  } catch {
    /* form post without a body */
  }
  const res = NextResponse.json({ ok: true, to: `${site}/${locale}` });
  clearSessionCookies(res);
  return res;
}
