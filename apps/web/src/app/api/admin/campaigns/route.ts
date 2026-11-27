import { NextRequest, NextResponse } from "next/server";
import { ADMIN_COOKIE, isAdmin } from "@/lib/admin-auth";
import { logAction } from "@/lib/admin-actions";
import { audience, campaign, saveCampaign, scheduleCampaign, segmentFrom, segmentLine, segmentOf, stopCampaign, testCampaign, unknownMarks } from "@/lib/campaigns";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * 10-23 进度表 107 ③ 分群群发 (/admin/segments), admin only. One form, `op`:
 *   save      — a new draft, or an edit of a draft (an edit needs a new test letter)
 *   copy      — a finished or stopped one as a new draft
 *   test      — the two test letters, to us only (DIGEST_TO)
 *   schedule  — let it go from a time (北京时间), in batches; only a tested draft with no unknown marks, the box ticked and
 *               the number of people typed again (it must match the count now)
 *   stop      — what has not gone out stays unsent
 * Test, schedule and stop are written to 操作记录 (admin_actions, no customer).
 */
export async function POST(req: NextRequest) {
  const form = await req.formData();
  const key = String(form.get("key") ?? "");
  if (!(await isAdmin(req.cookies.get(ADMIN_COOKIE)?.value, key || null))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const f = (k: string) => String(form.get(k) ?? "");
  const site = (process.env.SITE_URL ?? req.nextUrl.origin).replace(/\/$/, "");
  const op = f("op");
  const back = (id: number | null, ok: boolean, msg: string) => {
    const url = new URL("/admin/segments", site);
    if (id) url.searchParams.set("id", String(id));
    url.searchParams.set(ok ? "done" : "failed", msg.slice(0, 200));
    url.hash = ok && op === "save" ? "preview" : "send";
    return NextResponse.redirect(url, { status: 303 });
  };
  const id = Number(f("id")) || null;

  if (op === "save") {
    if (!f("subject_hant").trim() || !f("body_hant").trim()) return back(id, false, "繁体的主旨和正文都要写");
    try {
      const nid = saveCampaign({
        id, name: f("name"), segment: segmentFrom({ standing: f("standing"), days: f("days"), locale: f("locale"), currency: f("currency"), product: f("product") }),
        subjectHant: f("subject_hant"), subjectHans: f("subject_hans"), bodyHant: f("body_hant"), bodyHans: f("body_hans"), perRun: Number(f("per_run")) || 150,
      });
      const marks = [...unknownMarks(f("body_hant")), ...unknownMarks(f("body_hans")), ...unknownMarks(f("subject_hant"))];
      return back(nid, true, marks.length ? `已存草稿；有看不懂的记号：${[...new Set(marks)].join("、")}` : "已存草稿，看一下预览，再寄测试信给自己");
    } catch (e) {
      return back(id, false, e instanceof Error && e.message === "not_a_draft" ? "这封已经开始寄了，不能改（可以「复制成新草稿」）" : "没存成");
    }
  }

  const c = id ? campaign(id) : null;
  if (!c) return back(null, false, "找不到这封群发");

  if (op === "copy") {
    const nid = saveCampaign({ name: `${c.name}（复制）`, segment: segmentOf(c), subjectHant: c.subject_hant, subjectHans: c.subject_hans, bodyHant: c.body_hant, bodyHans: c.body_hans, perRun: c.per_run });
    return back(nid, true, `复制成新草稿 #${nid}`);
  }

  if (op === "test") {
    if (c.status !== "draft") return back(c.id, false, "已经在寄或寄完了，不用再测试");
    const r = await testCampaign(c.id, site).catch((e: unknown) => ({ sent: 0, error: e instanceof Error ? e.message : String(e) }));
    logAction({ customerId: null, action: "campaign", params: { campaign: c.id, op: "test" }, reason: "寄测试信给自己", ok: r.sent > 0, result: r.sent > 0 ? `#${c.id} 测试信 ${r.sent} 封（繁体会员＋通卡、简体没付过钱）寄给我们` : `#${c.id} 测试信没寄出去` });
    return back(c.id, r.sent > 0, r.sent > 0 ? `测试信 ${r.sent} 封寄给你了（繁体·会员＋通卡、简体·没付过钱各一封）；看过没问题再排时间` : "测试信没寄出去，看一下寄信设定");
  }

  if (op === "schedule") {
    const reason = f("reason").trim();
    if (f("confirm") !== "yes") return back(c.id, false, "要勾「确认」才会排");
    if ([...reason].length < 2) return back(c.id, false, "要写一句为什么寄");
    const n = audience(segmentOf(c)).recipients.length;
    if (Number(f("confirm_count")) !== n) return back(c.id, false, `人数再打一次要对得上（现在是 ${n} 人）`);
    // 北京时间 「2026-10-24T10:00」 → ms; empty = now
    const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(f("at").trim());
    const at = m ? Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!, +m[4]!, +m[5]!) - 8 * 3_600_000 : Date.now();
    const r = scheduleCampaign(c.id, at);
    const why = r.error === "not_tested" ? "还没寄测试信（改过以后要再寄一次）" : r.error === "unknown_marks" ? "信里有看不懂的记号，先改掉" : r.error === "not_a_draft" ? "这封已经排过了" : r.error ?? "";
    logAction({ customerId: null, action: "campaign", params: { campaign: c.id, op: "schedule", at: m ? f("at") : "now" }, reason, ok: r.ok, result: r.ok ? `#${c.id}「${c.name}」→ ${segmentLine(segmentOf(c))}，${r.planned} 人` : `没排成：${why}` });
    return back(c.id, r.ok, r.ok ? `排好了：${r.planned} 人，分批寄（每 10 分钟最多 ${c.per_run} 封，北京时间 9–21 点）` : why);
  }

  if (op === "stop") {
    const ok = stopCampaign(c.id);
    logAction({ customerId: null, action: "campaign", params: { campaign: c.id, op: "stop" }, reason: f("reason").trim() || "停止", ok, result: ok ? `#${c.id} 停了，已寄 ${c.sent} 封，其余不寄` : `#${c.id} 不在寄的状态` });
    return back(c.id, ok, ok ? "停了，还没寄的不会再寄" : "这封不在寄的状态");
  }

  return back(c.id, false, "不认得这个动作");
}
