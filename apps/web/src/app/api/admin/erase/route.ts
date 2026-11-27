import { NextRequest, NextResponse } from "next/server";
import { ADMIN_COOKIE, isAdmin } from "@/lib/admin-auth";
import { customerEmailById, customerLocaleById, eraseCustomer } from "@/lib/db";
import { sendEraseConfirm, sendErased } from "@/lib/erase-letters";
import { logAction } from "@/lib/admin-actions";

export const runtime = "nodejs";

/**
 * 「删除此客户全部数据」 (09-25 合规, 隐私政策 §4 删除权). Admin only; the form
 * must repeat the customer's address exactly so a stray click cannot do it.
 * Orders stay as an anonymised accounting record — see eraseCustomer.
 *
 * 10-23 进度表 111 ③: `step=confirm` sends the reader the letter that says what will go and asks for a reply first (no
 * typed address needed — it deletes nothing); the deletion itself then sends 「已刪除」 to the address it had.
 */
export async function POST(req: NextRequest) {
  const form = await req.formData();
  const key = String(form.get("key") ?? "");
  if (!(await isAdmin(req.cookies.get(ADMIN_COOKIE)?.value, key || null))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const id = Number(form.get("customer_id"));
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "bad id" }, { status: 400 });
  const email = customerEmailById(id);
  if (!email) return NextResponse.json({ error: "no such customer" }, { status: 404 });
  const site = (process.env.SITE_URL ?? req.nextUrl.origin).replace(/\/$/, "");

  if (String(form.get("step") ?? "") === "confirm") {
    const r = await sendEraseConfirm(id);
    logAction({ customerId: id, action: "erase_confirm", reason: "读者要求删除帐号", ok: r.ok, result: r.ok ? "删除确认信已寄出" : `寄不出去：${r.error ?? "?"}` });
    const back = new URL(`/admin/customers/${id}`, site);
    if (key) back.searchParams.set("key", key);
    back.searchParams.set(r.ok ? "done" : "failed", r.ok ? "删除确认信已寄出，等读者回信确认后再删" : `删除确认信没寄出：${r.error ?? "?"}`);
    return NextResponse.redirect(back, { status: 303 });
  }

  // 10-23 (Neil: 「我想删除她的资料，也是直接 bug」): a refusal came back as a bare JSON page — now the customer page,
  // with the reason in words where the other buttons put theirs
  const refuse = (why: string) => {
    const back = new URL(`/admin/customers/${id}`, site);
    if (key) back.searchParams.set("key", key);
    back.searchParams.set("failed", why.slice(0, 200));
    back.hash = "ops";
    return NextResponse.redirect(back, { status: 303 });
  };
  const typed = String(form.get("confirm") ?? "").trim().toLowerCase();
  if (typed !== email.toLowerCase()) return refuse("没删：确认框里的邮箱和这个帐号的不一样（要一字不差地输入）");
  const locale = customerLocaleById(id);
  const r = eraseCustomer(id);
  if (!r.ok) {
    logAction({ customerId: id, action: "erase", reason: "读者要求删除帐号", ok: false, result: r.error ?? "没删" });
    return refuse(r.error ?? "没删");
  }
  // the last letter, to the address the account had (nothing of it is kept)
  const told = await sendErased(email, locale).catch(() => false);
  logAction({ customerId: id, action: "erase", reason: "读者要求删除帐号", ok: true, result: `已删除（卦 ${r.casts ?? 0}、订单匿名化 ${r.orders ?? 0}）${told ? "，「已删除」信已寄" : "，「已删除」信没寄出"}` });
  const url = new URL("/admin/customers", site);
  if (key) url.searchParams.set("key", key);
  url.searchParams.set("erased", String(id));
  return NextResponse.redirect(url, { status: 303 });
}
