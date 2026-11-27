import { NextRequest, NextResponse } from "next/server";
import { ADMIN_COOKIE, isAdmin } from "@/lib/admin-auth";
import { addCost, deleteCost } from "@/lib/db";

export const runtime = "nodejs";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The cost rows behind the profit line (admin only). Two kinds: `monthly`
 * (server, Resend, domain — prorated over whatever period the page is showing)
 * and `once` (a one-off bill on a given day). Stripe's fees are NOT entered
 * here: those come from each charge's balance transaction (lib/ledger.ts).
 */
export async function POST(req: NextRequest) {
  const form = await req.formData();
  const key = String(form.get("key") ?? "");
  if (!(await isAdmin(req.cookies.get(ADMIN_COOKIE)?.value, key))) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const action = String(form.get("action") ?? "add");
  if (action === "delete") {
    const id = Number(form.get("id"));
    if (Number.isInteger(id) && id > 0) deleteCost(id);
  } else {
    const kind = String(form.get("kind") ?? "monthly") === "once" ? "once" : "monthly";
    const label = String(form.get("label") ?? "").trim();
    const amount = Number(String(form.get("amount") ?? "").trim());
    const currency = String(form.get("currency") ?? "USD").trim().toUpperCase();
    const on = String(form.get("on") ?? "").trim();
    const note = String(form.get("note") ?? "").trim();
    if (label && Number.isFinite(amount) && amount > 0 && /^[A-Z]{3}$/.test(currency)) {
      addCost({
        kind,
        label,
        amountCents: Math.round(amount * 100),
        currency,
        ...(kind === "monthly" ? { startedOn: DATE.test(on) ? on : null } : { spentOn: DATE.test(on) ? on : null }),
        note: note || null,
      });
    }
  }

  const back = String(form.get("back") ?? "/admin/finance");
  const url = new URL(back, (process.env.SITE_URL ?? req.nextUrl.origin).replace(/\/$/, ""));
  return NextResponse.redirect(url, { status: 303 });
}
