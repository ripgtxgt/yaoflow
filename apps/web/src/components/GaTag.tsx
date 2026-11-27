"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { cleanLocation, cleanReferrer } from "@/lib/ga";

/**
 * 10-27 Google Analytics 4 (lib/ga.ts says what goes and what never does). The bootstrap is inline in <head> (lib/ga.ts
 * gaBootstrap); this sends each route's page_view by hand with the cleaned location — and SETS that location for every
 * later event too (scrolls, outbound clicks), because GA would otherwise read the raw URL itself.
 */
export default function GaTag() {
  const pathname = usePathname();
  // 10-29: the tag itself is added only now, after hydration (lib/ga.ts gaBootstrap — a <head> script React did not render was React #418)
  useEffect(() => { try { (window as unknown as { __yfGaLoad?: () => void }).__yfGaLoad?.(); } catch { /* ignore */ } }, []);
  useEffect(() => {
    try {
      const g = (window as unknown as { gtag?: (...a: unknown[]) => void }).gtag;
      if (typeof g !== "function") return;
      const loc = cleanLocation(location.href);
      // a page about one reader's own thing (its path folded to :id) may carry their question in its title: send the path instead
      const page = { page_location: loc, page_referrer: cleanReferrer(document.referrer), page_title: loc.includes(":id") ? new URL(loc).pathname : document.title.slice(0, 100) };
      g("set", page);
      g("event", "page_view", page);
    } catch { /* ignore */ }
  }, [pathname]);
  return null;
}
