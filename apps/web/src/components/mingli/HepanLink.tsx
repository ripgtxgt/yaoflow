"use client";

import { useEffect, useState } from "react";
import { track } from "@/lib/track";

/**
 * 10-20 合盤 — a small 「和 TA 合盤」 card under the report panels of the 八字, 紫微 and 星盤 chart pages, linking to
 * /{locale}/hepan. Shown only while the hepan switch is visible to this browser.
 * 10-30 进度表 128 ④: the 合盤 is open in every language — the card's two lines in each (as the 合盤 page words them,
 * data/l10n/hepan.json ui.linkHead / ui.linkLine).
 */
const WORDS: Record<string, [string, string]> = {
  zh: ["和 TA 合盘", "用八字、紫微、星盘一起看两个人怎么相处 →"],
  "zh-hant": ["和 TA 合盤", "用八字、紫微、星盤一起看兩個人怎麼相處 →"],
  en: ["Compatibility with someone", "See how two people get along through BaZi, Zi Wei, and the birth chart →"],
  ja: ["相手との相性鑑定", "四柱推命・紫微斗数・ホロスコープで二人の関わり方を見る →"],
  ko: ["상대와 궁합 보기", "사주팔자, 자미두수, 출생 차트로 두 사람이 어떻게 지내는지 함께 봅니다 →"],
  fr: ["Compatibilité avec une autre personne", "BaZi, Zi Wei et thème astral réunis pour voir comment deux personnes s'entendent →"],
  de: ["Partnerschaftsvergleich mit einer anderen Person", "Mit BaZi, Zi Wei und Geburtshoroskop ansehen, wie zwei Menschen miteinander umgehen →"],
  es: ["Compatibilidad con otra persona", "Mira cómo se llevan dos personas con BaZi, Zi Wei y carta astral →"],
  pt: ["Compatibilidade com outra pessoa", "Veja como vocês dois se relacionam, com BaZi, Zi Wei e mapa astral →"],
};

export default function HepanLink({ locale, from }: { locale: string; from: "bazi" | "ziwei" | "astro" }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    void fetch("/api/features/visible?n=hepan").then((r) => r.json()).then((j: Record<string, boolean>) => setShow(!!j.hepan)).catch(() => {});
  }, []);
  const words = WORDS[locale];
  if (!show || !words) return null;
  return (
    <a href={`/${locale}/hepan`} onClick={() => track("hepan", { locale, method: `from_${from}` })}
      className="mt-[var(--s-4)] block rounded-[6px] border border-[var(--ink-16)] p-4 hover:border-[var(--ink)] transition-colors">
      <p className="t-sect">{words[0]}</p>
      <p className="t-small mt-1 !text-[var(--ink-66)]">{words[1]}</p>
    </a>
  );
}
