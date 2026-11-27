import { NextRequest, NextResponse } from "next/server";
import { ADMIN_COOKIE, isAdmin } from "@/lib/admin-auth";
import { toMinor } from "@/lib/admin-actions";
import { createPromo, setPromoActive } from "@/lib/promos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 北京时间 「2026-11-01T00:00」 → ms; empty → null */
const tpe = (v: string): number | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(v.trim());
  return m ? Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!, +m[4]!, +m[5]!) - 8 * 3_600_000 : null;
};

/**
 * 10-23 进度表 109 ① 优惠码 (/admin/promos), admin only. `op`:
 *   create — a Stripe coupon and our rules (which products, from / until, how many uses, the campaign tag)
 *   on / off — whether checkouts apply it
 * Each needs a reason and the box ticked; each is written to 操作记录. Making one creates a coupon in Stripe (no money
 * moves until a reader pays with it).
 */
export async function POST(req: NextRequest) {
  const form = await req.formData();
  const key = String(form.get("key") ?? "");
  if (!(await isAdmin(req.cookies.get(ADMIN_COOKIE)?.value, key || null))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const f = (k: string) => String(form.get(k) ?? "").trim();
  const site = (process.env.SITE_URL ?? req.nextUrl.origin).replace(/\/$/, "");
  const back = (ok: boolean, msg: string, hash = "list") => {
    const url = new URL("/admin/promos", site);
    url.searchParams.set(ok ? "done" : "failed", msg.slice(0, 200));
    url.hash = hash;
    return NextResponse.redirect(url, { status: 303 });
  };
  const reason = f("reason");
  if ([...reason].length < 2) return back(false, "要写理由", "new");
  if (f("confirm") !== "yes") return back(false, "要勾「确认」", "new");
  const op = f("op");
  if (op === "create") {
    const kind = f("kind") === "amount" ? "amount" : "percent";
    const currency = f("currency").toUpperCase();
    const value = kind === "percent" ? Number(f("value")) : toMinor(f("value"), currency || "USD") ?? 0;
    const r = await createPromo({
      code: f("code"), kind, value, currency: kind === "amount" ? currency : null, products: form.getAll("products").map(String), campaign: f("campaign") || null,
      startsAt: tpe(f("starts")), endsAt: tpe(f("ends")), maxUses: f("max_uses") ? Number(f("max_uses")) : null, reason, note: f("note") || null,
    });
    return r.ok ? back(true, `${r.promo.code} 建好了（Stripe ${r.promo.stripe_coupon_id}）——下面有活动连结`) : back(false, r.error, "new");
  }
  if (op === "on" || op === "off") {
    const r = await setPromoActive(Number(f("id")), op === "on", reason);
    return back(r.ok, r.ok ? (op === "on" ? "已打开" : "已停用，结账不再套用") : r.error);
  }
  return back(false, "不认得这个动作");
}
