import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { hexagramByNumber, type LineValue } from "@yaoflow/engine";
import { isLocale, t, type Locale } from "@/lib/i18n";
import { asLocale } from "@/lib/locales";
import { proofData } from "@/lib/db";
import { parseProofRef, verifyProofToken } from "@/lib/outcome-token";
import { hexName } from "@/lib/names";
import FigureMark, { changedYangs, primaryYangs } from "@/components/FigureMark";
import ProofCard from "@/components/ProofCard";
import { brandName } from "@/lib/brand";

export const dynamic = "force-dynamic";

const INTL: Record<Locale, string> = { zh: "zh-CN", "zh-hant": "zh-TW", en: "en-US", ja: "ja-JP", ko: "ko-KR", fr: "fr-FR", de: "de-DE", es: "es-ES", pt: "pt-BR" };
const fmt = (ms: number, l: Locale) => new Date(ms).toLocaleDateString(INTL[l], { year: "numeric", month: "short", day: "numeric" });

function load(ref: string) {
  const p = parseProofRef(ref);
  if (!p || !verifyProofToken(p.id, p.token)) return null;
  return proofData(p.id);
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string; ref: string }> }): Promise<Metadata> {
  const { locale, ref } = await params;
  const l = asLocale(locale);
  const d = load(ref);
  if (!d) return { title: "YaoFlow" };
  const name = hexName(hexagramByNumber(d.primary_num), l);
  return {
    title: `${name} · ${t(l, "proofHit")} · ${brandName(l)}`,
    description: t(l, "proofLead"),
    robots: { index: false, follow: true },
    openGraph: { title: `${name} · ${t(l, "proofHit")}`, description: t(l, "proofLead"), type: "website" },
  };
}

/**
 * 应验卡 (裂变 V1 ④): a revisit that came true, as a public card — the
 * figure, the cast date, the window the reading named, the day it came
 * true. Never the question. Reached from the thank-you page of the
 * one-tap "it came true" link; shared onward with the sharer's via code.
 */
export default async function ProofPage({ params }: { params: Promise<{ locale: string; ref: string }> }) {
  const { locale, ref } = await params;
  if (!isLocale(locale)) notFound();
  const l = locale as Locale;
  const d = load(ref);
  if (!d) notFound();
  const values = d.values_str.split(",").map(Number) as LineValue[]; // stored "7,8,9,8,7,8"
  const code = values.join("");
  const primary = hexagramByNumber(d.primary_num);
  const changed = d.changed_num ? hexagramByNumber(d.changed_num) : null;
  const site = (process.env.SITE_URL ?? "https://yaoflow.com").replace(/\/$/, "");
  // 09-28 (进度表 15 ③): the shared link and the door out carry the source and the author's share code
  const url = `${site}/${l}/proof/${ref}?c=ying-share&r=${code}`; // 10-13 进度表 41 ①

  return (
    <div className="mx-auto w-full max-w-[36rem] px-[var(--s-4)] md:px-8 pt-10 pb-20">
      <p className="t-label pb-[var(--s-4)]">{t(l, "proofLead")}</p>

      <div className="ink-block relative overflow-hidden">
        {/* the seal: cinnabar, tilted a touch, the way a chop lands on paper */}
        <div className="absolute right-[var(--s-4)] top-[var(--s-4)] rotate-[-8deg] border-[3px] border-[var(--cinnabar)] text-[var(--cinnabar)] rounded-[3px] px-3 py-1 text-[13px] tracking-[0.3em] font-semibold select-none" aria-hidden>
          {t(l, "proofSeal")}
        </div>
        <div className="flex items-center gap-6">
          <div>
            <FigureMark yangs={primaryYangs(values)} width={56} className="mb-3" />
            <p className="t-body !text-[15px]">{hexName(primary, l)}</p>
          </div>
          {changed && (
            <>
              <span className="t-label !text-[16px] !text-[var(--paper-45)] self-center pt-2">→</span>
              <div className="text-[var(--paper-66)]">
                <FigureMark yangs={changedYangs(values)} width={56} className="mb-3" />
                <p className="t-body !text-[15px] text-[var(--paper)]">{hexName(changed, l)}</p>
              </div>
            </>
          )}
        </div>

        <dl className="mt-[var(--s-5)] pt-[var(--s-5)] border-t border-[var(--paper-12)] grid grid-cols-[auto_1fr] gap-x-6 gap-y-2">
          <dt className="t-label !text-[var(--paper-45)]">{t(l, "proofCast")}</dt>
          <dd className="t-body !text-[15px] tabular-nums">{fmt(d.cast_at, l)}</dd>
          <dt className="t-label !text-[var(--paper-45)]">{t(l, "proofWindow")}</dt>
          <dd className="t-body !text-[15px]">{d.timing_quote ?? `${d.window_days}d`}</dd>
          <dt className="t-label !text-[var(--gold)]">{t(l, "proofHit")}</dt>
          <dd className="t-body !text-[15px] tabular-nums text-[var(--paper)]">{fmt(d.outcome_at, l)}</dd>
        </dl>
        <p className="t-label !text-[var(--paper-45)] mt-[var(--s-4)] text-right">yaoflow.com</p>
      </div>

      <p className="t-small mt-[var(--s-4)] !text-[var(--ink-66)]">{t(l, "proofBody")}</p>
      {/* 10-13 进度表 41 ③: the 「應了」 card (9:16), a line of the reader's own if they want, and every channel counted */}
      <ProofCard locale={l} refId={ref} url={url} />

      <Link
        href={`/${l}?via=${code}&c=proof`}
        // 09-21: for the stranger the card was sent to, this is the page's main action
        className="inline-block mt-[var(--s-5)] w-full md:w-auto text-center min-h-[var(--s-6)] px-9 py-3 rounded-[2px] bg-[var(--ink)] text-[var(--paper)] text-[13px] tracking-[0.16em] hover:bg-[var(--cinnabar)] transition-colors"
      >
        {t(l, "shareCta")}
      </Link>
    </div>
  );
}
