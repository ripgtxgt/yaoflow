import { NextRequest, NextResponse } from "next/server";
import { ADMIN_COOKIE, isAdmin } from "@/lib/admin-auth";
import { logAction } from "@/lib/admin-actions";
import { addNote, approvePost, createTask, getPost, PLATFORMS, rejectPost, setTaskStatus, unschedulePost, wakeBot, type BotPlatform, type TaskStatus } from "@/lib/ops-bot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 台北时间「2026-12-01T09:30」→ ms */
const tpe = (v: string): number | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(v.trim());
  return m ? Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!, +m[4]!, +m[5]!) - 8 * 3_600_000 : null;
};

/**
 * 11-27 /admin/bot 的动作，管理员才能做。op：
 *   approve（定发布时间）· reject（退回，要理由）· unschedule（已批未发的撤回待审）
 *   note（写批注；勾「要它改」就退回并唤醒 bot）· task（派任务并唤醒 bot）· task_status（标完成／取消）
 * 每一笔进操作记录。
 */
export async function POST(req: NextRequest) {
  const form = await req.formData();
  if (!(await isAdmin(req.cookies.get(ADMIN_COOKIE)?.value, String(form.get("key") ?? "") || null))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const f = (k: string) => String(form.get(k) ?? "").trim();
  const site = (process.env.SITE_URL ?? req.nextUrl.origin).replace(/\/$/, "");
  const back = (ok: boolean, msg: string, hash = "review") => {
    const url = new URL("/admin/bot", site);
    url.searchParams.set(ok ? "done" : "failed", msg.slice(0, 200));
    url.hash = hash;
    return NextResponse.redirect(url, { status: 303 });
  };
  const log = (action: string, params: Record<string, unknown>, reason: string, ok: boolean, result: string) =>
    logAction({ customerId: null, action, params, reason: reason || "—", ok, result });
  const op = f("op");
  const id = f("id");

  if (op === "approve") {
    const when = tpe(f("when"));
    if (when === null) return back(false, "要填发布时间");
    const r = approvePost(id, when, f("reason"));
    log("bot_approve", { id, when }, f("reason"), r.ok, r.error ?? "ok");
    return r.ok ? back(true, "已批准，到点 bot 会发") : back(false, r.error!);
  }
  if (op === "reject" || op === "unschedule") {
    if ([...f("reason")].length < 2) return back(false, "要写理由");
    const r = op === "reject" ? rejectPost(id, f("reason")) : unschedulePost(id, f("reason"));
    log(`bot_${op}`, { id }, f("reason"), r.ok, r.error ?? "ok");
    return r.ok ? back(true, op === "reject" ? "已退回" : "已撤回到待审") : back(false, r.error!);
  }
  if (op === "note") {
    const body = f("body");
    if ([...body].length < 2) return back(false, "批注是空的");
    const ask = f("ask") === "yes";
    const r = addNote(id, body, ask);
    log("bot_note", { id, ask }, body, r.ok, r.error ?? "ok");
    if (!r.ok) return back(false, r.error!);
    if (ask) {
      const p = getPost(id)!;
      const w = await wakeBot({ kind: "revision", post_id: id, platform: p.platform, lang: p.lang, title: p.title, notes: [body], how_to: "get_feedback(post_id) → 按批注改 → check_draft → revise_draft" });
      return back(true, w.ok ? "批注已写，已叫 bot 改" : `批注已写；唤醒 bot 没成功（${w.error ?? w.status}），它下次例行运行会看到`);
    }
    return back(true, "批注已写");
  }
  if (op === "task") {
    const title = f("title"), brief = f("brief");
    const platforms = form.getAll("platforms").map(String).filter((x): x is BotPlatform => (PLATFORMS as string[]).includes(x));
    if (title.length < 2 || brief.length < 5 || !platforms.length) return back(false, "标题、说明、平台都要填", "tasks");
    const t = createTask({ title, brief, platforms, due_at: tpe(f("due")) });
    log("bot_task", { id: t.id, title, platforms }, brief.slice(0, 200), true, "ok");
    const w = await wakeBot({ kind: "task", task_id: t.id, title, brief, platforms, due_at: t.due_at ? new Date(t.due_at).toISOString() : null, how_to: "get_guidelines → start_task(task_id) → 写稿 → check_draft → submit_draft（带 task_id）" });
    return back(true, w.ok ? "任务已派，bot 已被叫醒" : `任务已派；唤醒 bot 没成功（${w.error ?? w.status}），它下次例行运行会看到`, "tasks");
  }
  if (op === "task_status") {
    const s = f("status") as TaskStatus;
    if (!["done", "cancelled", "open"].includes(s)) return back(false, "状态不对", "tasks");
    setTaskStatus(id, s);
    log("bot_task_status", { id, status: s }, f("reason"), true, "ok");
    return back(true, "已更新", "tasks");
  }
  return back(false, "不认得这个动作");
}
