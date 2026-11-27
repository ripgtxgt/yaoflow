import { NextRequest, NextResponse } from "next/server";
import { ADMIN_COOKIE, isAdmin } from "@/lib/admin-auth";
import { addVariant, ALL_SLOTS, draftVariants, setVariantStatus, variantById, type Slot } from "@/lib/nudge";
import { asLocale } from "@/lib/locales";
import { recordOps } from "@/lib/db";
import { startAiReview } from "@/lib/ai-review";

export const runtime = "nodejs";
export const maxDuration = 90;

/** 10-03 付费话术学习: the dashboard's three buttons — a variant's status, draft now, add one by hand (lib/nudge.ts). */
export async function POST(req: NextRequest) {
  const form = await req.formData();
  const key = String(form.get("key") ?? "");
  if (!(await isAdmin(req.cookies.get(ADMIN_COOKIE)?.value, key || null))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const action = String(form.get("action") ?? "");
  let msg = "";
  if (action === "status") {
    const id = String(form.get("id") ?? "");
    const status = String(form.get("status") ?? "");
    if (!variantById(id) || !["active", "draft", "retired"].includes(status)) return NextResponse.json({ error: "bad_request" }, { status: 400 });
    setVariantStatus(id, status as "active" | "draft" | "retired", "dashboard");
    recordOps("nudge_status", `${id} → ${status}`);
    msg = `${id} 已改为${status === "active" ? "上线" : status === "draft" ? "待定" : "退役"}`;
  } else if (action === "draft") {
    const slot = String(form.get("slot") ?? "") as Slot;
    if (!ALL_SLOTS.includes(slot)) return NextResponse.json({ error: "bad_slot" }, { status: 400 });
    const r = await draftVariants(slot, asLocale(String(form.get("locale") ?? "zh-hant")), { by: "dashboard" });
    msg = r.error
      ? `起草失败：${r.error}`
      : `起草了 ${r.created.length} 个（${r.created.map((c) => `${c.id}：${c.status === "active" ? "已上线" : "待定"}`).join("，") || "无"}）${r.rejected.length ? `，${r.rejected.length} 个没过检查：${r.rejected.map((x) => x.why.join("/")).join("；").slice(0, 200)}` : ""}`;
  } else if (action === "review") {
    // 10-03 AI 每周分析: start one now; it runs in the background and the report appears on the page when done
    const r = startAiReview({ by: "dashboard" });
    msg = r.started ? `AI 分析 #${r.id} 已开始，大约 2–4 分钟，之后刷新这一页看报告` : r.why === "running" ? `已经有一份在跑（#${r.id}），等它跑完` : `没开始：${r.why}`;
  } else if (action === "add") {
    const slot = String(form.get("slot") ?? "") as Slot;
    if (!["n1", "n2", "n3", "n4"].includes(slot)) return NextResponse.json({ error: "bad_slot" }, { status: 400 });
    const r = addVariant(slot as "n1" | "n2" | "n3" | "n4", asLocale(String(form.get("locale") ?? "zh-hant")), {
      title: String(form.get("title") ?? "").trim(), body: String(form.get("body") ?? "").trim(), cta: String(form.get("cta") ?? "").trim(),
    }, Date.now(), String(form.get("topic") ?? "") || null);
    msg = r.id ? `已加上并上线：${r.id}` : `没加上：${r.why.join("；")}`;
  } else {
    return NextResponse.json({ error: "bad_action" }, { status: 400 });
  }
  const url = new URL("/admin/nudges", (process.env.SITE_URL ?? req.nextUrl.origin).replace(/\/$/, ""));
  if (key) url.searchParams.set("key", key);
  url.searchParams.set("msg", msg.slice(0, 400));
  return NextResponse.redirect(url, { status: 303 });
}
