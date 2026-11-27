/**
 * 10-22 进度表 76 (CastFlow 拆分): the rite's sound and touch, out of the page component.
 *
 * ---------- tiny synth (no assets) ----------
 * The rite is physical: three coins cupped, shaken, thrown, landing one by
 * one. The sound follows that sequence rather than decorating the UI.
 * Browser-only: every function is a no-op (or null) where the APIs are missing.
 */

export const rng = () => {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0]! / 2 ** 32;
};

let actx: AudioContext | null = null;

function audio(): AudioContext | null {
  try {
    actx ??= new AudioContext();
    if (actx.state === "suspended") void actx.resume();
    return actx;
  } catch {
    return null;
  }
}

/** Unlocks the context on the first user gesture; iOS needs this. */
export function primeAudio() {
  try {
    actx ??= new AudioContext();
    if (actx.state === "suspended") void actx.resume();
  } catch {
    /* audio unavailable — the whole layer is optional */
  }
}

export function tone(freq: number, dur: number, type: OscillatorType, gain = 0.08, delay = 0) {
  const ctx = audio();
  if (!ctx) return;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.setValueAtTime(gain, ctx.currentTime + delay);
  g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + delay + dur);
  o.connect(g).connect(ctx.destination);
  o.start(ctx.currentTime + delay);
  o.stop(ctx.currentTime + delay + dur + 0.05);
}

let noiseBuf: AudioBuffer | null = null;
function noise(dur: number, gain: number, band: number, q = 1.4) {
  const ctx = audio();
  if (!ctx) return;
  if (!noiseBuf) {
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  const f = ctx.createBiquadFilter();
  f.type = "bandpass";
  f.frequency.value = band;
  f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
  src.connect(f).connect(g).connect(ctx.destination);
  src.start();
  src.stop(ctx.currentTime + dur + 0.02);
}

/** Coins turning over in a cupped hand — grows as the throw is charged. */
export const sfxRattle = (intensity: number) =>
  noise(0.05 + rng() * 0.03, 0.012 + intensity * 0.05, 2600 + rng() * 1800, 2.2);

/** One coin striking the table: a metallic ping over a short click. */
export const sfxCoin = () => {
  noise(0.03, 0.05, 3600 + rng() * 1200, 3);
  tone(2100 + rng() * 700, 0.11, "triangle", 0.045);
  tone(3300 + rng() * 900, 0.07, "triangle", 0.02, 0.012);
};

/** The line taking its place: low, wooden, final. */
export const sfxSettle = () => {
  tone(96, 0.26, "sine", 0.13);
  tone(192, 0.12, "sine", 0.05);
  noise(0.05, 0.02, 420, 1.1);
};

/** Six lines complete: a struck bowl, left to ring. */
export const sfxComplete = () => {
  tone(392, 1.5, "sine", 0.075);
  tone(588, 1.3, "sine", 0.035, 0.02);
  tone(784, 1.1, "sine", 0.022, 0.05);
  tone(1176, 0.8, "sine", 0.012, 0.09);
};

/** Released before the throw was ready: a soft refusal, not an error. */
export const sfxTooSoon = () => tone(180, 0.14, "sine", 0.045);

/** Reading the finished figure upward, one line at a time — a pentatonic rise
    so six ticks read as a phrase resolving rather than six identical beeps. */
const RISE = [392, 440, 494, 587, 659, 784];
export const sfxTick = (i: number) => {
  tone(RISE[i] ?? 784, 0.16, "sine", 0.05);
  tone((RISE[i] ?? 784) * 2, 0.09, "sine", 0.014);
};

/* ---------- haptics ----------
   navigator.vibrate covers Android/Chrome. iOS Safari does not implement the
   Vibration API at all, so iPhone users get sound and motion only — there is
   no reliable web API for Taptic Engine feedback. */
export const canVibrate = () =>
  typeof navigator !== "undefined" && typeof navigator.vibrate === "function";

export function haptic(pattern: number | number[]) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* blocked or unsupported — purely additive */
  }
}
