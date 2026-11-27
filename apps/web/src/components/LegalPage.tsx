import Link from "next/link";
import { t, type Locale } from "@/lib/i18n";
import { LEGAL_UPDATED, type LegalSection } from "@/lib/legal";
import { contentFor, isEnglishFallback } from "@/lib/content";

function RichText({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith("**") && p.endsWith("**") ? (
          <strong key={i} className="font-semibold text-[var(--ink)]">{p.slice(2, -2)}</strong>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}

export default function LegalPage(
  { locale, title, sections }: { locale: Locale; title: string; sections: LegalSection[] },
) {
  const englishFallback = sections.length > 0 && isEnglishFallback(sections[0]!, locale);
  return (
    <div className="mx-auto w-full max-w-[40rem] px-[var(--s-4)] md:px-8 pt-12 pb-20">
      <h1 className="t-d2">{title}</h1>
      <p className="t-label mt-[var(--s-3)] pb-[var(--s-5)] border-b border-[var(--ink-16)]">
        {t(locale, "lastUpdated")} {LEGAL_UPDATED}
      </p>
      {englishFallback && (
        <p className="t-small mt-[var(--s-4)] text-[var(--ink-66)]">{t(locale, "legalEnNote")}</p>
      )}

      <div className="flex flex-col">
        {sections.map((sec, n) => {
          const c = contentFor(sec, locale);
          return (
            <section
              key={c.h}
              className={`pt-[var(--s-5)] pb-[var(--s-5)] ${n > 0 ? "border-t border-[var(--ink-16)]" : ""}`}
            >
              <h2 className="t-sect mb-[var(--s-3)]">
                <span className="font-[family-name:var(--mono)] mr-2">
                  {String(n + 1).padStart(2, "0")}
                </span>
                {/* the texts number their own headings ("4. 退款"); the mono counter already does that job */}
                {c.h.replace(/^\d+\.\s*/, "")}
              </h2>
              <div className="flex flex-col gap-[var(--s-3)]">
                {c.p.map((para, i) => (
                  <p key={i} className="t-body !text-[15px] text-[var(--ink-86)]">
                    <RichText text={para} />
                  </p>
                ))}
              </div>
            </section>
          );
        })}
      </div>

      <div className="mt-[var(--s-5)] pt-[var(--s-5)] border-t border-[var(--ink-16)] flex flex-wrap gap-x-6 gap-y-3">
        {([["", "backHome"], ["/about", "navAbout"], ["/terms", "navTerms"], ["/privacy", "navPrivacy"]] as const).map(
          ([href, key]) => (
            <Link
              key={key}
              href={`/${locale}${href}`}
              className="t-label hover:text-[var(--ink)] transition-colors"
            >
              {t(locale, key)}
            </Link>
          ),
        )}
      </div>
    </div>
  );
}
