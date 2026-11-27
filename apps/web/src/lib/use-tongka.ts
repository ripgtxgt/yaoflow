"use client";

import { useEffect, useState } from "react";

/**
 * 10-22 通卡: does this browser see the pass panel instead of a single price (the `tongka` switch, from /api/me), is its
 * first 1 日通卡 at the first-time price, and does something already cover paid readings (a membership or a pass)?
 * One request, after mount; until it answers the page shows nothing new.
 */
export interface TongkaState { tongka: boolean; first: boolean; covered: boolean; member: boolean; signedIn: boolean; loaded: boolean }
export function useTongka(): TongkaState {
  const [s, setS] = useState<TongkaState>({ tongka: false, first: false, covered: false, member: false, signedIn: false, loaded: false });
  useEffect(() => {
    let alive = true;
    fetch("/api/me", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { signedIn?: boolean; tongka?: boolean; firstTongka?: boolean; entitlement?: { active?: boolean; member?: boolean } } | null) => {
        if (!alive || !j) return;
        setS({ tongka: !!j.tongka, first: !!j.firstTongka, covered: !!j.entitlement?.active, member: !!j.entitlement?.active && !!j.entitlement?.member, signedIn: !!j.signedIn, loaded: true });
      })
      .catch(() => { if (alive) setS((x) => ({ ...x, loaded: true })); });
    return () => { alive = false; };
  }, []);
  return s;
}
