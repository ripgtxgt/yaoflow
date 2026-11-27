"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { goToCast } from "@/lib/cast-nav";
import { loveCastUrl, LOVE_LANDING_LOCALE, LOVE_SELL } from "@/lib/love-landing";
import type { Situation } from "@/lib/situation";

/**
 * 10-12 感情落地頁 (进度表 §四 37): the page's question box — the situation already said, three ways to ask that fill
 * the box (not start the cast: the reader should still make the question theirs), and the cast it opens carries the
 * situation chip and the page's campaign tag.
 */
export default function LoveAskBox({ slug, situation, situationLabel, examples }: { slug: string; situation?: Situation; situationLabel: string; examples: string[] }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [going, setGoing] = useState(false);
  useEffect(() => { router.prefetch(`/${LOVE_LANDING_LOCALE}/cast`); }, [router]);
  const go = () => {
    const question = q.trim();
    if (question.length < 2 || going) return;
    setGoing(true);
    goToCast(router, LOVE_LANDING_LOCALE, question, loveCastUrl({ slug, situation }, question));
  };
  return (
    <form onSubmit={(e) => { e.preventDefault(); go(); }} className="panel px-[var(--s-4)] py-[var(--s-5)]">
      <p className="t-label !text-[var(--gold-text)]">目前的狀態：{situationLabel}</p>
      <p className="t-small mt-[var(--s-3)] !text-[var(--ink-66)]">可以這樣問（點一下帶進框裡，再改成你的話）：</p>
      <div className="mt-[var(--s-2)] flex flex-wrap gap-2">
        {examples.map((x, i) => (
          <button key={x} type="button" data-heat={`ask-${slug}-ex${i + 1}`} onClick={() => setQ(x)}
            className="t-small px-3 py-2 rounded-[2px] border border-[var(--ink-16)] hover:border-[var(--ink-45)] hover:text-[var(--ink)] transition-colors text-left">
            {x}
          </button>
        ))}
      </div>
      <textarea
        name="q" rows={3} required minLength={2} maxLength={450} value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="寫一句你想問的事，越具體越好"
        className="t-body mt-[var(--s-4)] w-full bg-transparent border border-[var(--ink-16)] rounded-[2px] p-4 outline-none transition-colors focus:border-[var(--ink-45)] placeholder:text-[var(--ink-45)] resize-none"
      />
      <button type="submit" disabled={going || q.trim().length < 2} data-heat={`ask-${slug}-begin`}
        className="mt-4 w-full md:w-auto min-h-[var(--s-6)] px-9 py-3 rounded-[2px] bg-[var(--ink)] text-[var(--paper)] tracking-[0.16em] text-[13px] hover:bg-[var(--cinnabar)] active:scale-[0.99] transition disabled:opacity-45 disabled:hover:bg-[var(--ink)]">
        {going ? "正在打開…" : "開始起卦"}
      </button>
      <p className="t-small mt-[var(--s-3)] !text-[var(--ink)]">{LOVE_SELL}</p>
    </form>
  );
}
