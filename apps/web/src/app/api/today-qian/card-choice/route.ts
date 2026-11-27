import { NextRequest, NextResponse } from "next/server";
import { unsubValid } from "@/lib/unsub";
import { setCardChoice } from "@/lib/today-qian";
import { record } from "@/lib/analytics-server";

export const runtime = "nodejs";

/** 10-14 进度表 50: the buttons of the 籤卡 ending letter — recorded, then where each one leads. */
export async function GET(req: NextRequest) {
  const id = Number(req.nextUrl.searchParams.get("id"));
  const c = req.nextUrl.searchParams.get("c");
  const t = req.nextUrl.searchParams.get("t") ?? "";
  const l = req.nextUrl.searchParams.get("l") === "zh" ? "zh" : "zh-hant";
  const site = (process.env.SITE_URL ?? req.nextUrl.origin).replace(/\/$/, "");
  if (!Number.isInteger(id) || (c !== "again" && c !== "member" && c !== "no") || !unsubValid(`qcard:${id}`, t)) return NextResponse.redirect(`${site}/${l}/today-qian`, 303);
  setCardChoice(id, c);
  record({ t: Date.now(), e: "today_qian", s: `card${id}`, method: `notice_${c}` });
  // 10-22 进度表 92: the 籤卡 is no longer sold — an older letter's 「再買」 lands on the lot's page, where the membership is offered
  const to = c === "again" ? `/${l}/today-qian#card` : c === "member" ? `/${l}/account#membership` : `/${l}/today-qian?card=no`;
  return NextResponse.redirect(`${site}${to}`, 303);
}
