import { cookies } from "next/headers";
import { ADMIN_COOKIE, isAdmin } from "@/lib/admin-auth";
import { markOwnOrdersAsTest } from "@/lib/db";
import { INTERNAL_EMAILS } from "@/lib/internal";
import { refreshFx } from "@/lib/live";
import { productTable } from "@/lib/admin-products";
import { sourceLine } from "@/lib/deliveries";
import { AdminLogin, AdminShell, Legend, Section } from "../ui";

export const dynamic = "force-dynamic";

/**
 * 10-22 进度表 94 第二批 「产品」 (Neil: 「我们的后台要怎么改呢？」→「好，可以的」): the seventeen products in one table —
 * people today and in 7 days, what was paid, revisits sent and answered, how long it has been open and when its fate is
 * decided. The weekly report's product lines (lib/product-review.ts), here at any time. A name opens that product.
 */

const th = "py-2 pr-3 font-normal text-xs opacity-50 whitespace-nowrap text-left";
const td = "py-2 pr-3 whitespace-nowrap align-top tabular-nums";
const usd = (c: number) => (c ? `$${(c / 100).toFixed(2)}` : "—");

export default async function ProductsPage({ searchParams }: { searchParams: Promise<{ key?: string; denied?: string; test?: string }> }) {
  const { key, denied, test } = await searchParams;
  if (!(await isAdmin((await cookies()).get(ADMIN_COOKIE)?.value, key))) return <AdminLogin denied={denied === "1"} back="/admin/products" />;
  markOwnOrdersAsTest(INTERNAL_EMAILS);
  await refreshFx();
  const showTest = test === "1";
  const rows = productTable(Date.now(), showTest);
  const groups = ["问事", "看自己", "每天", "钱"] as const;
  const due = rows.filter((r) => r.review?.due);
  // 10-23 进度表 106: every product opens its own page (four blocks); the older detail pages stay one click further
  const detailHref = (r: (typeof rows)[number]) => `/admin/products/${r.def.id}${showTest ? "?test=1" : ""}`;
  return (
    <AdminShell title="产品" nav={groups.map((g) => ({ href: `#${g}`, label: g }))}
      right={<a href={showTest ? "/admin/products" : "/admin/products?test=1"} className="opacity-60 underline underline-offset-4">{showTest ? "隐藏自测" : "含自测"}</a>}>
      {due.length > 0 && (
        <p className="mb-6 text-sm text-[var(--cinnabar)]">⚠ 到了该定去留的日子：{[...new Set(due.map((r) => r.review!.name))].join("、")}</p>
      )}
      {groups.map((g) => (
        <Section key={g} id={g} title={g} sub={`${rows.filter((r) => r.def.group === g).length} 个`}>
          <div className="overflow-x-auto -mx-4 px-4">
            <table className="w-full text-sm min-w-[62rem]">
              <thead>
                <tr>
                  <th className={th}>产品</th><th className={th}>今天的人</th><th className={th}>7 天的人</th><th className={th}>7 天交付</th><th className={th}>7 天付费</th><th className={th}>7 天收入</th>
                  <th className={th}>7 天回访 寄出／答了</th><th className={th}>开放</th><th className={th}>定去留</th>
                </tr>
              </thead>
              <tbody>
                {rows.filter((r) => r.def.group === g).map((r) => (
                  <tr key={r.def.id} className="border-t border-black/5">
                    <td className={`${td} font-sans`}><a className="underline underline-offset-4" href={detailHref(r)}>{r.def.name}</a>{r.def.detail ? <a className="ml-2 text-[11px] opacity-50 underline underline-offset-2" href={r.def.detail}>原来的页 →</a> : null}</td>
                    <td className={td}>{r.today.people || "—"}</td>
                    <td className={td}>{r.week.people || "—"}</td>
                    {/* 10-23 进度表 105 ⑦: what it handed over — the reports and the tarot readings were 0 paid while 32 and 12 went out under passes and memberships */}
                    <td className={td}>{r.week.delivered ? (r.week.delivered.total ? <>{r.week.delivered.total}<span className="block text-[11px] opacity-50">{sourceLine(r.week.delivered)}</span></> : "—") : <span className="opacity-30">·</span>}</td>
                    <td className={td}>{r.week.paid || "—"}{r.week.passes ? <span className="opacity-50 text-xs ml-1">含通卡 {r.week.passes}</span> : null}{r.today.paid ? <span className="opacity-50 text-xs ml-1">（今天 {r.today.paid}）</span> : null}</td>
                    <td className={td}>{usd(r.week.usd)}</td>
                    <td className={td}>{r.week.rvSent || r.week.rvAnswered ? `${r.week.rvSent} / ${r.week.rvAnswered}` : "—"}</td>
                    <td className={td}>{r.review ? `第 ${r.review.day} 天` : "—"}</td>
                    <td className={`${td} ${r.review?.due ? "text-[var(--cinnabar)]" : "opacity-70"}`}>{r.review ? (r.review.due ? `该定了（${r.review.reviewOn.slice(5)}）` : r.review.reviewOn.slice(5)) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      ))}
      <Legend>「交付」= 这个产品交出去的解读或报告，按凭什么给的分：付费、通卡、会员（含我们赠送的会员）、免费（10-23 起，进度表 105）；没有东西可交的产品是「·」。「付费」含在这个产品页买的通卡（起卦页带着卦买的算六爻，其余按结账后要回到哪一页），收入跟着算到这里；「通卡与会员」一行仍是全部通卡和会员。「人」按各产品自己的记录算：有自己表的（擲筊、解籤、塔罗、今日一籤、命盘问答、正缘画像）按帐号或浏览器去重，其余（六爻起卦、黄历、择日、运势、排盘、合盘、年书）按页面事件里的浏览器去重；通卡与会员一行的「人」是现在在用的人数。付费与收入按付款那一刻算、折美元（当日牌价），退款的照算；会员按定价。回访：寄出 = 7 天内寄出的回访信条数，答了 = 7 天内答的条数。「开放」与「定去留」来自周报的产品表（lib/product-review.ts），还没开放的产品不显示。{showTest ? "现在含测试账号（页面事件本来就分不出测试账号）。" : "不含测试账号。"}</Legend>
    </AdminShell>
  );
}
