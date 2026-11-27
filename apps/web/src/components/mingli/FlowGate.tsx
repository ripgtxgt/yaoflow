import Link from "next/link";
import { toHans } from "@/lib/hant";
import { isForeign } from "@/lib/l10n/core";

/**
 * 10-22 进度表 92／93 — the two states a deep report's 運勢 chapters can be in besides fully open (lib/mingli/flow-view.ts):
 *   FlowLocked  92: made under a 通卡 — two lines of the chapter, then 「會員可看，每月按當下的流月重寫」
 *   FlowDated   93: made under a membership that has ended — 「國曆 X 月版」 above the chapter, and a link to resume
 * Both link to the membership on the account page. Server-rendered: the locked chapter's full text never reaches the page.
 * 10-30 进度表 128 ④: the lines in every language a chart page opens in (FlowDated's month label comes in with 八字／紫微).
 */
const T = {
  lock: "會員可看，每月按當下的流月重寫",
  lockSky: "會員可看，每月按當下的天象更新",
  resume: "恢復會員，每月按當下流月更新",
  resumeSky: "恢復會員，每月按當下天象更新",
};
const FOREIGN: Record<string, typeof T> = {
  en: { lock: "For members — rewritten each month for the current lunar month", lockSky: "For members — updated each month from the current sky", resume: "Resume your membership to have it updated each month", resumeSky: "Resume your membership to have it updated each month from the current sky" },
  ja: { lock: "メンバーシップで読めます。毎月その時の流月に合わせて書き直されます", lockSky: "メンバーシップで読めます。毎月その時の天体の動きに合わせて更新されます", resume: "メンバーシップを再開すると、毎月その時の流月に合わせて更新されます", resumeSky: "メンバーシップを再開すると、毎月その時の天体の動きに合わせて更新されます" },
  ko: { lock: "멤버십으로 볼 수 있으며, 매월 그달의 운에 맞춰 다시 씁니다", lockSky: "멤버십으로 볼 수 있으며, 매월 그때의 천체 배치에 맞춰 갱신됩니다", resume: "멤버십을 다시 시작하면 매월 그달의 운에 맞춰 갱신됩니다", resumeSky: "멤버십을 다시 시작하면 매월 그때의 천체 배치에 맞춰 갱신됩니다" },
  fr: { lock: "Réservé aux abonnés, réécrit chaque mois selon le mois lunaire en cours", lockSky: "Réservé aux abonnés, mis à jour chaque mois selon le ciel du moment", resume: "Réactivez votre abonnement pour une mise à jour chaque mois", resumeSky: "Réactivez votre abonnement pour une mise à jour chaque mois selon le ciel du moment" },
  de: { lock: "Für Mitglieder – jeden Monat für den laufenden Mondmonat neu geschrieben", lockSky: "Für Mitglieder – jeden Monat nach dem aktuellen Himmelsstand aktualisiert", resume: "Mitgliedschaft fortsetzen, dann wird es jeden Monat aktualisiert", resumeSky: "Mitgliedschaft fortsetzen, dann wird es jeden Monat nach dem aktuellen Himmelsstand aktualisiert" },
  es: { lock: "Para miembros: se reescribe cada mes según el mes lunar en curso", lockSky: "Para miembros: se actualiza cada mes según el cielo del momento", resume: "Reactiva tu membresía para que se actualice cada mes", resumeSky: "Reactiva tu membresía para que se actualice cada mes según el cielo del momento" },
  pt: { lock: "Para assinantes: reescrito todo mês conforme o mês lunar em curso", lockSky: "Para assinantes: atualizado todo mês conforme o céu do momento", resume: "Reative sua assinatura para receber a atualização todo mês", resumeSky: "Reative sua assinatura para receber a atualização todo mês conforme o céu do momento" },
};
const say = (locale: string, k: keyof typeof T) => (isForeign(locale) ? (FOREIGN[locale] ?? FOREIGN.en!)[k] : locale === "zh" ? toHans(T[k]).replace(/国历/g, "公历") : T[k]);

export function FlowLocked({ locale, text, sky = false, resume = false }: { locale: string; text?: string | null; sky?: boolean; resume?: boolean }) {
  return (
    <div className="mt-[var(--s-3)]" data-flow="locked">
      {text ? (
        <p className="t-body leading-relaxed !text-[var(--ink-45)] [mask-image:linear-gradient(to_bottom,black_45%,transparent)]">{text}</p>
      ) : null}
      <Link href={`/${locale}/account#membership`} data-heat="flow-lock"
        className="inline-block mt-[var(--s-2)] t-small underline underline-offset-4 !text-[var(--gold-text)]">
        {say(locale, resume ? (sky ? "resumeSky" : "resume") : sky ? "lockSky" : "lock")} →
      </Link>
    </div>
  );
}

export function FlowDated({ locale, month, sky = false }: { locale: string; month: string; sky?: boolean }) {
  return (
    <p className="t-small mt-[var(--s-2)] flex flex-wrap gap-x-2 gap-y-1 items-baseline" data-flow="dated">
      <span className="rounded-[2px] border border-[var(--gold)] px-2 py-[1px] !text-[var(--gold-text)]">{locale === "zh" ? toHans(`國曆 ${month}版`).replace(/国历/g, "公历") : `國曆 ${month}版`}</span>
      <Link href={`/${locale}/account#membership`} data-heat="flow-resume" className="underline underline-offset-4 !text-[var(--ink-66)] hover:!text-[var(--ink)]">
        {say(locale, sky ? "resumeSky" : "resume")} →
      </Link>
    </p>
  );
}
