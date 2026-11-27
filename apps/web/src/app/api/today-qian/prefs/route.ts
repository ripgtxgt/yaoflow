import { NextRequest, NextResponse } from "next/server";
import { featureVisible } from "@/lib/features";
import { ADMIN_COOKIE } from "@/lib/admin-auth";
import { setPrefs } from "@/lib/today-qian";
import { isQianSet, isTemple, TEMPLES } from "@/lib/qian-meta";
import { record } from "@/lib/analytics-server";
import { who } from "../shared";

export const runtime = "nodejs";

/** 10-14 进度表 50: 「我常去的廟」 (→ its set, from tomorrow's draw) and 「每天早上寄給我」 (members and card holders, signed in). */
export async function POST(req: NextRequest) {
  if (!(await featureVisible("today-qian", req.cookies.get(ADMIN_COOKIE)?.value))) return NextResponse.json({ error: "not_found" }, { status: 404 }); // 10-15 功能开关
  let b: { temple?: unknown; set?: unknown; mail?: unknown } = {};
  try { b = (await req.json()) as typeof b; } catch { return NextResponse.json({ error: "bad_json" }, { status: 400 }); }
  const w = who(req);
  if (!w.subject) return NextResponse.json({ error: "no_subject" }, { status: 400 });
  const p: { set?: string; temple?: string | null; mail?: boolean } = {};
  if (isTemple(b.temple)) { p.temple = b.temple; p.set = TEMPLES.find((t) => t.id === b.temple)!.set; }
  else if (isQianSet(b.set)) { p.set = b.set; p.temple = null; }
  if (typeof b.mail === "boolean") {
    if (b.mail && (!w.cid || !w.access)) return NextResponse.json({ error: "not_member" }, { status: 403 });
    p.mail = b.mail;
    record({ t: Date.now(), e: "today_qian", s: w.subject.slice(-12), method: b.mail ? "mail_on" : "mail_off" });
  }
  return NextResponse.json({ prefs: setPrefs(w.subject, p) });
}
