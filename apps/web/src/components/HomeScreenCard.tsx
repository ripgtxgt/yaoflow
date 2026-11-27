"use client";

import { useEffect, useState } from "react";
import { ht } from "@/lib/dict/homescreen";
import { track } from "@/lib/track";

/**
 * 09-29 加到主屏幕: a member's deep reading page, phones only. Browsers do
 * not let a page add itself to the home screen (and our manifest is
 * display:"browser" on purpose — see api/manifest), so this is instructions,
 * written for the phone in hand. Hidden for good once dismissed or once the
 * reader has opened the site from the icon (PageView sets yf_home_added).
 */
const DISMISS = "yf_home_card";
const ADDED = "yf_home_added";

type Kind = "ios" | "android" | "inApp";

function detect(): Kind | null {
  const ua = navigator.userAgent;
  const standalone = window.matchMedia?.("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone;
  if (standalone) return null;
  // Instagram, Facebook, Threads (Barcelona), LINE, WeChat, TikTok webviews cannot add to the home screen
  if (/Instagram|FBAN|FBAV|Barcelona|Line\/|MicroMessenger|musical_ly|BytedanceWebview/i.test(ua)) return "inApp";
  if (/iPhone|iPad|iPod/.test(ua)) return /CriOS|FxiOS|EdgiOS/.test(ua) ? "inApp" : "ios";
  if (/Android/.test(ua)) return "android";
  return null; // desktop: not worth a card
}

export default function HomeScreenCard({ locale }: { locale: string }) {
  const [kind, setKind] = useState<Kind | null>(null);

  useEffect(() => {
    try {
      if (localStorage.getItem(DISMISS) || localStorage.getItem(ADDED)) return;
    } catch { /* private mode: still show */ }
    const k = detect();
    if (k) {
      setKind(k);
      track("home_card_view", { locale, method: k });
    }
  }, [locale]);

  if (!kind) return null;
  const close = () => {
    try { localStorage.setItem(DISMISS, String(Date.now())); } catch { /* ignore */ }
    track("home_card_close", { locale, method: kind });
    setKind(null);
  };

  return (
    <section className="mt-[var(--s-6)] border border-[var(--ink-16)] rounded-[2px] px-[var(--s-4)] py-[var(--s-4)] flex gap-[var(--s-3)] items-start" data-heat="home-card">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/icon-192.png" alt="" width={44} height={44} className="shrink-0 rounded-[10px] border border-[var(--ink-16)]" />
      <div className="min-w-0">
        <p className="t-label mb-1">{ht(locale, "title")}</p>
        <p className="t-small text-[var(--ink-86)]">{ht(locale, "body")}</p>
        <p className="t-small mt-2 !text-[var(--ink)]">{ht(locale, kind)}</p>
        <button type="button" onClick={close} className="t-small mt-2 underline underline-offset-4 !text-[var(--ink-45)]">{ht(locale, "close")}</button>
      </div>
    </section>
  );
}
