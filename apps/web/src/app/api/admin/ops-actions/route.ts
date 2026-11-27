import { NextRequest, NextResponse } from "next/server";
import { ADMIN_COOKIE, isAdmin } from "@/lib/admin-auth";
import { decide, describeAction, getAction, type Decision } from "@/lib/ops-actions";
import { logAction } from "@/lib/admin-actions";

export const runtime = "nodejs";

/**
 * 10-28 进度表 119: the owner's answer to one 運營動作 (lib/ops-actions.ts) from the admin home —
 *   approve 批准（跑七天）· reject 不要 · revoke 撤回 · keep 長期保留 · stop 停掉保留的
 * Every answer lands in 操作记录 (ops_action).
 */
const DECISIONS: Decision[] = ["approve", "reject", "revoke", "keep", "stop"];
export async function POST(req: NextRequest) {
  if (!(await isAdmin(req.cookies.get(ADMIN_COOKIE)?.value))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const f = await req.formData().catch(() => null);
  const id = Number(f?.get("id") ?? 0);
  const what = String(f?.get("do") ?? "") as Decision;
  const to = new URL("/admin#actions", (process.env.SITE_URL ?? req.nextUrl.origin).replace(/\/$/, ""));
  if (!id || !DECISIONS.includes(what)) { to.searchParams.set("err", "bad"); return NextResponse.redirect(to, 303); }
  const a = getAction(id);
  const r = decide(id, what);
  logAction({ customerId: null, action: "ops_action", params: { id, do: what }, reason: a ? describeAction(a) : "", ok: r.ok, result: r.ok ? `#${id} → ${r.status}` : `没改成：${r.why}` });
  to.searchParams.set(r.ok ? "ok" : "err", r.ok ? `${id}` : r.why);
  return NextResponse.redirect(to, 303);
}
