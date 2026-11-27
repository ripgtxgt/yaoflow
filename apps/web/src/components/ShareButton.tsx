"use client";

import { useShare, type ShareInput } from "@/lib/use-share";

/**
 * 10-22 进度表 76 (分享 13 合 1): the one-tap share — the phone's sheet where there is one, otherwise copy — with the
 * copy link beside it on phones that have the sheet. The same hook as the full ShareSheet; the small buttons that
 * used to carry their own navigator.share / clipboard code (今日一卦, 封卦, 同題合參, 送一卦, 推薦) are this now.
 */
export default function ShareButton({ label, copiedLabel, copyLabel, look = "primary", className = "", heat, ...input }: ShareInput & {
  label: string; copiedLabel: string; copyLabel?: string; look?: "primary" | "link"; className?: string; heat?: string;
}) {
  const sh = useShare(input);
  const main = look === "primary"
    ? "min-h-[var(--s-6)] px-6 py-3 rounded-[2px] bg-[var(--ink)] text-[var(--paper)] text-[13px] tracking-[0.16em] hover:bg-[var(--cinnabar)] transition-colors"
    : "t-small underline underline-offset-4 !text-[var(--ink-66)] hover:!text-[var(--ink)]";
  return (
    <span className={`inline-flex flex-wrap items-center gap-3 ${className}`}>
      <button type="button" onClick={() => void sh.shareOrCopy()} className={main} data-heat={heat}>{sh.copied ? copiedLabel : label}</button>
      {copyLabel && sh.canNative && (
        <button type="button" onClick={() => void sh.copy()} className="t-label hover:text-[var(--ink)] transition-colors">{sh.copied ? copiedLabel : copyLabel}</button>
      )}
    </span>
  );
}
