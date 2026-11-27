import { cookies } from "next/headers";
import { ADMIN_COOKIE, isAdmin } from "@/lib/admin-auth";
import { PEOPLE_FILTERS, PEOPLE_SINCE, peopleView, personFunnel, type PeopleFilter, type PersonRow } from "@/lib/people";
import { homeDay, homeMinute } from "@/lib/clock";
import { AdminLogin, AdminShell, Legend, Section, Stat } from "../ui";

export const dynamic = "force-dynamic";

/**
 * 10-03 按人看 (Neil: 「把一个人的标识从第一次进入，到第几天回访，第几次摇卦，都能精准的识别出来」): who came lately,
 * one row per browser (lib/browsers.ts), and the funnel counted per person. Click a row for the day-by-day trail.
 * 10-04 (Neil: 「这页应该要标明和排除会员的吧？」): members are marked and kept out of every list but 「会员」 and out of the funnel.
 */
const pct = (a: number, b: number) => (b ? `${Math.round((100 * a) / b)}%` : "—");
const FILTER_ZH: Record<PeopleFilter, string> = { all: "全部（不含会员和通卡在用的）", unpaid: "没付过钱", repeat: "同一件事问 3 次以上没付钱", paid: "付过钱", back: "隔天回来过", member: "会员 · 通卡" };

/** 10-04: who this browser's person is to us — a member, a new member, a lapsed one */
function Mark({ r }: { r: PersonRow }) {
  const tag = "ml-1.5 text-[11px] px-1.5 py-px rounded-full whitespace-nowrap";
  // 11-01 (Neil: 通卡和会员一定要区分清楚)
  if (r.member) {
    const name = r.coverKind === "pass" ? "通卡" : r.coverKind === "unknown" ? "通卡或会员" : "会员";
    const tone = r.coverKind === "pass" ? "bg-emerald-700/10 text-emerald-700" : "bg-[var(--gold)]/15 text-[var(--gold-text)]";
    return <span className={`${tag} ${r.memberNow ? tone : "bg-black/5 opacity-70"}`}>{r.memberNow ? name : `${name} · 已到期`}</span>;
  }
  if (r.joinedAt) return <span className={`${tag} bg-emerald-700/10 text-emerald-700`}>新开会员 {homeMinute(r.joinedAt).slice(5, 10)}</span>;
  if (r.lapsed) return <span className={`${tag} bg-black/5 opacity-60`}>前会员</span>;
  return null;
}

export default async function PeoplePage({ searchParams }: { searchParams: Promise<{ key?: string; denied?: string; days?: string; f?: string }> }) {
  const { key, denied, days, f } = await searchParams;
  if (!(await isAdmin((await cookies()).get(ADMIN_COOKIE)?.value, key))) return <AdminLogin denied={denied === "1"} back="/admin/people" />;
  const d = Math.min(30, Math.max(1, Number(days) || 3));
  const filter: PeopleFilter = PEOPLE_FILTERS.includes(f as PeopleFilter) ? (f as PeopleFilter) : "all";
  const { rows: list, total, members, machines } = peopleView(Date.now() - d * 86_400_000, filter);
  const shown = `${total} 个${total > list.length ? `（列出最新的 ${list.length} 个）` : ""}`;
  const fn = personFunnel();
  const q = (o: { days?: number; f?: string }) => `/admin/people?days=${o.days ?? d}&f=${o.f ?? filter}`;

  return (
    <AdminShell
      title="按人看"
      nav={[{ href: "#funnel", label: "按人漏斗" }, { href: "#list", label: "最近来过的人" }, { href: "/admin/people/anon", label: "没登录的回头客" }]}
    >
      <p className="text-xs opacity-50 mb-8">一行是一个浏览器（随机编号，{homeDay(PEOPLE_SINCE)} 起才有）。付款、领取、用额度或登录过的，会归到那位客户名下；同一个人换了手机或浏览器，在留下邮箱之前算两个人。10-03 起每一卦的问题、卦象和免费那一句存在起卦记录里（保留一年），点「轨迹」能看到；健康、性、犯罪前科类的问题只记类别不记原文。</p>

      <Section id="funnel" title="按人漏斗" sub={`${homeDay(PEOPLE_SINCE)} 起第一次来的人 · 不含之前来过的 ${fn.old} 人、第一次来就是会员的 ${fn.members} 人`}>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <Stat label="新来的人" value={fn.people} />
          <Stat label="摇过卦" value={pct(fn.cast, fn.people)} sub={`${fn.cast} 人`} />
          <Stat label="隔天又来" value={pct(fn.back, fn.people)} sub={`${fn.back} 人`} />
          <Stat label="付过钱" value={pct(fn.paid, fn.people)} sub={`${fn.paid} 人 · 买解读 ${fn.paidBy.reading} · 开会员 ${fn.paidBy.membership}`} good={fn.paid > 0} />
        </div>
        {fn.paid > 0 && (
          <div className="grid md:grid-cols-2 gap-6 mb-6 text-sm">
            <div>
              <p className="text-xs opacity-50 mb-2">付钱的人，第一次付钱前摇了几卦{fn.medianCasts !== null ? `（中位数 ${fn.medianCasts}）` : ""}</p>
              <table className="w-full"><tbody>{(["1", "2", "3", "4+"] as const).map((k) => (
                <tr key={k} className="border-t border-black/5"><td className="py-1">{k === "1" ? "0–1 卦" : `${k} 卦`}</td><td className="tabular-nums">{fn.castsBeforePaid[k]}</td><td className="tabular-nums opacity-50">{pct(fn.castsBeforePaid[k], fn.paid)}</td></tr>
              ))}</tbody></table>
            </div>
            <div>
              <p className="text-xs opacity-50 mb-2">在第几个来访日付的钱</p>
              <table className="w-full"><tbody>{(["1", "2", "3", "4+"] as const).map((k) => (
                <tr key={k} className="border-t border-black/5"><td className="py-1">第 {k} 天</td><td className="tabular-nums">{fn.payDay[k]}</td><td className="tabular-nums opacity-50">{pct(fn.payDay[k], fn.paid)}</td></tr>
              ))}</tbody></table>
            </div>
          </div>
        )}
        <div className="grid md:grid-cols-2 gap-6 text-sm">
          <div>
            <p className="text-xs opacity-50 mb-2">摇了几卦的人里，付过钱的比例</p>
            <table className="w-full"><tbody>{fn.byCasts.map((r) => (
              <tr key={r.k} className="border-t border-black/5"><td className="py-1">{r.k} 卦</td><td className="tabular-nums">{r.n} 人</td><td className="tabular-nums">{pct(r.paid, r.n)}</td></tr>
            ))}</tbody></table>
          </div>
          <div>
            <p className="text-xs opacity-50 mb-2">来了几天的人里，付过钱的比例（摇过卦的）</p>
            <table className="w-full"><tbody>{fn.byDays.map((r) => (
              <tr key={r.k} className="border-t border-black/5"><td className="py-1">{r.k} 天</td><td className="tabular-nums">{r.n} 人</td><td className="tabular-nums">{pct(r.paid, r.n)}</td></tr>
            ))}</tbody></table>
          </div>
        </div>
        <Legend>按人算：一个浏览器，加上归到同一位客户名下的其他浏览器，从第一次来到现在只算一个人（之前的看板按标签页算，同一个人开三个标签页算三次）。只算 {homeDay(PEOPLE_SINCE)} 起第一次来的人——浏览器自己记得更早来过、帐号更早就有、或之前付过钱的，算「之前来过」，不在这里；第一次来时已经是会员的也不算（会员看不到价格，没有要转化的）。付钱 = 买了解读，或开了会员（通卡也算），在哪个浏览器付的都算。数据从编号上线那天才开始攒，头一两周人数少，比例先别当真。</Legend>
      </Section>

      <Section
        id="list"
        title="最近来过的人"
        sub={filter === "member" ? `最近 ${d} 天 · 会员的浏览器 ${shown}` : `最近 ${d} 天 · ${shown} · 会员的浏览器 ${members} 个不在这里（看「会员」）${machines ? ` · 机房链接检查 ${machines} 个不算` : ""}`}
        right={<>{PEOPLE_FILTERS.map((k) => <a key={k} href={q({ f: k })} className={k === filter ? "underline underline-offset-4" : "opacity-50 hover:opacity-100"}>{FILTER_ZH[k]}</a>)}<span className="opacity-30">|</span>{[1, 3, 7, 30].map((n) => <a key={n} href={q({ days: n })} className={n === d ? "underline underline-offset-4" : "opacity-50 hover:opacity-100"}>{n} 天</a>)}</>}
      >
        <div className="overflow-x-auto -mx-4 px-4">
          <table className="text-sm w-full min-w-[840px]">
            <thead><tr className="text-left text-xs opacity-50"><th className="py-1 font-normal">是谁</th><th className="font-normal">第一次来</th><th className="font-normal">来了几天</th><th className="font-normal">摇卦</th><th className="font-normal">同一件事最多</th><th className="font-normal">看到免费一句</th><th className="font-normal">点价格</th><th className="font-normal">去付款</th><th className="font-normal">付款</th><th className="font-normal">最近一次</th><th /></tr></thead>
            <tbody>{list.map((r) => (
              <tr key={r.bid} className="border-t border-black/5">
                <td className="py-1.5 whitespace-nowrap">{r.customerId ? <a className="underline underline-offset-2" href={`/admin/customers/${r.customerId}`}>{r.who}</a> : <span className="opacity-50">访客 {r.bid.slice(0, 6)}</span>}<Mark r={r} /></td>
                <td className="whitespace-nowrap">{r.first_day ?? homeDay(r.first_at)}<span className="opacity-50 text-xs ml-1">{r.first_c ?? r.first_ref ?? ""}</span></td>
                <td className="tabular-nums">{r.days || 1}</td>
                <td className="tabular-nums">{r.casts}</td>
                <td className="tabular-nums">{r.maxThread >= 2 ? <span className={r.maxThread >= 3 && !r.everPaid && !r.member ? "text-[var(--cinnabar)]" : ""}>第 {r.maxThread} 卦</span> : <span className="opacity-30">—</span>}</td>
                <td className="tabular-nums">{r.teased}</td>
                <td className="tabular-nums">{r.clicks}</td>
                <td className="tabular-nums">{r.checkouts}</td>
                <td className="tabular-nums">{r.paidOrders ? <span className="text-emerald-700">{r.paidOrders}</span> : <span className="opacity-30">0</span>}</td>
                <td className="whitespace-nowrap text-xs opacity-60">{homeMinute(r.last_at).slice(5)}</td>
                <td><a className="text-xs underline underline-offset-2" href={`/admin/people/${r.bid}`}>轨迹 →</a></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
        <Legend>「第一次来」：这个浏览器自己记着的首次来访日（编号上线前就来过的人，日期比编号早）；旁边是第一次带进来的渠道或来源网站。「来了几天」「摇卦」等从编号上线后开始数。「付款」按人算：这个浏览器，加上同一位客户名下的其他浏览器和帐号里的订单（买解读的笔数）；「付过钱 / 没付过钱」把开会员、增购包也算上。会员（这段时间来的时候会员还有效、后来送了会员，或起卦页说这一卦是会员身份）看不到价格，只在「会员」里列出；这段时间里自己开了会员的标「新开会员」，照常列在其他几栏（算付过钱）；以前是会员、这段时间已经过期的标「前会员」，照常列。时间是 UTC+8。</Legend>
      </Section>
    </AdminShell>
  );
}
