import { NextRequest, NextResponse } from "next/server";
import { ADMIN_COOKIE, isAdmin } from "@/lib/admin-auth";
import { setCapOverride } from "@/lib/caps";
import { logAction } from "@/lib/admin-actions";

export const runtime = "nodejs";

/**
 * 10-22 进度表 94 第三批: change one fair-use cap from /admin/limits (75 ④「正常人碰到就放宽」— no deploy needed). An empty
 * value, or 「恢复默认」, clears it back to the number in lib/caps.ts. Every change is written to ops (`cap_set`).
 */
export async function POST(req: NextRequest) {
  if (!(await isAdmin(req.cookies.get(ADMIN_COOKIE)?.value))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const f = await req.formData().catch(() => null);
  const key = String(f?.get("key") ?? "");
  const raw = String(f?.get("value") ?? "").trim();
  const clear = f?.get("clear") === "1" || raw === "";
  const value = clear ? null : Number(raw);
  const r = setCapOverride(key, value, "admin");
  // 10-23 进度表 109 ②: every change is in 操作记录 too, with the reason when one was written
  const reason = String(f?.get("reason") ?? "").trim().slice(0, 300) || "（没写理由）";
  logAction({ customerId: null, action: "cap_set", params: { key, value: value ?? "默认" }, reason, ok: r.ok, result: r.ok ? `${key}：${r.before ?? "默认"} → ${r.after ?? "默认"}` : `没改成：${r.why}` });
  // 10-23 (Neil saved 问事 20→50 and landed on 「localhost 拒绝了连接」): behind nginx req.url is http://localhost:3201 —
  // the site's own address, as login (09-25) and the other admin forms do
  const to = new URL("/admin/limits", (process.env.SITE_URL ?? req.nextUrl.origin).replace(/\/$/, ""));
  to.searchParams.set(r.ok ? "ok" : "err", r.ok ? key : r.why);
  return NextResponse.redirect(to, 303);
}
