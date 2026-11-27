import { kinCandidates, mergesInto, type KinWhy } from "@/lib/identity";
import { homeMinute as when } from "@/lib/clock";

/**
 * 10-22 同一个人 (Neil: 「后台客户页显示「可能是同一人」，列出关联的帐号和关联原因；由你手动确认后合并帐号」).
 * The other accounts the clues point at (lib/identity kinCandidates), each with why, and a merge form either way round.
 * A card, an address or a Stripe customer in common reads as 「很可能」; a browser alone as 「可能」 — a family shares a phone.
 */

const HOW: Record<string, string> = {
  pay: "付过款", login: "登录过", login_code: "登录过", "signed-in": "登录过", free_first: "领过新人免费", invite: "领过邀请免费",
  cast_email: "起卦留过邮箱", qian_email: "解签留过邮箱", gift_cast: "领过送的一卦", member: "用过通卡／会员额度", reward: "领过回礼",
  ref_light: "领过推荐回馈", case_light: "领过卦例回礼", revisit_light: "领过应验回礼", cookies: "看过解读",
};

function whyText(w: KinWhy, me: string, other: string): string {
  switch (w.kind) {
    case "card": return `同一张付款卡（Stripe 卡标识 ${w.fp.replace(/^[a-z]+:/, "").slice(0, 6)}…，TA 用它付过 ${w.orders} 单）`;
    case "alt_email": return w.held_by === "this" ? `本帐号的备用邮箱里有 TA 的邮箱 ${w.email}` : w.held_by === "other" ? `TA 的备用邮箱里有本帐号的邮箱 ${me}` : `两个帐号的备用邮箱都有 ${w.email}`;
    case "order_email": return w.held_by === "this" ? `本帐号 ${w.orders} 单的付款邮箱是 TA 的 ${other}` : `TA 有 ${w.orders} 单的付款邮箱是本帐号的 ${me}`;
    case "stripe_customer": return `Stripe 里是同一个客户（${w.id.slice(0, 12)}…）`;
    case "browser": return `同一个浏览器 ${w.browsers} 台（TA 在上面${w.how.map((h) => HOW[h] ?? h).join("、") || "用过"}）`;
  }
}

export default function Kin({ customerId, email, back, merged }: { customerId: number; email: string; back: string; merged?: string }) {
  const kin = kinCandidates(customerId);
  const history = mergesInto(customerId);
  if (!kin.length && !history.length && !merged) return null;
  return (
    <section id="kin" className="mb-10">
      <h2 className="text-xs uppercase tracking-widest opacity-40 mb-3">可能是同一人</h2>
      {merged && <p className="text-sm mb-3 text-[var(--gold-text)]">已把 #{merged} 并进本帐号：TA 的卦、解读、订单、会员、追问、回访都在这一页了，TA 的邮箱成了本帐号的备用邮箱。</p>}
      {kin.length > 0 && (
        <div className="overflow-x-auto"><table className="w-full text-sm">
          <tbody>
            {kin.map((k) => (
              <tr key={k.id} className="border-t border-black/5 align-top">
                <td className="py-2 pr-3 whitespace-nowrap">
                  <a href={`/admin/customers/${k.id}`} className="underline underline-offset-4 break-all">{k.email}</a>
                  <div className="text-[11px] opacity-50 tabular-nums mt-0.5">#{k.id} · {k.casts} 卦 · 付费 {k.paidOrders} 单{k.member ? ` · 会员（${k.member === "year" ? "年付" : k.member === "month" ? "月付" : k.member}）` : ""} · 最近 {when(k.lastSeen)}</div>
                </td>
                <td className="py-2 pr-3">
                  <span className={`text-[11px] px-1.5 py-0.5 rounded-[2px] ${k.strong ? "bg-[var(--gold)]/20 text-[var(--gold-text)]" : "bg-black/5 opacity-70"}`}>{k.strong ? "很可能" : "可能（也许是共用设备）"}</span>
                  <ul className="mt-1 text-xs opacity-70 list-disc pl-4">
                    {k.why.map((w, i) => <li key={i}>{whyText(w, email, k.email)}</li>)}
                  </ul>
                </td>
                <td className="py-2 text-right whitespace-nowrap">
                  <details className="inline-block text-left">
                    <summary className="cursor-pointer text-xs opacity-60 hover:opacity-100">合并…</summary>
                    <form method="post" action="/api/admin/merge-customer" className="mt-2 flex flex-col gap-2 text-xs w-64">
                      <input type="hidden" name="back" value={back} />
                      <label className="flex items-start gap-2 cursor-pointer">
                        <input type="radio" name="dir" value="in" defaultChecked className="mt-[3px]" />
                        <span>把 TA（#{k.id}）并进<b>本帐号</b>（#{customerId}）：保留本帐号的邮箱登录</span>
                      </label>
                      <label className="flex items-start gap-2 cursor-pointer">
                        <input type="radio" name="dir" value="out" className="mt-[3px]" />
                        <span>把本帐号并进 <b>TA</b>（#{k.id}）：保留 TA 的邮箱登录</span>
                      </label>
                      <input type="hidden" name="a" value={customerId} />
                      <input type="hidden" name="b" value={k.id} />
                      <input name="reason" required maxLength={200} placeholder="原因（必填，记进对账）" className="border border-black/15 rounded-[2px] px-2 py-1" />
                      <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" name="sure" value="1" required /> 我确认这是同一个人（不可撤销）</label>
                      <button type="submit" className="self-start border border-black/20 rounded-[2px] px-2 py-1 hover:bg-black/5">合并</button>
                      <p className="opacity-50">合并后：两边的卦、解读、订单、会员、额度、追问、回访都归到留下的帐号；另一个邮箱变成它的备用邮箱，用它登录也进这个帐号；原客户页链接自动转过来。</p>
                    </form>
                  </details>
                </td>
              </tr>
            ))}
          </tbody>
        </table></div>
      )}
      {history.length > 0 && (
        <ul className="mt-3 text-xs opacity-60">
          {history.map((h) => <li key={h.at}>{when(h.at)} 并入了 #{h.from_id} {h.from_email} · {h.reason} · 搬过来 {Object.entries(h.moved).map(([k, v]) => `${k.split(".")[0]} ${v}`).join("、") || "没有记录"}</li>)}
        </ul>
      )}
    </section>
  );
}
