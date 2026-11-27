import { NextRequest, NextResponse } from "next/server";
import { ADMIN_COOKIE, isAdmin } from "@/lib/admin-auth";
import { customerDetail, grantAllowance, latestSubscription, recordOps } from "@/lib/db";
import { LIVE_STATUSES } from "@/lib/subscription";

export const runtime = "nodejs";

/**
 * 09-30 补额度 (进度表 24, 客服: #838 「補回兩次」): the owner adds units to a member's current period from the
 * ledger on the customer's page. A reason is required and goes on the ledger and into ops_events. Only a live
 * membership takes a grant; the units reset with the period and never carry. This is NOT a void of a used unit —
 * a delivered reading stays used (sub_uses.voided_at cannot give it back), which is why this exists.
 */
export async function POST(req: NextRequest) {
  const form = await req.formData();
  const key = String(form.get("key") ?? "");
  if (!(await isAdmin(req.cookies.get(ADMIN_COOKIE)?.value, key || null))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const customerId = Number(form.get("customer"));
  const tier = String(form.get("tier") ?? "");
  const units = Number(form.get("units"));
  const reason = String(form.get("reason") ?? "").trim().slice(0, 200);
  const back = String(form.get("back") ?? "/admin/customers");
  if (!Number.isInteger(customerId) || customerId <= 0 || (tier !== "deep" && tier !== "one") || !Number.isInteger(units) || units < 1 || units > 30 || !reason) {
    return NextResponse.json({ error: "bad_request", detail: "需要客户、档位、1–30 的数量和原因" }, { status: 400 });
  }
  if (!customerDetail(customerId)?.customer) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const sub = latestSubscription(customerId);
  if (!sub || !LIVE_STATUSES.has(sub.status)) return NextResponse.json({ error: "not_member", detail: "只对在册会员生效" }, { status: 409 });
  const g = grantAllowance({ customerId, tier, units, reason });
  recordOps("allowance_grant", `#${customerId} ${tier} +${units} ${reason}`);
  const url = new URL(back.startsWith("/admin/") ? back : "/admin/customers", (process.env.SITE_URL ?? req.nextUrl.origin).replace(/\/$/, ""));
  if (key) url.searchParams.set("key", key);
  url.searchParams.set("granted", String(g.id));
  url.hash = "ledger";
  return NextResponse.redirect(url, { status: 303 });
}
