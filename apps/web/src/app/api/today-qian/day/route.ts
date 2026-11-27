import { NextRequest, NextResponse } from "next/server";
import { featureVisible } from "@/lib/features";
import { ADMIN_COOKIE } from "@/lib/admin-auth";
import { drawnOn } from "@/lib/today-qian";
import { homeDay } from "@/lib/clock";
import { record } from "@/lib/analytics-server";
import { who, viewFor } from "../shared";

export const runtime = "nodejs";

/** 10-14 进度表 50: one past day of the calendar — the lot and its words (members and card holders; others get the lot only). */
export async function GET(req: NextRequest) {
  if (!(await featureVisible("today-qian", req.cookies.get(ADMIN_COOKIE)?.value))) return NextResponse.json({ error: "not_found" }, { status: 404 }); // 10-15 功能开关
  const d = req.nextUrl.searchParams.get("d") ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || d > homeDay(Date.now())) return NextResponse.json({ error: "bad_day" }, { status: 400 });
  const w = who(req);
  if (!w.subject) return NextResponse.json({ error: "none" }, { status: 404 });
  const draw = drawnOn(w.subject, d);
  if (!draw) return NextResponse.json({ error: "none" }, { status: 404 });
  if (!w.access && d !== homeDay(Date.now())) return NextResponse.json({ error: "locked" }, { status: 403 });
  record({ t: Date.now(), e: "today_qian", s: w.subject.slice(-12), method: "day_view" });
  return NextResponse.json({ day: d, lot: viewFor(draw, w, req.nextUrl.searchParams.get("l") === "zh" ? "zh" : "zh-hant") }, { headers: { "Cache-Control": "no-store" } });
}
