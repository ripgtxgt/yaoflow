import Link from "next/link";
import { cookies } from "next/headers";
import { ADMIN_COOKIE } from "@/lib/admin-auth";
import { featureVisible } from "@/lib/features";
import { homeDay } from "@/lib/clock";
import { toHans } from "@/lib/hant";
import { huangliDay, term as hlTerm, WEEK_ZH, type HlLocale } from "@/lib/mingli/calendar/day";
import { GROUP_LABEL, GROUP_LINE, priceTable, servicesFor, serviceText, siteLine } from "@/lib/services";
import ServicePrice from "@/components/ServicePrice";
import type { Locale } from "@/lib/locales";

/**
 * 10-22 进度表 76 C — the home's first screen after the question (调研结论 §三 首頁): one action, then
 *   · the row that switches the action (求一支籤 / 擲一次筊 / 抽一張塔羅) — Chinese pages, the switches respected
 *   · a 「今天」 card: the date, the 黃曆's 宜 in one line, the door to 今日一籤
 *   · three intent cards (問事 / 看自己 / 每天) into the 全部服務 page
 *   · the prices on one screen: the three passes and the membership, in the visitor's currency
 * Nothing here is a second answer to the question above; it is where to go when a cast is not the thing.
 */
const SWITCH: Record<"zh" | "zh-hant", { lead: string; qiuqian: string; jiaobei: string; tarot: string; xunwu: string; bmg: string }> = {
  "zh-hant": { lead: "不想起卦？也可以", qiuqian: "求一支籤", jiaobei: "擲一次筊", tarot: "抽一張塔羅", xunwu: "東西不見了？擲骰子找", bmg: "你是哪一卦？做本命卦" },
  zh: { lead: "不想起卦？也可以", qiuqian: "求一支签", jiaobei: "掷一次筊", tarot: "抽一张塔罗", xunwu: "东西不见了？掷骰子找", bmg: "你是哪一卦？做本命卦" },
};
const TODAY: Record<"zh" | "zh-hant", { head: string; yi: string; nothing: string; lot: string; more: string }> = {
  "zh-hant": { head: "今天", yi: "宜", nothing: "諸事不宜，先把手上的事做完", lot: "抽今天的一支籤 →", more: "整頁黃曆 →" },
  zh: { head: "今天", yi: "宜", nothing: "诸事不宜，先把手上的事做完", lot: "抽今天的一支签 →", more: "整页黄历 →" },
};
const PRICE_HEAD: Record<Locale, string> = { zh: "价格一屏看清", "zh-hant": "價格一屏看清", en: "Prices, on one screen", ja: "料金はこの一画面で", ko: "가격 한눈에", fr: "Les prix, en un écran", de: "Die Preise auf einen Blick", es: "Los precios, en una pantalla", pt: "Os preços, numa tela" };
const PRICE_LINE: Record<Locale, string> = {
  zh: "通卡一次付清、不续费，期内问事与本命报告不限次；会员多了跟着时间走的：大运流年、每天按你八字算的今天、今日一签全文、每天一封信、报告月更和年书合盘 8 折。",
  "zh-hant": "通卡一次付清、不續訂，期內問事與本命報告不限次；會員多了跟著時間走的：大運流年、每天按你八字算的今天、今日一籤全文、每天一封信、報告月更和年書合盤 8 折。",
  en: "A pass is paid once and never renews, every paid reading while it runs; a membership adds the daily letter, the monthly outlook, report rewrites and 20% off the big one-offs.",
  ja: "パスは一回払い・更新なしで期間中の有料鑑定が使い放題。メンバーシップは毎日の手紙、毎月の運勢、レポート更新、大型商品 20% 引きが加わります。",
  ko: "패스는 한 번 결제, 갱신 없음, 기간 동안 모든 유료 풀이. 멤버십은 매일 편지, 매월 운세, 리포트 갱신, 대형 상품 20% 할인이 더해집니다.",
  fr: "Un pass se paie une fois, sans renouvellement, toutes les lectures payantes pendant sa durée ; l'abonnement ajoute la lettre quotidienne, l'horizon mensuel, les rapports réécrits et 20 % sur les grands formats.",
  de: "Ein Pass wird einmal bezahlt und nie verlängert, jede bezahlte Deutung, solange er läuft; die Mitgliedschaft bringt den täglichen Brief, den Monatsausblick, neu geschriebene Berichte und 20 % auf die großen Einmalkäufe.",
  es: "Un pase se paga una vez y no se renueva, todas las lecturas de pago mientras dure; la membresía añade la carta diaria, la mirada mensual, los informes reescritos y 20 % en los grandes.",
  pt: "Um passe é pago uma vez e nunca renova, todas as leituras pagas enquanto durar; a assinatura acrescenta a carta diária, o panorama mensal, relatórios reescritos e 20% nos grandes.",
};
const ALL: Record<Locale, string> = { zh: "全部服务 →", "zh-hant": "全部服務 →", en: "All services →", ja: "サービス一覧 →", ko: "전체 서비스 →", fr: "Tous les services →", de: "Alle Angebote →", es: "Todos los servicios →", pt: "Todos os serviços →" };
const DAYS: Record<Locale, [string, string, string]> = { zh: ["1 日", "7 天", "30 天"], "zh-hant": ["1 日", "7 天", "30 天"], en: ["1 day", "7 days", "30 days"], ja: ["1 日", "7 日", "30 日"], ko: ["1일", "7일", "30일"], fr: ["1 jour", "7 jours", "30 jours"], de: ["1 Tag", "7 Tage", "30 Tage"], es: ["1 día", "7 días", "30 días"], pt: ["1 dia", "7 dias", "30 dias"] };
const FIRST: Record<Locale, string> = { zh: "首次", "zh-hant": "首次", en: "first time", ja: "初回", ko: "첫 구매", fr: "1re fois", de: "erstes Mal", es: "primera vez", pt: "primeira vez" };
/** 10-22 进度表 92: the membership is written 「會員首月 X · 之後 Y/月」 */
const MEMBER_FIRST: Record<Locale, string> = { zh: "会员首月", "zh-hant": "會員首月", en: "membership, first month", ja: "メンバー初月", ko: "멤버 첫 달", fr: "abonnement, 1er mois", de: "Mitgliedschaft, 1. Monat", es: "membresía, primer mes", pt: "assinatura, 1º mês" };
const THEN: Record<Locale, string> = { zh: "之后", "zh-hant": "之後", en: "then", ja: "以降", ko: "이후", fr: "puis", de: "danach", es: "luego", pt: "depois" };
const PER_MONTH: Record<Locale, string> = { zh: "/月", "zh-hant": "/月", en: "/month", ja: "/月", ko: "/월", fr: "/mois", de: "/Monat", es: "/mes", pt: "/mês" };

/**
 * 10-22 进度表 88 (设计稿第 2 節「左問右今天」): the home page places the pieces itself — `switch` under the question,
 * `today` in the right column on a desktop (under the question on a phone), `rest` (the three intents and the prices)
 * after them. `all` keeps the old single stack.
 */
export default async function HomeDoors({ locale, part = "all" }: { locale: Locale; part?: "all" | "switch" | "today" | "rest" }) {
  const show = (x: "switch" | "today" | "rest") => part === "all" || part === x;
  const admin = (await cookies()).get(ADMIN_COOKIE)?.value;
  const zh = locale === "zh" || locale === "zh-hant";
  const hl = (locale === "zh" ? "zh" : "zh-hant") as HlLocale;
  const items = await servicesFor(locale, admin);
  const has = (id: string) => items.some((s) => s.id === id);
  const hub = await featureVisible("services", admin);
  const table = priceTable();
  const tk = has("tongka");
  const w = (s: string) => (locale === "zh" ? toHans(s) : s);
  // 10-29 进度表 128: the switch row in every language — the words from data/l10n/site.json outside Chinese
  const sw = (k: keyof (typeof SWITCH)["zh-hant"]) => (zh ? SWITCH[hl][k] : siteLine(locale, `switchRow.${k}`) ?? SWITCH["zh-hant"][k]);

  // the 黃曆 line for today (Taipei), only when the 黃曆 is open to this visitor
  let today: { date: string; line: string; href: string } | null = null;
  if (zh && has("huangli")) {
    try {
      const ymd = homeDay(Date.now());
      const [y, m, d] = ymd.split("-").map(Number);
      const h = huangliDay(y!, m!, d!);
      const yi = h.nothing ? TODAY[hl].nothing : `${TODAY[hl].yi} ${h.yi.slice(0, 4).map((x) => hlTerm(x, hl)).join("、")}`;
      today = { date: w(`國曆 ${m} 月 ${d} 日 週${WEEK_ZH[h.weekday]} · 農曆${h.lunar.month}${h.lunar.day} · ${h.gz.day}日`).replace(/国历/g, "公历"), line: yi, href: `/${locale}/huangli?c=home-today` };
    } catch { today = null; }
  }

  return (
    <div className={part === "today" ? "" : "mt-[var(--s-5)]"} data-heat={`home-doors${part === "all" ? "" : `-${part}`}`}>
      {/* the switch row */}
      {show("switch") && (has("jiaobei") || has("tarot") || has("xunwu") || has("bmg")) && (
        <p className="t-small flex flex-wrap gap-x-3 gap-y-1 !text-[var(--ink-66)]">
          <span>{sw("lead")}</span>
          {has("jiaobei") && <Link href={`/${locale}/qiuqian?c=home-switch`} data-heat="home-switch-qiuqian" className="underline underline-offset-4 hover:text-[var(--ink)]">{sw("qiuqian")}</Link>}
          {has("jiaobei") && <Link href={`/${locale}/jiaobei?c=home-switch`} data-heat="home-switch-jiaobei" className="underline underline-offset-4 hover:text-[var(--ink)]">{sw("jiaobei")}</Link>}
          {has("tarot") && <Link href={`/${locale}/tarot?c=home-switch`} data-heat="home-switch-tarot" className="underline underline-offset-4 hover:text-[var(--ink)]">{sw("tarot")}</Link>}
          {/* 10-29 进度表 127: the one door that needs no account */}
          {has("xunwu") && <Link href={`/${locale}/xunwu?c=home-switch`} data-heat="home-switch-xunwu" className="underline underline-offset-4 hover:text-[var(--ink)]">{sw("xunwu")}</Link>}
          {/* 11-05 进度表 136 (Neil: 「看看要放在哪个版块」): the second door that needs no account — and no question */}
          {has("bmg") && <Link href={`/${locale}/bmg?c=home-switch`} data-heat="home-switch-bmg" className="underline underline-offset-4 hover:text-[var(--ink)]">{sw("bmg")}</Link>}
        </p>
      )}

      {/* 今天 */}
      {show("today") && today && (
        <aside className={`${part === "today" ? "mt-[var(--s-4)] md:mt-0" : "mt-[var(--s-4)]"} rounded-[6px] border border-[var(--ink-16)] p-4`} data-heat="home-today">
          <p className="t-label !text-[var(--gold-text)]">{TODAY[hl].head}</p>
          <p className="t-small mt-1 !text-[var(--ink-66)]">{today.date}</p>
          <p className="t-body mt-1">{today.line}</p>
          <p className="t-small mt-2 flex flex-wrap gap-x-4 gap-y-1">
            {has("today-qian") && <Link href={`/${locale}/today-qian?c=home-today`} data-heat="home-today-lot" className="underline underline-offset-4 hover:text-[var(--ink)]">{TODAY[hl].lot}</Link>}
            <Link href={today.href} data-heat="home-today-huangli" className="underline underline-offset-4 !text-[var(--ink-66)] hover:!text-[var(--ink)]">{TODAY[hl].more}</Link>
          </p>
        </aside>
      )}

      {/* the three intents */}
      {show("rest") && zh && hub && (
        <div className="mt-[var(--s-4)] grid gap-3 sm:grid-cols-3">
          {(["ask", "self", "daily"] as const).filter((g) => g === "ask" || items.some((s) => s.group === g)).map((g) => (
            <Link key={g} href={g === "ask" ? `/${locale}/services?c=home-intent#ask` : `/${locale}/services/${g}?c=home-intent`} data-heat={`home-intent-${g}`}
              className="block rounded-[6px] border border-[var(--ink-16)] p-4 hover:border-[var(--ink)] no-underline">
              <span className="t-d3 block">{GROUP_LABEL[g][locale]}</span>
              <span className="t-small block mt-1 !text-[var(--ink-66)]">{GROUP_LINE[g][hl]}</span>
              <span className="t-small block mt-2 !text-[var(--ink-45)]">{items.filter((s) => s.group === g).slice(0, 4).map((s) => serviceText(s, locale).label).join(" · ")}</span>
            </Link>
          ))}
        </div>
      )}

      {/* the prices */}
      {show("rest") && <aside className="mt-[var(--s-4)] rounded-[6px] border border-[var(--ink-16)] p-4" data-heat="home-prices">
        <p className="t-label !text-[var(--gold-text)]">{PRICE_HEAD[locale]}</p>
        {tk
          ? <>
            <ServicePrice table={table} parts={[{ key: "pass_1", label: `${DAYS[locale][0]} ${FIRST[locale]}` }, { key: "pass_7", label: DAYS[locale][1] }, { key: "pass_30", label: DAYS[locale][2] }]} locale={locale} />
            <ServicePrice table={table} parts={[{ key: "month:first", label: MEMBER_FIRST[locale] }, { key: "month", label: THEN[locale], suffix: PER_MONTH[locale] }]} locale={locale} />
          </>
          : <ServicePrice table={table} parts={[{ key: "month:first", label: MEMBER_FIRST[locale] }, { key: "month", label: THEN[locale], suffix: PER_MONTH[locale] }]} locale={locale} />}
        <p className="t-small mt-2 !text-[var(--ink-66)]">{PRICE_LINE[locale]}</p>
        {hub && <p className="t-small mt-2"><Link href={`/${locale}/services?c=home-prices`} data-heat="home-prices-all" className="underline underline-offset-4 hover:text-[var(--ink)]">{ALL[locale]}</Link></p>}
      </aside>}
    </div>
  );
}
