"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { markVisitDay, pulse, refTag, track } from "@/lib/track";
import { PULSE_MS } from "@/lib/presence-const";

/**
 * page_view, and since 09-23 a first-party 热区 (Neil: 「加上一个网页的热力图吧」).
 *
 * Why not Hotjar / Clarity: they record the screen, and our screen is the
 * reader's question and their reading — the one thing we promise never leaves
 * the browser. So we keep what a heatmap is for and nothing else:
 *   - how far down each page people get (max scroll %, sent when they leave);
 *   - how long they stayed;
 *   - which named controls they touch (elements carrying data-heat="name").
 * No text, no coordinates, no input contents — a name and two numbers.
 */
export default function PageView({ locale }: { locale: string }) {
  const pathname = usePathname();
  const start = useRef(Date.now());
  const depth = useRef(0);
  const sent = useRef(false);

  // 10-05 (Neil: 「访客 kk4q 页面报错 res:SCRIPT 3176-…/page-…」): tell the <head> error script that the app is up on this
  // document (lib/err-capture.ts). After this, one of OUR files "failing to load" is a load the browser cancelled — a
  // <Link> prefetch cut short by the tap that navigates, which iPhone/WebKit reports as an error — not a broken page. A
  // real start failure happens before this line ever runs, and is still reported.
  useEffect(() => { (window as unknown as { __yfUp?: number }).__yfUp = Date.now(); }, []);

  useEffect(() => {
    track("page_view", { locale });
    refTag(); // 09-29: pin a sharer's ?r= to this visit (first touch), for the free first reading
    // 09-29 加到主屏幕: the manifest's start_url carries src=home
    try { if (new URLSearchParams(window.location.search).get("src") === "home") { track("home_icon_open", { locale }); localStorage.setItem("yf_home_added", "1"); } } catch { /* ignore */ }
    markVisitDay(locale); // 09-23 回访: once per local day, dates only
  }, [locale]);

  useEffect(() => {
    start.current = Date.now();
    depth.current = 0;
    sent.current = false;
    const measure = () => {
      const h = document.documentElement.scrollHeight - window.innerHeight;
      const pct = h <= 0 ? 100 : Math.min(100, Math.round(((window.scrollY + 1) / h) * 100));
      if (pct > depth.current) depth.current = pct;
    };
    const flush = () => {
      if (sent.current) return;
      sent.current = true;
      measure();
      track("page_leave", { locale, path: pathname, ms: Date.now() - start.current, depth: depth.current });
    };
    const onVis = () => { if (document.visibilityState === "hidden") flush(); else { sent.current = false; start.current = Date.now(); } };
    // 10-02 实时在线: a heartbeat every 30 s while the tab is visible, one more when it goes hidden (lib/track.ts pulse)
    let beat: ReturnType<typeof setInterval> | null = null;
    const startBeat = () => { if (beat === null) beat = setInterval(() => { if (document.visibilityState === "visible") pulse(locale); }, PULSE_MS); };
    const stopBeat = () => { if (beat !== null) { clearInterval(beat); beat = null; } };
    const onVisPulse = () => { if (document.visibilityState === "hidden") { pulse(locale, true); stopBeat(); } else { pulse(locale); startBeat(); } };
    if (document.visibilityState === "visible") startBeat();
    document.addEventListener("visibilitychange", onVisPulse);
    const onClick = (e: MouseEvent) => {
      const el = (e.target as HTMLElement | null)?.closest?.("[data-heat]") as HTMLElement | null;
      if (el?.dataset.heat) track("heat_click", { locale, method: el.dataset.heat.slice(0, 24) });
    };
    // 09-28 → 10-02: uncaught errors are reported by the script at the top of <head> (lib/err-capture.ts), which runs
    // even when React never starts — this component cannot see those, and listening here too would count them twice
    measure();
    window.addEventListener("scroll", measure, { passive: true });
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVis);
    document.addEventListener("click", onClick, true);
    return () => {
      flush(); // a client-side navigation leaves this path too
      stopBeat();
      document.removeEventListener("visibilitychange", onVisPulse);
      window.removeEventListener("scroll", measure);
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onVis);
      document.removeEventListener("click", onClick, true);
    };
  }, [pathname, locale]);

  return null;
}
