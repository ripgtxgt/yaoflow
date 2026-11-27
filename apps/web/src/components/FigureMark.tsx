import type { LineValue } from "@yaoflow/engine";

/**
 * A hexagram drawn as lines — the hero mark used wherever a figure is shown.
 *
 * Never the Unicode glyph: the U+4DC0 block is missing from most Android
 * fonts (tofu) and drawn incorrectly by several others, so a glyph next to
 * our own correctly-drawn chart reads as a contradiction. These bars render
 * identically everywhere and inherit currentColor, so the mark works on
 * paper and inside ink blocks alike.
 */

/** Line shapes (bottom-up yang flags) of the primary figure. */
export function primaryYangs(values: readonly LineValue[]): boolean[] {
  return values.map((v) => v === 7 || v === 9);
}

/** Line shapes of the transformed figure — moving lines flipped. */
export function changedYangs(values: readonly LineValue[]): boolean[] {
  return values.map((v) => (v === 9 ? false : v === 6 ? true : v === 7));
}

export default function FigureMark({
  yangs,
  width = 56,
  className = "",
  marks,
}: {
  /** bottom-up, as cast */
  yangs: readonly boolean[];
  width?: number;
  className?: string;
  /** bottom-up flags: lines to draw in cinnabar (moving lines on the reference pages) */
  marks?: readonly boolean[];
}) {
  const h = Math.max(4, Math.round(width / 9));
  const gap = Math.max(3, Math.round(h * 0.85));
  const notch = Math.round(width / 6);
  return (
    <span
      aria-hidden
      className={`inline-flex flex-col-reverse ${className}`}
      style={{ gap, width }}
    >
      {yangs.map((yang, i) =>
        yang ? (
          <span key={i} style={{ height: h, borderRadius: 1 }} className={`bg-current block${marks?.[i] ? " text-[var(--cinnabar)]" : ""}`} />
        ) : (
          <span key={i} className={`flex justify-between${marks?.[i] ? " text-[var(--cinnabar)]" : ""}`}>
            <span style={{ height: h, width: (width - notch) / 2, borderRadius: 1 }} className="bg-current" />
            <span style={{ height: h, width: (width - notch) / 2, borderRadius: 1 }} className="bg-current" />
          </span>
        ),
      )}
    </span>
  );
}
