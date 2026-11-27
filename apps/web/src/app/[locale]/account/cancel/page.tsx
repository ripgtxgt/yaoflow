import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { isLocale, type Locale } from "@/lib/i18n";
import { currentCustomer } from "@/lib/auth";
import { entitlementFor } from "@/lib/subscription";
import { OWN_CARRY_MAX } from "@/lib/sub-plan";
import { rp } from "@/lib/dict/renew-perks";
import { ManageButton } from "@/components/AccountActions";
import { brandName } from "@/lib/brand";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return { title: `${rp(locale, "title")} · ${brandName(locale)}`, robots: { index: false } };
}

const fmtDate = (ms: number, locale: Locale) =>
  new Date(ms).toLocaleDateString(locale === "zh" ? "zh-CN" : locale === "zh-hant" ? "zh-TW" : locale, { year: "numeric", month: "short", day: "numeric" });

/**
 * 09-30 续订专属 (Neil: 「好，都做吧」): the page between 「取消续订」 and Stripe's cancel screen.
 * #678 went from the account page to cancelled in 29 seconds without seeing what stops. This page says it — what
 * stops at once, what stays until the period ends, and that one tap undoes it — then the next tap is Stripe's own
 * cancel step (it still asks why). Cancelling stays two taps away; nothing is hidden or made harder.
 */
export default async function CancelPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const l = locale as Locale;
  const me = await currentCustomer();
  if (!me) redirect(`/${l}/login?next=${encodeURIComponent(`/${l}/account/cancel`)}`);
  const ent = await entitlementFor(me.customerId);
  if (!ent.active || ent.comp || ent.pass) redirect(`/${l}/account#membership`);

  const date = ent.periodEnd ? fmtDate(ent.periodEnd, l) : "—";
  return (
    <div className="mx-auto w-full max-w-[36rem] px-[var(--s-4)] md:px-8 pt-10 pb-20">
      <h1 className="t-d2">{rp(l, "title")}</h1>
      {ent.cancelAtPeriodEnd ? (
        <p className="t-body mt-4">{rp(l, "already")}</p>
      ) : (
        <>
          <p className="t-body mt-4 !text-[var(--ink-66)]">{rp(l, "lead", { date, n: ent.deepLeft })}</p>

          <div className="mt-[var(--s-5)] panel px-[var(--s-4)] py-[var(--s-4)]">
            <p className="t-small !text-[var(--cinnabar)]">{rp(l, "loseTitle")}</p>
            <ul className="mt-2 flex flex-col gap-1.5 t-body !text-[15px]">
              <li>· {rp(l, "lose1", { carry: OWN_CARRY_MAX })}</li>
              <li>· {rp(l, "lose2")}</li>
              <li>· {rp(l, "lose3")}</li>
            </ul>
            <p className="t-small mt-[var(--s-4)] !text-[var(--ink-66)]">{rp(l, "keepTitle", { date })}</p>
            <p className="t-body !text-[15px] mt-1">· {rp(l, "keep1")}</p>
          </div>

          <p className="t-small mt-[var(--s-4)] !text-[var(--ink-45)]">{rp(l, "after")}</p>

          <div className="mt-[var(--s-5)] flex flex-wrap items-center gap-x-6 gap-y-3">
            <Link href={`/${l}/account#membership`} data-heat="cancel-stay"
              className="min-h-[var(--s-6)] grid place-items-center px-6 rounded-[2px] bg-[var(--ink)] text-[var(--paper)] text-[13px] tracking-[0.14em]">
              {rp(l, "stay")}
            </Link>
            <ManageButton locale={l} flow="cancel" label={rp(l, "go")} primary />
          </div>
        </>
      )}
    </div>
  );
}
