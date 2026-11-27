import { cookies } from "next/headers";
import { ADMIN_COOKIE, isAdmin } from "@/lib/admin-auth";
import { featureRows, type FeatureState } from "@/lib/features";
import { productReviewLines } from "@/lib/product-review";
import { homeDay } from "@/lib/clock";
import { PROMO_MAX, PROMO_SURFACES, promoPick, type PromoSurface } from "@/lib/promo";
import { SERVICES, serviceText } from "@/lib/services";
import { AdminLogin, AdminShell, Legend, Section } from "../ui";

export const dynamic = "force-dynamic";

/** 10-15 功能开关: a new feature goes live in 预览 (only this browser sees it), Neil checks it on his phone, then opens it. */
const LABEL: Record<FeatureState, string> = { preview: "预览中（只有登录后台的浏览器看得到）", on: "全部开放", off: "关闭" };
const TONE: Record<FeatureState, string> = { preview: "text-amber-700", on: "text-emerald-700", off: "opacity-50" };

/**
 * 10-29 (Neil: 「我目前看不到产品页面在哪里啊」): the pages a switch covers, clickable. A path followed by a placeholder
 * (<字>, <token>) stays text — it is a pattern, not a page.
 */
const PATH_RE = /(\/(?:zh-hant|zh)\/[A-Za-z0-9\-\/#]*)/;
const isPage = (p: string, next: string | undefined) => /^\/(?:zh-hant|zh)\/[A-Za-z0-9]/.test(p) && !(next ?? "").startsWith("<");
function WhereLinks({ where, className }: { where: string; className?: string }) {
  const parts = where.split(PATH_RE);
  return (
    <p className={className}>
      {parts.map((p, i) => (i % 2 === 1 && isPage(p, parts[i + 1])
        ? <a key={i} href={p} target="_blank" rel="noopener" className="underline underline-offset-2 hover:opacity-100">{p}</a>
        : <span key={i}>{p}</span>))}
    </p>
  );
}
const firstPage = (where: string) => where.split(PATH_RE).find((p, i, a) => i % 2 === 1 && isPage(p, a[i + 1])) ?? null;

const SURFACE_LABEL: Record<PromoSurface, string> = { home: "首页（繁简）", jieqian: "解籤页", reading: "解读页（深断下方）", mingli: "命理产品页（八字、紫微、星盘、合盘、年书，页面自己不推自己）", jiaobei: "擲筊／求籤页", tarot: "塔罗页", cast: "起卦页（起卦前，九语）" };

export default async function FeaturesPage({ searchParams }: { searchParams: Promise<{ key?: string; denied?: string; ok?: string; promo?: string }> }) {
  const { key, denied, ok, promo } = await searchParams;
  if (!(await isAdmin((await cookies()).get(ADMIN_COOKIE)?.value, key))) return <AdminLogin denied={denied === "1"} back="/admin/features" />;
  const rows = featureRows();
  const reviews = new Map(productReviewLines().map((r) => [r.id, r]));
  return (
    <AdminShell title="功能开关" nav={[]}>
      {ok && <p className="text-sm mb-6">已切换，网站在 15 秒内生效。</p>}
      <Section id="features" title="新功能先预览，再开放">
        {/* 10-29: what is waiting for a look, one tap each (this browser is signed in, so the preview pages open) */}
        {rows.some((r) => r.state === "preview") && (
          <div className="border border-amber-600/40 bg-amber-50/40 rounded-[2px] p-4 mb-6">
            <p className="text-sm">预览中、等你看的（在这个浏览器里点开就能看；没登录后台的浏览器看到的是 404）：</p>
            <ul className="mt-2 space-y-1">
              {rows.filter((r) => r.state === "preview").map((r) => {
                const href = firstPage(r.where);
                return <li key={r.name} className="text-sm">{href ? <a href={href} target="_blank" rel="noopener" className="underline underline-offset-2">{r.label}</a> : r.label}</li>;
              })}
            </ul>
          </div>
        )}
        <div className="space-y-4">
          {rows.map((r) => (
            <div key={r.name} className="border border-black/10 rounded-[2px] p-4">
              <p className="text-base">{r.label}</p>
              <WhereLinks where={r.where} className="text-xs opacity-60 mt-1" />
              <p className={`text-sm mt-2 ${TONE[r.state]}`}>现在：{LABEL[r.state]}{r.updatedAt ? ` · ${homeDay(r.updatedAt)} 改过` : ""}</p>
              {/* 10-16 进度表 59: the date it is judged, and its numbers so far */}
              {reviews.get(r.name) && <p className={`text-xs mt-1 whitespace-pre-line ${reviews.get(r.name)!.due ? "text-[var(--cinnabar)]" : "opacity-60"}`}>{reviews.get(r.name)!.line}</p>}
              <div className="flex flex-wrap gap-2 mt-3">
                {(["preview", "on", "off"] as const).filter((s) => s !== r.state).map((s) => (
                  <form key={s} method="post" action="/api/admin/features">
                    <input type="hidden" name="name" value={r.name} />
                    <input type="hidden" name="state" value={s} />
                    <button className={`text-sm px-3 py-1.5 rounded-[2px] border ${s === "on" ? "border-emerald-600 text-emerald-700" : "border-black/20"}`}>
                      {s === "preview" ? "改回预览" : s === "on" ? "对所有人开放" : "关闭"}
                    </button>
                  </form>
                ))}
              </div>
            </div>
          ))}
        </div>
        <Legend>预览中的功能已经在正式网站上、用真实数据跑，但只有登录了后台的浏览器能看到入口和页面，其他人看到的和没上线一样（页面 404、入口不显示、不进 sitemap、不发相关邮件）。在手机上登录后台后直接打开网站就能看。确认没问题再点「对所有人开放」。</Legend>
      </Section>
      {/* 10-22 进度表 58 ②: the 「也可以試試」 strips' picks — no deploy */}
      <Section id="promo" title="「也可以試試」主推（每页最多两个）">
        {promo && <p className="text-sm mb-4">已改，网站马上生效。</p>}
        <div className="space-y-4">
          {PROMO_SURFACES.map((sf) => {
            const pick = promoPick(sf);
            return (
              <form key={sf} method="post" action="/api/admin/promo" className="border border-black/10 rounded-[2px] p-4">
                <input type="hidden" name="surface" value={sf} />
                <p className="text-base">{SURFACE_LABEL[sf]}<span className="text-xs opacity-50 ml-2">{pick.set ? "已设定" : "默认"}：{pick.ids.join("、") || "（无）"}</span></p>
                <div className="flex flex-wrap gap-x-4 gap-y-2 mt-3">
                  {SERVICES.map((s) => (
                    <label key={s.id} className="text-sm flex items-center gap-1.5">
                      <input type="checkbox" name="id" value={s.id} defaultChecked={pick.ids.includes(s.id)} />
                      {serviceText(s, "zh").label}<span className="opacity-40 text-xs">{s.id}</span>
                    </label>
                  ))}
                </div>
                <button className="text-sm px-3 py-1.5 rounded-[2px] border border-black/20 mt-3">保存（勾超过 {PROMO_MAX} 个只取前 {PROMO_MAX} 个）</button>
              </form>
            );
          })}
        </div>
        <Legend>主推只在该服务的开关「全部开放」时对访客显示（预览中的只有后台浏览器看到）；页面自己的服务不会推自己。全部服务页在 /zh-hant/services（开关 services）。</Legend>
      </Section>
    </AdminShell>
  );
}
