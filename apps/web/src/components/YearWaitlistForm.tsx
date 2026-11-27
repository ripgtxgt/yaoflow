"use client";

import { useState } from "react";
import EmailField from "@/components/EmailField";
import { emailTypoPending } from "@/lib/email-check";

const KINDS = [["love", "感情"], ["work", "工作"], ["money", "財"], ["other", "其他"]] as const;

/** 10-12 「2027，這件事的年卦」预约 (进度表 §四 38): an address and the kind of matter — no payment, no login. */
export default function YearWaitlistForm({ via }: { via?: string }) {
  const [email, setEmail] = useState("");
  const [kind, setKind] = useState<string>("");
  const [state, setState] = useState<"idle" | "sending" | "done" | "again" | "error" | "bad">("idle");
  const send = async () => {
    if (state === "sending") return;
    if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(email.trim()) || !kind) { setState("bad"); return; }
    if (emailTypoPending(email)) return; // 10-23: the 「是不是 …？」 line under the box is asking
    setState("sending");
    try {
      const r = await fetch("/api/waitlist/2027", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: email.trim(), kind, locale: "zh-hant", via }) });
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; again?: boolean };
      setState(r.ok && j.ok ? (j.again ? "again" : "done") : "error");
    } catch { setState("error"); }
  };
  if (state === "done" || state === "again") {
    return (
      <div className="panel px-[var(--s-4)] py-[var(--s-5)]">
        <p className="t-d3">{state === "again" ? "這個信箱已經在名單上了，類型也更新好了。" : "收到了，你在名單上。"}</p>
        <p className="t-body mt-[var(--s-2)] text-[var(--ink-66)]">年卦開放的時候，我們寄一封信到 {email.trim()}。只有這一封。</p>
      </div>
    );
  }
  return (
    <form onSubmit={(e) => { e.preventDefault(); void send(); }} className="panel px-[var(--s-4)] py-[var(--s-5)]">
      <p className="t-label">想問的那件事，是哪一類？</p>
      <div className="mt-[var(--s-2)] flex flex-wrap gap-2">
        {KINDS.map(([k, label]) => (
          <button key={k} type="button" onClick={() => { setKind(k); if (state === "bad") setState("idle"); }} data-heat={`year-kind-${k}`}
            className={`t-small px-4 py-2 rounded-[2px] border transition-colors ${kind === k ? "border-[var(--ink)] text-[var(--ink)] bg-[var(--ink-06,transparent)]" : "border-[var(--ink-16)] hover:border-[var(--ink-45)]"}`}
            aria-pressed={kind === k}>
            {label}
          </button>
        ))}
      </div>
      <div className="mt-[var(--s-4)]">
        <EmailField locale="zh-hant" id="yw-email" label="信箱" required value={email} placeholder="you@example.com" onChange={(v) => { setEmail(v); if (state === "bad") setState("idle"); }} />
      </div>
      {state === "bad" && <p className="t-small mt-2 !text-[var(--cinnabar)]">{!kind ? "先選一個類型。" : "信箱格式好像不太對。"}</p>}
      {state === "error" && <p className="t-small mt-2 !text-[var(--cinnabar)]">沒送出去，稍後再試一次。</p>}
      <button type="submit" disabled={state === "sending"} data-heat="year-join"
        className="mt-[var(--s-4)] w-full md:w-auto min-h-[var(--s-6)] px-9 py-3 rounded-[2px] bg-[var(--ink)] text-[var(--paper)] tracking-[0.16em] text-[13px] hover:bg-[var(--cinnabar)] transition disabled:opacity-45">
        {state === "sending" ? "送出中…" : "加入預約名單"}
      </button>
      <p className="t-small mt-[var(--s-3)] !text-[var(--ink-45)]">不收錢，不用登入。信箱只用來在年卦開放時通知你一次，不會拿去寄別的信。</p>
    </form>
  );
}
