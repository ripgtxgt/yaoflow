import Link from "next/link";
import ServicePrice, { type PricePart } from "@/components/ServicePrice";
import { serviceText, type Service, type priceTable } from "@/lib/services";
import type { Locale } from "@/lib/locales";

/**
 * The service cards of /services and of the two doors' own pages (/services/self 看自己, /services/daily 每天): name,
 * one line, the catalog price in the visitor's money, 「打開 →」. One place, so the pages cannot drift apart.
 */
const FREE: Record<Locale, string> = { zh: "免费", "zh-hant": "免費", en: "Free", ja: "無料", ko: "무료", fr: "Gratuit", de: "Kostenlos", es: "Gratis", pt: "Grátis" };
const OPEN: Record<Locale, string> = { zh: "打开", "zh-hant": "打開", en: "Open", ja: "開く", ko: "열기", fr: "Ouvrir", de: "Öffnen", es: "Abrir", pt: "Abrir" };
const PER_MONTH: Record<Locale, string> = { zh: "/月", "zh-hant": "/月", en: "/month", ja: "/月", ko: "/월", fr: "/mois", de: "/Monat", es: "/mes", pt: "/mês" };
const FIRST: Record<Locale, string> = { zh: "首次", "zh-hant": "首次", en: "first time", ja: "初回", ko: "첫 구매", fr: "1re fois", de: "erstes Mal", es: "primera vez", pt: "primeira vez" };
const DAYS: Record<Locale, [string, string, string]> = { zh: ["1 日", "7 天", "30 天"], "zh-hant": ["1 日", "7 天", "30 天"], en: ["1 day", "7 days", "30 days"], ja: ["1 日", "7 日", "30 日"], ko: ["1일", "7일", "30일"], fr: ["1 jour", "7 jours", "30 jours"], de: ["1 Tag", "7 Tage", "30 Tage"], es: ["1 día", "7 días", "30 días"], pt: ["1 dia", "7 dias", "30 dias"] };
/** 10-22 进度表 92: the membership is written 「首月 X · 之後 Y/月」 */
const FIRST_MONTH: Record<Locale, string> = { zh: "首月", "zh-hant": "首月", en: "first month", ja: "初月", ko: "첫 달", fr: "1er mois", de: "1. Monat", es: "primer mes", pt: "1º mês" };
const THEN: Record<Locale, string> = { zh: "之后", "zh-hant": "之後", en: "then", ja: "以降", ko: "이후", fr: "puis", de: "danach", es: "luego", pt: "depois" };
const MEMBER_PRICE: Record<Locale, string> = { zh: "会员", "zh-hant": "會員", en: "members", ja: "メンバー", ko: "멤버", fr: "membres", de: "Mitglieder", es: "miembros", pt: "membros" };

/** which price keys a card shows */
function parts(s: Service, l: Locale): { parts: PricePart[]; per?: string } | null {
  if (!s.prices?.length) return null;
  if (s.id === "cast" || s.id === "tongka") { const d = DAYS[l]; return { parts: [{ key: "pass_1", label: `${d[0]} ${FIRST[l]}` }, { key: "pass_7", label: d[1] }, { key: "pass_30", label: d[2] }] }; }
  if (s.id === "member") return { parts: [{ key: "month:first", label: FIRST_MONTH[l] }, { key: "month", label: THEN[l], suffix: PER_MONTH[l] }] };
  if (s.id === "hepan") return { parts: [{ key: "hepan" }, { key: "hepan:member", label: MEMBER_PRICE[l] }] };
  if (s.id === "nianshu") return { parts: [{ key: "nianshu", strike: "nianshu:regular" }, { key: "nianshu:member", label: MEMBER_PRICE[l] }] };
  return { parts: s.prices.map((k) => ({ key: k })) };
}

export default function ServiceCards({ services, locale, table, from = "services" }: { services: Service[]; locale: Locale; table: ReturnType<typeof priceTable>; from?: string }) {
  const l = locale;
  return (
    <div className="grid gap-3">
      {services.map((s) => {
        const t = serviceText(s, l);
        const p = parts(s, l);
        const href = s.id === "member" ? `/${l}${s.path}?c=${from}#membership` : `/${l}${s.path}?c=${from}`;
        return (
          <article key={s.id} className="rounded-[6px] border border-[var(--ink-16)] p-4 flex flex-col sm:flex-row sm:items-start gap-3" data-heat={`services-${s.id}`}>
            <div className="flex-1 min-w-0">
              <h3 className="t-d3">{t.label}{s.free ? <span className="t-label ml-2 !text-[var(--gold-text)]">{FREE[l]}</span> : null}</h3>
              <p className="t-small mt-1 !text-[var(--ink-66)]">{t.line}</p>
              {p ? <ServicePrice table={table} parts={p.parts} per={p.per} locale={l} note={t.priceNote} /> : t.priceNote ? <p className="t-small mt-[var(--s-2)] !text-[var(--ink-45)]">{t.priceNote}</p> : null}
            </div>
            <Link href={href} className="shrink-0 inline-block px-4 py-2 rounded-full border border-[var(--ink-16)] hover:border-[var(--ink)] t-small no-underline">{OPEN[l]} →</Link>
          </article>
        );
      })}
    </div>
  );
}
