/**
 * 10-17 (Neil: 「这个动效没有声音吗？」): the sounds of the tarot table, made on the spot with Web Audio (no files):
 * a riffle while shuffling, a soft slide for each card dealt, a whoosh when a card is chosen, a swish as a card turns,
 * and one low singing-bowl tone when the last card is up. Quiet by design; the reader can switch them off.
 * The context is created on the reader's first tap (browsers allow sound only after a gesture).
 */
let ctx: AudioContext | null = null;
let noise: AudioBuffer | null = null;

export function soundReady(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    ctx ??= new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    void ctx.resume();
    if (!noise) {
      noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = noise.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    return ctx;
  } catch { return null; }
}

/** a burst of filtered noise: the paper of a card */
function paper(at: number, len: number, f0: number, f1: number, gain: number, q = 1.2) {
  if (!ctx || !noise) return;
  const src = ctx.createBufferSource();
  src.buffer = noise;
  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass"; bp.Q.value = q;
  bp.frequency.setValueAtTime(f0, at);
  bp.frequency.exponentialRampToValueAtTime(Math.max(60, f1), at + len);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(gain, at + Math.min(0.012, len / 3));
  g.gain.exponentialRampToValueAtTime(0.0001, at + len);
  src.connect(bp).connect(g).connect(ctx.destination);
  src.start(at, Math.random() * 0.5, len + 0.05);
}

/** the two halves riffled together: many quick flicks, faster in the middle */
export function riffle(durationMs = 480) {
  const c = soundReady(); if (!c) return;
  const t0 = c.currentTime + 0.02, n = 34, dur = durationMs / 1000;
  for (let i = 0; i < n; i++) {
    const u = i / (n - 1), t = t0 + dur * (0.5 - 0.5 * Math.cos(Math.PI * u));
    paper(t, 0.03 + Math.random() * 0.015, 3800 + Math.random() * 1500, 2200, 0.05 + Math.random() * 0.03, 1.6);
  }
  paper(t0 + dur + 0.02, 0.07, 900, 300, 0.07, 0.8); // the deck squared up
}

/** one card dealt: a short slide */
export function deal(delayMs = 0, gain = 0.035) {
  const c = soundReady(); if (!c) return;
  const t = c.currentTime + delayMs / 1000;
  paper(t, 0.09, 2600, 1100, gain, 1.1);
}

/** a card chosen: lifted (a soft whoosh) and set down (a light tap) */
export function lift() {
  const c = soundReady(); if (!c) return;
  const t = c.currentTime + 0.01;
  paper(t, 0.32, 500, 2400, 0.05, 0.7);
  paper(t + 0.5, 0.05, 1400, 700, 0.06, 1);
}

/** a card turning over */
export function swish() {
  const c = soundReady(); if (!c) return;
  const t = c.currentTime + 0.12;
  paper(t, 0.22, 3200, 1200, 0.06, 0.9);
}

/** the last card is up: one low bowl tone with its ringing partials */
export function bowl() {
  const c = soundReady(); if (!c) return;
  const t = c.currentTime + 0.35, base = 196;
  const out = c.createGain();
  out.gain.value = 0.9;
  out.connect(c.destination);
  for (const [mul, g, len] of [[1, 0.06, 3.2], [2.76, 0.025, 2.4], [5.4, 0.012, 1.6]] as const) {
    const o = c.createOscillator();
    o.type = "sine"; o.frequency.value = base * mul;
    const e = c.createGain();
    e.gain.setValueAtTime(0.0001, t);
    e.gain.exponentialRampToValueAtTime(g, t + 0.02);
    e.gain.exponentialRampToValueAtTime(0.0001, t + len);
    o.connect(e).connect(out);
    o.start(t); o.stop(t + len + 0.05);
  }
}

/**
 * 10-18 (Neil: iPhone 没震动，加声音试试 → 「太闷了，能不能脆点」): one detent of a picker wheel — a crisp, bright tick
 * like the native iOS wheel: an instant-attack 3 ms burst of high-passed noise with a faint 5 kHz ring, nothing low.
 */
export function detent() {
  const c = soundReady(); if (!c || !noise) return;
  const t = c.currentTime + 0.001;
  const src = c.createBufferSource(); src.buffer = noise;
  const hp = c.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 3200; hp.Q.value = 0.7;
  const pk = c.createBiquadFilter(); pk.type = "peaking"; pk.frequency.value = 6000; pk.gain.value = 9; pk.Q.value = 1.4;
  const g = c.createGain();
  g.gain.setValueAtTime(0.32, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.004);
  src.connect(hp).connect(pk).connect(g).connect(c.destination);
  src.start(t, Math.random() * 0.5, 0.01);
  const o = c.createOscillator(), og = c.createGain();
  o.type = "sine"; o.frequency.setValueAtTime(5200, t);
  og.gain.setValueAtTime(0.05, t); og.gain.exponentialRampToValueAtTime(0.0001, t + 0.006);
  o.connect(og).connect(c.destination); o.start(t); o.stop(t + 0.012);
}
