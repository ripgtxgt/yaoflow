"use client";

import { useEffect, useRef, useState } from "react";
import JiaobeiBlocks from "./JiaobeiBlocks";

/**
 * 10-17 擲筊 3D (Neil: 「筊子做得不太好看……能不能做3D效果」). Two lacquered moon blocks drawn with three.js, loaded only on
 * this page and only in the browser. The result is decided before anything moves (lib/jiaobei.ts toss()); this picks a
 * recorded real-physics fall that ends in exactly those faces (public/jiaobei/motion.json, made by
 * scripts/jiaobei-motion.mts) and replays it, with a soft wooden click at every recorded impact.
 * No WebGL, or three fails to load → the flat SVG blocks (JiaobeiBlocks). Reduced motion → the resting pose at once.
 *
 * blocks[i] = true when that block lands flat face up.
 */
type Clip = { d: number; f: [number, number]; fr: number[]; im: number[] };
type Motion = { v: number; hz: number; clips: Clip[] };
type Props = { blocks: [boolean, boolean]; state: "waiting" | "tossing" | "still"; tossKey: number; instant?: boolean; onSettled?: () => void; sound?: [string, string] };

const SOUND_KEY = "yf_jb_sound";

export default function Jiaobei3D(props: Props) {
  const host = useRef<HTMLDivElement>(null);
  const api = useRef<{ play: (b: [boolean, boolean], instant: boolean) => Promise<void>; dispose: () => void } | null>(null);
  const [mode, setMode] = useState<"loading" | "3d" | "flat">("loading");
  const [sound, setSound] = useState(true);
  const soundRef = useRef(true);
  const settled = useRef(props.onSettled);
  settled.current = props.onSettled;

  useEffect(() => {
    try { const s = localStorage.getItem(SOUND_KEY); if (s === "0") { setSound(false); soundRef.current = false; } } catch { /* private mode */ }
    let dead = false;
    const can = (() => { try { const c = document.createElement("canvas"); return !!(c.getContext("webgl2") || c.getContext("webgl")); } catch { return false; } })();
    if (!can) { setMode("flat"); return; }
    Promise.all([import("@/lib/jiaobei-scene"), fetch("/jiaobei/motion.json").then((r) => r.json() as Promise<Motion>)])
      .then(([m, motion]) => {
        if (dead || !host.current) return;
        api.current = m.createJiaobeiScene(host.current, motion, () => soundRef.current);
        setMode("3d");
      })
      .catch(() => { if (!dead) setMode("flat"); });
    return () => { dead = true; api.current?.dispose(); api.current = null; };
  }, []);

  // a new toss (or, `instant`, the blocks shown at rest in a sign already given)
  useEffect(() => {
    if (props.tossKey === 0) return;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (mode === "flat") { const t = setTimeout(() => settled.current?.(), props.instant || reduced ? 0 : 1000); return () => clearTimeout(t); }
    if (mode !== "3d" || !api.current) return;
    let live = true;
    void api.current.play(props.blocks, !!props.instant || reduced).then(() => { if (live) settled.current?.(); });
    return () => { live = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.tossKey, mode]);

  // three still loading when the toss came: let the flow go on (the blocks appear at rest once ready)
  useEffect(() => {
    if (mode !== "loading" || props.state !== "tossing") return;
    const t = setTimeout(() => settled.current?.(), 1200);
    return () => clearTimeout(t);
  }, [mode, props.state, props.tossKey]);

  if (mode === "flat") return <JiaobeiBlocks blocks={props.blocks} state={props.state} tossKey={props.tossKey} />;
  return (
    <div className="relative mx-auto mt-2 w-full max-w-[34rem]">
      <div ref={host} className="w-full aspect-[16/10]" aria-hidden="true" />
      {mode === "loading" && <div className="absolute inset-0 grid place-items-center t-small !text-[var(--ink-45)]">…</div>}
      {mode === "3d" && (
        <button type="button" className="absolute right-1 bottom-1 t-label !text-[var(--ink-45)] hover:!text-[var(--ink)] px-2 py-1"
          onClick={() => { const n = !sound; setSound(n); soundRef.current = n; try { localStorage.setItem(SOUND_KEY, n ? "1" : "0"); } catch { /* */ } }}
          aria-pressed={sound}>
          {sound ? (props.sound?.[0] ?? "聲音 開") : (props.sound?.[1] ?? "聲音 關")}
        </button>
      )}
    </div>
  );
}
