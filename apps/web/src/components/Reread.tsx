"use client";

import { useEffect, useState } from "react";

/**
 * 10-22 分開 (lib/reread.ts): the reading page's 「不是同一件事，分開」 and the one free re-read after it. Plain form posts;
 * this only keeps the button from being tapped twice and, while the re-read is being written, reloads the page until the
 * new reading is in place.
 */
export function SplitForm({ sid, back, ask, btn }: { sid: string; back: string; ask: string; btn: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <form method="post" action="/api/matter" onSubmit={() => setBusy(true)} className="mt-1">
      <input type="hidden" name="action" value="split" />
      <input type="hidden" name="sid" value={sid} />
      <input type="hidden" name="back" value={back} />
      <p className="t-small !text-[var(--ink-45)]">
        {ask}{" "}
        <button type="submit" disabled={busy} data-heat="reading-split" className="underline underline-offset-4 hover:text-[var(--ink)] disabled:opacity-50">{btn}</button>
      </p>
    </form>
  );
}

/** 10-23 进度表 98: 「分錯了？合併回去」 — open for a day after a split; the cast goes back where it came from, nothing is rewritten */
export function UnsplitForm({ sid, back, btn }: { sid: string; back: string; btn: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <form method="post" action="/api/matter" onSubmit={() => setBusy(true)} className="mt-1">
      <input type="hidden" name="action" value="unsplit" />
      <input type="hidden" name="sid" value={sid} />
      <input type="hidden" name="back" value={back} />
      <button type="submit" disabled={busy} data-heat="reading-unsplit" className="t-small underline underline-offset-4 !text-[var(--ink-66)] hover:text-[var(--ink)] disabled:opacity-50">{btn}</button>
    </form>
  );
}

export function RereadForm({ sid, back, btn }: { sid: string; back: string; btn: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <form method="post" action="/api/reading/reread" onSubmit={() => setBusy(true)} className="mt-[var(--s-2)]">
      <input type="hidden" name="sid" value={sid} />
      <input type="hidden" name="back" value={back} />
      <button type="submit" disabled={busy} data-heat="reading-reread" className="min-h-[var(--s-6)] px-5 py-2 rounded-[2px] bg-[var(--ink)] text-[var(--paper)] text-[13px] tracking-[0.1em] disabled:opacity-50">{btn}</button>
    </form>
  );
}

/** While the re-read is being written: reload every 10 s (for up to 3 minutes) until the page no longer says so. */
export function RereadWait() {
  useEffect(() => {
    let n = 0;
    const id = setInterval(() => { if (++n > 18) { clearInterval(id); return; } window.location.reload(); }, 10_000);
    return () => clearInterval(id);
  }, []);
  return null;
}
