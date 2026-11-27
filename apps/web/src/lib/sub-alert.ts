import { ownerRecipients, sendEmail } from "./email";
import { recordOps, subscriptionByStripeId, type SubscriptionRow } from "./db";
import { homeMinute } from "./clock";
import type { StripeSubscription } from "./stripe";
import { FEEDBACK_LABEL } from "./retain";

/**
 * Tell the owner when a membership changes for the worse (09-22, Neil: 「如果
 * 客户取消了续订，我们会不会收到通知呢？」).
 *
 * The answer was no. The webhook did receive `customer.subscription.updated`
 * and `.deleted` and mirrored them into the database faithfully — so a
 * cancellation was *recorded*, and then sat there. It showed up as a number on
 * the dashboard for anyone who happened to look, and in the Monday digest, up
 * to seven days later. With four members that is four ways to lose a quarter
 * of the recurring revenue without noticing for a week.
 *
 * Only the turns that matter are mailed, and only on the transition — a
 * renewal that goes through, or any other update, stays quiet. Nobody reads an
 * alert that arrives every ten minutes.
 */

type Turn = "canceling" | "gone" | "past_due" | "revived";

/** exported for the tests: which turn this change is, or null for a no-op */
export function turnFor(before: SubscriptionRow | null, after: StripeSubscription, deleted: boolean): Turn | null {
  if (deleted) return "gone";
  // 09-23: Stripe schedules an ending two ways and the dashboard calls both
  // 「取消日期」. Reading only the flag is why kiki0931611144's cancellation
  // (cancel_at set, flag false) arrived by webhook and raised nothing.
  const wasCanceling = before ? before.cancel_at_period_end === 1 || before.cancel_at != null : false;
  const nowCanceling = Boolean(after.cancel_at_period_end) || after.cancel_at != null;
  const wasLive = before ? ["active", "trialing"].includes(before.status) : false;
  const nowLive = ["active", "trialing"].includes(after.status);
  if (!wasCanceling && nowCanceling) return "canceling";
  // they changed their mind before the period ran out — worth knowing too
  if (wasCanceling && !nowCanceling) return "revived";
  if (wasLive && (after.status === "past_due" || after.status === "unpaid")) return "past_due";
  if (!wasLive && nowLive && before) return "revived";
  return null;
}

const HEAD: Record<Turn, string> = {
  canceling: "会员取消了续订",
  gone: "会员已结束",
  past_due: "会员续费扣款失败",
  revived: "会员又续上了",
};

const BODY: Record<Turn, string> = {
  canceling: "他这一期还能用到期满，到期后不再自动扣费。想挽留的话，现在是唯一的窗口。",
  gone: "订阅已经结束，额度停了。",
  past_due: "Stripe 扣不到款（卡过期、余额不足或被银行拒了）。Stripe 会自己重试几次；重试完还不成就会自动结束。",
  revived: "取消撤销了，下一期会照常扣费。",
};

/** what they picked in the portal (09-23: the portal now asks); the portal has no 「为什么」 when they skip it */
function reasonLine(s: StripeSubscription): string {
  const f = s.cancellation_details?.feedback;
  const c = s.cancellation_details?.comment;
  if (!f && !c) return "没填";
  return [f ? FEEDBACK_LABEL[f] ?? f : null, c ? `「${c.slice(0, 200)}」` : null].filter(Boolean).join(" ");
}

function nowEnding(s: StripeSubscription): boolean {
  return Boolean(s.cancel_at_period_end) || s.cancel_at != null;
}

export async function alertSubscriptionTurn(
  s: StripeSubscription,
  before: SubscriptionRow | null,
  deleted = false,
  extra: string[] = [],
): Promise<void> {
  const turn = turnFor(before, s, deleted);
  if (!turn) return;

  const to = ownerRecipients();
  const row = subscriptionByStripeId(s.id);
  const price = s.items?.data?.[0]?.price;
  const money = price?.unit_amount != null
    ? `${(price.currency ?? "usd").toUpperCase()} ${(price.unit_amount / 100).toFixed(2)}/${price.recurring?.interval === "year" ? "年" : "月"}`
    : "—";
  const endsAt = s.cancel_at ?? s.items?.data?.[0]?.current_period_end ?? s.current_period_end;
  const lines = [
    HEAD[turn],
    "",
    BODY[turn],
    "",
    `会员　　${row?.plan === "year" ? "年付" : "月付"} · ${money}`,
    `本期到　${endsAt ? homeMinute(endsAt * 1000) : "—"}`,
    `状态　　${s.status}${nowEnding(s) ? " · 已排定结束" : ""}${s.pause_collection ? " · 暂停扣款中" : ""}`,
    ...(turn === "canceling" ? [`原因　　${reasonLine(s)}`] : []),
    ...extra,
    "",
    "客户档案：https://yaoflow.com/admin/customers" + (row?.customer_id ? `/${row.customer_id}` : ""),
  ];
  const text = lines.join("\n");
  const html = `<pre style="font:14px/1.7 ui-monospace,monospace;white-space:pre-wrap">${text.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]!))}</pre>`;

  const sent = await sendEmail(to, `YaoFlow · ${HEAD[turn]}`, html, text, { kind: "sub_alert", customerId: row?.customer_id ?? null });
  recordOps("sub_alert", `${turn} ${s.id} ${sent.ok ? "sent" : "failed:" + (sent.error ?? "?")}`);
}
