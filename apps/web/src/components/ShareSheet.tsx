"use client";

import type { ShareChannel, ShareSurface } from "@/lib/share-meta";
import { useShare } from "@/lib/use-share";
import { ssh } from "@/lib/dict/share-sheet";

/**
 * 10-13 进度表 41 ②: one share panel for every surface — the 9:16 card first (a thumbnail you can open), then the
 * places people actually post: the phone's share sheet with the picture attached, LINE, Threads, an IG story (save
 * the picture), save, copy. Every tap is one share_click with its surface (sf) and channel (method).
 * The card never carries the reader's question; the link carries a campaign tag set by the caller.
 */
export default function ShareSheet({
  locale, surface, url, text, image, fileName = "yaoflow.png", primary = "native", compact = false, onShared,
}: {
  locale: string;
  surface: ShareSurface;
  url: string;
  text: string;
  /** the 9:16 card (same origin); without it the sheet shares the link only */
  image?: string | null;
  fileName?: string;
  /** which button leads — LINE for a lot shared with the people you went to the temple with */
  primary?: "native" | "line";
  compact?: boolean;
  onShared?: (ch: ShareChannel) => void;
}) {
  // 10-22 分享 13 合 1: the mechanics live in lib/use-share.ts, shared with every ShareButton
  const { canNative, note, native, copy, ig, download, line, threads } = useShare({ locale, surface, url, text, image, fileName, onShared });
  const save = download;

  const pill = "inline-flex items-center gap-1.5 min-h-[40px] px-3.5 rounded-full border border-[var(--ink-16)] text-[12px] tracking-[0.06em] text-[var(--ink-86)] hover:border-[var(--ink-45)] hover:text-[var(--ink)] transition-colors";
  const lead = "inline-flex items-center justify-center gap-2 w-full min-h-[46px] px-5 rounded-[2px] text-[13px] tracking-[0.14em] transition-colors";
  const leadLine = primary === "line";

  return (
    <div className={`flex gap-[var(--s-4)] items-start ${compact ? "" : "mt-[var(--s-3)]"}`}>
      {image && !compact && (
        <a href={image} target="_blank" rel="noreferrer" className="shrink-0 group" aria-label={ssh(locale, "save")}>
          <span className="block w-[104px] sm:w-[124px] aspect-[9/16] rounded-[6px] overflow-hidden border border-[var(--ink-16)] bg-[var(--paper)] shadow-[0_10px_28px_-12px_rgba(20,21,28,0.45)] rotate-[-2deg] group-hover:rotate-0 transition-transform">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={image} alt="" loading="lazy" className="w-full h-full object-cover" onError={(e) => { e.currentTarget.style.visibility = "hidden"; }} />
          </span>
        </a>
      )}
      <div className="flex-1 min-w-0 flex flex-col gap-2.5">
        {leadLine ? (
          <button type="button" onClick={line} className={`${lead} bg-[#06C755] text-white hover:brightness-95`} data-heat={`share-${surface}-line`}>
            <Dot c="#fff" /> LINE
          </button>
        ) : (
          <button type="button" onClick={() => void (canNative ? native() : image ? ig() : copy())} className={`${lead} bg-[var(--ink)] text-[var(--paper)] hover:bg-[var(--cinnabar)]`} data-heat={`share-${surface}-native`}>
            {image ? ssh(locale, "image") : ssh(locale, "copy")}
          </button>
        )}
        <div className="flex flex-wrap gap-2">
          {!leadLine && <button type="button" onClick={line} className={pill} data-heat={`share-${surface}-line`}><Dot c="#06C755" />LINE</button>}
          {leadLine && canNative && <button type="button" onClick={() => void native()} className={pill} data-heat={`share-${surface}-native`}>{image ? ssh(locale, "image") : "…"}</button>}
          <button type="button" onClick={threads} className={pill} data-heat={`share-${surface}-threads`}><span aria-hidden className="text-[13px] leading-none">@</span>Threads</button>
          {image && <button type="button" onClick={() => void ig()} className={pill} data-heat={`share-${surface}-ig`}><Dot c="#d6249f" />{ssh(locale, "ig")}</button>}
          {image && <button type="button" onClick={save} className={pill} data-heat={`share-${surface}-save`}>↓ {ssh(locale, "save")}</button>}
          <button type="button" onClick={() => void copy()} className={pill} data-heat={`share-${surface}-copy`}>{ssh(locale, "copy")}</button>
        </div>
        <p className="t-small !text-[var(--ink-45)] min-h-[1.2em]" aria-live="polite">{note ?? (image ? ssh(locale, "noQ") : "")}</p>
      </div>
    </div>
  );
}

function Dot({ c }: { c: string }) {
  return <span aria-hidden className="inline-block w-2 h-2 rounded-full" style={{ background: c }} />;
}
