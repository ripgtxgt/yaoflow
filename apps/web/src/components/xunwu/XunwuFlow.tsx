"use client";

import { useEffect, useRef, useState } from "react";
import type { XwCard } from "@/lib/xunwu";
import { firstXw, keepXw } from "@/lib/xunwu-local";
import { track } from "@/lib/track";
import { Compass, Die, ListBlock } from "./XunwuParts";

/**
 * 10-29 进度表 127 尋物「東西不見了？」 — three taps (what, where last, how long), an optional name that never leaves the
 * browser, three dice thrown here (the browser's crypto random), the card worked out on our side (POST /api/xunwu/cast,
 * no account). The same thing again within a day shows its first card (「同一件事接受第一次的結果」).
 */
type Opt = [string, string];
export interface XunwuUi { [k: string]: string }

const fill = (s: string, m: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k: string) => String(m[k] ?? ""));
const d6 = () => {
  try { const u = new Uint32Array(1); crypto.getRandomValues(u); return 1 + (u[0]! % 6); } catch { return 1 + Math.floor(Math.random() * 6); }
};
const reduced = () => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

function Chips({ opts, value, onPick, name }: { opts: Opt[]; value: string | null; onPick: (v: string) => void; name: string }) {
  return (
    <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label={name}>
      {opts.map(([id, label]) => {
        const on = value === id;
        return (
          <button key={id} type="button" aria-pressed={on} onClick={() => onPick(id)} data-heat={`xunwu-pick-${id}`}
            className={`px-3.5 py-2 rounded-[2px] border t-body !text-[15px] transition-colors ${on ? "bg-[var(--ink)] border-[var(--ink)] !text-[var(--paper)]" : "border-[var(--ink-16)] hover:border-[var(--ink)]"}`}>
            {label}
          </button>
        );
      })}
    </div>
  );
}

/** 「這一卦是〈{hex}〉，動{move}；變出〈{changed}〉。」 with the two names linked to their pages */
function GuaLine({ tpl, card }: { tpl: string; card: XwCard }) {
  return (
    <p className="t-small !text-[var(--ink-66)]">
      {tpl.split(/(\{hex\}|\{move\}|\{changed\})/).map((part, i) =>
        part === "{hex}" ? <a key={i} href={card.hex.href} className="underline underline-offset-4 hover:text-[var(--ink)]" data-heat="xunwu-gua">{card.hex.name}</a>
        : part === "{changed}" ? <a key={i} href={card.changed.href} className="underline underline-offset-4 hover:text-[var(--ink)]" data-heat="xunwu-gua-changed">{card.changed.name}</a>
        : part === "{move}" ? <span key={i}>{card.move}</span>
        : <span key={i}>{part}</span>)}
    </p>
  );
}

export function XunwuCardView({ card, ui, dirs, name, locale }: { card: XwCard; ui: XunwuUi; dirs: string[]; name: string; locale: string }) {
  // 10-29 进度表 128: the punctuation around the pieces comes with the words (「」 / “” / « », ：/ :)
  const toCast = () => {
    track("xunwu", { locale, method: "to_cast" });
    try { void fetch("/api/xunwu/mark", { method: "POST", keepalive: true, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tk: card.token, act: "cast" }) }); } catch { /* the link still works */ }
  };
  return (
    <div className="mt-[var(--s-4)] grid gap-[var(--s-4)]" aria-live="polite">
      {card.same && <p className="t-small text-center !text-[var(--ink-45)]">{ui.same}</p>}
      {/* 證件、錢包卡片、手機: the step that cannot wait goes above the card (进度表 127 实际行动清单) */}
      {card.urgent && <ListBlock h={fill(ui.urgentLine ?? "{head}：{what}", { head: ui.urgentHead ?? "", what: card.urgent.h })} items={card.urgent.items} tone="urgent" />}
      <article className="rounded-[6px] border border-[var(--ink-16)] p-4 sm:p-5" data-heat="xunwu-card">
        <p className="t-label !text-[var(--ink-45)]">{name || card.title}</p>
        <p className="t-d2 mt-1 !text-[var(--cinnabar)]">{card.tierLabel}</p>
        <p className="t-body mt-2 leading-relaxed">{card.tierLine}</p>
        <p className="t-small mt-2 !text-[var(--ink-66)] leading-relaxed">{card.why}</p>

        <section className="mt-[var(--s-4)] pt-[var(--s-3)] border-t border-dotted border-[var(--ink-16)]">
          <h3 className="t-sect">{ui.dirHead}</h3>
          <div className="mt-2 flex flex-col sm:flex-row items-center sm:items-start gap-3">
            <Compass idx={card.dirIdx} labels={dirs} center={ui.center} />
            <div className="w-full">
              <p className="t-body leading-relaxed">{fill(ui.dirLine, { dir: card.dir })}</p>
              <p className="t-small mt-1 !text-[var(--ink-45)]">{ui.centerNote}</p>
            </div>
          </div>
        </section>

        <section className="mt-[var(--s-4)] pt-[var(--s-3)] border-t border-dotted border-[var(--ink-16)]">
          <h3 className="t-sect">{ui.placeHead}</h3>
          <p className="t-small mt-2 !text-[var(--gold-text)] leading-relaxed">{fill(ui.quote ?? "「{q}」", { q: card.orig })}</p>
          <dl className="mt-2 grid gap-1.5">
            {card.places.map((p) => (
              <div key={p.label} className="grid grid-cols-[minmax(3em,auto)_1fr] gap-x-3">
                <dt className="t-small !text-[var(--ink-45)] pt-[3px]">{p.label}</dt>
                <dd className="t-body leading-relaxed">{p.text}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="mt-[var(--s-4)] pt-[var(--s-3)] border-t border-dotted border-[var(--ink-16)]">
          <ListBlock h={card.actions.h} items={card.actions.items} />
        </section>

        <section className="mt-[var(--s-4)] pt-[var(--s-3)] border-t border-dotted border-[var(--ink-16)] grid gap-2">
          <p>
            <a href={card.castHref} onClick={toCast} data-heat="xunwu-cast"
              className="inline-block min-h-[var(--s-6)] px-6 py-3 rounded-[2px] bg-[var(--ink)] !text-[var(--paper)] tracking-[0.08em] text-[14px] hover:opacity-90 transition">{ui.toCast}</a>
          </p>
          <p className="t-small !text-[var(--ink-45)]">{ui.toCastNote}</p>
          <GuaLine tpl={ui.guaLine} card={card} />
        </section>
        <p className="t-small mt-[var(--s-4)] !text-[var(--ink-45)]">{ui.foot}</p>
      </article>
    </div>
  );
}

export default function XunwuFlow({ locale, ui, cats, places, agos, dirs, dirShort }: { locale: string; ui: XunwuUi; cats: Opt[]; places: Opt[]; agos: Opt[]; dirs: string[]; dirShort?: string[] }) {
  const [cat, setCat] = useState<string | null>(null);
  const [place, setPlace] = useState<string | null>(null);
  const [ago, setAgo] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [faces, setFaces] = useState<[number, number, number]>([1, 4, 6]);
  const [phase, setPhase] = useState<"pick" | "rolling" | "done">("pick");
  const [card, setCard] = useState<XwCard | null>(null);
  const [err, setErr] = useState("");
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  useEffect(() => () => { if (timer.current) clearInterval(timer.current); }, []);

  const roll = async () => {
    if (phase === "rolling") return;
    if (!cat || !place || !ago) { setErr(ui.needPick); return; }
    setErr(""); setCard(null); setPhase("rolling");
    const dice: [number, number, number] = [d6(), d6(), d6()];
    const calm = reduced();
    if (!calm) timer.current = setInterval(() => setFaces([d6(), d6(), d6()]), 90);
    const t0 = Date.now();
    let res: Response | null = null;
    let j: { card?: XwCard; error?: string } = {};
    try {
      res = await fetch("/api/xunwu/cast", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cat, place, ago, dice, h: new Date().getHours(), locale, again: firstXw(cat, place)?.tk }),
      });
      j = (await res.json().catch(() => ({}))) as typeof j;
    } catch { /* below */ }
    const left = (calm ? 0 : 1100) - (Date.now() - t0);
    if (left > 0) await new Promise((r) => setTimeout(r, left));
    if (timer.current) { clearInterval(timer.current); timer.current = null; }
    if (!res || !res.ok || !j.card) {
      const why = res?.status === 429 ? (j.error === "day" ? "day" : "fast") : null;
      setErr(why === "day" ? ui.limitDay : why === "fast" ? ui.limitFast : ui.failed);
      if (why) track("xunwu", { locale, method: `limit:${why}` });
      setFaces(dice); setPhase("pick");
      return;
    }
    const c = j.card;
    setFaces(c.dice); setCard(c); setPhase("done");
    keepXw({ tk: c.token, cat: c.cat, place: c.place, ago: c.ago, at: c.at, tier: c.tier, hex: c.hex.n, ...(name.trim() ? { name: name.trim().slice(0, 20) } : {}) });
    track("xunwu", { locale, method: c.same ? "same" : `cast:${c.cat}:${c.tier}` });
    setTimeout(() => cardRef.current?.scrollIntoView({ behavior: calm ? "auto" : "smooth", block: "start" }), 60);
  };
  const reset = () => { setCat(null); setPlace(null); setAgo(null); setName(""); setCard(null); setErr(""); setPhase("pick"); };

  const picked = !!(cat && place && ago);
  return (
    <div>
      <fieldset disabled={phase === "rolling"}>
        <legend className="t-sect">{ui.stepCat}</legend>
        <Chips opts={cats} value={cat} onPick={(v) => { setCat(v); setCard(null); }} name={ui.stepCat} />
        <p className="t-small mt-2 !text-[var(--ink-45)]">{ui.catNote}</p>
      </fieldset>
      <fieldset className="mt-[var(--s-4)]" disabled={phase === "rolling"}>
        <legend className="t-sect">{ui.stepPlace}</legend>
        <Chips opts={places} value={place} onPick={(v) => { setPlace(v); setCard(null); }} name={ui.stepPlace} />
      </fieldset>
      <fieldset className="mt-[var(--s-4)]" disabled={phase === "rolling"}>
        <legend className="t-sect">{ui.stepAgo}</legend>
        <Chips opts={agos} value={ago} onPick={(v) => { setAgo(v); setCard(null); }} name={ui.stepAgo} />
      </fieldset>
      <label className="mt-[var(--s-4)] block">
        <span className="t-small !text-[var(--ink-66)]">{ui.nameLabel}</span>
        <input value={name} onChange={(e) => setName(e.target.value.slice(0, 20))} placeholder={ui.namePh} maxLength={20} disabled={phase === "rolling"}
          className="mt-1 w-full max-w-[22rem] block border border-[var(--ink-16)] rounded-[2px] px-3 py-2 bg-transparent t-body" />
      </label>

      <div className="mt-[var(--s-5)] flex justify-center gap-4" aria-hidden={phase === "rolling"}>
        {faces.map((n, i) => <Die key={i} n={n} rolling={phase === "rolling"} />)}
      </div>
      {card && <p className="t-small mt-2 text-center !text-[var(--ink-66)]">{fill(ui.diceLine, { a: card.dice[0], b: card.dice[1], c: card.dice[2], sum: card.sum, hour: card.hourName })}</p>}
      <div className="text-center mt-[var(--s-4)]">
        {phase !== "done" ? (
          <button type="button" onClick={() => void roll()} disabled={phase === "rolling"} data-heat="xunwu-roll"
            className={`min-h-[var(--s-6)] px-10 py-3 rounded-[2px] bg-[var(--ink)] !text-[var(--paper)] text-[15px] tracking-[0.14em] ${picked ? "" : "opacity-60"}`}>
            {phase === "rolling" ? ui.rolling : ui.roll}
          </button>
        ) : (
          <button type="button" onClick={reset} className="t-small underline underline-offset-4 !text-[var(--ink-66)]" data-heat="xunwu-again">{ui.again}</button>
        )}
        {err && <p className="t-small mt-2 !text-[var(--cinnabar)]" role="alert">{err}</p>}
        {phase !== "done" && <p className="t-small mt-2 !text-[var(--ink-45)]">{ui.privacy}</p>}
      </div>
      <div ref={cardRef} className="scroll-mt-20">
        {card && <XunwuCardView card={card} ui={ui} dirs={dirShort ?? dirs} name={name.trim()} locale={locale} />}
      </div>
    </div>
  );
}
