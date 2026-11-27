"use client";

import { useState } from "react";
import { track } from "@/lib/track";

/** 11-05 进度表 138 合卦 (behind bmg-pair): the link that asks someone to take the quiz and see the two side by side */
export default function BmgPairInvite({ url }: { url: string }) {
  const [done, setDone] = useState(false);
  const copy = async () => {
    const text = `我做了本命卦，你也來做做看？做完可以並排看我們倆六個爻哪幾層相合：${url}`;
    try { await navigator.clipboard.writeText(text); } catch { /* the link is shown below anyway */ }
    setDone(true);
    track("bmg_view", { method: "pair:invite" });
  };
  return (
    <section className="mt-[var(--s-6)] border border-[var(--ink-16)] rounded-[2px] p-[var(--s-4)]" data-heat="bmg-pair-invite">
      <h2 className="t-sect">邀他也做一次</h2>
      <p className="t-small mt-1 !text-[var(--ink-66)]">他做完，就能並排看你們倆六個爻哪幾層相合、哪幾層不一樣，以及相處時可以多注意的地方。</p>
      <button type="button" onClick={() => void copy()} className="mt-[var(--s-3)] min-h-[44px] px-5 rounded-[2px] border border-[var(--ink)] text-[13px] tracking-[0.12em]">{done ? "已複製，貼給他就好" : "複製邀請連結"}</button>
      <p className="t-small mt-2 break-all !text-[var(--ink-45)]">{url}</p>
    </section>
  );
}
