import { NextRequest, NextResponse } from "next/server";
import { ADMIN_COOKIE, isAdmin } from "@/lib/admin-auth";
import { setOrdersTest } from "@/lib/db";

export const runtime = "nodejs";

/**
 * Dashboard bookkeeping (09-12): mark the ticked readings as our own test runs
 * (or unmark them). Flagged rows are dimmed in Recent readings and left out of
 * the per-market numbers; nothing customer-facing changes. ADMIN_KEY in the form.
 */
export async function POST(req: NextRequest) {
  const form = await req.formData();
  const key = String(form.get("key") ?? "");
  if (!(await isAdmin(req.cookies.get(ADMIN_COOKIE)?.value, typeof key === "string" ? key : null))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const ids = form.getAll("sid").map(String).filter((s) => /^[A-Za-z0-9_:-]{4,120}$/.test(s)).slice(0, 200);
  const flag = String(form.get("do") ?? "set") !== "unset";
  if (ids.length) setOrdersTest(ids, flag);
  const back = String(form.get("back") ?? "/admin");
  const url = new URL(back, (process.env.SITE_URL ?? req.nextUrl.origin).replace(/\/$/, ""));
  url.searchParams.set("key", key);
  return NextResponse.redirect(url, { status: 303 });
}
