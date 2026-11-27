"use client";

import { useCallback, useEffect, useState } from "react";
import { track } from "@/lib/track";
import { DateWheel } from "@/components/WheelPicker";

/**
 * 10-18 进度表 73 每日運勢: the twelve signs, today's line for each, and the reader's own sign remembered on this device
 * (same key as 擇日, never sent to us). 「不確定屬什麼」 works out the sign from a birthday in the browser.
 */
export type Row = { slug: string; name: string; tier: string; tierKey: string; line: string };
const ZKEY = "yf_zodiac";
/** 10-30 进度表 128 ⑤: the sun signs (their own key) — Aries … Pisces start on these days */
const SKEY = "yf_star";
const STAR_START: [number, number][] = [[3, 21], [4, 20], [5, 21], [6, 21], [7, 23], [8, 23], [9, 23], [10, 23], [11, 22], [12, 22], [1, 20], [2, 19]];
function starOf(m: number, d: number): number {
  for (let i = 0; i < 12; i++) { const [sm, sd] = STAR_START[i]!, [nm, nd] = STAR_START[(i + 1) % 12]!; if ((m === sm && d >= sd) || (m === nm && d < nd)) return i; }
  return 0;
}

export default function YunshiPicker({ locale, rows, lichun, ui, kind = "animal", wide = false }: {
  locale: string; rows: Row[]; lichun: Record<number, number>;
  /** 10-30 进度表 128 ⑤: the twelve sun signs instead of the animals; `wide` for names longer than one character */
  kind?: "animal" | "star"; wide?: boolean;
  ui: { mine: string; unsure: string; birth: string; result: string; open: string; pick: string; y: string; m: string; d: string };
}) {
  const [mine, setMine] = useState<number | null>(null);
  const [showBirth, setShowBirth] = useState(false);
  const [birth, setBirthRaw] = useState({ y: 1990, m: 1, d: 1 });
  const [touched, setTouched] = useState(false);
  const setBirth = useCallback((v: { y: number; m: number; d: number }) => { setBirthRaw(v); setTouched(true); }, []);
  const thisYear = new Date().getFullYear();
  const key = kind === "star" ? SKEY : ZKEY;
  useEffect(() => { try { const z = localStorage.getItem(key); if (z && /^\d{1,2}$/.test(z) && +z < 12) setMine(+z); } catch { /* */ } }, [key]);
  const keep = (i: number) => { setMine(i); try { localStorage.setItem(key, String(i)); } catch { /* */ } };
  // 10-18 (Neil: 要 Apple 那种滚轮，滑动有震动): a year / month / day wheel; the sign shows once the reader has turned it
  const guess = (() => {
    if (!touched) return null;
    const { y, m: mo, d } = birth;
    if (kind === "star") return starOf(mo, d);
    const lc = lichun[y] ?? 4;
    const yy = mo < 2 || (mo === 2 && d < lc) ? y - 1 : y;
    return (((yy - 4) % 12) + 12) % 12;
  })();
  const go = (i: number, how: string) => { keep(i); track("yunshi", { locale, method: `pick:${how}` }); window.location.assign(`/${locale}/yunshi/${rows[i]!.slug}`); };
  const order = mine === null ? rows.map((_, i) => i) : [mine, ...rows.map((_, i) => i).filter((i) => i !== mine)];

  return (
    <div>
      <p className="t-sect mb-2">{ui.pick}</p>
      <div className="flex flex-wrap gap-2">
        {rows.map((r, i) => (
          <button key={r.slug} type="button" onClick={() => go(i, "button")}
            className={`${wide ? "px-3" : "w-11"} py-1.5 rounded-[2px] border t-body !text-[15px] ${mine === i ? "border-[var(--ink)] bg-[var(--ink)] !text-[var(--paper)]" : "border-[var(--ink-16)] hover:border-[var(--ink)]"}`}>{r.name}</button>
        ))}
      </div>
      <p className="mt-[var(--s-3)] t-small">
        <button type="button" onClick={() => setShowBirth(!showBirth)} className="underline underline-offset-4">{ui.unsure}</button>
      </p>
      {showBirth && (
        <div className="mt-3 grid gap-3 justify-items-start">
          <div className="grid gap-2">
            <span className="t-small !text-[var(--ink-66)]">{ui.birth}</span>
            <DateWheel value={birth} onChange={setBirth} minYear={1920} maxYear={thisYear} labels={{ y: ui.y, m: ui.m, d: ui.d }} />
          </div>
          {guess !== null && (
            <button type="button" onClick={() => go(guess, "birth")} className="px-5 py-2.5 rounded-[2px] bg-[var(--ink)] !text-[var(--paper)] t-body !text-[15px]">{ui.result.replace("{z}", rows[guess]!.name)}</button>
          )}
        </div>
      )}

      <ul className="mt-[var(--s-5)] divide-y divide-[var(--ink-16)] border-y border-[var(--ink-16)]">
        {order.map((i) => {
          const r = rows[i]!;
          return (
            <li key={r.slug}>
              <a href={`/${locale}/yunshi/${r.slug}`} onClick={() => keep(i)} className="py-3 flex items-baseline gap-3 group">
                <span className={`t-body shrink-0 ${wide ? "w-28" : "w-12"}`}>{r.name}{mine === i && <span className="block t-label !text-[var(--gold-text)]">{ui.mine}</span>}</span>
                <span className={`t-small shrink-0 ${wide ? "w-20" : "w-14"} ${r.tierKey === "smooth" ? "!text-[var(--gold-text)]" : r.tierKey === "careful" ? "!text-[var(--cinnabar)]" : ""}`}>{r.tier}</span>
                <span className="t-body flex-1 text-[var(--ink-86)] group-hover:underline underline-offset-4">{r.line}</span>
              </a>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
