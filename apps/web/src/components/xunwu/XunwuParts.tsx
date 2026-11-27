"use client";

/**
 * 10-29 进度表 127 尋物 — the small drawn pieces: a die (Chinese dice paint the one and the four red), the eight-way
 * compass with the direction to look in, and a list block. Plain SVG, no images.
 */
const PIPS: Record<number, [number, number][]> = {
  1: [[30, 30]],
  2: [[17, 17], [43, 43]],
  3: [[17, 17], [30, 30], [43, 43]],
  4: [[17, 17], [43, 17], [17, 43], [43, 43]],
  5: [[17, 17], [43, 17], [30, 30], [17, 43], [43, 43]],
  6: [[17, 15], [17, 30], [17, 45], [43, 15], [43, 30], [43, 45]],
};

export function Die({ n, rolling, size = 56, label }: { n: number; rolling?: boolean; size?: number; label?: string }) {
  const red = n === 1 || n === 4;
  return (
    <svg viewBox="0 0 60 60" width={size} height={size} role="img" aria-label={label ?? String(n)} className={rolling ? "xw-tumble" : ""}>
      <rect x="2" y="2" width="56" height="56" rx="10" fill="var(--paper)" stroke="var(--ink)" strokeWidth="2" />
      {(PIPS[n] ?? PIPS[1]!).map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={n === 1 ? 8 : 5.5} fill={red ? "var(--cinnabar)" : "var(--ink)"} />
      ))}
    </svg>
  );
}

/** 北 at the top; idx 0 北 1 東北 2 東 3 東南 4 南 5 西南 6 西 7 西北 */
export function Compass({ idx, labels, center }: { idx: number; labels: string[]; center: string }) {
  const C = 90, R = 58;
  const at = (deg: number, r: number) => [C + r * Math.cos((deg * Math.PI) / 180), C + r * Math.sin((deg * Math.PI) / 180)] as const;
  const a = -90 + idx * 45;
  const [x1, y1] = at(a - 22.5, R), [x2, y2] = at(a + 22.5, R);
  const [tx, ty] = at(a, R - 10);
  return (
    <svg viewBox="0 0 180 180" width="180" height="180" role="img" aria-label={`${labels[idx] ?? ""}`} className="shrink-0">
      <circle cx={C} cy={C} r={R} fill="none" stroke="var(--ink-16)" strokeWidth="1.5" />
      <path d={`M ${C} ${C} L ${x1} ${y1} A ${R} ${R} 0 0 1 ${x2} ${y2} Z`} fill="var(--cinnabar)" fillOpacity="0.16" stroke="var(--cinnabar)" strokeWidth="1.5" />
      <line x1={C} y1={C} x2={tx} y2={ty} stroke="var(--cinnabar)" strokeWidth="2.5" strokeLinecap="round" />
      {labels.map((l, i) => {
        const [x, y] = at(-90 + i * 45, R + 17);
        return <text key={i} x={x} y={y + 4} textAnchor="middle" fontSize={i === idx ? 13 : 11} fontWeight={i === idx ? 700 : 400} fill={i === idx ? "var(--cinnabar)" : "var(--ink-66)"}>{l}</text>;
      })}
      <circle cx={C} cy={C} r="4.5" fill="var(--ink)" />
      <title>{center}</title>
    </svg>
  );
}

export function ListBlock({ h, items, tone = "plain" }: { h: string; items: string[]; tone?: "plain" | "urgent" }) {
  return (
    <div className={tone === "urgent" ? "rounded-[6px] border-l-2 border-[var(--cinnabar)] bg-[var(--cinnabar)]/[0.06] px-4 py-3" : ""}>
      <p className="t-sect">{h}</p>
      <ul className="mt-2 grid gap-1.5">
        {items.map((x) => <li key={x} className="t-body leading-relaxed flex gap-2"><span className="!text-[var(--gold-text)]">·</span><span>{x}</span></li>)}
      </ul>
    </div>
  );
}
