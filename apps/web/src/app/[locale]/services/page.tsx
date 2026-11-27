import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import TrackOnce from "@/components/TrackOnce";
import PageShell, { PreviewNote } from "@/components/ui/PageShell";
import ServiceCards from "@/components/ServiceCards";
import { ADMIN_COOKIE } from "@/lib/admin-auth";
import { canSee, featureState } from "@/lib/features";
import { asLocale, isLocale, pageAlternates, type Locale } from "@/lib/locales";
import { GROUP_LABEL, priceTable, servicesFor, type ServiceGroup } from "@/lib/services";
import { brandName } from "@/lib/brand";

export const dynamic = "force-dynamic";

/**
 * 10-22 进度表 58 ① — 全部服務: every service the site offers in this language, from lib/services.ts, with the price the
 * catalog gives it (lib/catalog.ts) and who already has it. Nine languages; a service that exists only in Chinese is left
 * out of the other seven. Behind the `services` switch (preview: the admin browser only; not indexed meanwhile).
 */
const TITLE: Record<Locale, string> = { zh: "全部服务", "zh-hant": "全部服務", en: "All services", ja: "サービス一覧", ko: "전체 서비스", fr: "Tous les services", de: "Alle Angebote", es: "Todos los servicios", pt: "Todos os serviços" };
const LEAD: Record<Locale, string> = {
  zh: "有事要问的、想看自己的、每天看一眼的，都在这一页。免费的直接用；付费的一张通卡或会员就都包了。",
  "zh-hant": "有事要問的、想看自己的、每天看一眼的，都在這一頁。免費的直接用；付費的一張通卡或會員就都包了。",
  en: "Everything on one page. What is free is simply there; a pass or a membership covers the rest.",
  ja: "すべてをこのページに。無料のものはそのまま、有料のものはパスかメンバーシップでまとめて。",
  ko: "모든 서비스를 한 페이지에. 무료는 바로, 유료는 패스나 멤버십으로 한 번에.",
  fr: "Tout sur une page. Ce qui est gratuit est là ; un pass ou un abonnement couvre le reste.",
  de: "Alles auf einer Seite. Was kostenlos ist, ist einfach da; ein Pass oder eine Mitgliedschaft deckt den Rest.",
  es: "Todo en una página. Lo gratuito está ahí; un pase o una membresía cubre el resto.",
  pt: "Tudo numa página. O que é grátis está ali; um passe ou uma assinatura cobre o resto.",
};
const GROUPS: ServiceGroup[] = ["ask", "self", "daily", "plan"];

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const l = asLocale(locale);
  return { title: `${TITLE[l]} — ${brandName(l)}`, description: LEAD[l], alternates: pageAlternates(l, "/services"), robots: featureState("services") === "on" ? undefined : { index: false, follow: false } };
}

export default async function ServicesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  if (!(await canSee("services"))) notFound();
  const l = locale;
  const admin = (await cookies()).get(ADMIN_COOKIE)?.value;
  const items = await servicesFor(l, admin);
  const table = priceTable();
  return (
    <PageShell>
      <TrackOnce event="services" locale={l} method="view" />
      <PreviewNote on={featureState("services") === "preview"} />
      <h1 className="t-d1">{TITLE[l]}</h1>
      <p className="t-body mt-[var(--s-3)] text-[var(--ink-66)]">{LEAD[l]}</p>
      {GROUPS.map((g) => {
        const rows = items.filter((s) => s.group === g);
        if (!rows.length) return null;
        // 10-23 (Neil: 「看自己和每天這兩欄是一樣的，你怎麼不定位呢」): every group carries its own id, so a link to
        // /services#self lands on it (the masthead is not sticky; the margin keeps the heading clear of the top edge)
        return (
          <section key={g} id={g} className="mt-[var(--s-6)] scroll-mt-6">
            <h2 className="t-sect">
              {g === "self" || g === "daily" ? <Link href={`/${l}/services/${g}`} className="no-underline hover:underline underline-offset-4">{GROUP_LABEL[g][l]}</Link> : GROUP_LABEL[g][l]}
            </h2>
            <div className="mt-[var(--s-3)]">
              <ServiceCards services={rows} locale={l} table={table} />
            </div>
          </section>
        );
      })}
    </PageShell>
  );
}
