"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import type { Locale } from "@/lib/locales";
import { track } from "@/lib/track";

/**
 * 10-14 进度表 48 卦页情境起卦: after the explanation, before the published cases — the next step for someone who
 * searched their way onto a hexagram page. The button opens the cast page with an empty question box and this
 * hexagram's three example questions under it (?ex=<n>); an example tapped here fills the box straight away (&q=).
 * The hexagram is never preset — the reader throws their own coins. Events: gua_cta view / click / example (hex = n).
 */
const W: Record<string, { title: string; body: string; btn: string; or: string }> = {
  "zh-hant": { title: "你心裡那件事，會落在哪幾天？", body: "寫一句話，起一卦看應期（免費看盤）", btn: "寫一句話，起一卦", or: "或者從這幾句開始：" },
  zh: { title: "你心里那件事，会落在哪几天？", body: "写一句话，起一卦看应期（免费看盘）", btn: "写一句话，起一卦", or: "或者从这几句开始：" },
  en: { title: "The matter on your mind — which days will it land on?", body: "Write one sentence and cast to see the timing (the chart is free).", btn: "Write it down and cast", or: "Or start from one of these:" },
  ja: { title: "気になっているあのこと、いつ動く？", body: "一文書いて卦を立て、応期を見る（盤は無料）", btn: "一文書いて卦を立てる", or: "ここから始めても：" },
  ko: { title: "마음에 둔 그 일, 언제쯤 움직일까요?", body: "한 문장 적고 괘를 뽑아 시기를 보세요 (괘판은 무료)", btn: "한 문장 적고 괘 뽑기", or: "이렇게 시작해도 돼요:" },
  fr: { title: "Ce qui vous occupe : quels jours cela se jouera-t-il ?", body: "Écrivez une phrase et tirez pour voir le moment (le tableau est gratuit).", btn: "Écrire et tirer", or: "Ou partez de l'une de celles-ci :" },
  de: { title: "Die Sache, die Sie beschäftigt – an welchen Tagen entscheidet sie sich?", body: "Einen Satz schreiben und werfen, um den Zeitpunkt zu sehen (das Bild ist gratis).", btn: "Satz schreiben und werfen", or: "Oder mit einer dieser Fragen beginnen:" },
  es: { title: "Eso que tienes en mente, ¿en qué días se decide?", body: "Escribe una frase y haz una tirada para ver el momento (el cuadro es gratis).", btn: "Escribir y tirar", or: "O empieza con una de estas:" },
  pt: { title: "Aquilo que está na sua cabeça: em que dias se resolve?", body: "Escreva uma frase e faça uma tiragem para ver o momento (o quadro é grátis).", btn: "Escrever e tirar", or: "Ou comece por uma destas:" },
};

export default function GuaCta({ locale, hex, examples }: { locale: Locale; hex: number; examples: readonly string[] }) {
  const w = W[locale] ?? W.en!;
  const ref = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { track("gua_cta", { locale, method: "view", hex }); io.disconnect(); } }, { threshold: 0.5 });
    io.observe(el);
    return () => io.disconnect();
  }, [locale, hex]);
  const base = `/${locale}/cast?ex=${hex}`;
  return (
    <section ref={ref} className="mt-[var(--s-6)] p-[var(--s-5)] border border-[var(--gold)] rounded-[2px]" data-heat="gua-cta">
      <h2 className="t-d3">{w.title}</h2>
      <p className="t-small mt-[var(--s-2)] text-[var(--ink-66)]">{w.body}</p>
      <Link href={base} onClick={() => track("gua_cta", { locale, method: "click", hex })} data-heat="gua-cta-cast"
        className="inline-block mt-[var(--s-4)] min-h-[var(--s-6)] px-5 py-2.5 rounded-[2px] bg-[var(--ink)] text-[var(--paper)] text-[13px] tracking-[0.14em]">
        {w.btn} →
      </Link>
      {examples.length > 0 && (
        <>
          <p className="t-small mt-[var(--s-4)] text-[var(--ink-45)]">{w.or}</p>
          <ul className="mt-[var(--s-2)] flex flex-wrap gap-2">
            {examples.map((q, k) => (
              <li key={k}>
                <Link href={`${base}&q=${encodeURIComponent(q)}`} onClick={() => track("gua_cta", { locale, method: "example", hex })} data-heat="gua-cta-example"
                  className="inline-block t-small px-3 py-1.5 border border-[var(--ink-16)] rounded-[2px] hover:border-[var(--ink)] transition-colors">
                  {q}
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
