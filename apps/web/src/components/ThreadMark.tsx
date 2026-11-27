"use client";

import { useEffect } from "react";

/**
 * 09-18: once a reading is on screen, write its call back into the browser's
 * own cast record (`yaoflow:casts`, the same list the 一事一占 gate reads), so
 * that when this reader asks about the same matter again the cast page can
 * send them back here — or, if they insist on a new cast, hand the model what
 * they were told this time.
 *
 * Matched by the session id the cast page attached when the reading was
 * claimed. Renders nothing; imports nothing but React (the reading page has
 * been bitten once today by a component that pulled in more than it needed).
 */
export default function ThreadMark({ sid, call, tier, from }: { sid: string; call: string; tier: "one" | "deep"; from?: string | null }) {
  useEffect(() => {
    // 09-26: the figure kept while they were on Stripe has become this reading — stop offering it back on /cast
    try {
      const p = JSON.parse(localStorage.getItem("yaoflow:pending") ?? "null") as { sid?: string } | null;
      if (p?.sid && p.sid === sid) localStorage.removeItem("yaoflow:pending");
    } catch { /* storage unavailable */ }
    try {
      const raw = localStorage.getItem("yaoflow:casts");
      if (!raw) return;
      const list = JSON.parse(raw) as { sid?: string; verdict?: string; tier?: string }[];
      // an in-place upgrade keeps the light session on the record: re-point it
      // at the deep reading, so the gate's way back leads to the fuller one (09-18)
      const hit = list.find((c) => c && (c.sid === sid || (from && c.sid === from)));
      if (!hit || (hit.sid === sid && hit.verdict === call && hit.tier === tier)) return;
      hit.sid = sid;
      hit.verdict = call;
      hit.tier = tier;
      localStorage.setItem("yaoflow:casts", JSON.stringify(list));
    } catch {
      /* storage unavailable — the thread simply is not kept */
    }
  }, [sid, call, tier, from]);
  return null;
}
