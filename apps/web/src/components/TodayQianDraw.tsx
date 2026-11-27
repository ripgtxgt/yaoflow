"use client";

import { useRef, useState } from "react";
import s from "./TodayQianDraw.module.css";

/**
 * 10-15 今日一籤 抽籤動效 (Neil: 「可以的，但是要做加载加速哈」). The tube shakes, one lot rises out, the tube drops away
 * and the slip turns over to show the poem — about 2.2 s, and that time is the network's: the draw request leaves on the
 * tap, in parallel; if it is slower, the tube keeps shaking until it lands. Nothing to download: CSS drawn (no images, no
 * library), a stylesheet only this page loads, transform/opacity only. Only someone who has not drawn today ever renders
 * it; reduced-motion readers go straight to the lot.
 */
export interface DrawnLot { set: string; setName: string; num: number; tag: string; title: string; poem: string[]; full?: unknown }
type Phase = "idle" | "shaking" | "rising" | "lifting" | "revealed" | "flip" | "leaving";

const STICKS = Array.from({ length: 9 }, (_, i) => ({ left: 4 + i * 8.4, h: 30 + ((i * 7) % 13), d: (i % 3) * 0.05 }));
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export default function TodayQianDraw<T extends DrawnLot>({ label, busyLabel, failed, numLabel, request, onDone, seal = "籤" }: {
  label: string; busyLabel: string; failed: string; numLabel: (n: number) => string;
  request: () => Promise<T>; onDone: (lot: T) => void;
  /** 10-29 进度表 128: the glyph on the tube and the slip's back — 签 on 简体 pages */
  seal?: string;
}) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [lot, setLot] = useState<T | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const running = useRef(false);

  const go = async () => {
    if (running.current) return;
    running.current = true;
    setErr(null);
    const ask = request(); // leaves now — the animation is the waiting time, never added to it
    const reduce = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      try { onDone(await ask); } catch { setErr(failed); running.current = false; }
      return;
    }
    setPhase("shaking");
    let got: T;
    try {
      [got] = await Promise.all([ask, wait(900)]);
    } catch {
      setPhase("idle"); setErr(failed); running.current = false; return;
    }
    setLot(got);
    setPhase("rising");
    try { navigator.vibrate?.(18); } catch { /* not every phone */ }
    await wait(600);
    setPhase("lifting"); await wait(300);
    setPhase("revealed"); await wait(420);
    setPhase("flip"); await wait(1100);
    setPhase("leaving"); await wait(250);
    onDone(got);
  };

  const cls = phase === "idle" ? "" : phase === "shaking" ? s.shaking
    : phase === "rising" ? s.rising
    : phase === "lifting" ? `${s.rising} ${s.lifting}`
    : `${s.lifting} ${s.revealed} ${phase === "flip" || phase === "leaving" ? s.flip : ""} ${phase === "leaving" ? s.leaving : ""}`;

  return (
    <div className="text-center">
      <div className={`${s.stage} ${cls}`} aria-hidden={phase === "idle" ? undefined : true}>
        <div className={s.out} />
        <div className={s.tube}>
          <div className={s.sticks}>{STICKS.map((x, i) => <i key={i} style={{ left: `${x.left}px`, height: `${x.h}px`, animationDelay: `${x.d}s` }} />)}</div>
          <div className={s.rim} />
          <div className={s.body}><div className={s.band} style={{ top: 12 }} /><div className={s.band} style={{ bottom: 14 }} /><div className={s.seal}>{seal}</div></div>
        </div>
        <div className={s.card}>
          <div className={s.inner}>
            <div className={`${s.face} ${s.back}`}><span>{seal}</span></div>
            <div className={`${s.face} ${s.front}`}>
              {lot && <>
                <span className={s.no}>{lot.setName} · {numLabel(lot.num)}{lot.tag ? ` · ${lot.tag}` : ""}</span>
                <div className={s.poem}>{lot.poem.map((l, k) => <span key={k}>{l}<br /></span>)}</div>
              </>}
            </div>
          </div>
        </div>
      </div>
      {(phase === "idle" || phase === "shaking") && (
        <button type="button" onClick={go} disabled={phase !== "idle"} data-heat="tq-draw"
          className={`mt-[var(--s-3)] min-h-[var(--s-6)] px-8 py-3 rounded-[2px] bg-[var(--ink)] text-[var(--paper)] tracking-[0.2em] ${phase !== "idle" ? "opacity-60" : ""}`}>
          {phase === "idle" ? label : busyLabel}
        </button>
      )}
      {err && <p className="t-small mt-[var(--s-3)] !text-[var(--cinnabar)]">{err}</p>}
    </div>
  );
}
