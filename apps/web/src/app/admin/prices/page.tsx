import { cookies } from "next/headers";
import { ADMIN_COOKIE, isAdmin } from "@/lib/admin-auth";
import { catalogPrice, type CatalogId, type PriceOpts } from "@/lib/catalog";
import { CURRENCIES, firstMonthMinor, formatMoney, type Currency } from "@/lib/money";
import { AdminLogin, AdminShell, Legend, Section } from "../ui";

export const dynamic = "force-dynamic";

/**
 * 10-23 进度表 109 ② 价格表 — every price the site charges, per currency, read from the catalog the checkout reads
 * (lib/catalog.ts), so what is shown here is what Stripe is asked for. Read-only: a price lives in four places at once —
 * the checkout, the prices printed on the pages (computed in the browser too), the letters, and the terms in nine
 * languages — so a change goes through development with all four in one deploy (see the legend).
 */
const ROWS: { label: string; id: CatalogId | "first_month"; o?: PriceOpts }[] = [
  { label: "1 日通卡 · 第一张", id: "pass_1", o: { first: true } }, { label: "1 日通卡", id: "pass_1" }, { label: "7 天通卡", id: "pass_7" }, { label: "30 天通卡", id: "pass_30" },
  { label: "会员 · 首月", id: "first_month" }, { label: "会员 · 月费", id: "month" }, { label: "会员 · 年费", id: "year" },
  { label: "塔罗个人解读", id: "tarot" }, { label: "解籤个人解读", id: "qian_personal" },
  { label: "合盘", id: "hepan" }, { label: "合盘 · 会员价", id: "hepan", o: { member: true } },
  { label: "年书", id: "nianshu" }, { label: "年书 · 早鸟", id: "nianshu", o: { early: true } }, { label: "年书 · 会员价", id: "nianshu", o: { member: true } },
];
const MAIN: Currency[] = ["TWD", "HKD", "CNY", "USD", "MYR", "JPY"];

export default async function PricesPage({ searchParams }: { searchParams: Promise<{ key?: string; denied?: string; all?: string }> }) {
  const sp = await searchParams;
  if (!(await isAdmin((await cookies()).get(ADMIN_COOKIE)?.value, sp.key))) return <AdminLogin denied={sp.denied === "1"} back="/admin/prices" />;
  const cols: Currency[] = sp.all === "1" ? [...CURRENCIES] : MAIN;
  const price = (r: (typeof ROWS)[number], c: Currency) => (r.id === "first_month" ? firstMonthMinor(c) : catalogPrice(r.id, c, r.o));
  return (
    <AdminShell title="价格表" nav={[]} right={<a className="underline underline-offset-4 opacity-60" href={sp.all === "1" ? "/admin/prices" : "/admin/prices?all=1"}>{sp.all === "1" ? "只看主要币别" : "全部 15 种币别"}</a>}>
      <Section id="prices" title="现在收的价" sub="和结账读的是同一张表 · 含税价（读者看到的就是付的）">
        <div className="overflow-x-auto -mx-4 px-4">
          <table className="w-full text-sm min-w-[40rem]">
            <thead><tr className="text-xs opacity-50 text-left"><th className="py-1 pr-3 font-normal">东西</th>{cols.map((c) => <th key={c} className="pr-3 font-normal text-right">{c}</th>)}</tr></thead>
            <tbody>
              {ROWS.map((r) => (
                <tr key={r.label} className="border-t border-black/5">
                  <td className="py-1.5 pr-3 whitespace-nowrap">{r.label}</td>
                  {cols.map((c) => { const v = price(r, c); return <td key={c} className="pr-3 text-right tabular-nums whitespace-nowrap">{v == null ? "—" : formatMoney(c, v, "zh")}</td>; })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Legend>价格同时写在四个地方：结账（Stripe 收多少）、页面上的价格（有一部分在读者的浏览器里算）、信里的价格、九种语言的条款（「通卡 1 日 US$3.99」这样写死的句子）。只改其中一处，读者会看到一个价、被收另一个价，或者条款对不上——所以价格不放在后台直接改：要调价时告诉开发，四处在同一次部署里一起改、条款一起更新，改完这张表就会跟着变。临时让利请用「优惠码与活动连结」（不动原价，只在结账时扣）。每日上限在「上限与权益」里可以直接改。</Legend>
      </Section>
    </AdminShell>
  );
}
