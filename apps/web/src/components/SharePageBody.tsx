import Link from "next/link";
import { resolveCast, textsFor, type LineValue } from "@yaoflow/engine";
import { t, type Locale } from "@/lib/i18n";
import { altLang, hexName, hexSubName, judgmentFor } from "@/lib/names";
import { localTextsFor } from "@/lib/originals";
import FigureMark, { changedYangs, primaryYangs } from "@/components/FigureMark";
import { guaSlug } from "@/lib/gua";
import { entryT } from "@/lib/dict/entry";

/**
 * A public card: hexagram + classical judgment, and — only when the sharer
 * chose to attach it — one line of their own verdict. No question, no
 * reading, ever.
 */
export default function SharePageBody({ locale: l, code, values, quote }: { locale: Locale; code: string; values: LineValue[]; quote: string | null }) {
  const cast = resolveCast(values);
  const texts = textsFor(cast.primary.number);
  const j = judgmentFor(texts, l, localTextsFor(cast.primary.number, l));

  // ?via=<code> pins first-touch attribution: whoever this share brings
  // in stays attributed to it through cast and purchase
  // 09-30 (Neil: 「1，2，3都做吧」): straight to the cast — the home page was one more hop, and it is where
  // new visitors leave (155 share landings a week, 43% cast). The via code rides along in the URL.
  const askUrl = `/${l}/cast?via=${code}`;

  return (
    <div className="mx-auto w-full max-w-[36rem] px-[var(--s-4)] md:px-8 pt-10 pb-28 md:pb-20">
      <p className="t-label pb-[var(--s-4)]">{t(l, "shareCardLead")}</p>

      {/* the card itself: ink, so it reads as an object worth screenshotting.
          Figures are drawn, never Unicode glyphs — identical on every device. */}
      <div className="ink-block">
        <div className="flex items-center gap-6">
          <div>
            <FigureMark yangs={primaryYangs(values)} width={56} className="mb-3" />
            <p className="t-body !text-[15px]">
              {/* 09-23 (§14 ⑯): the share page is where strangers land — send them to the hexagram's own page */}
              <Link href={`/${l}/gua/${guaSlug(cast.primary)}`} className="underline decoration-[var(--paper-45)] underline-offset-4 hover:decoration-[var(--paper)]">{hexName(cast.primary, l)}</Link>
            </p>
            <p className="t-label !normal-case !tracking-[0.06em] !text-[var(--paper-45)] mt-0.5">{hexSubName(cast.primary, l)}</p>
          </div>
          {cast.changed && (
            <>
              <span className="t-label !text-[16px] !text-[var(--paper-45)] self-center pt-2">→</span>
              <div className="text-[var(--paper-66)]">
                <FigureMark yangs={changedYangs(values)} width={56} className="mb-3" />
                <p className="t-body !text-[15px] text-[var(--paper)]">
                  <Link href={`/${l}/gua/${guaSlug(cast.changed)}`} className="underline decoration-[var(--paper-45)] underline-offset-4 hover:decoration-[var(--paper)]">{hexName(cast.changed, l)}</Link>
                </p>
                <p className="t-label !normal-case !tracking-[0.06em] !text-[var(--paper-45)] mt-0.5">{hexSubName(cast.changed, l)}</p>
              </div>
            </>
          )}
        </div>

        <blockquote className="mt-[var(--s-5)] pt-[var(--s-5)] border-t border-[var(--paper-12)]">
          <p className="t-d3">{j.main}</p>
          <p lang={altLang(l, localTextsFor(cast.primary.number, l))} className="t-small mt-[var(--s-2)] !text-[var(--paper-45)]">{j.alt}</p>
        </blockquote>

        {quote && (
          <div className="mt-[var(--s-5)] pt-[var(--s-4)] border-t border-[var(--paper-12)]">
            <p className="t-label !text-[var(--gold)] mb-2">{t(l, "shareQuoteLead")}</p>
            <p className="t-body !text-[16px] text-[var(--paper)]">{quote}</p>
          </div>
        )}
        <p className="t-label !text-[var(--paper-45)] mt-[var(--s-4)] text-right">yaoflow.com</p>
      </div>

      {/* 09-21: the page's one job is the next question — the door sits right
          under the card, and on a phone it also stays pinned to the bottom
          (424 card views brought 69 visits; the door was below the fold) */}
      <p className="t-small !text-[var(--ink-66)] mt-[var(--s-5)]">{t(l, "shareAskLead")}</p>
      {/* 09-30: the free first full reading (双边推荐, /api/me inviteFree) was never said where the stranger lands */}
      <p className="t-small !text-[var(--gold-text)] mt-1">{entryT(l).shareFree}</p>
      <Link
        href={askUrl}
        data-heat="share-ask"
        className="inline-block mt-[var(--s-3)] w-full md:w-auto text-center min-h-[var(--s-6)]
                   px-9 py-3 rounded-[2px] bg-[var(--ink)] text-[var(--paper)]
                   text-[13px] tracking-[0.16em] hover:bg-[var(--cinnabar)] transition-colors"
      >
        {t(l, "shareCta")}
      </Link>
      <div className="md:hidden fixed inset-x-0 bottom-[calc(2.75rem+env(safe-area-inset-bottom))] z-20 px-[var(--s-4)] pb-3 pt-3 bg-[var(--paper)]/95 backdrop-blur border-t border-[var(--ink-16)]">
        <Link
          href={askUrl}
          data-heat="share-ask-bar"
          className="block w-full text-center min-h-[var(--s-6)] px-6 py-3 rounded-[2px]
                     bg-[var(--ink)] text-[var(--paper)] text-[13px] tracking-[0.16em]"
        >
          {t(l, "shareCta")}
        </Link>
      </div>

      <section className="mt-[var(--s-6)] pt-[var(--s-5)] border-t border-[var(--ink-16)]">
        <h2 className="t-sect mb-[var(--s-3)]">{t(l, "shareWhat")}</h2>
        <p className="t-small">{t(l, "shareWhatBody")}</p>
      </section>
    </div>
  );
}
