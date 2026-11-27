import { hexagramFromBits } from "./hexagram";
import { najiaFor } from "./najia";
import type { Bit, CastLine, CastResult, LinePosition, LineValue } from "./types";

/** Uniform random in [0,1). Injectable for testing / server-side seeding. */
export type Rng = () => number;

/**
 * One three-coin toss: heads = 3, tails = 2, summed.
 * 6 = 老阴 (changing yin), 7 = 少阳, 8 = 少阴, 9 = 老阳 (changing yang).
 * Probabilities: 6→1/8, 7→3/8, 8→3/8, 9→1/8 (matches physical coins).
 */
export function tossLine(rng: Rng = Math.random): LineValue {
  let sum = 0;
  for (let i = 0; i < 3; i++) sum += rng() < 0.5 ? 2 : 3;
  return sum as LineValue;
}

/** Cast six lines bottom-up. */
export function castValues(rng: Rng = Math.random): [LineValue, LineValue, LineValue, LineValue, LineValue, LineValue] {
  return [tossLine(rng), tossLine(rng), tossLine(rng), tossLine(rng), tossLine(rng), tossLine(rng)];
}

function toLine(value: LineValue, position: LinePosition): CastLine {
  switch (value) {
    case 6: return { position, value, polarity: "yin", changing: true };
    case 7: return { position, value, polarity: "yang", changing: false };
    case 8: return { position, value, polarity: "yin", changing: false };
    case 9: return { position, value, polarity: "yang", changing: true };
  }
}

/**
 * Resolve a full deterministic cast from six raw values (bottom-up).
 * Same input always produces the same output — the AI layer never touches this.
 */
export function resolveCast(values: readonly LineValue[]): CastResult {
  if (values.length !== 6) throw new Error("need exactly 6 line values");
  for (const v of values) {
    if (v !== 6 && v !== 7 && v !== 8 && v !== 9) throw new Error(`invalid line value: ${v}`);
  }
  const vals = values as readonly [LineValue, LineValue, LineValue, LineValue, LineValue, LineValue];
  const lines = vals.map((v, i) => toLine(v, (i + 1) as LinePosition));
  const changingPositions = lines.filter((l) => l.changing).map((l) => l.position);

  const primaryBits = lines.map((l): Bit => (l.polarity === "yang" ? 1 : 0));
  const primary = hexagramFromBits(primaryBits);

  let changed = null;
  if (changingPositions.length > 0) {
    const changedBits = lines.map((l): Bit => {
      if (!l.changing) return l.polarity === "yang" ? 1 : 0;
      return l.polarity === "yang" ? 0 : 1; // 老阳→阴, 老阴→阳
    });
    changed = hexagramFromBits(changedBits);
  }

  return {
    values: vals,
    lines,
    changingPositions,
    primary,
    changed,
    najia: najiaFor(primary.lower, primary.upper),
  };
}
