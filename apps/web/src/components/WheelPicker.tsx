"use client";

import "@ncdai/react-wheel-picker/style.css";
import { useCallback, useEffect, useMemo, useRef, type ReactNode } from "react";
import { WheelPicker, WheelPickerWrapper, type WheelPickerOption } from "@ncdai/react-wheel-picker";
import { prime, tick } from "@/lib/haptic";

/**
 * 10-18 (Neil: 滚轮要像 Apple 那样，滑动要限位、要有震动): @ncdai/react-wheel-picker (MIT) — an iOS-style drum with its own
 * drag physics, inertia and snapping to a row. We add the tick: while a column is being turned we watch its highlight
 * strip move and give one light haptic each time a new row passes the middle.
 */
const ROW = 38;

function Column({ options, value, onChange, width }: { options: WheelPickerOption<number>[]; value: number; onChange: (v: number) => void; width: string }) {
  const box = useRef<HTMLDivElement>(null);
  const raf = useRef(0);
  const until = useRef(0);
  const last = useRef<number | null>(null);

  // every touch, move and lift keeps the watch alive (a long drag used to outlast it and the ticks stopped)
  const watch = useCallback(() => {
    until.current = performance.now() + 2200;
    if (raf.current) return;
    const loop = () => {
      const list = box.current?.querySelector<HTMLElement>("[data-rwp-highlight-list]");
      const m = list ? /translateY\((-?[\d.]+)px\)/.exec(list.style.transform) : null;
      if (m) {
        const row = Math.round(-parseFloat(m[1]!) / ROW);
        if (last.current !== null && row !== last.current) tick();
        last.current = row;
      }
      if (performance.now() < until.current) raf.current = requestAnimationFrame(loop);
      else raf.current = 0;
    };
    raf.current = requestAnimationFrame(loop);
  }, []);
  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  return (
    <div ref={box} style={{ width }}
      onPointerDown={() => { prime(); watch(); }} onTouchStart={() => { prime(); watch(); }} onTouchEnd={() => { prime(); watch(); }}
      onPointerMove={watch} onTouchMove={watch} onPointerUp={watch} onWheel={watch} onKeyDown={watch}>
      <WheelPicker<number>
        options={options} value={value} onValueChange={onChange} optionItemHeight={ROW} visibleCount={16}
        classNames={{ optionItem: "!text-[18px] !text-[var(--ink-45)] tabular-nums", highlightWrapper: "!text-[18px] !font-normal text-[var(--ink)] bg-[color-mix(in_srgb,var(--ink)_8%,var(--paper))]", highlightItem: "tabular-nums" }}
      />
    </div>
  );
}

const BAND = "relative max-w-full rounded-[14px] overflow-hidden [&_[data-rwp-wrapper]>div:first-child_[data-rwp-highlight-wrapper]]:rounded-l-[10px] [&_[data-rwp-wrapper]>div:last-child_[data-rwp-highlight-wrapper]]:rounded-r-[10px]";

/** 10-18 (Neil: 八字选时间的也统一): hour / minute wheel (24 h) */
export function TimeWheel({ value, onChange, labels }: { value: { h: number; mi: number }; onChange: (v: { h: number; mi: number }) => void; labels: { h: string; mi: string } }) {
  const hours = useMemo(() => Array.from({ length: 24 }, (_, i) => ({ value: i, label: `${String(i).padStart(2, "0")}${labels.h}` })), [labels.h]);
  const mins = useMemo(() => Array.from({ length: 60 }, (_, i) => ({ value: i, label: `${String(i).padStart(2, "0")}${labels.mi}` })), [labels.mi]);
  return (
    <div className={`${BAND} w-[11rem]`}>
      <WheelPickerWrapper>
        <Column width="50%" options={hours} value={value.h} onChange={(h) => onChange({ ...value, h })} />
        <Column width="50%" options={mins} value={value.mi} onChange={(mi) => onChange({ ...value, mi })} />
      </WheelPickerWrapper>
    </div>
  );
}

/** a single list (e.g. the twelve 時辰) */
export function ListWheel({ items, value, onChange, width = "13rem" }: { items: string[]; value: number; onChange: (i: number) => void; width?: string }) {
  const opts = useMemo(() => items.map((label, i) => ({ value: i, label })), [items]);
  return (
    <div className={BAND} style={{ width }}>
      <WheelPickerWrapper>
        <Column width="100%" options={opts} value={value} onChange={onChange} />
      </WheelPickerWrapper>
    </div>
  );
}

/** a year / month / day wheel; days follow the month */
const LUNAR_M = ["正月", "二月", "三月", "四月", "五月", "六月", "七月", "八月", "九月", "十月", "冬月", "臘月"];
const LUNAR_D = ["初一", "初二", "初三", "初四", "初五", "初六", "初七", "初八", "初九", "初十", "十一", "十二", "十三", "十四", "十五", "十六", "十七", "十八", "十九", "二十", "廿一", "廿二", "廿三", "廿四", "廿五", "廿六", "廿七", "廿八", "廿九", "三十"];

export function DateWheel({ value, onChange, minYear, maxYear, labels, days, lunar = false }: {
  value: { y: number; m: number; d: number }; onChange: (v: { y: number; m: number; d: number }) => void;
  minYear: number; maxYear: number; labels: { y: string; m: string; d: string };
  /** lunar input: every month has 30 days */
  days?: number;
  /** show 正月…臘月 and 初一…三十 */
  lunar?: boolean;
}) {
  const years = useMemo(() => Array.from({ length: maxYear - minYear + 1 }, (_, i) => ({ value: minYear + i, label: `${minYear + i}${labels.y}` })), [minYear, maxYear, labels.y]);
  const months = useMemo(() => Array.from({ length: 12 }, (_, i) => ({ value: i + 1, label: lunar ? LUNAR_M[i]! : `${i + 1}${labels.m}` })), [labels.m, lunar]);
  const dim = days ?? new Date(value.y, value.m, 0).getDate();
  const dayOpts = useMemo(() => Array.from({ length: dim }, (_, i) => ({ value: i + 1, label: lunar ? LUNAR_D[i]! : `${i + 1}${labels.d}` })), [dim, labels.d, lunar]);
  const d = Math.min(value.d, dim);
  useEffect(() => { if (d !== value.d) onChange({ ...value, d }); }, [d, value, onChange]);
  return (
    <div className={`${BAND} w-[16rem]`}>
      <WheelPickerWrapper>
        <Column width="44%" options={years} value={value.y} onChange={(y) => onChange({ ...value, y })} />
        <Column width="28%" options={months} value={value.m} onChange={(m) => onChange({ ...value, m })} />
        <Column width="28%" options={dayOpts} value={d} onChange={(x) => onChange({ ...value, d: x })} />
      </WheelPickerWrapper>
    </div>
  );
}

/** 10-18 (Neil: 参考问真八字): any set of columns on one band — used by the birth sheet (年 月 日 時 分) and the place sheet */
export function Wheels({ columns, width = "100%" }: { columns: { key: string; options: { value: number; label: ReactNode }[]; value: number; onChange: (v: number) => void; width: string }[]; width?: string }) {
  return (
    <div className={BAND} style={{ width }}>
      <WheelPickerWrapper>
        {columns.map((c) => <Column key={c.key} width={c.width} options={c.options} value={c.value} onChange={c.onChange} />)}
      </WheelPickerWrapper>
    </div>
  );
}
