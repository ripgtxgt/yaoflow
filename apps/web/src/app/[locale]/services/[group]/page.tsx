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
import { GROUP_LABEL, GROUP_LINE, priceTable, SERVICES, serviceOpenIn, servicesFor } from "@/lib/services";
import { featureOn } from "@/lib/features";
import { LOCALES } from "@/lib/locales";
import { brandName } from "@/lib/brand";

export const dynamic = "force-dynamic";

/**
 * 10-23 (Neil: 「底部導航欄的看自己和每天這兩欄是一樣的啊，你怎麼不定位呢」): the two doors 看自己 and 每天 both opened
 * /services at its top (the #self／#daily anchors had nothing to land on), so the two tabs showed the same page. Each
 * door now has its own page — its name as the title, its one line, only its services — and its tab is lit there.
 * 全部服務 (/services) stays the page with everything.
 */
const DOORS = ["self", "daily"] as const;
type Door = (typeof DOORS)[number];
const ALL: Record<Locale, string> = { zh: "全部服务", "zh-hant": "全部服務", en: "All services", ja: "サービス一覧", ko: "전체 서비스", fr: "Tous les services", de: "Alle Angebote", es: "Todos los servicios", pt: "Todos os serviços" };

const door = (g: string): Door | null => ((DOORS as readonly string[]).includes(g) ? (g as Door) : null);
const lineOf = (g: Door, l: Locale) => (l === "zh" || l === "zh-hant" ? GROUP_LINE[g][l] : null);
/** 10-29 进度表 128: the languages this door has something open in (its hreflang set) */
const doorLocales = (g: Door) => LOCALES.filter((l) => SERVICES.some((s) => s.group === g && serviceOpenIn(s.id, l) && (!s.feature || featureOn(s.feature))));

export async function generateMetadata({ params }: { params: Promise<{ locale: string; group: string }> }): Promise<Metadata> {
  const { locale, group } = await params;
  const l = asLocale(locale);
  const g = door(group);
  if (!g) return {};
  return {
    title: `${GROUP_LABEL[g][l]} — ${brandName(l)}`,
    description: lineOf(g, l) ?? undefined,
    alternates: pageAlternates(l, `/services/${g}`, doorLocales(g)),
    robots: featureState("services") === "on" ? undefined : { index: false, follow: false },
  };
}

export default async function ServiceDoorPage({ params }: { params: Promise<{ locale: string; group: string }> }) {
  const { locale, group } = await params;
  const g = door(group);
  if (!isLocale(locale) || !g) notFound();
  if (!(await canSee("services"))) notFound();
  const l = locale;
  const rows = (await servicesFor(l, (await cookies()).get(ADMIN_COOKIE)?.value)).filter((s) => s.group === g);
  // a door with nothing open in this language is not in the nav either (lib/site-nav.ts)
  if (!rows.length) notFound();
  const line = lineOf(g, l);
  return (
    <PageShell>
      <TrackOnce event="services" locale={l} method={`view_${g}`} />
      <PreviewNote on={featureState("services") === "preview"} />
      <h1 className="t-d1">{GROUP_LABEL[g][l]}</h1>
      {line && <p className="t-body mt-[var(--s-3)] text-[var(--ink-66)]">{line}</p>}
      <div className="mt-[var(--s-5)]">
        <ServiceCards services={rows} locale={l} table={priceTable()} />
      </div>
      <p className="t-small mt-[var(--s-6)]">
        <Link href={`/${l}/services`} data-heat={`services-${g}-all`} className="underline underline-offset-4 !text-[var(--ink-66)] hover:!text-[var(--ink)]">{ALL[l]} →</Link>
      </p>
    </PageShell>
  );
}
