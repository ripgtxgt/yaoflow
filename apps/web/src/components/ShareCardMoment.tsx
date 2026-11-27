"use client";

import { sst } from "@/lib/dict/share-story";
import { useEffect, useState } from "react";
import type { LineValue } from "@yaoflow/engine";
import { t, type Locale } from "@/lib/i18n";
import { encodeCast, shareUrlWithQuote } from "@/lib/share";
import { SHARE_TAGS, withShareTag } from "@/lib/share-meta";
import ShareSheet from "@/components/ShareSheet";

/** 10-13 进度表 41 ③: the deep reading's date card, inside the one-time 「把這個日子存成一張卡？」 moment. */
export default function ShareCardMoment({ locale, values, verdict, shareRef, windowText }: {
  locale: Locale; values: readonly LineValue[]; verdict: string | null; shareRef: string | null; windowText: string;
}) {
  const [origin, setOrigin] = useState("https://yaoflow.com");
  useEffect(() => setOrigin(window.location.origin), []);
  const code = encodeCast(values);
  const url = withShareTag(shareUrlWithQuote(origin, locale, values, verdict) + (shareRef ? `?r=${shareRef}` : ""), SHARE_TAGS.gua);
  const image = `/api/share/${code}/story?l=${locale}${verdict ? `&q=${encodeURIComponent(verdict.slice(0, 70))}` : ""}&w=${encodeURIComponent(windowText)}${shareRef ? `&r=${shareRef}` : ""}`;
  return (
    <>
      {/* 10-15 进度表 54: the one sentence, right above the buttons */}
      <p className="t-small mb-[var(--s-3)] border-l-2 border-[var(--gold)] pl-3 !text-[var(--ink)]" data-ref-line="54">{sst(locale, shareRef ? "shareOne" : "shareOnly")}</p>
      <ShareSheet locale={locale} surface="deep" url={url} text={t(locale, "shareText")} image={image} fileName={`yaoflow-${code}-day.png`} />
    </>
  );
}
