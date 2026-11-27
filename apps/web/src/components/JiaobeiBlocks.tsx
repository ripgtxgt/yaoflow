"use client";

import s from "./JiaobeiBlocks.module.css";

/**
 * 10-16 进度表 67: the two moon blocks. Flat side up shows the pale cut face; round side up shows the red lacquered back.
 * `state`: waiting (before a toss), tossing (the fall plays once), or still.
 */
function Block({ flat, cls }: { flat: boolean; cls: string }) {
  return (
    <div className={`${s.block} ${cls}`} aria-hidden="true">
      <svg viewBox="0 0 88 44">
        {flat ? (
          // the flat face: a half-moon outline, pale wood with the red rim showing
          <>
            <path d="M4 40 Q44 -6 84 40 Z" fill="#b5432f" />
            <path d="M10 38 Q44 4 78 38 Z" fill="#e9c9a3" />
          </>
        ) : (
          // the round back: lacquered red, a highlight along the curve
          <>
            <path d="M4 40 Q44 -6 84 40 Z" fill="#a33a28" />
            <path d="M18 30 Q44 6 70 30" fill="none" stroke="#d9765f" strokeWidth="3" strokeLinecap="round" opacity=".7" />
          </>
        )}
      </svg>
    </div>
  );
}

export default function JiaobeiBlocks({ blocks, state, tossKey }: { blocks: [boolean, boolean]; state: "waiting" | "tossing" | "still"; tossKey: number }) {
  return (
    <div key={tossKey} className={`${s.stage} ${state === "tossing" ? s.tossing : state === "waiting" ? s.waiting : ""}`}>
      <Block flat={blocks[0]} cls={s.b1!} />
      <Block flat={blocks[1]} cls={s.b2!} />
    </div>
  );
}
