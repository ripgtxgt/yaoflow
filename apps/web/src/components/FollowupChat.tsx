"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { t, type Locale } from "@/lib/i18n";
import type { Tier } from "@/lib/reading";
import { track } from "@/lib/track";
import { howToAskFor } from "@/lib/how-to-ask";
import { isCrisis } from "@/lib/crisis";
import CrisisNote from "@/components/CrisisNote";
import { Paras } from "@/components/ReadingArticle";
import { tt } from "@/lib/dict/thread";
import { aiNotice } from "@/lib/ai-notice";

interface Turn { role: "user" | "assistant"; content: string }

export default function FollowupChat(
  { locale, homeLocale, tier, extraBody, initialTurns = [], limit = 5, giftHref, topic, initialInput, doneOffer, memberNudge }: {
    locale: Locale;
    /** the page's own language — the chat speaks the reading's, but links stay on the site they came from (09-17) */
    homeLocale?: Locale;
    tier: Tier;
    extraBody: Record<string, unknown>;
    /** previously saved exchanges, so a returning visitor sees the whole thread */
    initialTurns?: Turn[];
    /** questions allowed on this reading (5, +1 after a "没应验" revisit answer — 09-21) */
    limit?: number;
    /** 09-24 R2: when the questions run out, the gift is the natural next thing to offer */
    giftHref?: string;
    /** 09-26: which quick questions to offer — the love set or the general one */
    topic?: string | null;
    /** 09-26: a reply-like question sent here from the cast page, waiting in the box */
    initialInput?: string;
    /** 09-27 (Neil: 「改改…朋友那一侧的承接」): a friend's gifted reading, questions used up — their own next step */
    doneOffer?: { title: string; body: string; castHref: string; castLabel: string; memberHref: string; memberLabel: string };
    /** 09-29 (用户数据与需求全面分析 §4.3): a non-member deep in one matter — the third question is when membership makes sense */
    memberNudge?: { title: string; body: string; href: string; cta: string; at?: number };
  },
) {
  const [turns, setTurns] = useState<Turn[]>(initialTurns);
  const [input, setInput] = useState(initialInput ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(false);
  const [crisis, setCrisis] = useState(false);
  // 09-26: a long saved thread folds its older exchanges — the last two stay open
  const [showAll, setShowAll] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const userTurns = turns.filter((x) => x.role === "user").length;

  // keep the newest exchange in view — answers are long and arrive below the fold
  useEffect(() => {
    if (turns.length > (initialTurns?.length ?? 0) || busy) {
      endRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turns.length, busy]);

  const ask = async (preset?: string) => {
    const msg = (preset ?? input).trim();
    if (!msg || busy || userTurns >= limit) return;
    // 09-26 危机词闸门: not sent, not counted — the helpline note instead
    if (isCrisis(msg)) { setCrisis(true); return; }
    setCrisis(false);
    setBusy(true);
    setErr(false);
    setInput("");
    setTurns((x) => [...x, { role: "user", content: msg }]);
    track("followup_ask", { locale, tier, ...(preset ? { method: "quick" } : {}) });
    try {
      const res = await fetch("/api/followup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...extraBody, tier, locale, history: turns, message: msg }),
      });
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as { reply: string };
      setTurns((x) => [...x, { role: "assistant", content: data.reply }]);
    } catch {
      // A failed request must not spend one of the five questions: take the
      // turn back out of the thread and put the text back in the box.
      setTurns((x) => x.slice(0, -1));
      setInput(msg);
      setErr(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div id="followup" className="mt-[var(--s-5)] pt-[var(--s-5)] border-t border-[var(--ink-16)]">
      <div className="flex items-baseline justify-between gap-4 mb-[var(--s-4)]">
        <p className="t-sect">{t(locale, "askTitle")}</p>
        {userTurns > 0 && userTurns < limit && (
          <p className="t-label shrink-0">{t(locale, "askLeft", { n: limit - userTurns })}</p>
        )}
      </div>
      {/* 09-30 (进度表 23, #838: 「卦不好的時候用別的角度去看或再詢問」): the three angles live on one page */}
      <p className="t-small -mt-[var(--s-2)] mb-[var(--s-4)]"><Link href={`/${locale}/how-to-ask#bad`} data-heat="hta-followup" className="underline underline-offset-4 !text-[var(--ink-45)] hover:!text-[var(--ink)]">{howToAskFor(locale).entry.followup} →</Link></p>

      {(turns.length > 0 || busy) && (
        <div className="flex flex-col gap-[var(--s-4)] mb-[var(--s-5)]">
          {(() => {
            const asks = turns.map((x, i) => (x.role === "user" ? i : -1)).filter((i) => i >= 0);
            const cut = !showAll && asks.length > 2 ? asks[asks.length - 2] : 0; // index of the first turn still shown
            const hidden = cut ? asks.filter((i) => i < cut).length : 0;
            return (
              <>
                {hidden > 0 && (
                  <button type="button" onClick={() => setShowAll(true)} className="self-start t-label hover:text-[var(--ink)] transition-colors">
                    {tt(locale, "rdEarlier", { n: hidden })} ↓
                  </button>
                )}
                {showAll && asks.length > 2 && (
                  <button type="button" onClick={() => setShowAll(false)} className="self-start t-label hover:text-[var(--ink)] transition-colors">
                    {tt(locale, "rdHide")} ↑
                  </button>
                )}
                {turns.map((turn, i) =>
                  i < cut ? null : turn.role === "user" ? (
                    /* the reader's own voice: a quiet panel, marked in cinnabar */
                    <div key={i} className="rounded-[2px] bg-[var(--ink)]/[0.04] border-l-2 border-[var(--cinnabar)] px-4 py-3">
                      <p className="t-label !text-[var(--cinnabar)] mb-1">{tt(locale, "rdYouAsked")}</p>
                      <p className="t-small !text-[var(--ink-86)]">{turn.content}</p>
                    </div>
                  ) : (
                    <div key={i} className="fade-in pl-1"><Paras text={turn.content} /></div>
                  ),
                )}
              </>
            );
          })()}
          {busy && (
            <p className="flex items-center gap-1.5" aria-label="…">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="w-1.5 h-1.5 rounded-full bg-[var(--ink-45)] think-dot"
                  style={{ animationDelay: `${i * 180}ms` }}
                />
              ))}
            </p>
          )}
          <div ref={endRef} />
        </div>
      )}

      {crisis && <CrisisNote locale={locale} />}

      {/* 09-29: after the third question (or when they run out), once — what membership is for, in this reader's terms */}
      {memberNudge && userTurns >= (memberNudge.at ?? 3) && !busy && (
        <div className="mb-[var(--s-4)] border border-[var(--gold)] bg-[var(--gold)]/[0.06] rounded-[2px] px-[var(--s-4)] py-[var(--s-3)]" data-heat="member-nudge-chat">
          <p className="t-body !text-[15px]">{memberNudge.title}</p>
          <p className="t-small mt-1 !text-[var(--ink-66)]">{memberNudge.body}</p>
          <Link href={memberNudge.href} className="inline-block mt-2 t-small underline underline-offset-4">{memberNudge.cta} →</Link>
        </div>
      )}

      {userTurns < limit ? (
        <>
          {/* 09-26: the four things readers most often came back to ask — one tap, no typing (hidden once asked) */}
          {!busy && (() => {
            const keys = (topic === "relationship" ? ["fq1", "fq2", "fq3", "fq4"] : ["fq5", "fq3", "fq4", "fq6"]) as ("fq1" | "fq2" | "fq3" | "fq4" | "fq5" | "fq6")[];
            const asked = new Set(turns.filter((x) => x.role === "user").map((x) => x.content.trim()));
            const left = keys.map((k) => tt(locale, k)).filter((q) => !asked.has(q));
            if (!left.length) return null;
            return (
              <div className="mb-[var(--s-3)]" data-heat="followup-quick">
                <p className="t-small !text-[var(--ink-45)] mb-2">{tt(locale, "fqLabel")}</p>
                <div className="flex flex-wrap gap-2">
                  {left.map((q) => (
                    <button key={q} type="button" onClick={() => void ask(q)}
                      className="px-3 py-1.5 rounded-[2px] border border-[var(--ink-16)] hover:border-[var(--ink-45)] t-small !text-[var(--ink)]">
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            );
          })()}
          <div className="flex items-end gap-3">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void ask()}
              enterKeyHint="send"
              placeholder={t(locale, "askPlaceholder")}
              className="t-body !text-[16px] md:!text-[15px] flex-1 min-w-0 bg-transparent border-b border-[var(--ink-16)]
                         pb-2 outline-none focus:border-[var(--ink-45)] transition-colors
                         placeholder:text-[var(--ink-45)]"
            />
            <button
              onClick={() => void ask()}
              disabled={busy || !input.trim()}
              className="t-label shrink-0 pb-2 min-h-[var(--s-6)] hover:text-[var(--ink)] transition-colors disabled:opacity-30"
            >
              {t(locale, "askSend")}
            </button>
          </div>
          {/* 10-29 进度表 128: the EU AI Act's notice, the four EU languages only (lib/ai-notice.ts) */}
          {aiNotice(locale, "cast") && <p className="t-small mt-[var(--s-2)] !text-[var(--ink-45)]">{aiNotice(locale, "cast")}</p>}
          {err && (
            <p className="t-small mt-[var(--s-2)] !text-[var(--cinnabar)]">{t(locale, "askError")}</p>
          )}
        </>
      ) : (
        /* the natural end of this cast — and the doorway to the next one */
        doneOffer ? (
          <div className="border border-[var(--gold)] rounded-[2px] px-[var(--s-4)] py-[var(--s-4)]" data-heat="gift-recv-done">
            <p className="t-body !text-[15px]">{doneOffer.title}</p>
            <p className="t-small mt-1 !text-[var(--ink-66)]">{doneOffer.body}</p>
            <div className="mt-[var(--s-3)] flex flex-wrap items-center gap-x-6 gap-y-3">
              <Link href={doneOffer.castHref} className="inline-block min-h-[var(--s-6)] px-6 py-3 rounded-[2px] bg-[var(--ink)] text-[var(--paper)] text-[13px] tracking-[0.14em]">{doneOffer.castLabel}</Link>
              <Link href={doneOffer.memberHref} className="t-small underline underline-offset-4">{doneOffer.memberLabel} →</Link>
            </div>
          </div>
        ) : <div>
          <p className="t-small !text-[var(--ink-45)]">{t(locale, "askDone")}</p>
          <Link
            href={`/${homeLocale ?? locale}`}
            className="inline-block mt-[var(--s-3)] t-label !text-[var(--cinnabar)] hover:opacity-70 transition-opacity"
          >
            {t(locale, "askAnother")} →
          </Link>
          {giftHref && (
            <a href={giftHref} data-heat="gift-askdone" className="block mt-[var(--s-2)] t-label hover:text-[var(--ink)] transition-colors">
              {t(locale, "giftCastTitle")} →
            </a>
          )}
        </div>
      )}
    </div>
  );
}
