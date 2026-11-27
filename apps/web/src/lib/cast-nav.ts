"use client";

import type { useRouter } from "next/navigation";
import type { Locale } from "./locales";

/**
 * Go to the cast page with an optional question. iOS Shake-to-Undo hangs off
 * the DOCUMENT's undo stack, which survives SPA navigation — typing a question
 * here and then shaking on the cast page pops the system undo dialog over the
 * rite. A real navigation is the only thing that clears the stack, so
 * shake-capable devices take the hard road. Shared by every "ask" entry.
 */
export function goToCast(router: ReturnType<typeof useRouter>, locale: Locale, question?: string, href?: string): void {
  const q = question?.trim();
  // 10-12: a landing page hands over its own URL (question + situation chip + campaign tag)
  const url = href ?? (q ? `/${locale}/cast?q=${encodeURIComponent(q)}` : `/${locale}/cast`);
  if (window.matchMedia?.("(pointer: coarse)").matches && "DeviceMotionEvent" in window) {
    window.location.assign(url);
    return;
  }
  router.push(url);
}

/**
 * 09-24 (Neil: 「推荐体系是怎么样的」→ 送一卦 7 张 0 领取): the iOS clean-document
 * reload in CastFlow (cleanseForShake / reset) rebuilt the URL from the question alone, so on an iPhone every
 * token the page arrived with — gift=, reward=, after=, pair= — was dropped the
 * moment the reader finished typing. A friend opening a 送一卦 link on an iPhone
 * typed their question and was shown the ordinary prices; the nginx log shows it
 * happening to every real recipient. Keep everything the page came with; only q
 * is rewritten.
 */
export function cleanCastUrl(locale: string, question: string, search: string = typeof location !== "undefined" ? location.search : ""): string {
  const params = new URLSearchParams(search);
  const q = question.trim();
  if (q) params.set("q", q); else params.delete("q");
  const qs = params.toString();
  return `/${locale}/cast${qs ? `?${qs}` : ""}`;
}
