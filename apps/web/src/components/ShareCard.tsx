"use client";

import { sst } from "@/lib/dict/share-story";
import { useEffect, useState } from "react";
import type { LineValue } from "@yaoflow/engine";
import { t, type Locale } from "@/lib/i18n";
import { encodeCast, shareUrlWithQuote } from "@/lib/share";
import { SHARE_TAGS, withShareTag, type ShareSurface } from "@/lib/share-meta";
import ShareSheet from "@/components/ShareSheet";

/**
 * The share moment right after a reading (裂变 V1 ③). The link carries only the six lines; the sharer may attach ONE
 * line of their verdict — on by default since 09-21, their choice to untick — and sees how many people their share has
 * already brought to a cast.
 * 10-13 进度表 41 ②④: the 9:16 card leads (figure, the one line, the date window — never the question), every channel
 * is counted with its surface, the link is tagged gua-share, and the 「送朋友問一件事」 offer sits beside the card.
 */
export default function ShareCard(
  { locale, values, verdict, shareRef = null, surface = "result", windowText = null }:
  { locale: Locale; values: readonly LineValue[]; verdict?: string | null; shareRef?: string | null; surface?: ShareSurface; windowText?: string | null },
) {
  const [withQuote, setWithQuote] = useState(true);
  const [brought, setBrought] = useState<number | null>(null);
  const [origin, setOrigin] = useState("");
  const code = encodeCast(values);
  const quote = withQuote && verdict ? verdict : null;
  useEffect(() => {
    setOrigin(window.location.origin);
    fetch(`/api/share-stats?code=${code}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { casts?: number } | null) => { if (d && typeof d.casts === "number") setBrought(d.casts); })
      .catch(() => { /* the count is a nicety */ });
  }, [code]);
  // 09-29: the sharer's own ref, so the newcomer this brings can thank them (share_refs)
  const url = withShareTag(shareUrlWithQuote(origin || "https://yaoflow.com", locale, values, quote) + (shareRef ? `?r=${shareRef}` : ""), SHARE_TAGS.gua);
  const image = `/api/share/${code}/story?l=${locale}${quote ? `&q=${encodeURIComponent(quote.slice(0, 70))}` : ""}${windowText ? `&w=${encodeURIComponent(windowText)}` : ""}${shareRef ? `&r=${shareRef}` : ""}`;

  return (
    <section className="mt-[var(--s-5)] pt-[var(--s-5)] border-t border-[var(--ink-16)]">
      <h3 className="t-sect mb-[var(--s-2)]">{t(locale, "shareTitle")}</h3>
      <p className="t-small !text-[var(--ink-45)] mb-[var(--s-3)]">{t(locale, "shareBody")}</p>
      {verdict && (
        <label className="flex items-start gap-2 cursor-pointer mb-[var(--s-3)]">
          <input type="checkbox" checked={withQuote} onChange={(e) => setWithQuote(e.target.checked)} className="mt-[3px] accent-[var(--ink)]" />
          <span className="t-small !text-[var(--ink-66)]">{t(locale, "shareWithVerdict")}<span className="block mt-1 !text-[var(--ink-45)]">“{verdict}”</span></span>
        </label>
      )}
      {/* 10-15 进度表 54: one sentence for what sharing earns, right above the buttons (no ref → no reward to promise) */}
      <p className="t-small mb-[var(--s-3)] border-l-2 border-[var(--gold)] pl-3 !text-[var(--ink)]" data-ref-line="54">{sst(locale, shareRef ? "shareOne" : "shareOnly")}</p>
      <ShareSheet locale={locale} surface={surface} url={url} text={t(locale, "shareText")} image={image} fileName={`yaoflow-${code}.png`} />
      {brought !== null && brought > 0 && <p className="t-small mt-[var(--s-3)] !text-[var(--ink-66)]">{t(locale, "shareBrought", { n: brought })}</p>}
    </section>
  );
}
