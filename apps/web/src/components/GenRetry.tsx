"use client";

import { useEffect, useState } from "react";
import type { Locale } from "@/lib/locales";

/**
 * 10-14 进度表 30 ② (Neil: 最优先): a paid reading whose writing failed no longer leaves the reader on 「生成失敗」 with a
 * button. The page says it is retrying and reloads itself (each reload writes again; the fulfilment sweep also retries
 * every 10 minutes and mails the reading when it is done), up to six times, then says plainly what happens next.
 */
const W = {
  "zh-hant": { now: "解讀還在寫，約 1 分鐘，這一頁會自己更新。", later: "這次寫得比較久。可以先關掉這一頁，寫好後會寄到你付款時填的信箱；或稍後再打開這個連結。", again: "現在再試一次" },
  zh: { now: "解读还在写，约 1 分钟，这一页会自己更新。", later: "这次写得比较久。可以先关掉这一页，写好后会寄到你付款时填的邮箱；或稍后再打开这个链接。", again: "现在再试一次" },
  en: { now: "Your reading is still being written — about a minute. This page will refresh by itself.", later: "This one is taking longer. You can close this page: it will be emailed to the address you paid with, or open this link again a little later.", again: "Try again now" },
} as const;

export default function GenRetry({ locale, href }: { locale: Locale; href: string }) {
  const w = locale === "zh" || locale === "zh-hant" ? W[locale] : W.en;
  const [left, setLeft] = useState<number | null>(null);
  useEffect(() => {
    let n = 0;
    try { n = Number(sessionStorage.getItem(`yf_retry_${href}`) ?? 0); } catch { /* private mode */ }
    setLeft(6 - n);
    if (n >= 6) return;
    const t = setTimeout(() => {
      try { sessionStorage.setItem(`yf_retry_${href}`, String(n + 1)); } catch { /* ignore */ }
      window.location.replace(href);
    }, 15_000);
    return () => clearTimeout(t);
  }, [href]);
  return (
    <div>
      <p className="t-body mb-[var(--s-3)]" aria-live="polite">{left === 0 ? w.later : w.now}</p>
      <a href={href} className="inline-block min-h-[var(--s-6)] px-8 py-3 rounded-[2px] bg-[var(--ink)] text-[var(--paper)] text-[13px] tracking-[0.16em]">{w.again}</a>
    </div>
  );
}
