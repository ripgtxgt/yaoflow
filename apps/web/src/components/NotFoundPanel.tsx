import Link from "next/link";
import { t } from "@/lib/i18n";
import type { Locale } from "@/lib/locales";

/** The 404 in the reader's language; the locale is resolved by the caller. */
export default function NotFoundPanel({ locale }: { locale: Locale }) {
  return (
    <div className="mx-auto w-full max-w-[46rem] px-[var(--s-4)] md:px-8 pt-16 pb-20">
      <p className="t-label !text-[var(--gold-text)]">404</p>
      <h1 className="t-d1 mt-3">{t(locale, "notFoundTitle")}</h1>
      <p className="t-body mt-4 text-[var(--ink-66)]">{t(locale, "notFoundBody")}</p>
      <Link href={`/${locale}`} className="inline-block mt-[var(--s-5)] t-label hover:text-[var(--ink)] transition-colors">
        {t(locale, "backHome")} →
      </Link>
    </div>
  );
}
