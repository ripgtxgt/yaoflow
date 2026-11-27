"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { track } from "@/lib/track";
import type { TarotUi } from "@/lib/tarot-ui";
import s from "./TarotDraw.module.css";
import * as snd from "@/lib/card-sound";

const SOUND_KEY = "yf_tarot_sound";

/**
 * 10-17 (Neil: 「抽牌的这个动效再做好看一点」): the draw on one table. The same 22 cards stay on stage the whole way —
 * resting deck (breathing) → riffle shuffle twice → dealt out into a fan → the reader taps n cards, each rises and flies to
 * its place → the rest are swept away → the chosen cards come to the middle and turn over one by one.
 * Every move is a transform on the card itself (left/top never change), so it stays on the compositor and is smooth on a
 * phone. The cards were dealt on the server when the shuffle began; the fan only decides the order they are turned.
 */
type Card = { id: string; rev: boolean; name: string; en: string; img: string; keywords: string[] };
type Mode = "deck" | "split" | "fan" | "pick" | "reveal";
const N = 22;
const fill = (t: string, k: string, v: string | number) => t.replace(`{${k}}`, String(v));

/** an original back: ink, a double gold rule, a star in two rings with fine rays — nothing borrowed from any printed deck */
const BACK = (() => {
  const g = "#b08d4a";
  const rays = Array.from({ length: 24 }, (_, i) => {
    const a = (i * Math.PI) / 12, r1 = 33, r2 = i % 2 ? 37 : 41;
    return `<line x1='${(60 + r1 * Math.sin(a)).toFixed(1)}' y1='${(105 - r1 * Math.cos(a)).toFixed(1)}' x2='${(60 + r2 * Math.sin(a)).toFixed(1)}' y2='${(105 - r2 * Math.cos(a)).toFixed(1)}'/>`;
  }).join("");
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 120 210'>
<rect width='120' height='210' rx='7' fill='#16171f'/>
<g stroke='${g}' stroke-opacity='.10' stroke-width='.6'>${Array.from({ length: 14 }, (_, i) => `<line x1='${-60 + i * 18}' y1='0' x2='${60 + i * 18}' y2='210'/><line x1='${180 - i * 18}' y1='0' x2='${60 - i * 18}' y2='210'/>`).join("")}</g>
<rect x='5' y='5' width='110' height='200' rx='4' fill='none' stroke='${g}' stroke-width='1.1'/>
<rect x='9' y='9' width='102' height='192' rx='2.5' fill='none' stroke='${g}' stroke-opacity='.6' stroke-width='.6'/>
<g fill='${g}'><circle cx='15' cy='15' r='1.4'/><circle cx='105' cy='15' r='1.4'/><circle cx='15' cy='195' r='1.4'/><circle cx='105' cy='195' r='1.4'/></g>
<g fill='none' stroke='${g}'>
<circle cx='60' cy='105' r='30' stroke-width='.9'/><circle cx='60' cy='105' r='26' stroke-width='.5' stroke-opacity='.7'/>
<rect x='45' y='90' width='30' height='30' stroke-width='.8'/><rect x='45' y='90' width='30' height='30' stroke-width='.8' transform='rotate(45 60 105)'/>
<circle cx='60' cy='105' r='6' stroke-width='.8'/>
<g stroke-width='.6' stroke-opacity='.8'>${rays}</g>
<path d='M60 30 a8 8 0 1 0 6 13 a6.5 6.5 0 1 1 -6 -13z' stroke-width='.8'/>
<circle cx='60' cy='172' r='5' stroke-width='.8'/><circle cx='60' cy='172' r='1.6' fill='${g}'/>
</g></svg>`;
  return `url("data:image/svg+xml;utf8,${encodeURIComponent(svg.replace(/\n/g, ""))}")`;
})();

/** a small, fixed jitter per card so the deck looks hand-stacked */
const jitter = Array.from({ length: N }, (_, i) => ((i * 37) % 11) / 11 - 0.5);

export function TarotDraw({ locale, ui, initialQ = "" }: { locale: string; ui: TarotUi; initialQ?: string }) {
  // 10-30 进度表 128: a question in a Latin-script language needs more letters than one in Chinese, Japanese or Korean
  const maxQ = /^(zh|ja|ko)/.test(locale) ? 120 : 200;
  const [q, setQ] = useState(initialQ);
  const [spread, setSpread] = useState<1 | 3>(1);
  const [phase, setPhase] = useState<"ask" | "shuffle" | "pick" | "reveal">("ask");
  const [mode, setMode] = useState<Mode>("deck");
  const [err, setErr] = useState<string | null>(null);
  const [again, setAgain] = useState<{ url: string; question?: string } | null>(null);
  const [cards, setCards] = useState<Card[]>([]);
  const [url, setUrl] = useState("");
  const [picked, setPicked] = useState<number[]>([]);
  const [flipped, setFlipped] = useState(0);
  // 10-18 (Neil: 「手机在哪个牌上面滑动，需要有当前牌面的动效」): the card under the finger (or mouse) rises
  const [hot, setHot] = useState<number | null>(null);
  const lastHot = useRef<number | null>(null);
  const [w, setW] = useState(680);
  const stage = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLTextAreaElement>(null);
  const reduced = useRef(false);
  // 10-17 (Neil: 「这个动效没有声音吗？」): quiet table sounds, on unless the reader turned them off
  const [sound, setSound] = useState(true);
  const soundOn = useRef(true);
  useEffect(() => { try { if (localStorage.getItem(SOUND_KEY) === "0") { setSound(false); soundOn.current = false; } } catch { /* */ } }, []);
  const toggleSound = () => { const n = !sound; setSound(n); soundOn.current = n; try { localStorage.setItem(SOUND_KEY, n ? "1" : "0"); } catch { /* */ } if (n) snd.soundReady(); };
  const play = (f: () => void) => { if (soundOn.current) { try { f(); } catch { /* */ } } };

  useLayoutEffect(() => {
    reduced.current = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    const el = stage.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth || 680));
    ro.observe(el);
    setW(el.clientWidth || 680);
    return () => ro.disconnect();
  }, []);

  // geometry, all from the stage width
  const g = useMemo(() => {
    const narrow = w < 520;
    const H = narrow ? 460 : 520;
    const n = cards.length || spread;
    const gap = narrow ? 10 : 18;
    const slotW = Math.min(n === 1 ? (narrow ? 140 : 160) : 132, Math.floor((w - 24 - gap * (n - 1)) / n));
    const slotH = Math.round(slotW * 1.75);
    const fanW = narrow ? 50 : 62;
    const fanScale = fanW / slotW;
    const maxA = narrow ? 34 : 40;
    const R = Math.min(narrow ? 420 : 760, ((w * 0.40) / Math.sin((maxA * Math.PI) / 180)));
    const drop = R * (1 - Math.cos((maxA * Math.PI) / 180));
    const fanY = H - 24 - (fanW * 1.75) / 2 - drop; // the centre card's centre
    const deckY = narrow ? H * 0.5 : H * 0.48;
    const slotY = 18 + slotH / 2; // where picked cards wait during the pick
    const revealY = Math.max(slotH / 2 + 20, H / 2 - 40);
    return { H, n, gap, slotW, slotH, fanW, fanScale, maxA, R, fanY, deckY, slotY, revealY };
  }, [w, cards.length, spread]);

  const slotX = (k: number) => (k - (g.n - 1) / 2) * (g.slotW + g.gap);

  /** where card i (0..21 in the deck) sits for the current mode */
  const place = (i: number): { x: number; y: number; r: number; sc: number; o: number; delay: number; z: number } => {
    const k = picked.indexOf(i);
    const stack = { x: jitter[i]! * 3, y: g.deckY - i * 0.7, r: jitter[i]! * 3, sc: Math.max(g.fanScale * 1.25, 0.5), o: 1, delay: 0, z: i };
    if (mode === "deck") return stack;
    if (mode === "split") {
      const side = i % 2 ? 1 : -1;
      return { x: side * (w < 520 ? 52 : 78) + jitter[i]! * 4, y: g.deckY - 18 - i * 0.5, r: side * 11, sc: Math.max(g.fanScale * 1.25, 0.5), o: 1, delay: (i % 11) * 14, z: i };
    }
    if (k >= 0) {
      const y = mode === "reveal" ? g.revealY : g.slotY;
      return { x: slotX(k), y, r: 0, sc: 1, o: 1, delay: mode === "reveal" ? 120 : 0, z: 100 + k };
    }
    const a = -g.maxA + (2 * g.maxA * i) / (N - 1);
    const rad = (a * Math.PI) / 180;
    const fan = { x: g.R * Math.sin(rad), y: g.fanY + g.R * (1 - Math.cos(rad)), r: a, sc: g.fanScale, o: 1, delay: mode === "fan" ? i * 32 : 0, z: i };
    if (mode === "reveal") return { ...fan, y: fan.y + 160, o: 0, delay: Math.abs(i - N / 2) * 18 };
    if (mode === "pick" && hot !== null) {
      const d = Math.abs(i - hot);
      const lift = d === 0 ? 30 : d === 1 ? 12 : d === 2 ? 4 : 0;
      if (lift) return { ...fan, x: fan.x + lift * Math.sin(rad), y: fan.y - lift * Math.cos(rad), sc: fan.sc * (d === 0 ? 1.16 : 1), z: d === 0 ? 60 : i };
    }
    return fan;
  };

  const start = async () => {
    const text = q.trim();
    setErr(null); setAgain(null);
    if ([...text].length < 4) { setErr(ui.short); box.current?.focus(); return; }
    setPhase("shuffle");
    play(() => snd.soundReady()); // the tap that allows sound
    track("tarot", { locale, method: `start:${spread}`, path: "/tarot" });
    // two riffles while the server deals
    const riffle = reduced.current ? Promise.resolve() : (async () => {
      for (let k = 0; k < 2; k++) {
        setMode("split"); play(() => snd.riffle(900)); await wait(520);
        setMode("deck"); await wait(560);
      }
    })();
    try {
      const r = await fetch("/api/tarot/draw", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: text, spread, locale }) });
      const j = (await r.json().catch(() => ({}))) as { error?: string; why?: string; url?: string; again?: boolean; question?: string; cards?: Card[] };
      await riffle;
      if (!r.ok || !j.url || !j.cards) {
        setPhase("ask"); setMode("deck");
        setErr(j.error === "refuse" ? (ui[`refuse_${j.why}` as keyof TarotUi] ?? ui.error) : j.error === "question_required" ? ui.short : ui.error);
        return;
      }
      if (j.again) { setPhase("ask"); setMode("deck"); setAgain({ url: j.url, question: j.question }); return; }
      // preload the faces so the turn never shows an empty card
      for (const c of j.cards) { const im = new Image(); im.src = c.img; }
      setCards(j.cards); setUrl(j.url); setPicked([]); setFlipped(0);
      setPhase("pick"); setMode("fan");
      play(() => { for (let i = 0; i < N; i += 2) snd.deal(120 + i * 32, 0.03); });
      await wait(N * 32 + 650);
      setMode("pick");
    } catch { setPhase("ask"); setMode("deck"); setErr(ui.error); }
  };

  const pick = (i: number) => {
    if (phase !== "pick" || mode === "fan" || picked.includes(i) || picked.length >= cards.length) return;
    const next = [...picked, i];
    setPicked(next);
    play(snd.lift);
    if (next.length === cards.length) {
      setTimeout(() => { setPhase("reveal"); setMode("reveal"); }, 650);
    }
  };

  useEffect(() => {
    if (phase !== "reveal" || flipped >= cards.length) return;
    const t = setTimeout(() => {
      play(snd.swish);
      if (flipped + 1 >= cards.length) play(snd.bowl);
      setFlipped((n) => n + 1);
    }, flipped === 0 ? 1100 : 900);
    if (flipped === 0) track("tarot", { locale, method: "flip", path: "/tarot" });
    return () => clearTimeout(t);
  }, [phase, flipped, cards.length, locale]);

  /** which fan card is under a point on the stage: by angle around the fan's pivot, each card owning the strip of it that
   * the next card does not cover; a card already taken hands over to its nearest neighbour */
  const cardAt = (clientX: number, clientY: number): number | null => {
    const el = stage.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const px = clientX - r.left - r.width / 2, py = clientY - r.top;
    const pivotY = g.fanY + g.R;
    const dist = Math.hypot(px, pivotY - py);
    const cardH = g.fanW * 1.75;
    if (dist < g.R - cardH * 0.75 || dist > g.R + cardH * 0.9) return null;
    const a = (Math.atan2(px, pivotY - py) * 180) / Math.PI;
    const step = (2 * g.maxA) / (N - 1);
    const hw = (Math.atan(g.fanW / 2 / g.R) * 180) / Math.PI;
    if (a < -g.maxA - hw || a > g.maxA + hw) return null;
    let i = Math.max(0, Math.min(N - 1, Math.floor((a + g.maxA + hw) / step)));
    if (picked.includes(i)) {
      let best: number | null = null;
      for (let d = 1; d < N && best === null; d++) for (const j of [i - d, i + d]) if (j >= 0 && j < N && !picked.includes(j)) { best = j; break; }
      i = best ?? i;
    }
    return i;
  };
  const canPick = phase === "pick" && mode === "pick" && picked.length < cards.length;
  const moveTo = (i: number | null) => {
    if (i === lastHot.current) return;
    lastHot.current = i;
    setHot(i);
    if (i !== null) {
      play(() => snd.deal(0, 0.012));
      try { navigator.vibrate?.(4); } catch { /* */ }
    }
  };
  useEffect(() => { if (!canPick) { lastHot.current = null; setHot(null); } }, [canPick]);

  const left = cards.length - picked.length;
  const asking = phase === "ask" || phase === "shuffle";
  const done = phase === "reveal" && flipped >= cards.length;

  return (
    <div className="mt-[var(--s-5)]">
      {asking ? (
        <>
          <label className="t-label block" htmlFor="tarot-q">{ui.qLabel}</label>
          <textarea id="tarot-q" ref={box} value={q} onChange={(e) => { setQ(e.target.value.slice(0, maxQ)); setErr(null); }} rows={3} maxLength={maxQ} placeholder={ui.qPh} disabled={phase === "shuffle"}
            className="mt-2 w-full rounded-[2px] border border-[var(--ink-16)] bg-transparent px-3 py-2 t-body !text-[16px] focus:outline-none focus:border-[var(--ink-45)]" />
          <p className="t-small mt-1 !text-[var(--ink-45)]">{ui.qHint}</p>
          <div className="mt-[var(--s-4)] grid grid-cols-2 gap-3" role="radiogroup">
            {([1, 3] as const).map((n) => (
              <button key={n} type="button" role="radio" aria-checked={spread === n} onClick={() => setSpread(n)} disabled={phase === "shuffle"}
                className={`text-left rounded-[2px] border px-4 py-3 transition ${spread === n ? "border-[var(--ink)]" : "border-[var(--ink-16)] opacity-70"}`}>
                <span className="t-body block">{n === 1 ? ui.spread1 : ui.spread3}</span>
                <span className="t-small block !text-[var(--ink-66)]">{n === 1 ? ui.spread1Sub : ui.spread3Sub}</span>
              </button>
            ))}
          </div>
        </>
      ) : (
        <p className="t-body text-center !text-[var(--ink-66)]">{ui.quote.replace("{q}", q.trim())}</p>
      )}

      <div ref={stage} className={`${s.stage} ${mode === "deck" && phase === "ask" ? s.idle : ""}`} style={{ height: asking ? Math.round(g.H * 0.62) : g.H }} aria-hidden={asking}>
        <button type="button" onClick={toggleSound} aria-pressed={sound} className="absolute right-0 -top-1 z-[200] t-label !text-[var(--ink-45)] hover:!text-[var(--ink)] px-2 py-1">{sound ? ui.soundOn : ui.soundOff}</button>
        <div className={s.ring} style={{ top: (asking ? g.deckY : phase === "reveal" ? g.revealY : g.fanY + 40) - 120 }} />
        {phase === "pick" && (
          <div className={s.slots}>
            {Array.from({ length: g.n }, (_, k) => (
              <span key={k} className={s.slot} style={{ width: g.slotW, height: g.slotH, transform: `translate(calc(-50% + ${slotX(k)}px), calc(-50% + ${g.slotY}px))` }} />
            ))}
          </div>
        )}
        {canPick && (
          <div className={s.touch} style={{ top: Math.max(0, g.fanY - g.fanW * 1.75), bottom: 0 }}
            onPointerDown={(e) => { (e.target as HTMLElement).setPointerCapture?.(e.pointerId); moveTo(cardAt(e.clientX, e.clientY)); }}
            onPointerMove={(e) => moveTo(cardAt(e.clientX, e.clientY))}
            onPointerUp={(e) => { const i = cardAt(e.clientX, e.clientY) ?? hot; moveTo(null); if (i !== null) pick(i); }}
            onPointerLeave={(e) => { if (e.pointerType === "mouse") moveTo(null); }}
            onPointerCancel={() => moveTo(null)} />
        )}
        {Array.from({ length: N }, (_, i) => {
          const p = place(i);
          const k = picked.indexOf(i);
          const face = k >= 0 ? cards[k] : undefined;
          const isFlipped = k >= 0 && k < flipped;
          const pickable = phase === "pick" && mode === "pick" && k < 0 && picked.length < cards.length;
          // in the ask phase the deck sits higher in a shorter stage
          const y = asking ? p.y - (g.H - Math.round(g.H * 0.62)) / 2 + 10 : p.y;
          return (
            <button key={i} type="button" tabIndex={pickable ? 0 : -1} disabled={!pickable} aria-label={pickable ? fill(ui.pickLeft, "n", left) : undefined}
              onClick={() => pick(i)}
              className={`${s.card} ${pickable ? s.pickable : ""} ${pickable && hot === i ? s.hot : ""} ${hot !== null ? s.tracking : ""} ${k >= 0 ? s.chosen : ""} ${isFlipped ? s.flipped : ""} ${done && k >= 0 ? s.glow : ""}`}
              style={{
                width: g.slotW, height: g.slotH, zIndex: p.z, opacity: p.o,
                transform: `translate(calc(-50% + ${p.x}px), calc(-50% + ${y}px)) rotate(${p.r}deg) scale(${p.sc})`,
                transitionDelay: `${p.delay}ms`,
              }}>
              <span className={s.inner}>
                <span className={s.back} style={{ backgroundImage: BACK }} />
                <span className={`${s.face} ${face?.rev ? s.rev : ""}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {face && <img src={face.img} alt={face.name} />}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      {phase === "pick" && (
        <p className="t-body text-center -mt-2" aria-live="polite">{mode === "fan" ? " " : left === cards.length ? fill(ui.pickN, "n", cards.length) : fill(ui.pickLeft, "n", left)}</p>
      )}

      {phase === "reveal" && (
        <div className="grid gap-[10px] mx-auto -mt-[calc(var(--s-5))]" style={{ gridTemplateColumns: `repeat(${cards.length}, ${g.slotW}px)`, justifyContent: "center" }}>
          {cards.map((c, i) => (
            <div key={c.id} className={`text-center transition-opacity duration-500 ${i < flipped ? "opacity-100" : "opacity-0"}`}>
              <p className="t-body font-medium">{c.name}</p>
              <p className="t-small !text-[var(--ink-66)]">{c.rev ? ui.reversed : ui.upright}</p>
              <p className="t-small !text-[var(--ink-45)]">{c.keywords.slice(0, 2).join("、")}</p>
            </div>
          ))}
        </div>
      )}

      {done && (
        <p className="mt-[var(--s-5)] text-center">
          <a href={url} className="inline-block min-h-[var(--s-6)] px-7 py-3 rounded-[2px] bg-[var(--ink)] text-[var(--paper)] tracking-[0.12em] text-[13px] hover:opacity-90 transition">{ui.toResult}</a>
        </p>
      )}

      {asking && (
        <>
          <p className="text-center">
            <button type="button" onClick={() => void start()} disabled={phase === "shuffle"} data-heat="tarot-start"
              className="min-h-[var(--s-6)] px-8 py-3 rounded-[2px] bg-[var(--ink)] text-[var(--paper)] tracking-[0.16em] text-[14px] hover:opacity-90 transition disabled:opacity-50">
              {phase === "shuffle" ? ui.shuffling : ui.shuffleBtn}
            </button>
          </p>
          {err && <p className="t-small mt-[var(--s-3)] text-center !text-[var(--cinnabar)]">{err}</p>}
          {again && (
            <div className="mt-[var(--s-4)] p-[var(--s-4)] border border-[var(--ink-16)] rounded-[2px] text-center">
              <p className="t-body">{ui.again}{again.question ? `${/^「/.test(ui.quote) ? "" : " "}${ui.quote.replace("{q}", again.question)}` : ""}</p>
              <p className="mt-[var(--s-3)] flex justify-center gap-5 flex-wrap">
                <a href={again.url} className="underline underline-offset-4">{ui.againOpen}</a>
                <button type="button" className="underline underline-offset-4" onClick={() => { setAgain(null); box.current?.focus(); box.current?.select(); }}>{ui.rephrase}</button>
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
