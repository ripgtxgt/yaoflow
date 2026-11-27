import type { Metadata } from "next";
import { notFound } from "next/navigation";
import TrackOnce from "@/components/TrackOnce";
import HepanFree from "@/components/mingli/HepanFree";
import { canSee, featureState } from "@/lib/features";
import { loc } from "@/lib/mingli/calendar/content";
import type { HlLocale } from "@/lib/mingli/calendar/day";
import { birthUi } from "@/lib/mingli/birth/ui";
import { hepanVocab } from "@/lib/mingli/hepan/facts";
import { hepanT, hepanUiFor } from "@/lib/mingli/hepan/page-ui";
import { hepanNames } from "@/lib/mingli/hepan/names-data";
import { toHans } from "@/lib/hant";
import { brandName } from "@/lib/brand";
import { isLocale, type Locale } from "@/lib/locales";
import { serviceOpenIn } from "@/lib/services";
import { isForeign } from "@/lib/l10n/core";

export const dynamic = "force-dynamic";

/**
 * 10-21 合盤邀請 — TA's landing page: the inviter's birth is in the URL FRAGMENT (never sent to this server), the page itself
 * is the free overview with the inviter fixed as TA (HepanFree `invite`). Feature `hepan`; never indexed.
 * 10-30 进度表 128 ④: in every language the 合盤 is open in (an invite keeps the page's language).
 */
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale) || !serviceOpenIn("hepan", locale)) return {};
  const title = isForeign(locale) ? hepanT(locale).inviteMeta! : loc("有人邀請你一起合盤", locale as HlLocale);
  return { title: { absolute: `${title} — ${brandName(locale)}` }, robots: { index: false, follow: false } };
}

let HANS_MAP: Record<string, string> | null = null;
/** Traditional → Simplified for every character the overview can show (the client cannot load the converter) */
function hansMap(): Record<string, string> {
  if (HANS_MAP) return HANS_MAP;
  const out: Record<string, string> = {};
  for (const c of new Set([...hepanVocab()])) { const s = toHans(c); if (s !== c && [...s].length === 1) out[c] = s; }
  return (HANS_MAP = out);
}

export default async function HepanInvitePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale) || !serviceOpenIn("hepan", locale)) notFound();
  if (!(await canSee("hepan"))) notFound();
  const l = locale as Locale;
  const ui = hepanUiFor(l);
  const names = isForeign(l) ? hepanNames(l) : null;
  return (
    <div className="mx-auto w-full max-w-[46rem] px-[var(--s-4)] md:px-8 pt-10 pb-24">
      <TrackOnce event="hepan" locale={l} method="view:invite" />
      {featureState("hepan") === "preview" && !isForeign(l) && <p className="t-small mb-[var(--s-4)] p-[var(--s-3)] border border-[var(--gold)] rounded-[2px]">預覽中：只有登入後台的瀏覽器看得到，確認後到 /admin/features 對所有人開放。</p>}
      <h1 className="t-d1">{ui.head}</h1>
      <p className="t-body mt-[var(--s-3)] text-[var(--ink-66)]">{ui.lead}</p>
      <section className="mt-[var(--s-5)]">
        <HepanFree locale={l} ui={ui} birthUi={birthUi(l)} hansMap={l === "zh" ? hansMap() : null} castHref={`/${l}/cast`} names={names} invite />
      </section>
      <p className="t-small mt-[var(--s-6)] !text-[var(--ink-45)]">{ui.disclaimer}</p>
    </div>
  );
}
