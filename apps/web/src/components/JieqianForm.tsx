"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { QIAN_SETS, qianSet, situationsFor, templesFor } from "@/lib/qian-meta";
import QianPhoto, { type PhotoMatch } from "@/components/QianPhoto";
import EmailField from "@/components/EmailField";
import { emailTypoPending } from "@/lib/email-check";

/**
 * 10-12 解籤 (进度表 §四 36 ③): temple (recorded only), lot number, the reader's kind of matter, one question. The
 * draw is saved and the result opens on its own page.
 */
export default function JieqianForm({ initialNum, initialQuestion, from, matter, initialSet, signedIn = false }: { initialNum?: number; initialQuestion?: string; /** 10-12 承接: the reading / matter this lot joins */ from?: string; matter?: number; /** 10-12 籤系 */ initialSet?: string; /** 10-13: signed-in readers are not asked for an address */ signedIn?: boolean }) {
  const router = useRouter();
  const [setId, setSetId] = useState<string>(qianSet(initialSet).id);
  const set = qianSet(setId);
  const [temple, setTemple] = useState<string>(templesFor(set.id)[0]!.id);
  const [num, setNum] = useState<string>(initialNum ? String(initialNum) : "");
  const [situation, setSituation] = useState<string>("");
  const [question, setQuestion] = useState(initialQuestion ?? "");
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "error">("idle");
  const [problem, setProblem] = useState<string | null>(null);
  const n = Number(num);
  const go = async () => {
    if (state === "sending") return;
    if (!Number.isInteger(n) || n < 1 || n > set.count) { setProblem(`${set.name}的籤號是 1 到 ${set.count} 的數字。`); return; }
    if (!situation) { setProblem("選一個最接近你的處境。"); return; }
    if (question.trim().length < 2) { setProblem("寫一句你想問的事。"); return; }
    if (!signedIn && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())) { setProblem("留一個信箱，解讀寫好會寄到這裡。"); return; }
    if (!signedIn && emailTypoPending(email)) return; // 10-23: the 「是不是 …？」 line under the box is asking (gmail.con got through here)
    setProblem(null); setState("sending");
    try {
      const r = await fetch("/api/qian/draw", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ set: set.id, num: n, temple, situation, question: question.trim(), ...(signedIn ? {} : { email: email.trim() }), ...(from ? { from } : {}), ...(matter ? { matter } : {}) }) });
      const j = (await r.json().catch(() => ({}))) as { url?: string };
      if (r.ok && j.url) { router.push(j.url); return; }
      setState("error");
    } catch { setState("error"); }
  };
  // 10-13 拍照认籤: what the photo told us — the set and number (and the temple, when its wording gave it away)
  const fromPhoto = (m: PhotoMatch) => {
    if (m.set) {
      setSetId(m.set);
      const temples = templesFor(m.set);
      setTemple(m.temple && temples.some((t) => t.id === m.temple) ? m.temple : temples[0]!.id);
      if (!situationsFor(m.set).some((x) => x.id === situation)) setSituation("");
    }
    setNum(String(m.num));
    setProblem(null);
  };
  const chip = (on: boolean) => `t-small px-4 py-2 rounded-[2px] border transition-colors ${on ? "border-[var(--ink)] text-[var(--ink)]" : "border-[var(--ink-16)] hover:border-[var(--ink-45)]"}`;
  return (
    <form onSubmit={(e) => { e.preventDefault(); void go(); }} className="panel px-[var(--s-4)] py-[var(--s-5)] flex flex-col gap-[var(--s-4)]">
      <QianPhoto onPick={fromPhoto} />
      {/* 10-12 籤系: which set the slip is from — the temple list and the number range follow it */}
      <div>
        <p className="t-label">抽到的是哪一種籤</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {QIAN_SETS.map((s) => (
            <button key={s.id} type="button" aria-pressed={setId === s.id} data-heat={`jieqian-set-${s.id}`}
              onClick={() => { setSetId(s.id); setTemple(templesFor(s.id)[0]!.id); if (!situationsFor(s.id).some((x) => x.id === situation)) setSituation(""); setProblem(null); }} className={chip(setId === s.id)}>{s.name}</button>
          ))}
        </div>
        <p className="t-small mt-2 !text-[var(--ink-45)]">{set.where}，1 到 {set.count} 號。</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-[1fr_9rem] gap-[var(--s-3)]">
        <label className="flex flex-col gap-2">
          <span className="t-label">在哪裡求的籤</span>
          <select value={temple} onChange={(e) => setTemple(e.target.value)} className="t-body bg-transparent border border-[var(--ink-16)] rounded-[2px] px-3 py-3 outline-none focus:border-[var(--ink-45)]">
            {templesFor(set.id).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-2">
          <span className="t-label">第幾籤</span>
          <input type="number" inputMode="numeric" min={1} max={set.count} value={num} onChange={(e) => { setNum(e.target.value); setProblem(null); }} placeholder={`1–${set.count}`}
            className="t-body bg-transparent border border-[var(--ink-16)] rounded-[2px] px-3 py-3 outline-none focus:border-[var(--ink-45)] placeholder:text-[var(--ink-45)]" />
        </label>
      </div>
      <div>
        <p className="t-label">你問的是哪一類</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {situationsFor(set.id).map((s) => (
            <button key={s.id} type="button" aria-pressed={situation === s.id} onClick={() => { setSituation(s.id); setProblem(null); }} className={chip(situation === s.id)} data-heat={`jieqian-sit-${s.id}`}>{s.label}</button>
          ))}
        </div>
      </div>
      <label className="flex flex-col gap-2">
        <span className="t-label">想問的事，寫一句</span>
        <textarea rows={3} maxLength={450} value={question} onChange={(e) => { setQuestion(e.target.value); setProblem(null); }} placeholder="例如：他這個月會不會主動跟我聯絡？"
          className="t-body bg-transparent border border-[var(--ink-16)] rounded-[2px] p-4 outline-none focus:border-[var(--ink-45)] placeholder:text-[var(--ink-45)] resize-none" />
      </label>
      {!signedIn && (
        <EmailField locale="zh-hant" id="jq-email" label="你的信箱" value={email} onChange={(v) => { setEmail(v); setProblem(null); }} note="解讀寫好會寄到這裡，也用來找回這支籤；不會寄廣告。" />
      )}
      <p className="t-small !text-[var(--ink-45)] -mt-2">不確定是哪一套，用上面的「拍籤詩」，或對照籤紙上的干支、宮位、籤題。</p>
      {problem && <p className="t-small !text-[var(--cinnabar)] -mt-2">{problem}</p>}
      {state === "error" && <p className="t-small !text-[var(--cinnabar)] -mt-2">沒送出去，稍後再試一次。</p>}
      <button type="submit" disabled={state === "sending"} data-heat="jieqian-submit"
        className="w-full md:w-auto md:self-start min-h-[var(--s-6)] px-9 py-3 rounded-[2px] bg-[var(--ink)] text-[var(--paper)] tracking-[0.16em] text-[13px] hover:bg-[var(--cinnabar)] transition disabled:opacity-45">
        {state === "sending" ? "正在打開…" : "看這支籤怎麼說"}
      </button>
      <p className="t-small !text-[var(--ink-45)] -mt-2">下一步看籤詩原文；白話和專屬解讀需付費，會員已含。你的問題不會公開。</p>
    </form>
  );
}
