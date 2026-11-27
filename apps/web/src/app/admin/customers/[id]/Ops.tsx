import { db, type SubscriptionRow } from "@/lib/db";
import { ACTION_ZH, actionsFor } from "@/lib/admin-actions";
import { homeMinute } from "@/lib/clock";
import { formatMoney, isCurrency } from "@/lib/money";
import { tierLabelZh } from "@/lib/catalog";

/**
 * 10-23 进度表 107 ② the customer page's 「运营动作」: 补通卡、延期、存会员费抵扣、退款、重寄信、标测试／自己、备注 — each a small form
 * that asks twice (a box to tick; for money the amount typed again) and needs a reason; and ④ this customer's line of
 * everything done to them (admin_actions). Posts to /api/admin/action; the page comes back to #ops with the result.
 * Server-rendered forms only — no client code.
 */

const box = "rounded-[2px] border border-black/10 px-3 py-2";
const input = "bg-transparent border border-black/20 rounded-[2px] px-2 py-1 text-sm";
const btn = "border border-[var(--ink)] rounded-[2px] px-3 py-1 text-sm hover:bg-[var(--ink)] hover:text-[var(--paper)]";
const danger = "border border-[var(--cinnabar)] text-[var(--cinnabar)] rounded-[2px] px-3 py-1 text-sm hover:bg-[var(--cinnabar)] hover:text-white";
const money = (c: number | null, cur?: string | null) => {
  if (c == null) return "—";
  const u = (cur ?? "usd").toUpperCase();
  return isCurrency(u) ? formatMoney(u, c, "en") : `${u} ${(c / 100).toFixed(2)}`;
};
const subName = (s: SubscriptionRow) => {
  const sid = s.stripe_subscription_id;
  if (sid.startsWith("pass_")) return `${s.pass_days === 1 ? "1 日" : s.pass_days === 7 ? "7 天" : "30 天"}通卡${sid.startsWith("pass_comp_") ? "（我们送的）" : ""}`;
  if (sid.startsWith("comp_")) return "会员（我们送的）";
  return `会员 · ${s.plan === "year" ? "年付" : "月付"}`;
};

function Common({ customerId, back, action, money: isMoney }: { customerId: number; back: string; action: string; money?: string }) {
  return (
    <>
      <input type="hidden" name="customer_id" value={customerId} />
      <input type="hidden" name="action" value={action} />
      <input type="hidden" name="back" value={back} />
      <label className="flex flex-col gap-1 text-xs opacity-80">理由（必填，会留在操作记录里）
        <input name="reason" required minLength={2} maxLength={300} className={input} placeholder="例：客服 #510 来信，付款后没拿到深断" />
      </label>
      {isMoney && (
        <label className="flex flex-col gap-1 text-xs opacity-80">{isMoney}
          <input name="confirm_amount" required className={`${input} w-32`} inputMode="decimal" />
        </label>
      )}
      <label className="flex items-center gap-2 text-xs"><input type="checkbox" name="confirm" value="yes" required /> 我确认要这么做（第二次确认）</label>
    </>
  );
}

export default function Ops({ customerId, back, done, failed, orders, revisits }: {
  customerId: number; back: string; done?: string; failed?: string;
  orders: { session_id: string; created_at: number; tier: string; amount_cents: number | null; currency: string | null; payment_state?: string | null; status: string }[];
  revisits: { id: number; due_at: number; status: string; outcome: string | null }[];
}) {
  const subs = db().prepare("SELECT * FROM subscriptions WHERE customer_id = ? ORDER BY created_at DESC").all(customerId) as unknown as SubscriptionRow[];
  const test = ((db().prepare("SELECT test_flag AS t FROM customers WHERE id = ?").get(customerId) as { t: number | null } | undefined)?.t ?? 0) === 1;
  const paidOrders = orders.filter((o) => { const st = o.payment_state ?? (o.status === "paid" ? "paid" : o.status); return (st === "paid" || st === "disputed") && (o.amount_cents ?? 0) > 0; });
  // a reading's letter: the reading orders, and a pass bought with its cast (its order row is that reading)
  const readings = orders.filter((o) => ["deep", "one", "light"].includes(o.tier) || o.tier.startsWith("pass_"));
  const memberSubs = subs.filter((s) => s.stripe_subscription_id.startsWith("sub_"));
  const nowMs = Date.now();
  const liveSubs = subs.filter((s) => ["active", "trialing", "past_due", "paused", "scheduled"].includes(s.status) && (s.status === "scheduled" || !s.period_end || s.period_end > nowMs));
  const log = actionsFor(customerId);
  return (
    <section id="ops" className="mb-10 scroll-mt-24">
      <h2 className="text-xs uppercase tracking-widest opacity-40 mb-3">运营动作（进度表 107）</h2>
      {done && <p className="mb-3 text-sm text-emerald-700">✓ {done}</p>}
      {failed && <p className="mb-3 text-sm text-[var(--cinnabar)]">✗ {failed}</p>}
      <div className="grid md:grid-cols-2 gap-3 text-sm">
        <details className={box}>
          <summary className="cursor-pointer">补通卡</summary>
          <form method="post" action="/api/admin/action" className="mt-2 flex flex-col gap-2">
            <div className="flex gap-3 text-xs flex-wrap">
              {[1, 7, 30].map((d) => <label key={d} className="flex items-center gap-1"><input type="radio" name="days" value={d} required defaultChecked={d === 1} /> {d === 1 ? "1 日" : `${d} 天`}</label>)}
            </div>
            <div className="flex gap-3 text-xs flex-wrap">
              <label className="flex items-center gap-1"><input type="radio" name="start" value="now" defaultChecked /> 从现在起</label>
              <label className="flex items-center gap-1"><input type="radio" name="start" value="after" /> 接在手上那张后面</label>
            </div>
            <Common customerId={customerId} back={back} action="grant_pass" />
            <button className={btn}>补这张通卡</button>
            <p className="text-[11px] opacity-50">不收钱、没有订单；不算进付费。要不要另外寄开通信，用下面的「重寄信」。</p>
          </form>
        </details>

        <details className={box}>
          <summary className="cursor-pointer">延期（通卡或会员）</summary>
          {subs.length === 0 ? <p className="mt-2 text-xs opacity-50">这个人没有通卡也不是会员。</p> : (
            <form method="post" action="/api/admin/action" className="mt-2 flex flex-col gap-2">
              <select name="sub_id" required className={input}>
                {subs.map((s) => <option key={s.id} value={s.id}>{subName(s)} · {s.status} · 到 {s.period_end ? homeMinute(s.period_end) : "—"}</option>)}
              </select>
              <label className="flex items-center gap-2 text-xs">天数 <input name="days" type="number" min={1} max={90} required defaultValue={1} className={`${input} w-20`} /></label>
              <Common customerId={customerId} back={back} action="extend" />
              <button className={btn}>延期</button>
              <p className="text-[11px] opacity-50">通卡和我们送的会员改到期日；付费会员走 Stripe（这几天不扣款，下次扣款往后挪）。</p>
            </form>
          )}
        </details>

        <details className={box}>
          <summary className="cursor-pointer">存会员费抵扣</summary>
          {memberSubs.length === 0 ? <p className="mt-2 text-xs opacity-50">要有付费会员（Stripe 订阅）才能存。</p> : (
            <form method="post" action="/api/admin/action" className="mt-2 flex flex-col gap-2">
              <select name="sub_id" required className={input}>
                {memberSubs.map((s) => <option key={s.id} value={s.id}>{subName(s)} · {(s.currency ?? "?").toUpperCase()} · {s.status}</option>)}
              </select>
              <label className="flex items-center gap-2 text-xs">金额（这条会员的币别，例 83 或 18.5） <input name="amount" required inputMode="decimal" className={`${input} w-28`} /></label>
              <Common customerId={customerId} back={back} action="credit" money="再输入一次金额" />
              <button className={danger}>存进 Stripe 余额</button>
              <p className="text-[11px] opacity-50">存在客户的 Stripe 余额里，之后的会员费先扣它；不会退到卡上。</p>
            </form>
          )}
        </details>

        <details className={box}>
          <summary className="cursor-pointer">退款（全额或部分）</summary>
          {paidOrders.length === 0 ? <p className="mt-2 text-xs opacity-50">没有可退的付费单。</p> : (
            <form method="post" action="/api/admin/action" className="mt-2 flex flex-col gap-2">
              <select name="session_id" required className={input}>
                {paidOrders.map((o) => <option key={o.session_id} value={o.session_id}>{homeMinute(o.created_at)} · {tierLabelZh(o.tier)} · {money(o.amount_cents, o.currency)}</option>)}
              </select>
              <label className="flex items-center gap-2 text-xs">部分退款的金额（空着＝全额） <input name="amount" inputMode="decimal" className={`${input} w-28`} /></label>
              <select name="reason_code" className={input}>
                <option value="requested">客户要求</option>
                <option value="technical_failure">技术故障（没生成解读）</option>
                <option value="duplicate">重复扣款</option>
                <option value="other">其他</option>
              </select>
              <Common customerId={customerId} back={back} action="refund" money="再输入一次金额（全额就输入这一单的金额）" />
              <button className={danger}>退款</button>
              <p className="text-[11px] opacity-50">原路退回，Stripe 处理；全额的这一单标「已退款」并寄退款通知，部分的这一单仍算已付。</p>
            </form>
          )}
        </details>

        {/* 10-23: a membership whose money came back (a lost dispute, a full refund) still ran to its period's end */}
        <details className={box} id="end-now">
          <summary className="cursor-pointer">立即结束会员／通卡{liveSubs.some((s) => s.refunded_at) ? <span className="ml-2 text-xs text-[var(--cinnabar)]">（有一条的钱已经退回）</span> : null}</summary>
          {liveSubs.length === 0 ? <p className="mt-2 text-xs opacity-50">没有还在生效的会员或通卡。</p> : (
            <form method="post" action="/api/admin/action" className="mt-2 flex flex-col gap-2">
              <select name="sub_id" required className={input}>
                {liveSubs.map((s) => <option key={s.id} value={s.id}>{subName(s)} · 到 {s.period_end ? homeMinute(s.period_end) : "—"}{s.refunded_at ? " · 钱已退回（退款或争议）" : ""}</option>)}
              </select>
              <Common customerId={customerId} back={back} action="end_now" />
              <button className={danger}>立即结束</button>
              <p className="text-[11px] opacity-50">付费会员在 Stripe 立即取消：不退款、不扣款，读者马上失去会员权益，会员信也停。争议输掉或已全额退款的会员用这个；结束后才能删除帐号。通卡和我们送的会员在这里直接结束。</p>
            </form>
          )}
        </details>

        <details className={box}>
          <summary className="cursor-pointer">重寄信</summary>
          <form method="post" action="/api/admin/action" className="mt-2 flex flex-col gap-2">
            <select name="ref" required className={input}>
              <optgroup label="开通信">
                {subs.map((s) => <option key={`w${s.id}`} value={`welcome:${s.id}`}>{subName(s)} · {homeMinute(s.created_at)}</option>)}
              </optgroup>
              <optgroup label="交付信">
                {readings.slice(0, 20).map((o) => <option key={`r${o.session_id}`} value={`reading:${o.session_id}`}>{tierLabelZh(o.tier)} · {homeMinute(o.created_at)}</option>)}
              </optgroup>
              <optgroup label="回访信">
                {revisits.slice(0, 20).map((r) => <option key={`v${r.id}`} value={`revisit:${r.id}`}>回访 #{r.id} · {homeMinute(r.due_at)} · {r.outcome ? `已答` : r.status}</option>)}
              </optgroup>
            </select>
            <Common customerId={customerId} back={back} action="resend" />
            <button className={btn}>重寄</button>
          </form>
        </details>

        <details className={box}>
          <summary className="cursor-pointer">标测试／自己{test ? <span className="ml-2 text-xs text-[var(--gold-text)]">（现在是测试）</span> : null}</summary>
          <form method="post" action="/api/admin/action" className="mt-2 flex flex-col gap-2">
            <input type="hidden" name="on" value={test ? "0" : "1"} />
            <Common customerId={customerId} back={back} action="test_flag" />
            <button className={btn}>{test ? "取消测试标记" : "标为测试／自己"}</button>
            <p className="text-[11px] opacity-50">标了以后，这个人的所有记录都不算进看板、产品页和群发。</p>
          </form>
        </details>

        <details className={box}>
          <summary className="cursor-pointer">写备注</summary>
          <form method="post" action="/api/admin/action" className="mt-2 flex flex-col gap-2">
            <input type="hidden" name="customer_id" value={customerId} />
            <input type="hidden" name="action" value="note" />
            <input type="hidden" name="back" value={back} />
            <input type="hidden" name="confirm" value="yes" />
            <textarea name="reason" required minLength={2} maxLength={500} rows={3} className={input} placeholder="客服往来、特别情况……" />
            <button className={btn}>记下</button>
          </form>
        </details>
        <div className={`${box} text-xs opacity-60`}>合并帐号：见上面「同一个人」那一块。</div>
      </div>

      <div className="mt-5">
        <p className="text-[11px] opacity-50 mb-1">操作记录（{log.length}）</p>
        {log.length === 0 ? <p className="text-sm opacity-30">还没有。</p> : (
          <ul className="flex flex-col gap-1 text-sm">
            {log.map((a) => (
              <li key={a.id} className={`border-t border-black/5 pt-1 ${a.ok ? "" : "text-[var(--cinnabar)]"}`}>
                <span className="opacity-50 tabular-nums mr-2">{homeMinute(a.at)}</span>
                <b className="font-medium mr-2">{ACTION_ZH[a.action as keyof typeof ACTION_ZH] ?? a.action}</b>
                {a.action === "note" ? a.reason : <>{a.result}<span className="opacity-50"> · 理由：{a.reason}</span></>}
                {a.stripe_ref ? <span className="opacity-40 text-xs ml-2 font-mono">{a.stripe_ref}</span> : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
