import { NextRequest, NextResponse } from "next/server";
import { ADMIN_COOKIE, isAdmin } from "@/lib/admin-auth";
import { logAction } from "@/lib/admin-actions";
import { isLetterSwitch, letterOn, setLetterOn } from "@/lib/letter-switch";
import { AUTO_MAILS } from "@/lib/auto-mail";
import { recordOps } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 10-23 进度表 108 ① a letter that goes out by itself, on or off (/admin/letters). Needs a reason and the box ticked;
 * written to 操作记录. Takes effect within 15 seconds (lib/letter-switch.ts) — no deploy.
 */
export async function POST(req: NextRequest) {
  const form = await req.formData();
  const key = String(form.get("key") ?? "");
  if (!(await isAdmin(req.cookies.get(ADMIN_COOKIE)?.value, key || null))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const f = (k: string) => String(form.get(k) ?? "").trim();
  const site = (process.env.SITE_URL ?? req.nextUrl.origin).replace(/\/$/, "");
  const back = (ok: boolean, msg: string) => {
    const url = new URL("/admin/letters", site);
    url.searchParams.set(ok ? "done" : "failed", msg.slice(0, 160));
    url.hash = "manage";
    return NextResponse.redirect(url, { status: 303 });
  };
  const id = f("id");
  if (!isLetterSwitch(id)) return back(false, "这封信没有开关");
  const on = f("on") === "1";
  const reason = f("reason");
  if ([...reason].length < 2) return back(false, "要写理由");
  if (f("confirm") !== "yes") return back(false, "要勾「确认」");
  const names = AUTO_MAILS.filter((m) => m.switchId === id).map((m) => m.name).join("、") || id;
  const was = letterOn(id);
  setLetterOn(id, on);
  recordOps("letter_switch", `${id} ${was ? "on" : "off"} → ${on ? "on" : "off"}`);
  logAction({ customerId: null, action: "letter_switch", params: { id, op: on ? "on" : "off" }, reason, ok: true, result: `${names}：${on ? "打开" : "关掉"}${was === on ? "（本来就是）" : ""}` });
  return back(true, `${names}已${on ? "打开" : "关掉"}，15 秒内生效`);
}
