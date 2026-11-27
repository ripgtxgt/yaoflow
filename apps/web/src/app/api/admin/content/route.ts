import { NextRequest, NextResponse } from "next/server";
import { ADMIN_COOKIE, isAdmin } from "@/lib/admin-auth";
import { featureCase, fixOutcome, OUTCOMES, setCaseHidden, type Outcome } from "@/lib/content-admin";
import { PUBLIC_ID_RE } from "@/lib/cases";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 10-23 进度表 108 ② 内容整理 (admin only), one form, `op`:
 *   feature / unfeature — 精选 a public case or take it off;  hide / show — 撤下 or 恢复 it;
 *   fix — set a check-in's result right (`revisit_id`, `to` = hit / partial / miss / unclear / open / pending).
 * Each needs a reason and the box ticked; each is written to 操作记录 (lib/content-admin.ts).
 */
export async function POST(req: NextRequest) {
  const form = await req.formData();
  const key = String(form.get("key") ?? "");
  if (!(await isAdmin(req.cookies.get(ADMIN_COOKIE)?.value, key || null))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const f = (k: string) => String(form.get(k) ?? "").trim();
  const site = (process.env.SITE_URL ?? req.nextUrl.origin).replace(/\/$/, "");
  const op = f("op");
  const backPath = f("back").startsWith("/admin") ? f("back") : op === "fix" ? "/admin/outcomes#check" : "/admin/cases";
  const back = (ok: boolean, msg: string) => {
    const url = new URL(backPath, site);
    url.searchParams.set(ok ? "done" : "failed", msg.slice(0, 160));
    return NextResponse.redirect(url, { status: 303 });
  };
  const reason = f("reason");
  if ([...reason].length < 2) return back(false, "要写理由");
  if (f("confirm") !== "yes") return back(false, "要勾「确认」");

  if (op === "feature" || op === "unfeature" || op === "hide" || op === "show") {
    const id = f("public_id");
    if (!PUBLIC_ID_RE.test(id)) return back(false, "卦例编号不对");
    const r = op === "feature" || op === "unfeature" ? featureCase(id, op === "feature", reason) : setCaseHidden(id, op === "hide", reason);
    return back(r.ok, r.ok ? r.result : r.error);
  }
  if (op === "fix") {
    const rid = Number(f("revisit_id"));
    const to = f("to");
    if (!Number.isInteger(rid) || rid <= 0) return back(false, "回访编号不对");
    if (to !== "pending" && !(OUTCOMES as readonly string[]).includes(to)) return back(false, "不认得这个状态");
    const r = fixOutcome(rid, to === "pending" ? null : (to as Outcome), reason);
    return back(r.ok, r.ok ? `回访 #${rid}：${r.result}` : r.error);
  }
  return back(false, "不认得这个动作");
}
