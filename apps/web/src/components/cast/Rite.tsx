"use client";

import type { FullChart, LineValue } from "@yaoflow/engine";
import { t, type DictKey, type Locale } from "@/lib/i18n";
import { hexName, hexSubName } from "@/lib/names";
import FigureMark, { changedYangs, primaryYangs } from "@/components/FigureMark";
import { LineGlyph, LineSlot, POS_ZH } from "./atoms";

/**
 * 10-22 进度表 76 (CastFlow 拆分): the casting stage — the ruler of six positions, the figure once all six lines are
 * in, the three coins, and the act itself (hold / shake / ask for motion). Pure drawing: every number and handler
 * comes from CastFlow, which keeps the cast's state and the rite's timing.
 */
export type RitePhase = "idle" | "sweep" | "figure";
export type CastMode = "hold" | "shake" | "ask";

export default function Rite({
  locale, zh, values, nextPos, phase, sweep, formed, revealed, coins, charge, shakeIntensity, spinning, tooSoon, holdBeat, canShake,
  castMode, setCastMode, skipReveal, askMotion, holdStart, holdEnd,
}: {
  locale: Locale;
  /** Chinese-style line labels (初…上) */
  zh: boolean;
  values: LineValue[];
  nextPos: number;
  phase: RitePhase;
  sweep: number;
  formed: FullChart | null;
  revealed: number;
  coins: number[] | null;
  charge: number;
  shakeIntensity: number;
  spinning: boolean;
  tooSoon: boolean;
  holdBeat: boolean;
  canShake: boolean;
  castMode: CastMode;
  setCastMode: (m: CastMode) => void;
  skipReveal: () => void;
  askMotion: () => void;
  holdStart: () => void;
  holdEnd: () => void;
}) {
  return (
    <div className="mt-10 select-none">
      <div className="flex items-baseline justify-between mb-[var(--s-5)]">
        <p className="t-sect">
          {/* 初爻, not 第初爻 — the ordinal is built into the name */}
          {zh ? `${POS_ZH[Math.min(values.length, 5)]} 爻` : t(locale, "lineN", { n: nextPos })}
        </p>
        <p className="t-label !text-[var(--gold-text)]">
          {String(nextPos).padStart(2, "0")}
          <span className="opacity-50"> / 06</span>
        </p>
      </div>

      {/* the ruler: every position visible, cast lines settling into it.
          During the reveal it is read upward, one line lighting at a time. */}
      <div className="flex flex-col-reverse gap-[var(--s-3)] mb-[var(--s-6)]">
        {Array.from({ length: 6 }, (_, i) => {
          const v = values[i];
          const lit = phase !== "idle" && sweep > i;
          const isLast = v !== undefined && i === values.length - 1;
          return (
            <div key={i} className="flex items-center gap-[var(--s-3)]">
              <span
                className={`t-label w-5 shrink-0 !tracking-normal transition-colors duration-300 ${
                  lit
                    ? "!text-[var(--gold-text)]"
                    : v
                      ? ""
                      : i === values.length
                        ? "!text-[var(--gold-text)]"
                        : "opacity-35"
                }`}
              >
                {zh ? POS_ZH[i] : i + 1}
              </span>
              {v ? (
                <div
                  className={`${isLast && phase === "idle" ? "settle" : ""} ${lit ? "line-lit" : ""}
                              transition-opacity duration-300
                              ${phase !== "idle" && !lit ? "opacity-35" : "opacity-100"}`}
                >
                  <LineGlyph yang={v === 7 || v === 9} changing={v === 6 || v === 9} />
                </div>
              ) : (
                <LineSlot active={i === values.length} />
              )}
            </div>
          );
        })}
      </div>

      {/* ---- the figure, once all six lines are in ---- */}
      {phase !== "idle" && formed && (
        <div className="min-h-[13rem]">
          {phase === "figure" ? (
            <div className="figure-in">
              <div className="flex items-center gap-6">
                <div>
                  <FigureMark yangs={primaryYangs(values)} width={64} className="mb-3" />
                  <p className="t-d3">
                    {hexName(formed.cast.primary, locale)}
                  </p>
                  <p className="t-label !normal-case !tracking-[0.06em] mt-1">
                    {hexSubName(formed.cast.primary, locale)}
                  </p>
                </div>
                {formed.cast.changed && (
                  <>
                    <span className="t-label !text-[18px] self-center">→</span>
                    <div className="figure-in-late text-[var(--ink-66)]">
                      <FigureMark yangs={changedYangs(values)} width={64} className="mb-3" />
                      <p className="t-d3 text-[var(--ink)]">
                        {hexName(formed.cast.changed, locale)}
                      </p>
                    </div>
                  </>
                )}
              </div>
              <button
                onClick={skipReveal}
                className="t-label mt-[var(--s-5)] transition-colors"
              >
                {t(locale, "revealContinue")} →
              </button>
            </div>
          ) : (
            <p className="t-sect !text-[var(--gold-text)] pt-2">{t(locale, "revealReading")}</p>
          )}
        </div>
      )}

      {/* three coins: rattling while held or shaken, landing one at a time */}
      <div className={`flex gap-4 h-12 items-center mb-[var(--s-5)] transition-opacity duration-500
                       ${phase !== "idle" ? "opacity-0 pointer-events-none h-0 mb-0 overflow-hidden" : "opacity-100"}`} aria-hidden>
        {[0, 1, 2].map((i) => {
          const landed = revealed > i && coins;
          const drive = Math.max(charge, shakeIntensity);
          const inHand = drive > 0;
          return (
            <span
              key={i}
              className={`coin grid place-items-center w-11 h-11 rounded-full border text-[13px]
                          transition-colors
                          ${landed
                            ? "border-[var(--gold)] text-[var(--gold-text)] coin-land"
                            : "border-[var(--gold)]/40 text-[var(--gold-text)]/70"}
                          ${inHand ? "coin-rattle" : ""}
                          ${spinning && !landed ? "coin-spin" : ""}`}
              style={inHand ? { animationDelay: `${i * 70}ms`, animationDuration: `${170 - drive * 90}ms` } : undefined}
            >
              {landed ? t(locale, coins[i] === 3 ? "coinHeads" : "coinTails") : spinning ? "" : "·"}
            </span>
          );
        })}
      </div>

      {/* ---- the act itself: shake on capable devices, hold elsewhere ---- */}
      {castMode === "ask" && phase === "idle" && (
        <button
          onClick={askMotion}
          className="relative w-full md:w-auto md:min-w-[18rem] min-h-[56px] rounded-[2px]
                     border border-[var(--gold)]/55 select-none
                     grid place-items-center px-8 text-[14px] tracking-[0.18em] text-[var(--ink)]"
        >
          {t(locale, "motionAsk")}
        </button>
      )}

      {castMode === "shake" && (
        <div
          className={`relative w-full min-h-[56px] rounded-[2px] overflow-hidden select-none
                      border transition-all duration-300
                      ${phase !== "idle" ? "opacity-0 pointer-events-none h-0 min-h-0 border-0" : ""}
                      ${charge >= 1 ? "border-[var(--gold)] ready-pulse" : "border-[var(--gold)]/55"}`}
        >
          <span
            className="absolute inset-y-0 left-0 bg-[var(--gold)]/25 transition-[width] duration-150"
            style={{ width: `${charge * 100}%` }}
            aria-hidden
          />
          <span className="relative grid place-items-center min-h-[56px] px-8 text-[14px] tracking-[0.18em] text-[var(--ink)]">
            {spinning
              ? t(locale, "casting")
              : charge >= 1
                ? t(locale, "shakeReady")
                : charge > 0
                  ? t(locale, "holdCharging")
                  : t(locale, "shakeHint")}
          </span>
        </div>
      )}

      {castMode === "hold" && (
        <button
          onPointerDown={holdStart}
          onPointerUp={holdEnd}
          onPointerLeave={holdEnd}
          onPointerCancel={holdEnd}
          onContextMenu={(e) => e.preventDefault()}
          disabled={spinning || holdBeat}
          className={`relative w-full md:w-auto md:min-w-[18rem] min-h-[56px] rounded-[2px]
                      overflow-hidden touch-none disabled:opacity-40 select-none
                      border transition-all duration-300
                      ${phase !== "idle" ? "opacity-0 pointer-events-none h-0 min-h-0 border-0" : ""}
                      ${charge >= 1 ? "border-[var(--gold)] ready-pulse" : "border-[var(--gold)]/55"}`}
        >
          {/* charge fills left-to-right: a measure, not a spinner */}
          <span
            className="absolute inset-y-0 left-0 bg-[var(--gold)]/25 transition-[width] duration-75"
            style={{ width: `${charge * 100}%` }}
            aria-hidden
          />
          <span className="relative grid place-items-center min-h-[56px] px-8 text-[14px] tracking-[0.18em] text-[var(--ink)]">
            {spinning
              ? t(locale, "casting")
              : charge >= 1
                ? t(locale, "holdRelease")
                : charge > 0
                  ? t(locale, "holdCharging")
                  : t(locale, "castButton")}
          </span>
        </button>
      )}

      {phase === "idle" && (
        <>
          <div className="flex items-baseline justify-between gap-4 mt-[var(--s-3)]">
            <p className={`t-label ${tooSoon ? "!text-[var(--gold-text)]" : ""}`}>
              {castMode === "shake"
                ? t(locale, charge >= 1 ? "shakeReadyHint" : "shakeSubHint")
                : tooSoon
                  ? t(locale, "holdTooSoon")
                  : t(locale, "holdHint")}
            </p>
            {/* mode switching, quiet */}
            {castMode !== "hold" ? (
              <button
                onClick={() => setCastMode("hold")}
                className="t-label shrink-0 hover:text-[var(--ink)] transition-colors"
              >
                {t(locale, "useHold")}
              </button>
            ) : canShake ? (
              <button
                onClick={() => setCastMode("shake")}
                className="t-label shrink-0 hover:text-[var(--ink)] transition-colors"
              >
                {t(locale, "useShake")}
              </button>
            ) : null}
          </div>
          {/* before the first throw, a line to settle behind; after it,
              what the line you are about to cast stands for */}
          <p className="t-small mt-[var(--s-4)] fade-in" key={nextPos}>
            {values.length === 0
              ? t(locale, "castTitle")
              : t(locale, `lineMeaning${nextPos}` as DictKey)}
          </p>
        </>
      )}
    </div>
  );
}
