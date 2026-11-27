import { NextRequest, NextResponse } from "next/server";
import { customerFromRequest, EMAIL_RE } from "@/lib/auth";
import { record } from "@/lib/analytics-server";
import { addZeriRemind, cancelMyZeriRemind, cancelZeriRemind, myZeriReminds, sendZeriSetNote } from "@/lib/mingli/calendar/zeri-remind";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 10-17 进度表 70: 「提醒我這一天」 (POST) and the letter's cancel link (GET ?cancel=).
 * 10-18 (Neil: 登录了还要填 email): a signed-in reader needs no address — the account's is used; GET ?mine=<matter>
 * lists their pending days so the page marks them, and POST {cancel:true} takes one back.
 */
export async function POST(req: NextRequest) {
  let b: { email?: unknown; ymd?: unknown; slug?: unknown; locale?: unknown; cancel?: unknown; ask?: unknown };
  try { b = (await req.json()) as typeof b; } catch { return NextResponse.json({ error: "bad_json" }, { status: 400 }); }
  const me = customerFromRequest(req);
  if (b.cancel === true) {
    if (!me) return NextResponse.json({ error: "login" }, { status: 401 });
    cancelMyZeriRemind(me.email, String(b.ymd ?? ""), String(b.slug ?? ""));
    return NextResponse.json({ ok: true });
  }
  const typed = typeof b.email === "string" ? b.email.trim().toLowerCase().slice(0, 200) : "";
  const email = typed || me?.email.toLowerCase() || "";
  if (!EMAIL_RE.test(email)) return NextResponse.json({ error: "email" }, { status: 400 });
  // 10-22 进度表 80: the reminder also asks three days after the day (ask: false keeps the reminder alone)
  const r = addZeriRemind({ email, ymd: String(b.ymd ?? ""), slug: String(b.slug ?? ""), locale: String(b.locale ?? "zh-hant"), ask: b.ask !== false, customerId: me?.customerId ?? null });
  if (!r.ok) return NextResponse.json({ error: r.why }, { status: 400 });
  // 10-18: a note right away that the day is kept (a repeat tap on the same day sends nothing)
  if (r.token) await sendZeriSetNote((process.env.SITE_URL ?? "https://yaoflow.com").replace(/\/$/, ""), { email, ymd: String(b.ymd), slug: String(b.slug), token: r.token }).catch(() => false);
  record({ t: Date.now(), e: "zeri", s: email.slice(0, 3), locale: String(b.locale ?? "zh-hant"), method: "remind" });
  return NextResponse.json({ ok: true });
}

export async function GET(req: NextRequest) {
  const mine = req.nextUrl.searchParams.get("mine");
  if (mine !== null) {
    const me = customerFromRequest(req);
    return NextResponse.json({ days: me ? myZeriReminds(me.email, mine.slice(0, 40)) : [] }, { headers: { "Cache-Control": "no-store" } });
  }
  const tok = req.nextUrl.searchParams.get("cancel") ?? "";
  const ok = /^[0-9a-f]{24}$/.test(tok) && cancelZeriRemind(tok);
  return new NextResponse(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><body style="font-family:serif;background:#f4f2ec;color:#14151c;padding:48px 24px;max-width:520px;margin:auto"><p style="font-size:18px">${ok ? "好，這個提醒已經取消。" : "這個提醒已經取消過了。"}</p><p><a href="/zh-hant/zeri" style="color:#14151c">回到擇日</a></p></body>`, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}
