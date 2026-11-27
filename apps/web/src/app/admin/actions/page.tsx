import { cookies } from "next/headers";
import { ADMIN_COOKIE, isAdmin } from "@/lib/admin-auth";
import { ACTION_ZH, recentActions } from "@/lib/admin-actions";
import { db } from "@/lib/db";
import { homeMinute } from "@/lib/clock";
import { AdminLogin, AdminShell, Legend, Section } from "../ui";

export const dynamic = "force-dynamic";

/**
 * 10-23 进度表 107 ④ 操作记录: every button pressed on a customer page (补通卡、延期、抵扣、退款、重寄信、标测试、备注、
 * 合并帐号) and every group letter's test, schedule and stop — who, when, to whom, what, why, how it went, Stripe's receipt.
 * A try that failed is listed too. The merges from before 10-23 (lib/identity's own record) are at the foot.
 */
const PARAM_ZH: Record<string, string> = {
  days: "天数", start: "起算", sub_id: "条目", amount: "金额", session_id: "订单", kind: "信", ref: "哪封", on: "标记", reason_code: "退款原因",
  from: "并入", campaign: "群发", at: "时间", op: "步骤", id: "编号",
};
// the words for a value belong to its key (「1」 is a day count under 天数 and a yes under 标记)
const VAL_ZH: Record<string, Record<string, string>> = {
  on: { "1": "是", "0": "否" },
  start: { now: "从现在", after: "接在现有通卡之后" },
  reason_code: { requested: "读者要求", technical_failure: "技术故障", duplicate: "重复付款", other: "其他" },
  op: { test: "寄测试信", schedule: "排时间", stop: "停止", on: "打开", off: "关掉" },
};

function params(json: string): string {
  try {
    const p = JSON.parse(json) as Record<string, unknown>;
    return Object.entries(p).map(([k, v]) => `${PARAM_ZH[k] ?? k} ${VAL_ZH[k]?.[String(v)] ?? String(v)}`).join(" · ");
  } catch { return ""; }
}

export default async function ActionsPage({ searchParams }: { searchParams: Promise<{ key?: string; denied?: string; a?: string; failed?: string }> }) {
  const { key, denied, a, failed } = await searchParams;
  if (!(await isAdmin((await cookies()).get(ADMIN_COOKIE)?.value, key))) return <AdminLogin denied={denied === "1"} back="/admin/actions" />;
  const kinds = Object.keys(ACTION_ZH) as (keyof typeof ACTION_ZH)[];
  const pick = a && kinds.includes(a as keyof typeof ACTION_ZH) ? a : undefined;
  const rows = recentActions(300, pick).filter((r) => failed !== "1" || r.ok === 0);
  let merges: { at: number; into_id: number; from_id: number; reason: string; by: string | null }[] = [];
  try { merges = db().prepare("SELECT at, into_id, from_id, reason, by FROM customer_merges ORDER BY at DESC LIMIT 100").all() as typeof merges; } catch { /* none yet */ }
  const chip = (href: string, label: string, on: boolean) => (
    <a key={href} href={href} className={`shrink-0 px-2.5 py-1 rounded-full border ${on ? "border-black/60" : "border-black/10 opacity-70 hover:opacity-100"}`}>{label}</a>
  );
  return (
    <AdminShell title="操作记录" nav={[{ href: "#log", label: "动作" }, { href: "#merges", label: "合并帐号" }]}>
      <Section id="log" title="后台做过的事" sub={`最近 ${rows.length} 条 · 北京时间 · 没做成的也记`}>
        <div className="flex flex-wrap gap-1 text-xs mb-4">
          {chip("/admin/actions", "全部", !pick && failed !== "1")}
          {kinds.map((k) => chip(`/admin/actions?a=${k}`, ACTION_ZH[k], pick === k))}
          {chip("/admin/actions?failed=1", "只看没做成的", failed === "1")}
        </div>
        {rows.length === 0 ? <p className="text-sm opacity-50">还没有。</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-xs opacity-50 text-left"><th className="py-1 pr-3 font-normal">时间</th><th className="pr-3 font-normal">对谁</th><th className="pr-3 font-normal">动作</th><th className="pr-3 font-normal">理由</th><th className="pr-3 font-normal">结果</th><th className="font-normal">Stripe</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-black/5 align-top">
                    <td className="py-1.5 pr-3 whitespace-nowrap tabular-nums text-xs">{homeMinute(r.at)}<span className="block opacity-40">{r.actor}</span></td>
                    <td className="pr-3 whitespace-nowrap">{r.customer_id ? <a className="underline" href={`/admin/customers/${r.customer_id}#ops`}>#{r.customer_id}</a> : <span className="opacity-40">—</span>}</td>
                    <td className="pr-3">{ACTION_ZH[r.action as keyof typeof ACTION_ZH] ?? r.action}<span className="block text-xs opacity-50">{params(r.params_json)}</span></td>
                    <td className="pr-3 text-xs max-w-[16rem]">{r.reason}</td>
                    <td className={`pr-3 text-xs max-w-[20rem] ${r.ok ? "" : "text-[var(--cinnabar)]"}`}>{r.result}</td>
                    <td className="text-xs opacity-60 break-all max-w-[10rem]">{r.stripe_ref ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Legend>客户页上的每个按钮都要写理由、勾确认；退款与抵扣还要把金额再打一次。钱只经 Stripe 自己的接口动（退款原路退、抵扣存在客户余额、会员延期用 Stripe 的免费期），这里记的是 Stripe 回的单号。群发的测试、排时间、停止也记在这里（对谁一栏空）。</Legend>
      </Section>
      <Section id="merges" title="合并帐号" sub="同一个人两个帐号并成一个（客户页「可能是同一个人」）">
        {merges.length === 0 ? <p className="text-sm opacity-50">还没有。</p> : (
          <table className="w-full text-sm">
            <tbody>
              {merges.map((m) => (
                <tr key={`${m.at}-${m.from_id}`} className="border-t border-black/5">
                  <td className="py-1.5 pr-3 whitespace-nowrap tabular-nums text-xs">{homeMinute(m.at)}</td>
                  <td className="pr-3 whitespace-nowrap">#{m.from_id} → <a className="underline" href={`/admin/customers/${m.into_id}#kin`}>#{m.into_id}</a></td>
                  <td className="text-xs">{m.reason}<span className="opacity-40">{m.by ? ` · ${m.by}` : ""}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>
    </AdminShell>
  );
}
