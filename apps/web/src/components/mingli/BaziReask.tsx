"use client";

import { useState } from "react";

/**
 * 10-19 (Neil: 同一年只收一次錢) — on a 年書 the owner can ask this year's question again (or for the first time) without
 * paying again: chapter 8 is written for the new question, the earlier answer stays under 「你之前問過的」.
 * 10-20: the 紫微年書 uses the same form with endpoint="/api/ziwei/report/ask".
 */
export default function ReaskForm({ token, hans, endpoint = "/api/bazi/report/ask", copy }: {
  token: string; hans: boolean; endpoint?: string;
  /** 10-30 进度表 128 ④: a page in another language passes every line (button, sending, error, sign-in) in its language */
  copy?: { head: string; ph: string; go?: string; going?: string; err?: string; login?: string };
}) {
  const [q, setQ] = useState("");
  const [state, setState] = useState<"idle" | "going" | "error" | "login">("idle");
  const t = hans
    ? { head: "想再问一件今年的事？", ph: "例如：下半年适合搬家吗？（200 字以内）", go: "送出，重写这一章", going: "正在写…", err: "暂时没办法送出，请稍后再试。", login: "请先登录买下这份报告的账号。" }
    : { head: "想再問一件今年的事？", ph: "例如：下半年適合搬家嗎？（200 字以內）", go: "送出，重寫這一章", going: "正在寫…", err: "暫時沒辦法送出，請稍後再試。", login: "請先登入買下這份報告的帳號。" };
  // 10-20 合盤: its own head and placeholder (passed in the reader's script)
  if (copy) for (const [k, v] of Object.entries(copy)) if (v) (t as Record<string, string>)[k] = v;
  const send = async () => {
    if (!q.trim()) return;
    setState("going");
    try {
      const r = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, question: q }) });
      if (r.ok) { window.location.hash = "question"; window.location.reload(); return; }
      setState(r.status === 401 || r.status === 403 ? "login" : "error");
    } catch { setState("error"); }
  };
  return (
    <div className="mt-[var(--s-5)] border-t border-[var(--ink-16)] pt-[var(--s-4)]">
      <p className="t-small !text-[var(--ink-66)]">{t.head}</p>
      <textarea value={q} maxLength={200} rows={2} onChange={(e) => setQ(e.target.value)} placeholder={t.ph}
        className="mt-2 w-full rounded-[6px] border border-[var(--ink-16)] bg-transparent p-3 text-[16px] leading-relaxed focus:outline-none placeholder:!text-[var(--ink-45)]" />
      <button type="button" onClick={() => void send()} disabled={state === "going" || !q.trim()} className="mt-2 px-5 py-2.5 rounded-full border border-[var(--ink)] text-[14px] disabled:opacity-45">{state === "going" ? t.going : t.go}</button>
      {state === "error" && <p className="t-small mt-2 !text-[var(--cinnabar)]">{t.err}</p>}
      {state === "login" && <p className="t-small mt-2 !text-[var(--cinnabar)]">{t.login}</p>}
    </div>
  );
}
