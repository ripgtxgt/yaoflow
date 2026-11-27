"use client";

import { useState } from "react";

/**
 * 10-23 进度表 99 (客服 #510, 10-22 21:24): the 「以 support@ 发给读者并标处理」 button sent the same letter twice — two taps,
 * two Resend ids a few seconds apart, the reader got both. The button now locks on the first tap and says so; the route
 * (/api/admin/inbox/reply) refuses a second copy of the same draft within five minutes on its own.
 */
export default function ReplyOnceForm({ id, draft, rows }: { id: string; draft: string; rows: number }) {
  const [busy, setBusy] = useState(false);
  return (
    <form method="post" action="/api/admin/inbox/reply" className="mt-3" onSubmit={(e) => { if (busy) { e.preventDefault(); return; } setBusy(true); }}>
      <input type="hidden" name="id" value={id} />
      <textarea name="body" defaultValue={draft} rows={rows} readOnly={busy} className="w-full bg-black/[0.03] border border-black/15 rounded-[2px] p-3 text-[13px] leading-relaxed read-only:opacity-70" />
      <div className="mt-2 flex items-center gap-3 text-xs">
        <button disabled={busy} className="px-3 py-1 rounded-[2px] bg-[var(--ink)] text-[var(--paper)] disabled:opacity-60">{busy ? "发送中…" : "以 support@ 发给读者并标处理"}</button>
        <span className="opacity-60">{busy ? "正在发，别再点；发出后这一行会写上 Resend 编号。" : "改完直接发；发出的信挂在读者原线程上。同一封五分钟内只会发一次。"}</span>
      </div>
    </form>
  );
}
