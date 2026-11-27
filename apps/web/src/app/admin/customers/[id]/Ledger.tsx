import { allowanceGrantsFor, allowanceGrantsSince, caseRewardsLedger, grantsLedger, latestSubscription, subUsesLedger } from "@/lib/db";
import { allowanceWindow, periodCarry, LIGHT_FAIR_USE, tongkaLive } from "@/lib/subscription";
import { DEEP_PER_MONTH, GIFT_POOL_PER_MONTH } from "@/lib/sub-plan";
import { GIFT_POOL_CAP, giftPoolBalance } from "@/lib/membership";
import { memberReferralBonus, packBalance, packsForCustomer, poolGiftsInUse } from "@/lib/db";
import { homeMinute as when } from "@/lib/clock";
import { formatMoney, isCurrency, type Currency } from "@/lib/money";

/**
 * 09-29 对账明细 (Neil：「这个用户有 16 次深断，怎么来的，要在面板上写清楚，
 * 不然不好对账，所有的都要有对账明细」). Every unit that adds to or takes from
 * what a customer can get without paying, line by line, and a sum that must
 * equal the number on the card above it.
 *
 * 10-22 进度表 94: since the 通卡 switch nothing is counted against a monthly allowance — a member and a pass holder use
 * everything without a number, under the daily fair-use caps. The 「月额度 10 … 剩余」 sum and the 「补额度」 form are
 * the old model's; with the switch on they give way to one line, the 送一卦 pool (still monthly) and the old packs, and
 * the ledger of what was taken through the membership stays, renamed.
 */

const CHOICE: Record<string, string> = {
  self_deep: "会员：本期深断 +1",
  self_light: "自己用：轻解读兑换码",
  gift: "送朋友：一卦兑换码",
};
const GRANT_KIND: Record<string, string> = {
  case_light: "公开卦例回礼 · 轻解读码",
  comp: "补偿",
  gift_cast: "送一卦",
  invite_light: "新人邀请 · 轻解读",
  ref_light: "推荐回馈 · 轻解读",
  joint: "合参邀请",
  revisit_followup: "应验回礼 · 追问 +1",
  revisit_light: "应验回礼 · 轻解读",
};

function unitState(u: { voided_at?: number | null; void_reason?: string | null; order_at: number | null; created_at: number }): { text: string; counts: boolean; tone: string } {
  if (u.order_at) return { text: u.voided_at ? "已交付（曾退回，交付后重新计入）" : "已交付", counts: true, tone: "" };
  if (u.voided_at) return { text: `已退回 · ${u.void_reason ?? ""}`, counts: false, tone: "opacity-50 line-through decoration-black/20" };
  if (Date.now() - u.created_at < 30 * 60_000) return { text: "生成中（30 分钟内）", counts: true, tone: "text-[var(--gold-text)]" };
  return { text: "没有生成解读 · 下一轮定时任务会自动退回", counts: true, tone: "text-[var(--cinnabar)]" };
}

export default function Ledger({ customerId, locale, back }: { customerId: number; locale: string; back: string }) {
  const sub = latestSubscription(customerId);
  const uses = subUsesLedger(customerId);
  const rewards = caseRewardsLedger(customerId);
  const grants = grantsLedger(customerId);
  if (!sub && !uses.length && !rewards.length && !grants.length) return null;

  const w = sub ? allowanceWindow(sub) : null;
  const inPeriod = (t: number | null) => !!(w && t != null && t >= w.since);
  const cur = uses.filter((u) => inPeriod(u.created_at));
  const past = uses.filter((u) => !inPeriod(u.created_at));
  const deepCur = cur.filter((u) => u.tier === "deep");
  const lightCur = cur.filter((u) => u.tier !== "deep");
  const bonus = rewards.filter((r) => r.choice === "self_deep" && inPeriod(r.chosen_at));
  const isComp = !!sub?.stripe_subscription_id.startsWith("comp_");
  // 09-29 会员增购包: units taken from a bought pack are not the period's own
  const deepCounted = deepCur.filter((u) => !u.from_pack && unitState(u).counts).length;
  const packs = packsForCustomer(customerId);
  const pk = packBalance(customerId);
  const converted = packs.filter((p) => p.converted_at);
  const deepPackCur = deepCur.filter((u) => u.from_pack).length;
  const deepReturned = deepCur.length - deepPackCur - deepCounted;
  // 09-29 会员裂变: thank-you readings from friends' claims / shares, credited into the period
  const refBonus = w ? memberReferralBonus(customerId, w.since) : 0;
  // 09-30 续订专属: the carry is now two parts — friends' thank-yous (as before) and up to 5 of one's own
  const pc = sub && w ? periodCarry(sub, customerId, w) : { friends: 0, own: 0, total: 0 };
  const carry = pc.total;
  // 09-30 补额度 (进度表 24): what the owner added by hand this period, and the whole history below
  const granted = w ? allowanceGrantsSince(customerId, "deep", w.since) : 0;
  const grantedLight = w ? allowanceGrantsSince(customerId, "one", w.since) : 0;
  const allGrants = allowanceGrantsFor(customerId);
  const deepTotal = DEEP_PER_MONTH + bonus.length + refBonus + carry + granted;
  const lightCounted = lightCur.filter((u) => unitState(u).counts).length;
  const isPassRow = !!sub?.stripe_subscription_id.startsWith("pass_");
  const pool = sub && !isPassRow ? giftPoolBalance(sub.created_at, poolGiftsInUse(customerId, sub.created_at)) : null;
  const unlimited = tongkaLive();

  const Row = ({ u }: { u: (typeof uses)[number] }) => {
    const st = unitState(u);
    return (
      <tr className="border-t border-black/5 align-top">
        <td className="py-1 opacity-60 tabular-nums whitespace-nowrap">{when(u.created_at)}</td>
        <td className="whitespace-nowrap">{u.tier === "deep" ? (u.from_pack ? "深断 · 增购" : "深断") : "轻解读"}</td>
        <td className="max-w-[16rem] truncate opacity-70" title={u.question}>{u.question || "—"}</td>
        <td className={st.tone}>
          {u.order_at ? <a href={`/${locale}/reading?sid=sub_${u.token}`} className="underline underline-offset-4" target="_blank" rel="noreferrer">{st.text}</a> : st.text}
        </td>
        <td className="text-right whitespace-nowrap">
          {!u.order_at && (
            <form method="post" action="/api/admin/sub-use" className="inline">
              <input type="hidden" name="id" value={u.id} />
              <input type="hidden" name="back" value={back} />
              {u.voided_at ? (
                <><input type="hidden" name="action" value="restore" /><button className="text-xs opacity-60 hover:opacity-100 underline underline-offset-4">恢复计入</button></>
              ) : (
                <><input type="hidden" name="action" value="void" /><input type="hidden" name="reason" value="没有生成解读" /><button className="text-xs opacity-60 hover:opacity-100 underline underline-offset-4">退回这次</button></>
              )}
            </form>
          )}
        </td>
      </tr>
    );
  };

  return (
    <section id="ledger" className="mb-10">
      <h2 className="text-xs uppercase tracking-widest opacity-40 mb-3">{unlimited ? "会员兑换与回礼对账" : "额度对账"}</h2>

      {sub && w && (
        <div className="mb-4 text-sm">
          <p className="opacity-60 mb-2">会员本期 {when(w.since)} → {when(w.until)}{sub.status !== "active" ? ` · 状态 ${sub.status}` : ""}{isComp ? " · 赠送会员（不限次）" : ""}</p>
          {unlimited && !isComp && (
            <div className="text-sm mb-2 flex flex-col gap-1">
              <p className="opacity-60">10-22 起通卡和会员不限次，没有月额度可算；每天的合理使用上限见 <a className="underline underline-offset-4" href="/admin/limits">上限与权益</a>，这一期用了什么见上面「各产品记录」。</p>
              {pool && !isComp && <p><span className="opacity-60">送一卦：</span>可用 {pool.available} 张<span className="opacity-50">（每月 +{GIFT_POOL_PER_MONTH}，最多攒 {GIFT_POOL_CAP}；已累计 {pool.earned}；关掉续订后不再发）</span></p>}
              {packs.length > 0 && (converted.length > 0 ? (
                // 10-23 进度表 102: the unused units were converted — say to what, and the promise that came with it
                converted.map((p) => (
                  <p key={p.id}><span className="opacity-60">增购包（通卡开卖前买的）：</span>已折算 · {when(p.converted_at!)} 剩下的 {p.converted_units} 份
                    {p.converted_how === "balance" && p.converted_minor
                      ? <>折成 {isCurrency(String(p.currency ?? "").toUpperCase()) ? formatMoney(String(p.currency).toUpperCase() as Currency, p.converted_minor, "zh") : `${p.currency} ${p.converted_minor}`} 存进 Stripe 客户余额，抵之后的会员费<span className="opacity-50">（关掉续订时还没抵完的，原路退回）</span></>
                      : <>折成通卡延 3 天</>}
                  </p>
                ))
              ) : <p><span className="opacity-60">增购包（通卡开卖前买的）：</span>剩 {pk.left} 份<span className="opacity-50"> / 共买 {packs.filter((p) => !p.refunded_at).length} 包 {pk.bought} 份，已用 {pk.used}</span></p>)}
            </div>
          )}
          {!unlimited && !isComp && (
            <table className="text-sm tabular-nums mb-2">
              <tbody>
                <tr><td className="pr-6 opacity-60">月额度</td><td className="text-right">{DEEP_PER_MONTH}</td><td className="pl-3 opacity-50">每期固定</td></tr>
                <tr><td className="pr-6 opacity-60">＋ 公开卦例回礼</td><td className="text-right">{bonus.length}</td><td className="pl-3 opacity-50">本期选「会员深断 +1」的卦例（明细见下）</td></tr>
                <tr><td className="pr-6 opacity-60">＋ 朋友带来的回礼</td><td className="text-right">{refBonus}</td><td className="pl-3 opacity-50">本期朋友领了 TA 的送卦、或经 TA 的分享领了首份免费并读完</td></tr>
                <tr><td className="pr-6 opacity-60">＋ 上期顺延的回礼</td><td className="text-right">{pc.friends}</td><td className="pl-3 opacity-50">上期朋友带来、上期没用完的（只顺延一期）</td></tr>
                <tr><td className="pr-6 opacity-60">＋ 上期没用完的额度</td><td className="text-right">{pc.own}</td><td className="pl-3 opacity-50">续订会员专属，最多 5 份，只顺延一期（09-30 起）</td></tr>
                {granted > 0 && <tr><td className="pr-6 opacity-60">＋ 后台补的</td><td className="text-right">{granted}</td><td className="pl-3 opacity-50">本期手动补额度（明细见下）；随期重置，不顺延</td></tr>}
                <tr className="border-t border-black/10"><td className="pr-6">＝ 本期深断总额</td><td className="text-right font-medium">{deepTotal}</td><td /></tr>
                <tr><td className="pr-6 opacity-60">－ 已用</td><td className="text-right">{deepCounted}</td><td className="pl-3 opacity-50">{deepCur.length - deepPackCur} 次扣额度{deepReturned ? `，其中 ${deepReturned} 次没出解读已退回` : ""}{deepPackCur ? `；另有 ${deepPackCur} 次从增购包扣` : ""}</td></tr>
                <tr className="border-t border-black/10"><td className="pr-6">＝ 剩余</td><td className="text-right font-medium">{Math.max(0, deepTotal - deepCounted)}</td><td /></tr>
                {packs.length > 0 && <tr><td className="pr-6 pt-2 opacity-60">增购包余额</td><td className="text-right pt-2">{pk.left}</td><td className="pl-3 pt-2 opacity-50">共买 {packs.filter((p) => !p.refunded_at).length} 包 {pk.bought} 份，已用 {pk.used}{packs.some((p) => p.refunded_at) ? `；另有 ${packs.filter((p) => p.refunded_at).length} 包已退款` : ""}（不随月份清零，本期额度用完后才扣）</td></tr>}
                <tr><td className="pr-6 pt-2 opacity-60">轻解读</td><td className="text-right pt-2">{lightCounted}</td><td className="pl-3 pt-2 opacity-50">/ 合理使用上限 {LIGHT_FAIR_USE}{grantedLight ? ` + 后台补 ${grantedLight}` : ""}</td></tr>
                {pool && <tr><td className="pr-6 opacity-60">送朋友额度</td><td className="text-right">{pool.available}</td><td className="pl-3 opacity-50">可用（每月 +{GIFT_POOL_PER_MONTH}，最多攒 {GIFT_POOL_CAP}；已累计 {pool.earned}）</td></tr>}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* 09-30 补额度 (进度表 24): the form, live members only; a used unit cannot be given back (voided_at leaves a delivered reading used) */}
      {unlimited && allGrants.length > 0 && (
        <details className="mb-4">
          <summary className="cursor-pointer text-sm opacity-70">以前补过的额度（{allGrants.length}，通卡开卖前）</summary>
          <table className="w-full text-sm mt-2"><tbody>
            {allGrants.map((g) => (
              <tr key={g.id} className="border-t border-black/5">
                <td className="py-1 opacity-60 tabular-nums whitespace-nowrap">{when(g.created_at)}</td>
                <td className="whitespace-nowrap">{g.tier === "deep" ? "深断" : "轻解读"} +{g.units}</td>
                <td className="opacity-70">{g.reason}</td>
              </tr>
            ))}
          </tbody></table>
        </details>
      )}
      {!unlimited && sub && w && !isComp && sub.status === "active" && (
        <details className="mb-4" open={allGrants.length > 0}>
          <summary className="cursor-pointer text-sm opacity-70">补额度{allGrants.length ? `（已补 ${allGrants.length} 次）` : ""}</summary>
          <form method="post" action="/api/admin/allowance-grant" className="mt-2 flex flex-wrap items-end gap-3 text-sm">
            <input type="hidden" name="customer" value={customerId} />
            <input type="hidden" name="back" value={back} />
            <label className="flex flex-col gap-1"><span className="text-xs opacity-50">档位</span>
              <select name="tier" className="border border-black/15 rounded-[2px] px-2 py-1 bg-transparent"><option value="deep">深断</option><option value="one">轻解读</option></select></label>
            <label className="flex flex-col gap-1"><span className="text-xs opacity-50">数量</span>
              <input name="units" type="number" min={1} max={30} defaultValue={1} required className="w-16 border border-black/15 rounded-[2px] px-2 py-1 bg-transparent" /></label>
            <label className="flex flex-col gap-1 flex-1 min-w-[16rem]"><span className="text-xs opacity-50">原因（必填，进对账明细与 ops 日志）</span>
              <input name="reason" required maxLength={200} placeholder="例：09-29 轻解读上限误挡期间多用的两次深断" className="border border-black/15 rounded-[2px] px-2 py-1 bg-transparent" /></label>
            <button className="px-3 py-1.5 rounded-[2px] bg-[var(--ink)] text-[var(--paper)] text-xs">补进本期</button>
          </form>
          <p className="text-xs opacity-50 mt-2">只对在册会员生效，计入当期、随期重置、不顺延。已交付的深断不能通过「退回这次」拿回额度——要补就走这里。</p>
          {allGrants.length > 0 && (
            <table className="w-full text-sm mt-3"><tbody>
              {allGrants.map((g) => (
                <tr key={g.id} className="border-t border-black/5">
                  <td className="py-1 opacity-60 tabular-nums whitespace-nowrap">{when(g.created_at)}</td>
                  <td className="whitespace-nowrap">{g.tier === "deep" ? "深断" : "轻解读"} +{g.units}</td>
                  <td className="opacity-70">{g.reason}</td>
                  <td className="text-right opacity-40 text-xs whitespace-nowrap">{w && g.created_at >= w.since ? "本期" : "往期"}</td>
                </tr>
              ))}
            </tbody></table>
          )}
        </details>
      )}

      {deepCur.length + lightCur.length > 0 && (
        <details open={deepCur.length > 0} className="mb-4">
          <summary className="cursor-pointer text-sm opacity-70">{unlimited ? "本期用会员／通卡身份拿的解读" : "本期每一次扣额度"}（{deepCur.length} 深断 · {lightCur.length} 轻解读）</summary>
          <div className="overflow-x-auto mt-2"><table className="w-full text-sm"><tbody>
            {[...deepCur, ...lightCur].sort((a, b) => b.created_at - a.created_at).map((u) => <Row key={u.id} u={u} />)}
          </tbody></table></div>
        </details>
      )}

      {rewards.length > 0 && (
        <details open className="mb-4">
          <summary className="cursor-pointer text-sm opacity-70">公开卦例回礼（{rewards.length}）</summary>
          <div className="overflow-x-auto mt-2"><table className="w-full text-sm"><tbody>
            {rewards.map((r) => (
              <tr key={r.id} className="border-t border-black/5">
                <td className="py-1 opacity-60 tabular-nums whitespace-nowrap">{when(r.created_at)}</td>
                <td>{r.public_id ? <a href={`/${locale}/cases/${r.public_id}`} className="underline underline-offset-4" target="_blank" rel="noreferrer">卦例 {r.public_id}</a> : "卦例（已不在）"}{r.public_id && !r.live ? <span className="opacity-50"> · 已撤下</span> : null}</td>
                <td>{r.choice ? CHOICE[r.choice] ?? r.choice : <span className="opacity-50">还没选</span>}</td>
                <td className="opacity-50">{r.choice === "self_deep" ? (inPeriod(r.chosen_at) ? "计入本期" : "计入往期") : ""}</td>
              </tr>
            ))}
          </tbody></table></div>
        </details>
      )}

      {grants.length > 0 && (
        <details className="mb-4">
          <summary className="cursor-pointer text-sm opacity-70">兑换码与赠送（{grants.length}）</summary>
          <div className="overflow-x-auto mt-2"><table className="w-full text-sm"><tbody>
            {grants.map((g) => (
              <tr key={g.id} className="border-t border-black/5">
                <td className="py-1 opacity-60 tabular-nums whitespace-nowrap">{when(g.created_at)}</td>
                <td>{GRANT_KIND[g.kind] ?? g.kind} · {g.tier === "deep" ? "深断" : "轻解读"}</td>
                <td className="opacity-70">{g.from_customer_id === customerId ? (g.claimed_customer_id && g.claimed_customer_id !== customerId ? <>发给 <a href={`/admin/customers/${g.claimed_customer_id}`} className="underline underline-offset-4">#{g.claimed_customer_id}</a></> : "TA 发出") : g.from_customer_id ? <>来自 <a href={`/admin/customers/${g.from_customer_id}`} className="underline underline-offset-4">#{g.from_customer_id}</a></> : "系统发放"}</td>
                <td className="opacity-60">{g.used_at ? `已用 ${when(g.used_at)}` : g.expires_at < Date.now() ? "已过期未用" : `未用 · ${when(g.expires_at)} 到期`}</td>
              </tr>
            ))}
          </tbody></table></div>
        </details>
      )}

      {past.length > 0 && (
        <details>
          <summary className="cursor-pointer text-sm opacity-70">{unlimited ? "往期用会员身份拿的解读" : "往期扣额度"}（{past.length}）</summary>
          <div className="overflow-x-auto mt-2"><table className="w-full text-sm"><tbody>
            {past.map((u) => <Row key={u.id} u={u} />)}
          </tbody></table></div>
        </details>
      )}
      <p className="text-xs opacity-30 mt-2">{unlimited
        ? "用会员或通卡身份拿解读，每一次都在兑换那一刻记账（10-22 起不限次，不再扣额度）；没有生成解读的，30 分钟后定时任务自动退回。同一卦几分钟内重复兑换，会拿回同一份。"
        : "「扣额度」以会员兑换那一刻记账；没有生成解读的，30 分钟后定时任务自动退回，退回后若又打开生成了，会重新计入。同一卦几分钟内重复兑换，会拿回同一份，不再多扣。"}</p>
    </section>
  );
}
