"use client";

import { useEffect, useState } from "react";

/**
 * 11-05 进度表 136: the 本命卦 grows line by line from the bottom (the cast page's line-lit rhythm), then the name settles.
 * `animate` false (a revisit of the page) draws it at once.
 */
export default function BmgFigure({ lines, width = 120, animate = true }: { lines: readonly number[]; width?: number; animate?: boolean }) {
  const [n, setN] = useState(animate ? 0 : 6);
  useEffect(() => {
    if (!animate) return;
    let k = 0;
    const t = setInterval(() => { k += 1; setN(k); if (k >= 6) clearInterval(t); }, 260);
    return () => clearInterval(t);
  }, [animate]);
  const h = Math.max(6, Math.round(width / 9));
  const gap = Math.max(5, Math.round(h * 0.85));
  const notch = Math.round(width / 6);
  return (
    <span aria-hidden className="inline-flex flex-col-reverse" style={{ gap, width }}>
      {lines.map((yang, i) => (
        <span key={i} className={i < n ? "line-lit" : ""} style={{ opacity: i < n ? 1 : 0.08, transition: "opacity .25s" }}>
          {yang ? (
            <span className="block bg-current" style={{ height: h, borderRadius: 1 }} />
          ) : (
            <span className="flex justify-between">
              <span className="bg-current" style={{ height: h, width: (width - notch) / 2, borderRadius: 1 }} />
              <span className="bg-current" style={{ height: h, width: (width - notch) / 2, borderRadius: 1 }} />
            </span>
          )}
        </span>
      ))}
    </span>
  );
}
