"use client";

import TongkaPanel from "@/components/TongkaPanel";
import PassReturn from "@/components/PassReturn";
import { useCurrency } from "@/lib/use-currency";
import { useTongka } from "@/lib/use-tongka";

/**
 * 10-25 (Neil: 「解读必须要有付费」): where a chart's plain reading stood for everyone, a signed-in reader without a 通卡 or a
 * membership gets the pass panel; buying brings them back here.
 * 10-30 进度表 128 ④: the three lines in every language the chart pages open in.
 */
const T: Record<string, { head: string; lead: string; link: string }> = {
  "zh-hant": { head: "這張盤的白話解讀", lead: "開一張通卡或會員，就能看這張盤每一部分在說什麼：", link: "看通卡與會員 →" },
  zh: { head: "这张盘的白话解读", lead: "开一张通卡或会员，就能看这张盘每一部分在说什么：", link: "看通卡与会员 →" },
  en: { head: "This chart in plain words", lead: "Get a Pass or a membership to read what each part of this chart says:", link: "See the Pass and membership →" },
  ja: { head: "このチャートのやさしい解説", lead: "パスまたはメンバーシップがあれば、このチャートの一つひとつが何を語っているかを読めます：", link: "パスとメンバーシップを見る →" },
  ko: { head: "이 차트의 쉬운 풀이", lead: "패스나 멤버십이 있으면 이 차트의 각 부분이 무엇을 말하는지 볼 수 있습니다:", link: "패스와 멤버십 보기 →" },
  fr: { head: "Ce thème expliqué simplement", lead: "Avec un pass ou un abonnement, lisez ce que dit chaque partie de ce thème :", link: "Voir le pass et l’abonnement →" },
  de: { head: "Dein Horoskop verständlich erklärt", lead: "Mit einem Pass oder einer Mitgliedschaft liest du, was jeder Teil dieses Horoskops sagt:", link: "Pass und Mitgliedschaft ansehen →" },
  es: { head: "Esta carta explicada con palabras sencillas", lead: "Con un pase o una membresía puedes leer lo que dice cada parte de esta carta:", link: "Ver el pase y la membresía →" },
  pt: { head: "Este mapa explicado em palavras simples", lead: "Com um passe ou uma assinatura, você lê o que cada parte deste mapa diz:", link: "Ver o passe e a assinatura →" },
};

export default function ChartReadingLock({ locale }: { locale: string }) {
  const [currency] = useCurrency();
  const tk = useTongka();
  const t = T[locale] ?? T["zh-hant"]!;
  return (
    <section data-heat="chart-reading-lock" className="mt-[var(--s-6)] panel px-[var(--s-4)] py-[var(--s-5)]">
      <h2 className="t-sect">{t.head}</h2>
      <p className="t-small mt-1 mb-[var(--s-3)] !text-[var(--ink-66)]">{t.lead}</p>
      <PassReturn locale={locale} />
      {tk.tongka || !tk.loaded
        ? <TongkaPanel locale={locale} currency={currency} first={tk.first} compact title={null} lead={null} returnTo={typeof window === "undefined" ? undefined : window.location.pathname} />
        : <a href={`/${locale}/account#membership`} className="t-small underline underline-offset-4">{t.link}</a>}
    </section>
  );
}
