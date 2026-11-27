/**
 * 年付续费预告 (09-25 合规). Automatic-renewal law in several US states
 * (California ARL, New York, Colorado…) and the EU consumer rules want a
 * notice before a yearly plan renews — we send one ~30 days ahead, once per
 * period, to yearly members who have not cancelled. Not commercial mail:
 * it is a service notice about their own contract, so no unsubscribe link,
 * and it goes out regardless of the marketing box.
 *
 * {date} = renewal day, {price} = what will be charged (formatted). The
 * manage link opens the account page where 「取消续订」 lives — one click,
 * as the law requires it be as easy as signing up.
 */
export const RENEW_T = {
  zh: {
    subject: "会员将于 {date} 自动续费 · {price}/年",
    title: "续费预告",
    lead: "你的 YaoFlow 年付会员将于 {date} 自动续费，届时会向你原来的付款方式收取 {price}。",
    keep: "不想续？在到期前任何时候取消都可以，这一期照常用到 {date}，之后不再扣款。",
    manage: "管理会员 / 取消续订",
    note: "如果继续保留，不需要做任何事。续费后 Stripe 会把发票发到这个邮箱。",
  },
  "zh-hant": {
    subject: "會員將於 {date} 自動續費 · {price}/年",
    title: "續費預告",
    lead: "你的 YaoFlow 年付會員將於 {date} 自動續費，屆時會向你原來的付款方式收取 {price}。",
    keep: "不想續？在到期前任何時候取消都可以，這一期照常用到 {date}，之後不再扣款。",
    manage: "管理會員 / 取消續訂",
    note: "如果繼續保留，不需要做任何事。續費後 Stripe 會把發票寄到這個信箱。",
  },
  en: {
    subject: "Your membership renews on {date} · {price}/year",
    title: "Renewal notice",
    lead: "Your YaoFlow yearly membership renews automatically on {date}. Your payment method on file will be charged {price}.",
    keep: "Don't want to renew? Cancel any time before then — you keep everything until {date}, and nothing is charged after.",
    manage: "Manage membership / cancel renewal",
    note: "If you'd like to keep it, there's nothing to do. Stripe will email the invoice to this address after the renewal.",
  },
  ja: {
    subject: "{date} にメンバーシップが自動更新されます · 年額 {price}",
    title: "更新のお知らせ",
    lead: "YaoFlow の年間メンバーシップは {date} に自動更新され、登録済みのお支払い方法に {price} が請求されます。",
    keep: "更新をご希望でない場合は、それまでにいつでも解約できます。{date} まではそのままご利用いただけ、その後の請求はありません。",
    manage: "メンバーシップの管理 / 更新の停止",
    note: "継続される場合、お手続きは不要です。更新後、Stripe からこのアドレスに請求書が届きます。",
  },
  ko: {
    subject: "{date}에 멤버십이 자동 갱신됩니다 · 연 {price}",
    title: "갱신 안내",
    lead: "YaoFlow 연간 멤버십이 {date}에 자동 갱신되며, 등록된 결제 수단으로 {price}가 청구됩니다.",
    keep: "갱신을 원하지 않으시면 그 전에 언제든 해지할 수 있습니다. {date}까지는 그대로 이용하실 수 있고 이후 청구는 없습니다.",
    manage: "멤버십 관리 / 갱신 해지",
    note: "계속 이용하시려면 따로 하실 일은 없습니다. 갱신 후 Stripe가 이 주소로 청구서를 보내드립니다.",
  },
  fr: {
    subject: "Votre abonnement se renouvelle le {date} · {price}/an",
    title: "Avis de renouvellement",
    lead: "Votre abonnement annuel YaoFlow se renouvelle automatiquement le {date}. Votre moyen de paiement enregistré sera débité de {price}.",
    keep: "Vous ne souhaitez pas renouveler ? Vous pouvez résilier à tout moment avant cette date : vous conservez tout jusqu'au {date}, et rien n'est prélevé ensuite.",
    manage: "Gérer l'abonnement / annuler le renouvellement",
    note: "Si vous souhaitez le conserver, vous n'avez rien à faire. Stripe enverra la facture à cette adresse après le renouvellement.",
  },
  de: {
    subject: "Deine Mitgliedschaft verlängert sich am {date} · {price}/Jahr",
    title: "Verlängerungshinweis",
    lead: "Deine YaoFlow-Jahresmitgliedschaft verlängert sich am {date} automatisch. Deine hinterlegte Zahlungsmethode wird mit {price} belastet.",
    keep: "Du möchtest nicht verlängern? Kündige jederzeit vorher – du behältst alles bis zum {date}, danach wird nichts mehr abgebucht.",
    manage: "Mitgliedschaft verwalten / Verlängerung kündigen",
    note: "Wenn du sie behalten möchtest, musst du nichts tun. Stripe schickt die Rechnung nach der Verlängerung an diese Adresse.",
  },
  es: {
    subject: "Tu membresía se renueva el {date} · {price}/año",
    title: "Aviso de renovación",
    lead: "Tu membresía anual de YaoFlow se renueva automáticamente el {date}. Se cobrarán {price} a tu método de pago guardado.",
    keep: "¿No quieres renovar? Cancela en cualquier momento antes de esa fecha: conservas todo hasta el {date} y no se cobra nada después.",
    manage: "Gestionar membresía / cancelar la renovación",
    note: "Si quieres mantenerla, no tienes que hacer nada. Stripe enviará la factura a esta dirección tras la renovación.",
  },
  pt: {
    subject: "Sua assinatura renova em {date} · {price}/ano",
    title: "Aviso de renovação",
    lead: "Sua assinatura anual do YaoFlow renova automaticamente em {date}. Será cobrado {price} no método de pagamento cadastrado.",
    keep: "Não quer renovar? Cancele a qualquer momento antes disso: você mantém tudo até {date} e nada é cobrado depois.",
    manage: "Gerenciar assinatura / cancelar renovação",
    note: "Se quiser manter, não precisa fazer nada. A Stripe enviará a fatura para este endereço após a renovação.",
  },
};
