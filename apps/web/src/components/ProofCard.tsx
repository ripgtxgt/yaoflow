"use client";

import { useState } from "react";
import ShareSheet from "@/components/ShareSheet";
import { t, type Locale } from "@/lib/i18n";
import { track } from "@/lib/track";
import { ssh } from "@/lib/dict/share-sheet";

/**
 * 10-13 进度表 41 ③: the 「應了」 card — the figure, the window, the day it came true and the cinnabar seal, plus one
 * line of the reader's own if they want (empty by default). Never the question. The link is tagged ying-share.
 */
export default function ProofCard({ locale, refId, url }: { locale: Locale; refId: string; url: string }) {
  const [line, setLine] = useState("");
  const [shown, setShown] = useState("");
  const image = `/api/proof/${refId}/story?l=${locale}${shown ? `&m=${encodeURIComponent(shown)}` : ""}`;
  return (
    <div className="mt-[var(--s-5)]">
      <label className="block">
        <span className="t-label">{ssh(locale, "yingLine")}</span>
        <input value={line} maxLength={50} onChange={(e) => setLine(e.target.value)} onBlur={() => setShown(line.trim())}
          placeholder={ssh(locale, "yingHint")}
          className="mt-2 w-full t-body bg-transparent border border-[var(--ink-16)] rounded-[2px] px-3 py-2.5 outline-none focus:border-[var(--ink-45)] placeholder:text-[var(--ink-45)]" />
      </label>
      <ShareSheet locale={locale} surface="revisit" url={url} text={t(locale, "proofShareText")} image={image} fileName={`yaoflow-ying-${refId.slice(0, 8)}.png`}
        onShared={(ch) => track("proof_share", { locale, method: ch === "native" || ch === "copy" ? ch : `card-${ch}` })} />
    </div>
  );
}
