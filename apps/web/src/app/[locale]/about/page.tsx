import type { Metadata } from "next";
import JsonLd from "@/components/JsonLd";
import { pageJsonLd } from "@/lib/site-jsonld";
import Link from "next/link";
import { outcomeRecordsOn } from "@/lib/outcome-records";
import { notFound } from "next/navigation";
import { isLocale, t, type Locale, LOCALES } from "@/lib/i18n";
import { asLocale, pageAlternates } from "@/lib/locales";
import { contentFor } from "@/lib/content";
import { ABOUT, ABOUT_META, CONTACT_EMAIL, SOURCES, pick } from "@/lib/trust";
import { brandName } from "@/lib/brand";

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }));
}

export async function generateMetadata(
  { params }: { params: Promise<{ locale: string }> },
): Promise<Metadata> {
  const { locale } = await params;
  const l = asLocale(locale);
  return {
    title: `${t(l, "aboutTitle")}`,
    description: contentFor(ABOUT_META, l),
    alternates: pageAlternates(l, "/about"),
    // 10-16 进度表 61: the shared card said the home slogan while the tab said About — one title for both
    openGraph: { siteName: brandName(l), type: "website", title: `${t(l, "aboutTitle")}`, description: contentFor(ABOUT_META, l) },
  };
}

/** Renders **bold** spans inside a paragraph. */
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

export default async function AboutPage(
  { params }: { params: Promise<{ locale: string }> },
) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const l = locale as Locale;
  const n2 = (i: number) => String(i).padStart(2, "0");

  return (
    <div className="mx-auto w-full max-w-[42rem] px-[var(--s-4)] md:px-8 pt-12 pb-20">
      <JsonLd data={pageJsonLd(l, "/about", "AboutPage", t(l, "aboutTitle"), contentFor(ABOUT_META, l))} />
      <h1 className="t-d2">{t(l, "aboutTitle")}</h1>
      <p className="t-body mt-[var(--s-4)] pb-[var(--s-5)] text-[var(--ink-66)]">{t(l, "aboutLead")}</p>

      <div className="flex flex-col">
        {ABOUT.map((sec, n) => {
          const c = pick(sec, l);
          return (
            <section key={c.h} className="pt-[var(--s-5)] pb-[var(--s-5)] border-t border-[var(--ink-16)]">
              <h2 className="t-sect mb-[var(--s-4)]">
                <span className="font-[family-name:var(--mono)] mr-2">{n2(n + 1)}</span>
                {c.h}
              </h2>
              <div className="flex flex-col gap-[var(--s-3)]">
                {c.p.map((para, i) => (
                  <p key={i} className="t-body text-[var(--ink-86)]">
                    <RichText text={para} />
                  </p>
                ))}
              </div>
            </section>
          );
        })}

        <section className="pt-[var(--s-5)] pb-[var(--s-5)] border-t border-[var(--ink-16)]">
          <h2 className="t-sect mb-[var(--s-4)]">
            <span className="font-[family-name:var(--mono)] mr-2">{n2(ABOUT.length + 1)}</span>
            {t(l, "sourcesHeading")}
          </h2>
          <ul className="flex flex-col">
            {SOURCES.map((s, i) => {
              const c = pick(s, l);
              return (
                <li key={s.href}>
                  <a
                    href={s.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`group flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 py-3
                                ${i < SOURCES.length - 1 ? "border-b border-dotted border-[var(--ink-16)]" : ""}`}
                  >
                    <span className="t-body !text-[15px] group-hover:text-[var(--cinnabar)] transition-colors">
                      {c.title}
                    </span>
                    <span className="t-label !normal-case !tracking-[0.04em] min-w-0">{c.note}</span>
                  </a>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="pt-[var(--s-5)] pb-[var(--s-5)] border-t border-[var(--ink-16)]">
          <h2 className="t-sect mb-[var(--s-4)]">
            <span className="font-[family-name:var(--mono)] mr-2">{n2(ABOUT.length + 2)}</span>
            {t(l, "contactHeading")}
          </h2>
          <p className="t-body text-[var(--ink-86)]">
            {t(l, "contactBody")}{" "}
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="border-b border-[var(--ink-45)] hover:text-[var(--cinnabar)] hover:border-[var(--cinnabar)] transition-colors"
            >
              {CONTACT_EMAIL}
            </a>
          </p>
        </section>
      </div>

      {/* 10-14 进度表 45: 應驗紀錄 entry — 繁體 / 简体, only while the records are on */}
      {outcomeRecordsOn() && (l === "zh-hant" || l === "zh") && (
        <p className="t-body mt-[var(--s-4)]">
          <Link href={`/${l}/outcomes`} data-heat="about-outcomes" className="border-b border-[var(--ink-45)] hover:text-[var(--cinnabar)] hover:border-[var(--cinnabar)] transition-colors">
            {l === "zh" ? "应验记录：读者自己公开的卦例，到期后自己回报的结果 →" : "應驗紀錄：讀者自己公開的卦例，到期後自己回報的結果 →"}
          </Link>
        </p>
      )}

      <div className="mt-[var(--s-4)] pt-[var(--s-5)] border-t border-[var(--ink-16)] flex flex-wrap gap-x-6 gap-y-3">
        {([["", "backHome"], ["/terms", "navTerms"], ["/privacy", "navPrivacy"]] as const).map(([href, key]) => (
          <Link
            key={key}
            href={`/${l}${href}`}
            className="t-label hover:text-[var(--ink)] transition-colors"
          >
            {t(l, key)}
          </Link>
        ))}
      </div>
    </div>
  );
}
