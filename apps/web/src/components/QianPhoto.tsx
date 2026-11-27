"use client";

import { useRef, useState } from "react";

export interface PhotoMatch { set: string; setName: string; num: number; title: string; tag: string; temple: string | null; templeName: string | null }

/**
 * Shrink in the browser: ≤1000 px on the long side, JPEG, under ~900 KB (the site refuses bodies over 1 MB).
 * 10-14 (Neil: 「每次5-10秒会不会太久了？」): 1000 px read every test slip right (8/8, the real sideways one included) and
 * sends half the bytes of 1400 px; 800 px still named them but read the poems themselves worse.
 */
async function shrink(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = bad; i.src = url; });
    let last = "";
    for (const side of [1000, 900, 800]) for (const q of [0.8, 0.7, 0.6]) {
      const k = Math.min(1, side / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement("canvas");
      c.width = Math.max(1, Math.round(img.naturalWidth * k));
      c.height = Math.max(1, Math.round(img.naturalHeight * k));
      const g = c.getContext("2d");
      if (!g) throw new Error("no canvas");
      g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height);
      g.drawImage(img, 0, 0, c.width, c.height);
      last = c.toDataURL("image/jpeg", q);
      if (last.length < 900_000) return last;
    }
    return last;
  } finally { URL.revokeObjectURL(url); }
}

/**
 * 10-13 拍照认籤: 「拍籤詩，幫我找是哪一首」 above the form. The photo is shrunk here and read on the server (10-14: kept 30 days
 * only when it could not be named — lib/qian-photo-store.ts);
 * what comes back fills the set and the number (and the temple, when its wording gave it away). The reader confirms.
 */
/** what the button says while the photo is being read, step by step */
const READ_STEPS = ["整理照片…", "上傳中…", "正在看照片…", "快好了…", "這張字比較多，再等一下…"];

export default function QianPhoto({ onPick }: { onPick: (m: PhotoMatch) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<"idle" | "reading" | "done">("idle");
  // 10-14 (Neil: 「每次5-10秒会不会太久了？」): say what is happening while it reads, instead of one long wait
  const [step, setStep] = useState(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [choices, setChoices] = useState<PhotoMatch[]>([]);
  const [picked, setPicked] = useState<PhotoMatch | null>(null);

  const pick = (m: PhotoMatch) => { setPicked(m); setChoices([]); setMsg(null); onPick(m); };
  const send = async (file: File | undefined) => {
    if (!file) return;
    setState("reading"); setMsg(null); setChoices([]); setPicked(null); setStep(0);
    timers.current.forEach(clearTimeout);
    try {
      const image = await shrink(file);
      setStep(1);
      timers.current = [setTimeout(() => setStep(2), 2_500), setTimeout(() => setStep(3), 7_000), setTimeout(() => setStep(4), 15_000)];
      const r = await fetch("/api/qian/photo", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ image }) });
      timers.current.forEach(clearTimeout);
      const j = (await r.json().catch(() => ({}))) as { kind?: string; matches?: PhotoMatch[]; number?: number | null; error?: string };
      if (r.status === 429) setMsg(j.error === "busy" ? "拍照找籤暫時用不了，先手動選籤的種類、填籤號。" : "稍等幾分鐘再試，或直接手動填。");
      else if (!r.ok) setMsg("這次沒讀出來，換個角度再拍一次，或直接手動填。");
      else if (j.kind === "one" && j.matches?.[0]) pick(j.matches[0]);
      else if (j.kind === "some" && j.matches?.length) { setChoices(j.matches); setMsg("有幾首很像，是哪一首？"); }
      else if (j.kind === "notslip") setMsg("這張看起來不是籤詩。拍籤紙正面，詩句要拍進去。");
      else setMsg(j.number ? `看得出是第 ${j.number} 籤，但認不出是哪一套。選一下籤的種類，籤號已經幫你填好。` : "詩句沒認出來。拍正一點、光線亮一點再試，或直接手動填。");
      if (j.kind === "none" && j.number) onPick({ set: "", setName: "", num: j.number, title: "", tag: "", temple: null, templeName: null });
    } catch { setMsg("這張照片打不開，換一張試試，或直接手動填。"); }
    timers.current.forEach(clearTimeout);
    setState("done");
    if (input.current) input.current.value = "";
  };

  return (
    <div className="border border-dashed border-[var(--ink-16)] rounded-[2px] px-4 py-3">
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => input.current?.click()} disabled={state === "reading"} data-heat="qian-photo"
          className="t-small px-4 py-2 rounded-[2px] border border-[var(--ink)] text-[var(--ink)] hover:bg-[var(--ink)] hover:text-[var(--paper)] transition disabled:opacity-45">
          {state === "reading" ? READ_STEPS[step] : "拍籤詩，幫我找是哪一首"}
        </button>
        <span className="t-small !text-[var(--ink-45)]">不知道是哪一套籤時最方便。照片不會公開，認不出的 30 天後刪除。</span>
      </div>
      <input ref={input} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => void send(e.target.files?.[0])} />
      {picked && (
        <p className="t-small mt-2 !text-[var(--ink)]">
          認出來了：<b className="font-medium">{picked.setName} 第 {picked.num} 籤{picked.tag ? ` · ${picked.tag}` : ""}〈{picked.title}〉</b>{picked.templeName ? `（${picked.templeName}的用字）` : ""}，已經幫你填好。不對的話，下面可以改。
        </p>
      )}
      {msg && <p className="t-small mt-2 !text-[var(--ink-66)]">{msg}</p>}
      {choices.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {choices.map((m) => (
            <button key={`${m.set}:${m.num}`} type="button" onClick={() => pick(m)} className="t-small px-3 py-2 rounded-[2px] border border-[var(--ink-16)] hover:border-[var(--ink-45)] text-left">
              {m.setName} 第 {m.num} 籤〈{m.title}〉
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
