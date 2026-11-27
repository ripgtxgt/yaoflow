import { NextRequest, NextResponse } from "next/server";
import { featureVisible } from "@/lib/features";
import { ADMIN_COOKIE } from "@/lib/admin-auth";
import { BID_COOKIE, bidCookieOptions, newBid } from "@/lib/browsers";
import { drawToday, prefsFor, setPrefs, subjectOf, drawnOn } from "@/lib/today-qian";
import { homeDay } from "@/lib/clock";
import { isQianSet } from "@/lib/qian-meta";
import { who, viewFor } from "../shared";

export const runtime = "nodejs";

/** 10-14 进度表 50 今日一籤: draw today's lot — or get back the one already drawn today (a refresh never changes it). */
export async function POST(req: NextRequest) {
  if (!(await featureVisible("today-qian", req.cookies.get(ADMIN_COOKIE)?.value))) return NextResponse.json({ error: "not_found" }, { status: 404 }); // 10-15 功能开关
  let body: { set?: unknown; locale?: unknown } = {};
  try { body = (await req.json()) as typeof body; } catch { /* empty body is fine */ }
  const w = who(req);
  let fresh: string | null = null;
  let subject = w.subject;
  if (!subject) { fresh = newBid(); subject = subjectOf(null, fresh)!; }
  // a set chosen before the first draw of the day is the one drawn from (and remembered)
  if (typeof body.set === "string" && isQianSet(body.set) && !drawnOn(subject, homeDay(Date.now()))) setPrefs(subject, { set: body.set });
  const d = drawToday(subject, Date.now(), body.locale === "zh" ? "zh" : "zh-hant");
  const v = viewFor(d, { ...w, bid: w.bid ?? fresh }, body.locale === "zh" ? "zh" : "zh-hant");
  const res = NextResponse.json({ day: d.day, lot: v, prefs: prefsFor(subject), access: w.access });
  if (fresh) res.cookies.set(BID_COOKIE, fresh, bidCookieOptions);
  return res;
}
