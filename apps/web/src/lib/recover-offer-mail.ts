import { FOLLOWUP_LIMIT } from "./followup-limit";
import { castDateLabel, quoteOf } from "./recover-once";
import { discounted, offerPassName, offerSummary, type PendingRow } from "./recover-offer";
import type { Locale } from "./locales";
import { tongkaT } from "./tongka";

/**
 * 10-15 挽回信改版: the one letter, 5 minutes after 「返回」 (else 15 after the page opened). It says the payment did not
 * go through and nothing was charged, the 70 % price next to the full one, that the link holds for one hour (until
 * HH:MM their clock), and that after it the cast is still there at the full price. Only this letter — no later ones.
 * {date} {q} {hex} {offer} {base} {until} {n}. Same keys in every language (test/recover-offer.test.ts).
 */
export interface OfferCopy {
  subject: string; subjectMember: string;
  leadQ: string; leadHex: string; leadMember: string;
  none: string;
  offerDeep: string; offerMember: string; offerPass: string;
  after: string; afterMember: string;
  what: string; help: string;
  btnDeep: string; btnMember: string;
  foot: string;
  /** 10-23 进度表 113 / 111 ③: no discount — a membership or a one-off product is reminded at its own price */
  subjectRemind: string; subjectProduct: string; leadProduct: string; offerRemind: string; afterRemind: string; afterProduct: string;
  tryPass: string; tryPassBtn: string; btnRemind: string;
  /** 10-24 (Neil: 「会员是会员，通卡是通卡」): a pass checkout's letter says 通卡 everywhere, not 會員 — {name} is the pass */
  subjectPass: string; leadPass: string; afterPass: string; btnPass: string;
}

export const OFFER_T: Record<string, OfferCopy> = {
  "zh-hant": {
    subject: "剛才的付款沒有完成：{hex}（1 小時內 7 折）", subjectMember: "會員還沒開通（1 小時內 7 折）",
    leadQ: "{date}你在 YaoFlow 問「{q}」，得到{hex}，深斷的付款沒有完成。", leadHex: "{date}你在 YaoFlow 起的{hex}，深斷的付款沒有完成。", leadMember: "剛才開通會員的付款沒有完成。",
    none: "沒有扣款。如果是付款頁出了問題，換一種付款方式通常就行。",
    offerDeep: "這封信裡的連結 1 小時內有效（到 {until}），這份深斷打 7 折：{offer}（原價 {base}）。", offerMember: "這封信裡的連結 1 小時內有效（到 {until}），會員第一期打 7 折：{offer}（原價 {base}），之後照原價。", offerPass: "這封信裡的連結 1 小時內有效（到 {until}），{name}打 7 折：{offer}（原價 {base}）。",
    after: "超過 1 小時，折扣就沒有了；這一卦還在，可以照原價看。", afterMember: "超過 1 小時，折扣就沒有了，之後還是可以照原價開通。",
    what: "深斷在同一卦上講完：應期在哪幾天、現在先做的一步和要避開的，讀完還能追問 {n} 次。", help: "付款時遇到問題，直接回這封信，我們幫你看。",
    btnDeep: "7 折看深斷", btnMember: "7 折開通", foot: "這件事我們只寫這一封。",
    subjectPass: "剛才的付款沒有完成：{name}（1 小時內 7 折）", leadPass: "剛才買{name}的付款沒有完成。", afterPass: "超過 1 小時，折扣就沒有了，之後還是可以照原價買{name}。", btnPass: "7 折買{name}",
    subjectRemind: "會員還沒開通：剛才的付款沒有完成", subjectProduct: "付款沒有完成：{product}", leadProduct: "剛才「{product}」的付款沒有完成。", offerRemind: "這封信裡的連結 1 小時內有效（到 {until}），點了可以接著付完，價格照原來的：{base}。", afterRemind: "超過 1 小時連結就失效了，之後還是可以在「我的」頁開通。", afterProduct: "超過 1 小時連結就失效了，之後回到原來的頁面，還是可以照原價買。", tryPass: "想先試試的話，也可以先買一張 1 日通卡，當天問事、看自己都不限次。", tryPassBtn: "看 1 日通卡", btnRemind: "接著付款",
  },
  zh: {
    subject: "刚才的付款没有完成：{hex}（1 小时内 7 折）", subjectMember: "会员还没开通（1 小时内 7 折）",
    leadQ: "{date}你在 YaoFlow 问「{q}」，得到{hex}，深断的付款没有完成。", leadHex: "{date}你在 YaoFlow 起的{hex}，深断的付款没有完成。", leadMember: "刚才开通会员的付款没有完成。",
    none: "没有扣款。如果是付款页出了问题，换一种付款方式通常就行。",
    offerDeep: "这封信里的链接 1 小时内有效（到 {until}），这份深断打 7 折：{offer}（原价 {base}）。", offerMember: "这封信里的链接 1 小时内有效（到 {until}），会员第一期打 7 折：{offer}（原价 {base}），之后按原价。", offerPass: "这封信里的链接 1 小时内有效（到 {until}），{name}打 7 折：{offer}（原价 {base}）。",
    after: "超过 1 小时，折扣就没有了；这一卦还在，可以按原价看。", afterMember: "超过 1 小时，折扣就没有了，之后还是可以按原价开通。",
    what: "深断在同一卦上讲完：应期在哪几天、现在先做的一步和要避开的，读完还能追问 {n} 次。", help: "付款时遇到问题，直接回这封信，我们帮你看。",
    btnDeep: "7 折看深断", btnMember: "7 折开通", foot: "这件事我们只写这一封。",
    subjectPass: "刚才的付款没有完成：{name}（1 小时内 7 折）", leadPass: "刚才买{name}的付款没有完成。", afterPass: "超过 1 小时，折扣就没有了，之后还是可以按原价买{name}。", btnPass: "7 折买{name}",
    subjectRemind: "会员还没开通：刚才的付款没有完成", subjectProduct: "付款没有完成：{product}", leadProduct: "刚才「{product}」的付款没有完成。", offerRemind: "这封信里的链接 1 小时内有效（到 {until}），点了可以接着付完，价格照原来的：{base}。", afterRemind: "超过 1 小时链接就失效了，之后还是可以在「我的」页面开通。", afterProduct: "超过 1 小时链接就失效了，之后回到原来的页面，还是可以按原价买。", tryPass: "想先试试的话，也可以先买一张 1 日通卡，当天问事、看自己都不限次。", tryPassBtn: "看 1 日通卡", btnRemind: "接着付款",
  },
  en: {
    subject: "Your payment didn't go through: {hex} (30% off for one hour)", subjectMember: "Your membership wasn't started (30% off for one hour)",
    leadQ: "On {date} you asked YaoFlow “{q}” and cast {hex}; the payment for the full reading didn't go through.", leadHex: "On {date} you cast {hex} on YaoFlow; the payment for the full reading didn't go through.", leadMember: "The payment for your membership just now didn't go through.",
    none: "Nothing was charged. If the payment page was the problem, another way to pay usually works.",
    offerDeep: "The link in this email works for one hour (until {until}) and takes 30% off this full reading: {offer} (was {base}).", offerMember: "The link in this email works for one hour (until {until}) and takes 30% off the first membership payment: {offer} (was {base}); after that the usual price.", offerPass: "The link in this email works for one hour (until {until}) and takes 30% off the {name}: {offer} (was {base}).",
    after: "After the hour the discount is gone; the cast stays, at the usual price.", afterMember: "After the hour the discount is gone; you can still join at the usual price.",
    what: "The full reading finishes this cast: the days it points to, the first step now and what to avoid — with {n} follow-up questions after.", help: "If paying gave you trouble, just reply to this email and we'll look.",
    btnDeep: "Read it at 30% off", btnMember: "Join at 30% off", foot: "This is the only email we'll send about it.",
    subjectPass: "Your payment didn't go through: {name} (30% off for one hour)", leadPass: "The payment for your {name} just now didn't go through.", afterPass: "After the hour the discount is gone; you can still get the {name} at the usual price.", btnPass: "Get the {name} at 30% off",
    subjectRemind: "Your membership wasn't started: the payment didn't go through", subjectProduct: "Your payment didn't go through: {product}", leadProduct: "The payment for “{product}” just now didn't go through.", offerRemind: "The link in this email works for one hour (until {until}) and picks up where you left off, at the same price: {base}.", afterRemind: "After the hour the link expires; you can still join from your account page.", afterProduct: "After the hour the link expires; you can still buy it at the usual price from the same page.", tryPass: "If you'd like to try it first, a 1-day pass gives you unlimited questions for the day.", tryPassBtn: "See the 1-day pass", btnRemind: "Finish paying",
  },
  ja: {
    subject: "先ほどのお支払いは完了していません：{hex}（1時間だけ30%オフ）", subjectMember: "メンバー登録が完了していません（1時間だけ30%オフ）",
    leadQ: "{date}にYaoFlowで「{q}」と問い、{hex}が出ました。本格鑑定のお支払いは完了していません。", leadHex: "{date}にYaoFlowで立てた{hex}、本格鑑定のお支払いは完了していません。", leadMember: "先ほどのメンバー登録のお支払いは完了していません。",
    none: "請求はありません。支払いページの問題なら、別の支払い方法で通ることが多いです。",
    offerDeep: "このメールのリンクは1時間（{until}まで）有効で、この本格鑑定が30%オフになります：{offer}（通常 {base}）。", offerMember: "このメールのリンクは1時間（{until}まで）有効で、メンバー初回のお支払いが30%オフになります：{offer}（通常 {base}）。2回目からは通常価格です。", offerPass: "このメールのリンクは1時間（{until}まで）有効で、{name}が30%オフになります：{offer}（通常 {base}）。",
    after: "1時間を過ぎると割引はなくなります。卦は残るので、通常価格で読めます。", afterMember: "1時間を過ぎると割引はなくなります。その後も通常価格で登録できます。",
    what: "本格鑑定はこの卦を最後まで読みます：時期はいつか、今の一歩と避けること。読んだあと{n}回まで質問できます。", help: "お支払いで困ったら、このメールにそのまま返信してください。",
    btnDeep: "30%オフで読む", btnMember: "30%オフで登録", foot: "この件のご連絡はこの一通だけです。",
    subjectPass: "先ほどのお支払いは完了していません：{name}（1時間だけ30%オフ）", leadPass: "先ほどの{name}のお支払いは完了していません。", afterPass: "1時間を過ぎると割引はなくなります。その後も通常価格で{name}を購入できます。", btnPass: "30%オフで{name}を購入",
    subjectRemind: "メンバー登録が完了していません：お支払いが完了しませんでした", subjectProduct: "お支払いが完了していません：{product}", leadProduct: "先ほどの「{product}」のお支払いは完了していません。", offerRemind: "このメールのリンクは1時間（{until}まで）有効で、同じ価格のまま続きからお支払いいただけます：{base}。", afterRemind: "1時間を過ぎるとリンクは無効になりますが、マイページからいつでも登録できます。", afterProduct: "1時間を過ぎるとリンクは無効になりますが、元のページから通常価格で購入できます。", tryPass: "まず試してみたい場合は、1日パスもあります。その日は何度でも占えます。", tryPassBtn: "1日パスを見る", btnRemind: "お支払いを続ける",
  },
  ko: {
    subject: "방금 결제가 완료되지 않았어요: {hex} (1시간 동안 30% 할인)", subjectMember: "멤버십이 시작되지 않았어요 (1시간 동안 30% 할인)",
    leadQ: "{date} YaoFlow에서 「{q}」라고 묻고 {hex}가 나왔는데, 심층 풀이 결제가 완료되지 않았어요.", leadHex: "{date} YaoFlow에서 뽑은 {hex}, 심층 풀이 결제가 완료되지 않았어요.", leadMember: "방금 멤버십 결제가 완료되지 않았어요.",
    none: "청구된 금액은 없어요. 결제 페이지 문제였다면 다른 결제 방법으로 대개 해결돼요.",
    offerDeep: "이 메일의 링크는 1시간({until}까지) 유효하고, 이 심층 풀이가 30% 할인돼요: {offer} (정가 {base}).", offerMember: "이 메일의 링크는 1시간({until}까지) 유효하고, 멤버십 첫 결제가 30% 할인돼요: {offer} (정가 {base}). 그다음부터는 정가예요.", offerPass: "이 메일의 링크는 1시간({until}까지) 유효하고, {name}가 30% 할인돼요: {offer} (정가 {base}).",
    after: "1시간이 지나면 할인은 끝나요. 괘는 그대로 있어 정가로 볼 수 있어요.", afterMember: "1시간이 지나면 할인은 끝나요. 그 뒤에도 정가로 가입할 수 있어요.",
    what: "심층 풀이는 이 괘를 끝까지 읽어요: 시기가 언제인지, 지금의 첫걸음과 피할 것, 그리고 {n}번까지 추가 질문.", help: "결제에 문제가 있었다면 이 메일에 바로 답장해 주세요.",
    btnDeep: "30% 할인으로 보기", btnMember: "30% 할인으로 가입", foot: "이 일로 보내는 메일은 이 한 통뿐이에요.",
    subjectPass: "방금 결제가 완료되지 않았어요: {name} (1시간 동안 30% 할인)", leadPass: "방금 {name} 결제가 완료되지 않았어요.", afterPass: "1시간이 지나면 할인은 끝나요. 그 뒤에도 정가로 {name}를 살 수 있어요.", btnPass: "30% 할인으로 {name} 구매",
    subjectRemind: "멤버십이 시작되지 않았어요: 결제가 완료되지 않았어요", subjectProduct: "결제가 완료되지 않았어요: {product}", leadProduct: "방금 「{product}」 결제가 완료되지 않았어요.", offerRemind: "이 메일의 링크는 1시간({until}까지) 유효하며, 같은 가격으로 이어서 결제할 수 있어요: {base}.", afterRemind: "1시간이 지나면 링크는 만료되지만, 내 계정 페이지에서 언제든 가입할 수 있어요.", afterProduct: "1시간이 지나면 링크는 만료되지만, 원래 페이지에서 정가로 구매할 수 있어요.", tryPass: "먼저 써 보고 싶다면 1일 패스도 있어요. 그날은 몇 번이든 물어볼 수 있어요.", tryPassBtn: "1일 패스 보기", btnRemind: "이어서 결제하기",
  },
  fr: {
    subject: "Votre paiement n'a pas abouti : {hex} (-30 % pendant une heure)", subjectMember: "Votre abonnement n'a pas démarré (-30 % pendant une heure)",
    leadQ: "Le {date}, vous avez demandé « {q} » sur YaoFlow et tiré {hex} ; le paiement de la lecture approfondie n'a pas abouti.", leadHex: "Le {date}, vous avez tiré {hex} sur YaoFlow ; le paiement de la lecture approfondie n'a pas abouti.", leadMember: "Le paiement de votre abonnement n'a pas abouti.",
    none: "Rien n'a été débité. Si la page de paiement posait problème, un autre moyen de paiement fonctionne en général.",
    offerDeep: "Le lien de cet e-mail est valable une heure (jusqu'à {until}) et retire 30 % à cette lecture approfondie : {offer} (au lieu de {base}).", offerMember: "Le lien de cet e-mail est valable une heure (jusqu'à {until}) et retire 30 % au premier paiement de l'abonnement : {offer} (au lieu de {base}) ; ensuite, le prix habituel.", offerPass: "Le lien de cet e-mail est valable une heure (jusqu'à {until}) et retire 30 % au {name} : {offer} (au lieu de {base}).",
    after: "Passé une heure, la remise disparaît ; le tirage reste, au prix habituel.", afterMember: "Passé une heure, la remise disparaît ; vous pourrez toujours vous abonner au prix habituel.",
    what: "La lecture approfondie va au bout de ce tirage : les jours qu'il indique, le premier pas et ce qu'il faut éviter — avec {n} questions de suivi.", help: "Si le paiement a posé problème, répondez simplement à cet e-mail.",
    btnDeep: "Lire à -30 %", btnMember: "S'abonner à -30 %", foot: "C'est le seul e-mail que nous enverrons à ce sujet.",
    subjectPass: "Votre paiement n'a pas abouti : {name} (-30 % pendant une heure)", leadPass: "Le paiement de votre {name} n'a pas abouti.", afterPass: "Passé une heure, la remise disparaît ; vous pourrez toujours acheter le {name} au prix habituel.", btnPass: "Acheter le {name} à -30 %",
    subjectRemind: "Votre abonnement n'a pas démarré : le paiement n'a pas abouti", subjectProduct: "Votre paiement n'a pas abouti : {product}", leadProduct: "Le paiement de « {product} » n'a pas abouti.", offerRemind: "Le lien de cet e-mail est valable une heure (jusqu'à {until}) et reprend là où vous vous étiez arrêté, au même prix : {base}.", afterRemind: "Passé une heure, le lien expire ; vous pourrez toujours vous abonner depuis votre compte.", afterProduct: "Passé une heure, le lien expire ; vous pourrez toujours l'acheter au prix habituel depuis la même page.", tryPass: "Pour essayer d'abord, un pass d'un jour donne des questions illimitées pour la journée.", tryPassBtn: "Voir le pass d'un jour", btnRemind: "Terminer le paiement",
  },
  de: {
    subject: "Ihre Zahlung ist nicht durchgegangen: {hex} (eine Stunde lang 30 % günstiger)", subjectMember: "Ihre Mitgliedschaft wurde nicht gestartet (eine Stunde lang 30 % günstiger)",
    leadQ: "Am {date} haben Sie bei YaoFlow „{q}“ gefragt und {hex} geworfen; die Zahlung für die Tiefendeutung ist nicht durchgegangen.", leadHex: "Am {date} haben Sie bei YaoFlow {hex} geworfen; die Zahlung für die Tiefendeutung ist nicht durchgegangen.", leadMember: "Die Zahlung für Ihre Mitgliedschaft ist nicht durchgegangen.",
    none: "Es wurde nichts abgebucht. Lag es an der Zahlungsseite, klappt es meist mit einer anderen Zahlungsart.",
    offerDeep: "Der Link in dieser E-Mail gilt eine Stunde (bis {until}) und macht diese Tiefendeutung 30 % günstiger: {offer} (statt {base}).", offerMember: "Der Link in dieser E-Mail gilt eine Stunde (bis {until}) und macht die erste Zahlung der Mitgliedschaft 30 % günstiger: {offer} (statt {base}); danach der normale Preis.", offerPass: "Der Link in dieser E-Mail gilt eine Stunde (bis {until}) und macht den {name} 30 % günstiger: {offer} (statt {base}).",
    after: "Nach der Stunde entfällt der Rabatt; der Wurf bleibt, zum normalen Preis.", afterMember: "Nach der Stunde entfällt der Rabatt; Sie können weiterhin zum normalen Preis beitreten.",
    what: "Die Tiefendeutung liest diesen Wurf zu Ende: auf welche Tage er zeigt, den ersten Schritt und was zu meiden ist — mit {n} Rückfragen danach.", help: "Gab es beim Bezahlen ein Problem, antworten Sie einfach auf diese E-Mail.",
    btnDeep: "Mit 30 % Rabatt lesen", btnMember: "Mit 30 % Rabatt beitreten", foot: "Dies ist die einzige E-Mail dazu.",
    subjectPass: "Ihre Zahlung ist nicht durchgegangen: {name} (eine Stunde lang 30 % günstiger)", leadPass: "Die Zahlung für Ihren {name} ist nicht durchgegangen.", afterPass: "Nach der Stunde entfällt der Rabatt; Sie können den {name} weiterhin zum normalen Preis kaufen.", btnPass: "Den {name} mit 30 % Rabatt kaufen",
    subjectRemind: "Ihre Mitgliedschaft wurde nicht gestartet: die Zahlung ist nicht durchgegangen", subjectProduct: "Ihre Zahlung ist nicht durchgegangen: {product}", leadProduct: "Die Zahlung für „{product}“ ist nicht durchgegangen.", offerRemind: "Der Link in dieser E-Mail gilt eine Stunde (bis {until}) und macht dort weiter, wo Sie aufgehört haben – zum selben Preis: {base}.", afterRemind: "Nach der Stunde läuft der Link ab; Sie können weiterhin über Ihr Konto beitreten.", afterProduct: "Nach der Stunde läuft der Link ab; Sie können es weiterhin zum normalen Preis auf derselben Seite kaufen.", tryPass: "Wenn Sie es erst ausprobieren möchten: Ein Tagespass gibt Ihnen für den Tag unbegrenzt Fragen.", tryPassBtn: "Zum Tagespass", btnRemind: "Zahlung abschließen",
  },
  es: {
    subject: "Tu pago no se completó: {hex} (30 % menos durante una hora)", subjectMember: "Tu membresía no se activó (30 % menos durante una hora)",
    leadQ: "El {date} preguntaste en YaoFlow «{q}» y salió {hex}; el pago de la lectura completa no se completó.", leadHex: "El {date} hiciste la tirada {hex} en YaoFlow; el pago de la lectura completa no se completó.", leadMember: "El pago de tu membresía no se completó.",
    none: "No se te cobró nada. Si el problema fue la página de pago, otra forma de pago suele funcionar.",
    offerDeep: "El enlace de este correo vale una hora (hasta las {until}) y descuenta un 30 % a esta lectura completa: {offer} (antes {base}).", offerMember: "El enlace de este correo vale una hora (hasta las {until}) y descuenta un 30 % al primer pago de la membresía: {offer} (antes {base}); después, el precio normal.", offerPass: "El enlace de este correo vale una hora (hasta las {until}) y descuenta un 30 % al {name}: {offer} (antes {base}).",
    after: "Pasada la hora, el descuento desaparece; la tirada sigue ahí, al precio normal.", afterMember: "Pasada la hora, el descuento desaparece; podrás unirte igual al precio normal.",
    what: "La lectura completa termina esta tirada: los días que señala, el primer paso y lo que conviene evitar, con {n} preguntas de seguimiento.", help: "Si tuviste problemas al pagar, responde a este correo y lo revisamos.",
    btnDeep: "Leerla con 30 % menos", btnMember: "Unirme con 30 % menos", foot: "Es el único correo que enviaremos sobre esto.",
    subjectPass: "Tu pago no se completó: {name} (30 % menos durante una hora)", leadPass: "El pago de tu {name} no se completó.", afterPass: "Pasada la hora, el descuento desaparece; podrás comprar igual el {name} al precio normal.", btnPass: "Comprar el {name} con 30 % menos",
    subjectRemind: "Tu membresía no se activó: el pago no se completó", subjectProduct: "Tu pago no se completó: {product}", leadProduct: "El pago de «{product}» no se completó.", offerRemind: "El enlace de este correo vale una hora (hasta las {until}) y retoma el pago donde lo dejaste, al mismo precio: {base}.", afterRemind: "Pasada la hora, el enlace caduca; podrás unirte igual desde tu cuenta.", afterProduct: "Pasada la hora, el enlace caduca; podrás comprarlo igual al precio normal desde la misma página.", tryPass: "Si prefieres probar antes, un pase de un día te da preguntas ilimitadas durante ese día.", tryPassBtn: "Ver el pase de un día", btnRemind: "Terminar el pago",
  },
  pt: {
    subject: "Seu pagamento não foi concluído: {hex} (30% off por uma hora)", subjectMember: "Sua assinatura não foi iniciada (30% off por uma hora)",
    leadQ: "Em {date} você perguntou ao YaoFlow «{q}» e tirou {hex}; o pagamento da leitura completa não foi concluído.", leadHex: "Em {date} você tirou {hex} no YaoFlow; o pagamento da leitura completa não foi concluído.", leadMember: "O pagamento da sua assinatura não foi concluído.",
    none: "Nada foi cobrado. Se o problema foi a página de pagamento, outra forma de pagar costuma funcionar.",
    offerDeep: "O link deste e-mail vale por uma hora (até {until}) e tira 30% desta leitura completa: {offer} (antes {base}).", offerMember: "O link deste e-mail vale por uma hora (até {until}) e tira 30% do primeiro pagamento da assinatura: {offer} (antes {base}); depois, o preço normal.", offerPass: "O link deste e-mail vale por uma hora (até {until}) e tira 30% do {name}: {offer} (antes {base}).",
    after: "Depois de uma hora o desconto acaba; a tiragem continua, pelo preço normal.", afterMember: "Depois de uma hora o desconto acaba; você ainda pode assinar pelo preço normal.",
    what: "A leitura completa vai até o fim desta tiragem: os dias que ela aponta, o primeiro passo e o que evitar — com {n} perguntas de acompanhamento.", help: "Se teve problema ao pagar, é só responder a este e-mail.",
    btnDeep: "Ler com 30% off", btnMember: "Assinar com 30% off", foot: "Este é o único e-mail que enviaremos sobre isso.",
    subjectPass: "Seu pagamento não foi concluído: {name} (30% off por uma hora)", leadPass: "O pagamento do seu {name} não foi concluído.", afterPass: "Depois de uma hora o desconto acaba; você ainda pode comprar o {name} pelo preço normal.", btnPass: "Comprar o {name} com 30% off",
    subjectRemind: "Sua assinatura não foi iniciada: o pagamento não foi concluído", subjectProduct: "Seu pagamento não foi concluído: {product}", leadProduct: "O pagamento de «{product}» não foi concluído.", offerRemind: "O link deste e-mail vale por uma hora (até {until}) e retoma o pagamento de onde parou, pelo mesmo preço: {base}.", afterRemind: "Depois de uma hora o link expira; você ainda pode assinar pela sua conta.", afterProduct: "Depois de uma hora o link expira; você ainda pode comprar pelo preço normal na mesma página.", tryPass: "Se quiser experimentar antes, um passe de um dia dá perguntas ilimitadas durante o dia.", tryPassBtn: "Ver o passe de um dia", btnRemind: "Concluir o pagamento",
  },
};
export const offerT = (locale: string): OfferCopy => OFFER_T[locale] ?? OFFER_T.en!;

const UNSUB: Record<string, string> = { "zh-hant": "退訂", zh: "退订", en: "Unsubscribe", ja: "配信停止", ko: "수신 거부", fr: "Se désabonner", de: "Abbestellen", es: "Darse de baja", pt: "Cancelar inscrição" };
const PAPER = "#f4f2ec", INK = "#14151c", INK_86 = "#333439", INK_66 = "#606063", INK_50 = "#7a7a7c", RULE = "#d0cfcb", CINNABAR = "#b5432f";
const FONT = "Georgia,'Songti SC','Noto Serif SC',serif";
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const fill = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k: string) => String(v[k] ?? ""));

export function buildRecoverOfferEmail(i: { p: PendingRow; locale: Locale; url: string; base: string; offer: string; until: string; unsub: string; passUrl?: string }): { subject: string; html: string; text: string } {
  const t = offerT(i.locale);
  // 10-23 进度表 113 / 111 ③: a membership or a one-off product — the same one letter, at its own price
  if (!discounted(i.p.kind)) return remindLetter(i, t);
  // 10-24 (Neil: 「会员是会员，通卡是通卡」): a pass is never called a membership — subject, lead, after-line and button
  // all name the pass (1 日／7 天／30 天通卡); 會員 wording is left for a renewing plan only
  const pass = i.p.kind === "pass";
  const member = i.p.kind === "month" || i.p.kind === "year";
  const sum = member || pass ? null : offerSummary(i.p, i.locale);
  const v = { date: sum?.date ?? "", q: sum?.q ?? "", hex: sum?.hex ?? "", offer: i.offer, base: i.base, until: i.until, n: FOLLOWUP_LIMIT, name: offerPassName(i.p, i.locale, true) };
  const lead = pass ? t.leadPass : member ? t.leadMember : sum?.q ? t.leadQ : t.leadHex;
  const offerLine = pass ? t.offerPass : member ? t.offerMember : t.offerDeep;
  const lines = [fill(lead, v), t.none, fill(offerLine, v), fill(pass ? t.afterPass : member ? t.afterMember : t.after, v), ...(member || pass ? [] : [fill(t.what, v)]), t.help];
  const btn = fill(pass ? t.btnPass : member ? t.btnMember : t.btnDeep, v);
  const html = `<!doctype html><html lang="${i.locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:${PAPER};color:${INK};font-family:${FONT};"><div style="max-width:560px;margin:0 auto;padding:40px 24px 36px;">
<p style="letter-spacing:.35em;font-size:12px;color:${INK_50};margin:0 0 28px;">YAOFLOW</p>
${lines.map((l, k) => `<p style="font-size:${k === 2 ? 17 : 15}px;line-height:1.8;margin:0 0 14px;color:${k === 2 ? INK : INK_86};">${k === 2 ? `<span style="color:${CINNABAR};">${esc(l)}</span>` : esc(l)}</p>`).join("\n")}
<p style="margin:18px 0 22px;"><a href="${esc(i.url)}" style="display:inline-block;background:${INK};color:${PAPER};text-decoration:none;padding:13px 28px;border-radius:2px;font-size:15px;">${esc(btn)} · ${esc(i.offer)}</a></p>
<hr style="border:none;border-top:1px solid ${RULE};margin:8px 0 14px;">
<p style="font-size:11px;color:${INK_50};line-height:1.6;margin:0;">${esc(t.foot)} <a href="${esc(i.unsub)}" style="color:${INK_66};">${esc(UNSUB[i.locale] ?? UNSUB.en!)}</a></p>
</div></body></html>`;
  const text = [...lines, "", `${btn} · ${i.offer}: ${i.url}`, "", t.foot, i.unsub].join("\n");
  return { subject: fill(pass ? t.subjectPass : member ? t.subjectMember : t.subject, v), html, text };
}

function remindLetter(i: { p: PendingRow; locale: Locale; url: string; base: string; until: string; unsub: string; passUrl?: string }, t: OfferCopy): { subject: string; html: string; text: string } {
  const member = i.p.kind === "month" || i.p.kind === "year";
  const v = { base: i.base, until: i.until, product: i.p.product };
  // 10-24 (#2915: this letter sent a reader with only Alipay back to a membership ten more times): in yuan, say that a
  // membership takes a card and that the passes take Alipay — before the line that offers one
  const cardOnly = member && i.p.currency.toUpperCase() === "CNY" ? [tongkaT(i.locale).memberCardOnly] : [];
  const lines = [member ? t.leadMember : fill(t.leadProduct, v), t.none, fill(t.offerRemind, v), member ? t.afterRemind : t.afterProduct, ...cardOnly, ...(member && i.passUrl ? [t.tryPass] : []), t.help];
  const hi = 2;
  const html = `<!doctype html><html lang="${i.locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:${PAPER};color:${INK};font-family:${FONT};"><div style="max-width:560px;margin:0 auto;padding:40px 24px 36px;">
<p style="letter-spacing:.35em;font-size:12px;color:${INK_50};margin:0 0 28px;">YAOFLOW</p>
${lines.map((l, k) => `<p style="font-size:${k === hi ? 17 : 15}px;line-height:1.8;margin:0 0 14px;color:${k === hi ? INK : INK_86};">${esc(l)}${member && i.passUrl && l === t.tryPass ? ` <a href="${esc(i.passUrl)}" style="color:${INK};">${esc(t.tryPassBtn)} →</a>` : ""}</p>`).join("\n")}
<p style="margin:18px 0 22px;"><a href="${esc(i.url)}" style="display:inline-block;background:${INK};color:${PAPER};text-decoration:none;padding:13px 28px;border-radius:2px;font-size:15px;">${esc(t.btnRemind)} · ${esc(i.base)}</a></p>
<hr style="border:none;border-top:1px solid ${RULE};margin:8px 0 14px;">
<p style="font-size:11px;color:${INK_50};line-height:1.6;margin:0;">${esc(t.foot)} <a href="${esc(i.unsub)}" style="color:${INK_66};">${esc(UNSUB[i.locale] ?? UNSUB.en!)}</a></p>
</div></body></html>`;
  const text = [...lines.map((l) => (member && i.passUrl && l === t.tryPass ? `${l} ${t.tryPassBtn}: ${i.passUrl}` : l)), "", `${t.btnRemind} · ${i.base}: ${i.url}`, "", t.foot, i.unsub].join("\n");
  return { subject: member ? t.subjectRemind : fill(t.subjectProduct, v), html, text };
}

export { castDateLabel, quoteOf };
