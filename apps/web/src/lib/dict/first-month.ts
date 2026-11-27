/**
 * 10-10 首月同价 (Neil: 「按第1种做吧，然后需要把这个续费269写清楚」): a first-time member's first month costs what the
 * one-off month costs ({first}); from the second month on, the monthly fee ({month}). Every place that sells the
 * subscription to someone who would pay the first-month price says both numbers. {save} = one-off month − monthly fee.
 */
export interface FirstMonthCopy {
  /** the subscribe button on the account page */
  monthly: string;
  /** the auto-renewal terms under it (keeps <a>…</a> around the link to the Terms, like subConsent) */
  consent: string;
  /** appended after a sentence that names the monthly fee */
  paren: string;
  /** a button that used to say "{month}/month" */
  cta: string;
  /** the second-paid-question choice: membership vs one-off month */
  optSub: string;
  optSubSave: string;
  /** the one-time line on Stripe's page */
  stripeName: string;
  /** after a sentence about what the first month comes to (单买抵首月) */
  renewNote: string;
}

export const FIRST_MONTH_T: Record<string, FirstMonthCopy> = {
  zh: {
    monthly: "首月 {first}，之后每月 {month}",
    consent: "首月 {first}，从第二个月起按月自动续费，每月 {month}，直到你取消；随时可在账号页「管理订阅」取消，当期结束后不再扣费。<a>服务条款</a>",
    paren: "（首月 {first}）",
    cta: "开通会员 · 首月 {first}",
    optSub: "开会员：首月 {first}，续订每月 {month} · 随时可取消",
    optSubSave: "续订后每月比 30 天通卡省 {save}",
    stripeName: "首月差额：首月共 {first}，续订起每月 {month}",
    renewNote: "从第二个月起每月 {month}。",
  },
  "zh-hant": {
    monthly: "首月 {first}，之後每月 {month}",
    consent: "首月 {first}，從第二個月起按月自動續訂，每月 {month}，直到你取消；隨時可在帳號頁「管理訂閱」取消，當期結束後不再扣款。<a>服務條款</a>",
    paren: "（首月 {first}）",
    cta: "開通會員 · 首月 {first}",
    optSub: "開會員：首月 {first}，續訂每月 {month} · 隨時可取消",
    optSubSave: "續訂後每月比 30 天通卡省 {save}",
    stripeName: "首月差額：首月共 {first}，續訂起每月 {month}",
    renewNote: "從第二個月起每月 {month}。",
  },
  en: {
    monthly: "First month {first}, then {month} / month",
    consent: "First month {first}; from the second month it renews automatically every month at {month} until you cancel; cancel anytime from “Manage membership” on your account page and you will not be charged again after the current period. <a>Terms</a>",
    paren: " (first month {first})",
    cta: "Become a member · first month {first}",
    optSub: "Membership: first month {first}, then {month}/month · cancel anytime",
    optSubSave: "From the second month, {save} a month less than the 30-day pass",
    stripeName: "First-month difference: {first} for the first month, then {month}/month",
    renewNote: " From the second month: {month} a month.",
  },
  ja: {
    monthly: "初月 {first}、2か月目から月 {month}",
    consent: "初月は {first}、2か月目からは毎月 {month} で自動更新され、解約するまで続きます。アカウントページの「メンバーシップの管理」からいつでも解約でき、当期終了後は請求されません。<a>利用規約</a>",
    paren: "（初月 {first}）",
    cta: "メンバーになる · 初月 {first}",
    optSub: "メンバー：初月 {first}、以降は月 {month} · いつでも解約可",
    optSubSave: "2か月目から30日パスより毎月 {save} お得",
    stripeName: "初月差額：初月は合計 {first}、2か月目から月 {month}",
    renewNote: "2か月目からは月 {month} です。",
  },
  ko: {
    monthly: "첫 달 {first}, 이후 월 {month}",
    consent: "첫 달 {first}, 둘째 달부터 매월 {month}이 자동 갱신되며 해지할 때까지 계속됩니다. 계정 페이지 「멤버십 관리」에서 언제든 해지할 수 있고, 이번 기간이 끝나면 더 이상 청구되지 않습니다. <a>이용약관</a>",
    paren: " (첫 달 {first})",
    cta: "멤버십 시작 · 첫 달 {first}",
    optSub: "멤버십: 첫 달 {first}, 이후 월 {month} · 언제든 해지",
    optSubSave: "둘째 달부터 30일 패스보다 매달 {save} 절약",
    stripeName: "첫 달 차액: 첫 달 합계 {first}, 둘째 달부터 월 {month}",
    renewNote: " 둘째 달부터는 월 {month}이에요.",
  },
  fr: {
    monthly: "Premier mois {first}, puis {month} / mois",
    consent: "Premier mois {first} ; à partir du deuxième mois, renouvellement automatique chaque mois au tarif de {month} jusqu'à résiliation ; résiliable à tout moment depuis « Gérer l'abonnement » sur votre page de compte, sans nouveau prélèvement après la période en cours. <a>Conditions</a>",
    paren: " (premier mois {first})",
    cta: "S'abonner · premier mois {first}",
    optSub: "Abonnement : premier mois {first}, puis {month}/mois · résiliable à tout moment",
    optSubSave: "Dès le deuxième mois, {save} de moins par mois que le pass 30 jours",
    stripeName: "Différence du premier mois : {first} le premier mois, puis {month}/mois",
    renewNote: " À partir du deuxième mois : {month} par mois.",
  },
  de: {
    monthly: "Erster Monat {first}, danach {month} / Monat",
    consent: "Erster Monat {first}; ab dem zweiten Monat verlängert es sich automatisch jeden Monat zu {month}, bis du kündigst; jederzeit kündbar über „Mitgliedschaft verwalten“ auf deiner Kontoseite, danach keine weitere Abbuchung nach dem laufenden Zeitraum. <a>Bedingungen</a>",
    paren: " (erster Monat {first})",
    cta: "Mitglied werden · erster Monat {first}",
    optSub: "Mitgliedschaft: erster Monat {first}, danach {month}/Monat · jederzeit kündbar",
    optSubSave: "Ab dem zweiten Monat {save} pro Monat günstiger als der 30-Tage-Pass",
    stripeName: "Differenz erster Monat: {first} im ersten Monat, danach {month}/Monat",
    renewNote: " Ab dem zweiten Monat: {month} im Monat.",
  },
  es: {
    monthly: "Primer mes {first}, después {month} / mes",
    consent: "Primer mes {first}; a partir del segundo mes se renueva automáticamente cada mes por {month} hasta que canceles; puedes cancelar cuando quieras desde «Gestionar la membresía» en tu página de cuenta y no se te cobrará más tras el periodo en curso. <a>Términos</a>",
    paren: " (primer mes {first})",
    cta: "Hazte miembro · primer mes {first}",
    optSub: "Membresía: primer mes {first}, después {month}/mes · cancela cuando quieras",
    optSubSave: "Desde el segundo mes, {save} menos al mes que el pase de 30 días",
    stripeName: "Diferencia del primer mes: {first} el primer mes, luego {month}/mes",
    renewNote: " Desde el segundo mes: {month} al mes.",
  },
  pt: {
    monthly: "Primeiro mês {first}, depois {month} / mês",
    consent: "Primeiro mês {first}; a partir do segundo mês renova automaticamente todo mês por {month} até você cancelar; cancele quando quiser em «Gerenciar assinatura» na sua página de conta e não haverá nova cobrança após o período atual. <a>Termos</a>",
    paren: " (primeiro mês {first})",
    cta: "Assinar · primeiro mês {first}",
    optSub: "Assinatura: primeiro mês {first}, depois {month}/mês · cancele quando quiser",
    optSubSave: "A partir do segundo mês, {save} a menos por mês que o passe de 30 dias",
    stripeName: "Diferença do primeiro mês: {first} no primeiro mês, depois {month}/mês",
    renewNote: " A partir do segundo mês: {month} por mês.",
  },
};

export function firstT(locale: string, key: keyof FirstMonthCopy, vars: Record<string, string | number> = {}): string {
  const table = FIRST_MONTH_T[locale] ?? FIRST_MONTH_T.en!;
  return table[key].replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? `{${k}}`));
}
