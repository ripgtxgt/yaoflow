"use client";

import { useState } from "react";

/**
 * 10-24 微信／QQ 付款中转页: copy the page's own link (opened in a real browser it goes straight to the payment page).
 * The clipboard API first; WeChat's older web views refuse it, so a hidden textarea and execCommand next; and the link
 * itself is always printed below for a long press.
 */
export default function PayHopCopy({ link, copy, copied, manual }: { link: string; copy: string; copied: string; manual: string }) {
  const [done, setDone] = useState(false);
  const go = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setDone(true);
      return;
    } catch { /* the old way below */ }
    try {
      const ta = document.createElement("textarea");
      ta.value = link;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      ta.setSelectionRange(0, link.length);
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      setDone(ok);
    } catch { setDone(false); }
  };
  return (
    <div>
      <button type="button" onClick={() => void go()} data-heat="pay-hop-copy"
        className="min-h-[var(--s-6)] px-7 py-3 rounded-[2px] bg-[var(--ink)] text-[var(--paper)] tracking-[0.12em] text-[14px]">
        {copy}
      </button>
      {done && <p className="t-small mt-[var(--s-2)] !text-[var(--gold-text)]">{copied}</p>}
      <p className="t-small mt-[var(--s-3)] !text-[var(--ink-45)]">{manual}</p>
      <p className="t-small mt-1 break-all select-all !text-[var(--ink-66)]" style={{ WebkitUserSelect: "all", userSelect: "all" }}>{link}</p>
    </div>
  );
}
