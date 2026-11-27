import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { isLocale, t, type Locale } from "@/lib/i18n";
import { asLocale } from "@/lib/locales";
import { currentCustomer, safeNextPath } from "@/lib/auth";
import LoginForm from "@/components/LoginForm";
import { brandName } from "@/lib/brand";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return { title: `${t(asLocale(locale), "loginTitle")} · ${brandName(locale)}`, robots: { index: false } };
}

export default async function LoginPage(
  { params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ next?: string; e?: string }> },
) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const l = locale as Locale;
  const sp = await searchParams;
  const next = safeNextPath(sp.next);
  if (await currentCustomer()) redirect(next ?? `/${l}/account`);

  return (
    <div className="mx-auto w-full max-w-[34rem] px-[var(--s-4)] md:px-8 pt-12 pb-20">
      <h1 className="t-d1">{t(l, "loginTitle")}</h1>
      <p className="t-body mt-4 mb-[var(--s-5)] text-[var(--ink-66)]">{t(l, "loginLead")}</p>
      <LoginForm locale={l} next={next} invalid={sp.e === "invalid"} />
    </div>
  );
}
