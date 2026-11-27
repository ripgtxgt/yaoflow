import { cookies } from "next/headers";
import { ADMIN_COOKIE, isAdmin } from "@/lib/admin-auth";
import { db } from "@/lib/db";
import { homeMinute } from "@/lib/clock";
import { CAP_KINDS, CAP_MAX, DAY_CAPS, MEMBER_DAY_CAPS, RATE_PER_MIN, capOverrides, dayCapFor, ratePerMin, type CapKind } from "@/lib/caps";
import { RIGHTS, PASS_KEEPS_BEFORE_SPLIT, type Right } from "@/lib/entitlements";
import { MEMBER_FOLLOWUP_LIMIT } from "@/lib/sub-plan";
import { AdminLogin, AdminShell, Legend, Section } from "../ui";

export const dynamic = "force-dynamic";

/**
 * 10-22 进度表 94 第三批 「上限与权益」 (75 ④ Neil: 「上限按你列的數字先上」, 「正常人碰到就放宽」): who met which fair-use cap,
 * the caps themselves — changeable here, no deploy; every change goes to ops — and the rights table as the code has it
 * (lib/entitlements.ts RIGHTS), read-only, to check against 92.
 */

const th = "py-2 pr-3 font-normal text-xs opacity-50 whitespace-nowrap text-left";
const td = "py-2 pr-3 whitespace-nowrap align-top tabular-nums";
const DAY = 86_400_000;

const KIND_NAME: Record<CapKind, string> = {
  cast: "六爻深断（件）", followup: "追问（条）", tarot: "塔罗个人解读（次）", qian: "解籤个人解读（次）", report: "命盘报告（不同的盘）", qa: "命盘问答（题）",
};
const RIGHT_NAME: Record<Right, string> = {
  deep_reading: "六爻深断", member_followups: `每卦追问 ${MEMBER_FOLLOWUP_LIMIT} 次（不是 5 次）`, tarot_reading: "塔罗个人解读", qian_personal: "解籤个人解读",
  chart_report: "八字／紫微／星盘深度报告（本命篇）、正缘画像", chart_qa: "命盘问答", chart_rewrite: "深度报告每月按流月重写",
  chart_flow: "运势章（八字大运／今年、紫微大限、星盘本月行运）", daily_personal: "你的今天、黄历「今天对你」、择日按自己的盘筛",
  daily_qian_full: "今日一籤全文", member_letter: "会员每日信、流月信", bigs_discount: "年书、合盘 8 折", case_reward_self: "公开卦例回礼换成自己的深断",
};
const STANDING_NAME = { member: "会员", comp: "赠送会员", pass: "通卡", card: "籤卡（已停卖）" } as const;
const WHY = { day: "每日上限", rate: "每分钟上限" } as const;

export default async function LimitsPage({ searchParams }: { searchParams: Promise<{ key?: string; denied?: string; ok?: string; err?: string; test?: string; k?: string }> }) {
  const { key, denied, ok, err, test, k: kindParam } = await searchParams;
  if (!(await isAdmin((await cookies()).get(ADMIN_COOKIE)?.value, key))) return <AdminLogin denied={denied === "1"} back="/admin/limits" />;
  const now = Date.now();
  const over = capOverrides();

  // who met a cap in 7 days (ops `cap_hit`: 「cust {id} {kind} {day|rate}」, one line per account, kind and reason every ten minutes)
  const hits = (db().prepare("SELECT at, detail FROM ops_events WHERE kind = 'cap_hit' AND at >= ? ORDER BY at DESC").all(now - 7 * DAY) as { at: number; detail: string | null }[])
    .map((r) => { const m = /^cust (\d+) (\w+) (\w+)/.exec(r.detail ?? ""); return m ? { at: r.at, cid: Number(m[1]), kind: m[2] as CapKind, why: m[3] as "day" | "rate" } : null; })
    .filter(Boolean) as { at: number; cid: number; kind: CapKind; why: "day" | "rate" }[];
  const tests = new Set((db().prepare("SELECT id FROM customers WHERE test_flag = 1").all() as { id: number }[]).map((r) => r.id));
  const showTest = test === "1";
  const real = showTest ? hits : hits.filter((h) => !tests.has(h.cid));
  // 进度表 94「每行点得进详情」: a line of the table opens who met that cap
  const pick = (CAP_KINDS as readonly string[]).includes(kindParam ?? "") ? (kindParam as CapKind) : null;
  const q = (k: string | null) => `/admin/limits?${[showTest ? "test=1" : "", k ? `k=${k}` : ""].filter(Boolean).join("&")}`;
  const byKind = CAP_KINDS.map((k) => ({ k, day: real.filter((h) => h.kind === k && h.why === "day").length, rate: real.filter((h) => h.kind === k && h.why === "rate").length, people: new Set(real.filter((h) => h.kind === k).map((h) => h.cid)).size }));
  const shown = pick ? real.filter((h) => h.kind === pick) : real;
  const byPerson = [...shown.reduce((m, h) => m.set(h.cid, [...(m.get(h.cid) ?? []), h]), new Map<number, typeof real>()).entries()].sort((a, b) => b[1].length - a[1].length).slice(0, pick ? 100 : 20);
  const changes = db().prepare("SELECT at, detail FROM ops_events WHERE kind = 'cap_set' ORDER BY at DESC LIMIT 20").all() as { at: number; detail: string | null }[];

  const CapForm = ({ k, current, dflt }: { k: string; current: number; dflt: number | null }) => (
    <form method="post" action="/api/admin/limits" className="flex items-center gap-1.5">
      <input type="hidden" name="key" value={k} />
      <input name="value" type="number" min={1} max={CAP_MAX} defaultValue={current} className="w-16 bg-transparent border border-black/20 rounded px-1.5 py-0.5 tabular-nums" />
      <input name="reason" placeholder="理由" maxLength={300} className="w-24 bg-transparent border border-black/20 rounded px-1.5 py-0.5 text-xs" title="写一句为什么改（进操作记录）" />
      <button type="submit" className="text-xs border border-black/20 rounded px-2 py-0.5 hover:border-black/60">改</button>
      {over.has(k) ? <button type="submit" name="clear" value="1" className="text-xs opacity-60 underline underline-offset-2">恢复默认{dflt != null ? ` ${dflt}` : ""}</button> : null}
    </form>
  );

  return (
    <AdminShell title="上限与权益" nav={[{ href: "#hits", label: "碰到上限的" }, { href: "#caps", label: "上限（可改）" }, { href: "#changes", label: "改动记录" }, { href: "#rights", label: "权益表" }]}
      right={<a href={`/admin/limits${showTest ? "" : "?test=1"}`} className="opacity-60 underline underline-offset-4">{showTest ? "隐藏自测" : "含自测"}</a>}>
      {ok && <p className="mb-6 text-sm text-emerald-700">已改：{ok}（半分钟内所有进程生效）</p>}
      {err && <p className="mb-6 text-sm text-[var(--cinnabar)]">没改成：{err === "value" ? `数字要在 1–${CAP_MAX} 之间` : "不认识这个上限"}</p>}

      <Section id="hits" title="碰到上限的" sub={`近 7 天 · ${new Set(real.map((h) => h.cid)).size} 人 · ${showTest ? "含测试账号" : "不含测试账号"} · 点一种上限看是哪些人`}>
        <div className="overflow-x-auto -mx-4 px-4">
          <table className="w-full text-sm min-w-[32rem]">
            <thead><tr><th className={th}>上限</th><th className={th}>每日上限</th><th className={th}>每分钟上限</th><th className={th}>人</th></tr></thead>
            <tbody>
              {byKind.map((r) => (
                <tr key={r.k} className={`border-t border-black/5 ${pick === r.k ? "bg-[var(--gold)]/[0.08]" : ""}`}>
                  <td className={`${td} font-sans`}><a className="underline underline-offset-4" href={`${q(pick === r.k ? null : r.k)}#hits`}>{KIND_NAME[r.k]}</a></td><td className={td}>{r.day || "—"}</td><td className={td}>{r.rate || "—"}</td><td className={td}>{r.people || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {pick && <p className="mt-4 text-sm">只看「{KIND_NAME[pick]}」<a className="ml-3 opacity-60 underline underline-offset-2" href={`${q(null)}#hits`}>看全部</a></p>}
        {byPerson.length === 0 && pick && <p className="mt-2 text-sm opacity-50">近 7 天没人碰到。</p>}
        {byPerson.length > 0 && (
          <ul className="mt-4 text-sm flex flex-col gap-1">
            {byPerson.map(([cid, hs]) => (
              <li key={cid}><a className="underline underline-offset-4" href={`/admin/customers/${cid}`}>#{cid}</a><span className="opacity-60 ml-2">{hs.length} 次 · {[...new Set(hs.map((h) => `${KIND_NAME[h.kind] ?? h.kind}${WHY[h.why] ? `（${WHY[h.why]}）` : ""}`))].join("、")} · 最近 {homeMinute(hs[0]!.at).slice(5)}</span></li>
            ))}
          </ul>
        )}
        <Legend>同一个人、同一种上限、同一种原因，10 分钟内只记一次，所以这里的次数是「碰到了几回」，不是被挡了几下。正常用的人碰到了，就把那一项放宽（下面可以直接改）。</Legend>
      </Section>

      <Section id="caps" title="上限（可改）" sub="改完半分钟内生效 · 每次改动记进 ops，下面有记录">
        <div className="overflow-x-auto -mx-4 px-4">
          <table className="w-full text-sm min-w-[44rem]">
            <thead><tr><th className={th}>每天（北京时间日）</th><th className={th}>默认 通卡／会员</th><th className={th}>通卡（及没有会员数字时的会员）</th><th className={th}>会员</th></tr></thead>
            <tbody>
              {CAP_KINDS.map((k) => (
                <tr key={k} className="border-t border-black/5">
                  <td className={`${td} font-sans`}>{KIND_NAME[k]}</td>
                  <td className={`${td} opacity-60`}>{DAY_CAPS[k]} / {MEMBER_DAY_CAPS[k] ?? DAY_CAPS[k]}</td>
                  <td className={td}><CapForm k={`cap:${k}`} current={dayCapFor(k, false)} dflt={DAY_CAPS[k]} /></td>
                  <td className={td}><CapForm k={`cap_member:${k}`} current={dayCapFor(k, true)} dflt={MEMBER_DAY_CAPS[k] ?? null} /></td>
                </tr>
              ))}
              <tr className="border-t border-black/10">
                <td className={`${td} font-sans`}>每分钟最多生成（任何一种）</td>
                <td className={`${td} opacity-60`}>{RATE_PER_MIN}</td>
                <td className={td} colSpan={2}><CapForm k="cap_rate" current={ratePerMin()} dflt={RATE_PER_MIN} /></td>
              </tr>
            </tbody>
          </table>
        </div>
        <Legend>上限只管通卡和会员（赠送会员不受限）；同一样东西当天重开不算第二次（同一张盘、同一支籤）。问答的数字会写进开通信（通卡 {dayCapFor("qa", false)} 题、会员 {dayCapFor("qa", true)} 题），改了以后新寄出的信跟着变；其他几项不对外写。清空输入框再按「改」也等于恢复默认。</Legend>
      </Section>

      <Section id="changes" title="改动记录" sub={`最近 ${changes.length} 次`}>
        {changes.length === 0 ? <p className="text-sm opacity-50">还没改过，全部是默认数字。</p> : (
          <ul className="text-sm flex flex-col gap-1">
            {changes.map((c, i) => <li key={i}><span className="opacity-50 tabular-nums mr-2">{homeMinute(c.at)}</span>{c.detail}</li>)}
          </ul>
        )}
      </Section>

      <Section id="rights" title="权益表（只读）" sub="lib/entitlements.ts 的 RIGHTS——代码里实际用的那一张">
        <div className="overflow-x-auto -mx-4 px-4">
          <table className="w-full text-sm min-w-[48rem]">
            <thead>
              <tr><th className={th}>权益</th>{(["member", "comp", "pass", "card"] as const).map((s) => <th key={s} className={th}>{STANDING_NAME[s]}</th>)}<th className={th}>每日上限</th></tr>
            </thead>
            <tbody>
              {(Object.keys(RIGHTS) as Right[]).map((r) => (
                <tr key={r} className="border-t border-black/5">
                  <td className="py-2 pr-3 align-top">{RIGHT_NAME[r] ?? r}{PASS_KEEPS_BEFORE_SPLIT.includes(r) ? <span className="block text-[11px] opacity-50">分界（92）前买的通卡到期前照旧有</span> : null}</td>
                  {(["member", "comp", "pass", "card"] as const).map((s) => <td key={s} className={`${td} ${RIGHTS[r][s] ? "" : "opacity-25"}`}>{RIGHTS[r][s] ? "✓" : "—"}</td>)}
                  <td className={`${td} opacity-70`}>{RIGHTS[r].cap ? `${dayCapFor(RIGHTS[r].cap!, false)}${dayCapFor(RIGHTS[r].cap!, true) !== dayCapFor(RIGHTS[r].cap!, false) ? ` / 会员 ${dayCapFor(RIGHTS[r].cap!, true)}` : ""}` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Legend>改权益要改代码（lib/entitlements.ts），改完这里和开通信的清单会一起变。「通卡看本命，会员看流年」（92）：运势章、你的今天、今日一籤全文、每日信、月更、8 折只给会员。</Legend>
      </Section>
    </AdminShell>
  );
}
