"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { fullChart, type FullChart, type LineValue } from "@yaoflow/engine";
import { haptic, rng, sfxCoin, sfxComplete, sfxRattle, sfxSettle, sfxTick, sfxTooSoon, tone } from "./sfx";

/**
 * 10-22 进度表 76 (CastFlow 拆分): the rite itself — three coins charged by a held thumb or a shaken phone, thrown,
 * landing one at a time, six lines settling into the ruler, then the figure performed before the document takes
 * over. This hook owns that motion (the coins, the charge, the reveal, the timers); the page owns what the cast
 * means (the question, the guard, the record), and hands it in through `handlers`, read at the moment of use so
 * the newest render's closures always answer.
 */
export type RitePhase = "idle" | "sweep" | "figure";
export type CastMode = "hold" | "shake" | "ask";

export interface RiteHandlers {
  /** the guard before a toss (一事一占, the question check, the first-toss bookkeeping); false stops the rite */
  beginRite: () => boolean;
  /** six lines in: the figure is formed — called before the reveal plays */
  onComplete: (values: LineValue[], at: number, chart: FullChart) => void;
  /** the reveal is over (or skipped): the document takes the screen */
  onReveal: (chart: FullChart) => void;
}

export function useRite({ hasChart, handlers }: { hasChart: boolean; handlers: RefObject<RiteHandlers> }) {
  const [values, setValues] = useState<LineValue[]>([]);
  const [coins, setCoins] = useState<number[] | null>(null);
  const [spinning, setSpinning] = useState(false);
  const [charge, setCharge] = useState(0);
  const [revealed, setRevealed] = useState(0);
  const [tooSoon, setTooSoon] = useState(false);
  const holdTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  /* The completed figure is performed before the document takes over: the six
     lines are read upward, then the hexagram names itself. Swapping straight
     to the reading throws away the one moment the whole product builds to. */
  const [phase, setPhase] = useState<RitePhase>("idle");
  const [sweep, setSweep] = useState(0);
  const [formed, setFormed] = useState<FullChart | null>(null);
  const revealTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  /* A landed line gets a beat to itself: without it, six casts in a row
     collapse into mashing one button. */
  const [holdBeat, setHoldBeat] = useState(false);

  /* Two ways to cast. Shaking is the rite; holding is for everyone else. The
     device decides which is offered; the reader may switch. Either way the page
     never casts on its own — the moment of the throw is the user's own.
       - "shake": motion granted and driving
       - "hold": fallback (desktop, denied, unsupported, reduced motion)
       - "ask": iOS needs a tap-gated permission request first */
  const [castMode, setCastMode] = useState<CastMode>("hold");
  const [canShake, setCanShake] = useState(false);
  const [shakeIntensity, setShakeIntensity] = useState(0); // live, for the coin jitter
  const lastAccel = useRef<{ x: number; y: number; z: number } | null>(null);
  const lastShakeAt = useRef(0);
  const shakeRaf = useRef<ReturnType<typeof setInterval> | null>(null);
  const chargeRef = useRef(0);

  /** Charge with quarter-mark haptics; both modes speak through this. */
  const updateCharge = (add: number) => {
    setCharge((c) => {
      const next = Math.min(Math.max(c + add, 0), 1);
      if (c < 0.25 && next >= 0.25) haptic(7);
      else if (c < 0.5 && next >= 0.5) haptic(9);
      else if (c < 0.75 && next >= 0.75) haptic(11);
      else if (c < 1 && next >= 1) {
        haptic([14, 45, 14]); // ready
        tone(660, 0.1, "sine", 0.035);
      }
      chargeRef.current = next;
      return next;
    });
  };

  const holdStart = () => {
    if (spinning || values.length >= 6 || holdTimer.current) return;
    if (!handlers.current.beginRite()) return;
    setCoins(null);
    setRevealed(0);
    haptic(9); // the coins are in hand

    let ticks = 0;
    holdTimer.current = setInterval(() => {
      ticks++;
      if (chargeRef.current < 1 && ticks % 2 === 0) sfxRattle(chargeRef.current);
      updateCharge(0.07);
    }, 40);
  };

  const holdEnd = () => {
    if (holdTimer.current) {
      clearInterval(holdTimer.current);
      holdTimer.current = null;
    }
    setCharge((c) => {
      if (c >= 1) doToss();
      else if (c > 0.08) {
        // released early: say so, rather than doing nothing at all
        sfxTooSoon();
        haptic(4);
        setTooSoon(true);
        setTimeout(() => setTooSoon(false), 1600);
      }
      chargeRef.current = 0;
      return 0;
    });
  };

  /* ---------- the shake engine ---------- */

  /** iOS gates motion behind a user-gesture permission request. */
  const askMotion = async () => {
    try {
      const DM = DeviceMotionEvent as unknown as { requestPermission?: () => Promise<string> };
      const r = await DM.requestPermission?.();
      setCastMode(r === "granted" ? "shake" : "hold");
    } catch {
      setCastMode("hold");
    }
  };

  // decide the mode once the rite screen mounts
  useEffect(() => {
    try {
      if (typeof window === "undefined" || !("DeviceMotionEvent" in window)) return; // hold
      if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return; // hold
      const needsAsk =
        typeof (DeviceMotionEvent as unknown as { requestPermission?: unknown }).requestPermission === "function";
      // coarse pointer ≈ a device you can actually shake
      const mobile = window.matchMedia?.("(pointer: coarse)").matches;
      if (!mobile) return; // hold on desktop
      setCanShake(true);
      setCastMode(needsAsk ? "ask" : "shake");
    } catch {
      /* hold */
    }
  }, []);

  // the engine itself: shake energy charges; stillness after full = the throw
  useEffect(() => {
    if (castMode !== "shake") return;

    const onMotion = (e: DeviceMotionEvent) => {
      const a = e.accelerationIncludingGravity;
      if (!a || a.x == null || a.y == null || a.z == null) return;
      const prev = lastAccel.current;
      lastAccel.current = { x: a.x, y: a.y, z: a.z };
      if (!prev) return;
      const delta = Math.abs(a.x - prev.x) + Math.abs(a.y - prev.y) + Math.abs(a.z - prev.z);
      if (delta < 4) return; // idle noise
      if (spinning || values.length >= 6 || hasChart) return;
      if (!handlers.current.beginRite()) return;

      const now = Date.now();
      lastShakeAt.current = now;
      const strength = Math.min(delta / 18, 1);
      setShakeIntensity(strength);
      updateCharge(0.028 + strength * 0.05);
      if (chargeRef.current < 1) sfxRattle(Math.max(strength, chargeRef.current));
    };

    // decay + the stillness trigger, on a steady clock
    shakeRaf.current = setInterval(() => {
      const quiet = Date.now() - lastShakeAt.current;
      if (quiet > 220) setShakeIntensity(0);
      if (chargeRef.current >= 1) {
        // charged: a stilled hand casts
        if (quiet > 420 && !spinning && values.length < 6) {
          chargeRef.current = 0;
          setCharge(0);
          doToss();
        }
      } else if (chargeRef.current > 0 && quiet > 300) {
        // stopped too soon — the coins settle back (they must be turned evenly)
        updateCharge(-0.045);
      }
    }, 120);

    window.addEventListener("devicemotion", onMotion);
    return () => {
      window.removeEventListener("devicemotion", onMotion);
      if (shakeRaf.current) clearInterval(shakeRaf.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [castMode, spinning, values.length, hasChart]);

  const doToss = () => {
    if (spinning || values.length >= 6) return;
    setSpinning(true);
    setRevealed(0);
    haptic(16); // the throw itself
    const faces = [rng() < 0.5 ? 2 : 3, rng() < 0.5 ? 2 : 3, rng() < 0.5 ? 2 : 3];
    setCoins(faces);

    // coins land one after another, never together — that stagger is what
    // makes the outcome feel arrived at rather than announced
    const at = [300, 470 + rng() * 60, 660 + rng() * 80];
    at.forEach((ms, i) => {
      setTimeout(() => {
        setRevealed(i + 1);
        sfxCoin();
        haptic(6);
      }, ms);
    });

    setTimeout(() => {
      const v = (faces[0]! + faces[1]! + faces[2]!) as LineValue;
      const next = [...values, v];
      setValues(next);
      setSpinning(false);
      sfxSettle();
      haptic(v === 6 || v === 9 ? [22, 55, 22] : 20); // a moving line gets its own signature

      if (next.length < 6) {
        // let the line stand before the next throw is offered
        setHoldBeat(true);
        setTimeout(() => setHoldBeat(false), 620);
        return;
      }

      const now = Date.now();
      const c = fullChart({ values: next, utcMs: now, tzOffsetMinutes: -new Date().getTimezoneOffset() });
      handlers.current.onComplete(next, now, c);
      runReveal(c);
    }, at[2]! + 200);
  };

  /** Perform the finished figure, then hand over to the document. */
  const runReveal = (c: FullChart) => {
    const T = (ms: number, fn: () => void) => revealTimers.current.push(setTimeout(fn, ms));
    setFormed(c);
    setPhase("sweep");
    setSweep(0);

    // read the figure upward, line by line
    for (let i = 0; i < 6; i++) {
      T(460 + i * 150, () => {
        setSweep(i + 1);
        sfxTick(i);
        haptic(5);
      });
    }
    // the hexagram names itself
    T(460 + 6 * 150 + 180, () => {
      setPhase("figure");
      sfxComplete();
      haptic([26, 70, 26, 70, 70]);
    });
    // and only then does the reading take the screen
    T(460 + 6 * 150 + 180 + 1750, () => {
      handlers.current.onReveal(c);
      setPhase("idle");
    });
  };

  /** Let an impatient reader skip straight to the reading. */
  const skipReveal = () => {
    if (!formed) return;
    revealTimers.current.forEach(clearTimeout);
    revealTimers.current = [];
    handlers.current.onReveal(formed);
    setPhase("idle");
  };

  /** a fresh rite (the page's own reset clears the figure and the readings) */
  const clearRite = () => { setValues([]); setCoins(null); setRevealed(0); };

  // never leave timers running behind us
  useEffect(() => () => {
    if (holdTimer.current) clearInterval(holdTimer.current);
    revealTimers.current.forEach(clearTimeout);
  }, []);

  return {
    values, setValues, coins, spinning, charge, revealed, tooSoon, phase, sweep, formed, holdBeat,
    castMode, setCastMode, canShake, shakeIntensity,
    holdStart, holdEnd, askMotion, skipReveal, clearRite,
  };
}
