"use client";

import { useState } from "react";
import { t, type Locale } from "@/lib/i18n";
import { tt } from "@/lib/dict/thread";
import ShareButton from "@/components/ShareButton";
import { GIFT_NOTE_MAX, mg } from "@/lib/dict/member-gift";

/**
 * 送一卦 (裂变 V1 ②; 09-24 重整). One link that lets a friend cast their own
 * question and get a deep reading on us, 14 days, one use. The share text is
 * prefilled in the reader's language; the link carries no question and no
 * cast — only the gift.
 *
 *   sid        from a reading: a single purchase carries one gift; a member's
 *              reading draws on the monthly pool (the server decides).
 *   pool mode  (no sid) the account page: a member makes links from the pool,
 *              one after another, while any are left.
 */
export default function GiftCastPanel(
  { locale, sid, poolLeft = null, compact = false, bare = false }: { locale: Locale; sid?: string; poolLeft?: number | null; compact?: boolean; /** 09-29: inside a card that already says what the gift is and how many are left */ bare?: boolean },
) {
  const [state, setState] = useState<"idle" | "minting" | "ready" | "error" | "empty">(poolLeft === 0 && !sid ? "empty" : "idle");
  const [url, setUrl] = useState("");
  const [used, setUsed] = useState(false);
  const [left, setLeft] = useState<number | null>(poolLeft);
  // 09-29 会员裂变 ④: one optional line for the friend, shown when they open the gift
  const [note, setNote] = useState("");

  const mint = async () => {
    if (state === "minting") return;
    setState("minting");
    try {
      const res = await fetch("/api/gift-cast", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...(sid ? { sid } : { pool: true }), locale, ...(note.trim() ? { note: note.trim() } : {}) }),
      });
      const d = (await res.json().catch(() => ({}))) as { url?: string; used?: boolean; left?: number | null; error?: string };
      if (res.status === 403 && d.error === "pool_empty") { setLeft(0); setState("empty"); return; }
      if (!res.ok || !d.url) throw new Error(String(res.status));
      setUrl(d.url);
      setUsed(!!d.used);
      if (typeof d.left === "number") setLeft(d.left);
      setState("ready");
    } catch {
      setState("error");
    }
  };

  const text = `${note.trim() ? `${note.trim()}\n\n` : ""}${t(locale, "giftCastShareText", { url })}`;
  const pool = !sid || left !== null;
  return (
    <section id="gift" className={compact ? "" : "mt-[var(--s-6)] border border-[var(--gold)] rounded-[2px] px-[var(--s-4)] py-[var(--s-5)]"}>
      {!bare && (
        <>
          <p className="t-label mb-2">{t(locale, "giftCastTitle")}</p>
          <p className="t-body !text-[15px] text-[var(--ink-86)]">{pool ? tt(locale, "poolLead") : t(locale, "giftCastBody")}</p>
          {/* 09-26: the giver's thank-you existed since 09-24 but was never said */}
          <p className="t-small mt-2 !text-[var(--gold-text)]">{tt(locale, "giftRewardNote")}</p>
          {left !== null && state !== "empty" && <p className="t-small mt-2 !text-[var(--gold-text)]">{tt(locale, "poolLeft", { n: left })}</p>}
        </>
      )}
      <p className="t-small mt-2 !text-[var(--ink-66)]">{mg(locale, "privacy")}</p>
      {state === "empty" ? (
        <p className="t-small mt-[var(--s-3)] !text-[var(--ink-66)]">{tt(locale, "poolEmpty")}</p>
      ) : state !== "ready" ? (
        <>
        <label className="block mt-[var(--s-4)]">
          <span className="t-small !text-[var(--ink-66)]">{mg(locale, "noteLabel")}</span>
          <input
            type="text"
            value={note}
            maxLength={GIFT_NOTE_MAX}
            onChange={(e) => setNote(e.target.value)}
            placeholder={mg(locale, "notePh")}
            className="mt-1 block w-full bg-transparent border border-[var(--ink-16)] rounded-[2px] px-3 py-2 text-[15px] outline-none focus:border-[var(--ink-45)]"
          />
        </label>
        <div className="mt-[var(--s-3)] flex flex-wrap items-center gap-x-6 gap-y-3">
          <button
            type="button"
            onClick={() => void mint()}
            disabled={state === "minting"}
            data-heat="gift-make"
            className="min-h-[var(--s-6)] px-6 py-3 rounded-[2px] bg-[var(--ink)] text-[var(--paper)] text-[13px] tracking-[0.16em] disabled:opacity-60"
          >
            {state === "minting" ? t(locale, "giftCastMinting") : !sid ? tt(locale, "poolMake") : t(locale, "giftCastButton")}
          </button>
          {state === "error" && <p className="t-small !text-[var(--cinnabar)]">{t(locale, "giftCastError")}</p>}
        </div>
        </>
      ) : (
        <div className="mt-[var(--s-4)]">
          {used ? (
            <p className="t-small">{t(locale, "giftCastUsed")}</p>
          ) : (
            <>
              <p className="t-small mb-2">{t(locale, "giftCastReady")}</p>
              <p className="font-[family-name:var(--mono)] text-[13px] break-all select-all border border-[var(--ink-16)] rounded-[2px] px-3 py-2">{url}</p>
              <div className="mt-[var(--s-3)] flex flex-wrap items-center gap-x-6 gap-y-3">
                {/* 10-22 分享 13 合 1: the one share hook; the old method names (gift / gift-copy) stay */}
                <ShareButton locale={locale} surface="gift" url="" text={text} methods={{ native: "gift", copy: "gift-copy" }} heat="gift-share" label={t(locale, "giftCastCopy")} copiedLabel={t(locale, "giftCastCopied")} />
                {!sid && (left ?? 0) > 0 && (
                  <button type="button" onClick={() => { setUrl(""); setNote(""); setState("idle"); }} className="t-label hover:text-[var(--ink)] transition-colors">
                    {tt(locale, "poolAnother")}
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}
