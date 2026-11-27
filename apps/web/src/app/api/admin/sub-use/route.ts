import { NextRequest, NextResponse } from "next/server";
import { ADMIN_COOKIE, isAdmin } from "@/lib/admin-auth";
import { recordOps, setSubUseVoid } from "@/lib/db";

export const runtime = "nodejs";

/**
 * 09-29 对账: return one member allowance unit (void) or put it back (restore),
 * from the ledger on a customer's page. Nothing is deleted — the row stays on
 * the ledger with who/why, it just stops counting.
 */
export async function POST(req: NextRequest) {
  const form = await req.formData();
  const key = String(form.get("key") ?? "");
  if (!(await isAdmin(req.cookies.get(ADMIN_COOKIE)?.value, key || null))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const id = Number(form.get("id"));
  const action = String(form.get("action") ?? "");
  const back = String(form.get("back") ?? "/admin/customers");
  if (!Number.isInteger(id) || id <= 0 || (action !== "void" && action !== "restore")) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const reason = action === "void" ? `后台手动退回：${String(form.get("reason") ?? "").trim().slice(0, 120) || "未写原因"}` : null;
  if (!setSubUseVoid(id, reason)) return NextResponse.json({ error: "not_found" }, { status: 404 });
  recordOps(action === "void" ? "sub_use_void" : "sub_use_restore", `#${id} ${reason ?? ""}`.trim());
  const url = new URL(back.startsWith("/admin/") ? back : "/admin/customers", (process.env.SITE_URL ?? req.nextUrl.origin).replace(/\/$/, ""));
  if (key) url.searchParams.set("key", key);
  url.hash = "ledger";
  return NextResponse.redirect(url, { status: 303 });
}
