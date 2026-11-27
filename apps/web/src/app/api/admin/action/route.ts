import { NextRequest, NextResponse } from "next/server";
import { ADMIN_COOKIE, isAdmin } from "@/lib/admin-auth";
import { customerDetail, orderBySession } from "@/lib/db";
import { ACTION_ZH, credit, endNow, extend, grantPass, logAction, refund, resend, setTestFlag, toMinor, type ActionName, type ActionResult } from "@/lib/admin-actions";
import type { RefundReason } from "@/lib/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ACTIONS = new Set<ActionName>(["grant_pass", "extend", "credit", "refund", "resend", "test_flag", "note", "end_now"]);
const REASONS = new Set<RefundReason>(["technical_failure", "duplicate", "requested", "other"]);

/**
 * 10-23 进度表 107 ② the customer page's buttons (admin only). Every action needs:
 *   reason   — why, in words (at least two characters), kept with the action;
 *   confirm  — the second confirmation, a box ticked by hand;
 *   for money (refund, credit) the amount typed a second time — `confirm_amount` must equal `amount` (a full refund: the
 *   order's own amount).
 * Whatever happens is written to admin_actions — a refusal from Stripe too — and the page comes back with the result.
 */
export async function POST(req: NextRequest) {
  const form = await req.formData();
  const key = String(form.get("key") ?? "");
  if (!(await isAdmin(req.cookies.get(ADMIN_COOKIE)?.value, key || null))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const f = (k: string) => String(form.get(k) ?? "").trim();
  const customerId = Number(f("customer_id"));
  const action = f("action") as ActionName;
  const reason = f("reason");
  const site = (process.env.SITE_URL ?? req.nextUrl.origin).replace(/\/$/, "");
  const back = (() => { const b = f("back"); return b.startsWith("/admin") ? b : `/admin/customers/${customerId}`; })();
  const done = (ok: boolean, msg: string, id?: number) => {
    const url = new URL(back, site);
    url.searchParams.set(ok ? "done" : "failed", msg.slice(0, 160));
    if (id) url.searchParams.set("action", String(id));
    url.hash = "ops";
    return NextResponse.redirect(url, { status: 303 });
  };
  if (!Number.isInteger(customerId) || customerId <= 0 || !customerDetail(customerId).customer) return done(false, "找不到这个客户");
  if (!ACTIONS.has(action)) return done(false, "不认得这个动作");
  if ([...reason].length < 2) return done(false, `${ACTION_ZH[action]}：要写理由`);
  if (f("confirm") !== "yes") return done(false, `${ACTION_ZH[action]}：要勾「确认」才会做`);

  const params: Record<string, unknown> = {};
  for (const k of ["days", "start", "sub_id", "amount", "session_id", "kind", "ref", "on", "reason_code"]) { const v = f(k); if (v) params[k] = v; }

  // money is typed twice
  if (action === "credit" || action === "refund") {
    const amount = f("amount");
    let want = amount;
    if (action === "refund" && !amount) {
      const o = orderBySession(f("session_id"));
      want = o?.amount_cents ? String((o.currency ?? "").toUpperCase() === "JPY" || (o.currency ?? "").toUpperCase() === "KRW" ? o.amount_cents : o.amount_cents / 100) : "";
    }
    const a = toMinor(want || "0", "USD"), b = toMinor(f("confirm_amount") || "0", "USD");
    if (!a || a !== b) return done(false, `${ACTION_ZH[action]}：第二次输入的金额对不上（要再输入一次 ${want || "金额"}）`);
  }

  let r: ActionResult;
  try {
    switch (action) {
      case "grant_pass": {
        const days = Number(f("days"));
        if (days !== 1 && days !== 7 && days !== 30) { r = { ok: false, error: "通卡只有 1／7／30 天" }; break; }
        r = grantPass(customerId, days, f("start") === "after" ? "after" : "now");
        break;
      }
      case "extend": r = await extend(customerId, Number(f("sub_id")), Number(f("days"))); break;
      case "credit": r = await credit(customerId, Number(f("sub_id")), f("amount"), reason); break;
      case "refund": {
        const code = f("reason_code") as RefundReason;
        r = await refund(customerId, f("session_id"), f("amount") || null, REASONS.has(code) ? code : "requested");
        break;
      }
      case "resend": {
        // the page sends one choice, 「welcome:12」 / 「reading:cs_…」 / 「revisit:34」
        let kind = f("kind"), ref = f("ref");
        if (!kind && ref.includes(":")) { kind = ref.slice(0, ref.indexOf(":")); ref = ref.slice(ref.indexOf(":") + 1); }
        r = kind === "welcome" || kind === "reading" || kind === "revisit" ? await resend(customerId, kind, ref, site) : { ok: false, error: "不认得这种信" };
        break;
      }
      case "end_now": r = await endNow(customerId, Number(f("sub_id"))); break;
      case "test_flag": r = setTestFlag(customerId, f("on") === "1"); break;
      case "note": r = { ok: true, result: "已记下" }; break;
    }
  } catch (e) {
    r = { ok: false, error: (e instanceof Error ? e.message : String(e)).slice(0, 300) };
  }
  const id = logAction({ customerId, action, params, reason, ok: r.ok, result: r.ok ? r.result : `没做成：${r.error}`, stripeRef: r.ok ? r.stripeRef ?? null : null });
  return done(r.ok, r.ok ? `${ACTION_ZH[action]}：${r.result}` : `${ACTION_ZH[action]}没做成：${r.error}`, id);
}
