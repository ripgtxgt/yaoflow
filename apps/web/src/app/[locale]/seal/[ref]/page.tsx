import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { hexagramByNumber, type LineValue } from "@yaoflow/engine";
import { isLocale, t, type Locale } from "@/lib/i18n";
import { asLocale } from "@/lib/locales";
import { sealData, sealWatcherCount } from "@/lib/db";
import { parseSealRef, verifySealToken } from "@/lib/outcome-token";
import { hexName } from "@/lib/names";
import FigureMark, { changedYangs, primaryYangs } from "@/components/FigureMark";
import SealWatch from "@/components/SealWatch";
import { sealState } from "@/lib/seal";
import { brandName } from "@/lib/brand";

export const dynamic = "force-dynamic";

const INTL: Record<Locale, string> = { zh: "zh-CN", "zh-hant": "zh-TW", en: "en-US", ja: "ja-JP", ko: "ko-KR", fr: "fr-FR", de: "de-DE", es: "es-ES", pt: "pt-BR" };
const fmt = (ms: number, l: Locale) => new Date(ms).toLocaleDateString(INTL[l], { year: "numeric", month: "short", day: "numeric" });

function load(ref: string) {
  const p = parseSealRef(ref);
  if (!p || !verifySealToken(p.id, p.token)) return null;
  return sealData(p.id);
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string; ref: string }> }): Promise<Metadata> {
  const { locale, ref } = await params;
  const l = asLocale(locale);
  const d = load(ref);
  if (!d) return { title: "YaoFlow" };
  const name = hexName(hexagramByNumber(d.primary_num), l);
  const state = sealState(d);
  const lead = t(l, state === "hit" ? "sealLeadHit" : state === "miss" ? "sealLeadMiss" : state === "silent" ? "sealLeadSilent" : "sealLead");
  return {
    title: `${name} · ${lead} · ${brandName(l)}`,
    // the timing line IS the hook — it is what the sharer chose to make public
    description: (d.timing_quote ?? lead).slice(0, 140),
    robots: { index: false, follow: true },
    openGraph: { title: `${name} · ${lead}`, description: (d.timing_quote ?? lead).slice(0, 140), type: "website" },
  };
}

/**
 * 封卦 (09-21, A1): a prediction put on the record BEFORE it is settled —
 * the figure, the day of the cast, and the one line the reading gave about
 * timing. Never the question. The page has four faces: the window is still
 * open; the person came back and said it came true; they said it didn't; or
 * the window has passed with no word. Whoever is watching can leave an
 * address and be told once, when it settles.
 *
 * Why this shape (裂变玩法调研 §2.2): Long Bets — "Prediction is easy.
 * Accountability is hard." A claim with a date, in public, before the fact.
 */
export default async function SealPage({ params }: { params: Promise<{ locale: string; ref: string }> }) {
  const { locale, ref } = await params;
  if (!isLocale(locale)) notFound();
  const l = locale as Locale;
  const d = load(ref);
  if (!d) notFound();

  const values = d.values_str.split(",").map(Number) as LineValue[];
  const code = values.join("");
  const primary = hexagramByNumber(d.primary_num);
  const changed = d.changed_num ? hexagramByNumber(d.changed_num) : null;
  const state = sealState(d);
  const settled = state === "hit" || state === "miss";
  const watching = sealWatcherCount(d.id);

  const lead = t(l, state === "hit" ? "sealLeadHit" : state === "miss" ? "sealLeadMiss" : state === "silent" ? "sealLeadSilent" : "sealLead");
  const note = state === "hit" ? t(l, "sealHitNote")
    : state === "miss" ? t(l, "sealMissNote")
    : state === "silent" ? t(l, "sealSilentNote")
    : t(l, "sealOpenNote", { date: fmt(d.due_at, l) });
  const stamp = state === "hit" ? t(l, "proofSeal") : state === "miss" ? t(l, "sealStampMiss") : null;
  const askUrl = `/${l}?via=${code}`;

  return (
    <div className="mx-auto w-full max-w-[36rem] px-[var(--s-4)] md:px-8 pt-10 pb-28 md:pb-20">
      <p className="t-label pb-[var(--s-4)]">{lead}</p>

      <div className="ink-block relative overflow-hidden">
        {stamp && (
          <div
            className={`absolute right-[var(--s-4)] top-[var(--s-4)] rotate-[-8deg] border-[3px] rounded-[3px] px-3 py-1 text-[13px] tracking-[0.3em] font-semibold select-none ${
              state === "hit" ? "border-[var(--cinnabar)] text-[var(--cinnabar)]" : "border-[var(--paper-45)] text-[var(--paper-45)]"
            }`}
            aria-hidden
          >
            {stamp}
          </div>
        )}
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

        {d.timing_quote && (
          <blockquote className="mt-[var(--s-5)] pt-[var(--s-5)] border-t border-[var(--paper-12)]">
            <p className="t-label !text-[var(--gold)] mb-2">{t(l, "sealSaid")}</p>
            <p className="t-d3">{d.timing_quote}</p>
          </blockquote>
        )}

        <dl className="mt-[var(--s-5)] pt-[var(--s-5)] border-t border-[var(--paper-12)] grid grid-cols-[auto_1fr] gap-x-6 gap-y-2">
          <dt className="t-label !text-[var(--paper-45)]">{t(l, "proofCast")}</dt>
          <dd className="t-body !text-[15px] tabular-nums">{fmt(d.cast_at, l)}</dd>
          <dt className={`t-label ${settled ? "!text-[var(--gold)]" : "!text-[var(--paper-45)]"}`}>{settled ? t(l, "proofHit") : t(l, "sealDue")}</dt>
          <dd className="t-body !text-[15px] tabular-nums text-[var(--paper)]">{fmt(settled && d.outcome_at ? d.outcome_at : d.due_at, l)}</dd>
        </dl>
        <p className="t-label !text-[var(--paper-45)] mt-[var(--s-4)] text-right">yaoflow.com</p>
      </div>

      <p className="t-body !text-[15px] mt-[var(--s-4)]">{note}</p>
      <p className="t-small mt-[var(--s-3)] !text-[var(--ink-66)]">{t(l, "sealBody")}</p>

      {/* still open: whoever is curious can be told once, when it settles */}
      {!settled && <SealWatch locale={l} id={d.id} watching={watching} />}
      {settled && watching > 0 && <p className="t-small mt-[var(--s-3)] !text-[var(--ink-45)]">{t(l, "sealWatching", { n: watching })}</p>}

      <p className="t-small !text-[var(--ink-66)] mt-[var(--s-5)]">{t(l, "shareAskLead")}</p>
      <Link
        href={askUrl}
        className="inline-block mt-[var(--s-3)] w-full md:w-auto text-center min-h-[var(--s-6)] px-9 py-3 rounded-[2px]
                   bg-[var(--ink)] text-[var(--paper)] text-[13px] tracking-[0.16em] hover:bg-[var(--cinnabar)] transition-colors"
      >
        {t(l, "shareCta")}
      </Link>
      <div className="md:hidden fixed inset-x-0 bottom-[calc(2.75rem+env(safe-area-inset-bottom))] z-20 px-[var(--s-4)] pb-3 pt-3 bg-[var(--paper)]/95 backdrop-blur border-t border-[var(--ink-16)]">
        <Link href={askUrl} className="block w-full text-center min-h-[var(--s-6)] px-6 py-3 rounded-[2px] bg-[var(--ink)] text-[var(--paper)] text-[13px] tracking-[0.16em]">
          {t(l, "shareCta")}
        </Link>
      </div>
    </div>
  );
}
