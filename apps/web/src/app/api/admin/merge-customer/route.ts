import { NextRequest, NextResponse } from "next/server";
import { ADMIN_COOKIE, isAdmin } from "@/lib/admin-auth";
import { mergeCustomers } from "@/lib/identity";
import { logAction } from "@/lib/admin-actions";

export const runtime = "nodejs";

/**
 * 10-22 同一个人 (Neil: 「由你手动确认后合并帐号」): the owner folds one account into another from the customer page.
 * Needs both ids, a reason, and the 「我确认这是同一个人」 tick; refuses our test account against a reader's.
 * The decision is the owner's alone — nothing here is automatic, and lib/identity keeps the record.
 */
export async function POST(req: NextRequest) {
  const form = await req.formData();
  const key = String(form.get("key") ?? "");
  if (!(await isAdmin(req.cookies.get(ADMIN_COOKIE)?.value, key || null))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  // the form names the two accounts and which way round (dir=in: b → a, dir=out: a → b)
  const a = Number(form.get("a")), b = Number(form.get("b"));
  const out = String(form.get("dir") ?? "in") === "out";
  const into = out ? b : a, from = out ? a : b;
  const reason = String(form.get("reason") ?? "").trim().slice(0, 200);
  const sure = String(form.get("sure") ?? "") === "1";
  if (!Number.isInteger(into) || into <= 0 || !Number.isInteger(from) || from <= 0 || !reason || !sure) {
    return NextResponse.json({ error: "bad_request", detail: "需要两个客户号、原因，并勾选「我确认这是同一个人」" }, { status: 400 });
  }
  const r = mergeCustomers({ into, from, reason, by: "admin" });
  if (!r.ok) {
    const detail = r.why === "same" ? "不能把帐号并进自己" : r.why === "not_found" ? "有一个客户号不存在（可能已经合并过了）" : r.why === "test_mismatch" ? "一个是测试帐号、一个不是，不合并" : "需要原因";
    logAction({ customerId: into, action: "merge", params: { from }, reason, ok: false, result: `没做成：${detail}` });
    return NextResponse.json({ error: r.why, detail }, { status: r.why === "not_found" ? 404 : 409 });
  }
  // 10-23 进度表 107 ④: the merge is in 操作记录 too (lib/identity keeps its own detailed record)
  logAction({ customerId: into, action: "merge", params: { from }, reason, ok: true, result: `#${from} 并入 #${into}` });
  const url = new URL(`/admin/customers/${into}`, (process.env.SITE_URL ?? req.nextUrl.origin).replace(/\/$/, ""));
  if (key) url.searchParams.set("key", key);
  url.searchParams.set("merged", String(from));
  url.hash = "kin";
  return NextResponse.redirect(url, { status: 303 });
}
