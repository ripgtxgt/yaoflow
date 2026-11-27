"use client";

import { useEffect } from "react";
import { HASH_TAB } from "@/lib/dict/account-tabs";

/**
 * 09-29: open the <details> whose id is in the URL hash (the account page's folded sections), and bring it into view.
 * 09-30 分页: an old link (/account#membership, #gift, #referrals …) whose section now lives in another tab is sent there.
 */
export default function HashOpen() {
  useEffect(() => {
    const open = () => {
      const id = decodeURIComponent(location.hash.slice(1));
      let el = id ? document.getElementById(id) : null;
      // 10-01: a fold hidden on this page (the record, while answers are waiting) has its stand-in at `${id}-all`
      if (el && el.offsetParent === null && document.getElementById(`${id}-all`)) el = document.getElementById(`${id}-all`);
      if (!el && id && HASH_TAB[id]) {
        const u = new URL(location.href);
        if (u.searchParams.get("tab") !== HASH_TAB[id]) {
          u.searchParams.set("tab", HASH_TAB[id]!);
          location.replace(u.toString());
          return;
        }
      }
      if (el instanceof HTMLDetailsElement && !el.open) { el.open = true; setTimeout(() => el.scrollIntoView({ behavior: "smooth", block: "start" }), 50); }
    };
    open();
    window.addEventListener("hashchange", open);
    return () => window.removeEventListener("hashchange", open);
  }, []);
  return null;
}
