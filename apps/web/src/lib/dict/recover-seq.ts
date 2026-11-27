/**
 * 10-12 挽回信序列 (进度表 §一「付款没完成的挽回信」; Neil: 「做 1–4」). The letters to someone who ticked
 * 「沒付完時寄信提醒我」 and left the payment page unpaid: an hour, a day, three days and five days later. Each says
 * which letter it is and that they stop once paid or unsubscribed. The shared lines (what the full reading is, the
 * way back) come from lib/dict/recover.ts; these are the parts that change with the step. {price} = what the page
 * showed; {k} = this letter's number. Same keys in every language (test/recover-seq.test.ts).
 */
export interface RecoverSeqCopy {
  subject1: string; subject2: string; subject3: string; subject4: string;
  lead1: string;
  step2: string; step3: string; step4: string;
  price: string;
  foot: string; footLast: string;
  memSubject: string; memFoot: string;
}

export const RECOVER_SEQ_T: Record<string, RecoverSeqCopy> = {
  zh: {
    subject1: "刚才的付款没有完成：{hex}", subject2: "那一卦还在：{hex}", subject3: "卦里的日子在往前走：{hex}", subject4: "最后一封：{hex}",
    lead1: "刚才的付款没有完成，没有扣款。如果是付款页出了问题，换一种付款方式通常就行。",
    step2: "过了一天，这一卦还在，还是同一卦，不用再起。",
    step3: "卦里说的日子在往前走，早点看，能用上的日子越多。",
    step4: "之后不会再寄。",
    price: "这份深断是 {price}，和你当时看到的一样。",
    foot: "不想再收到这类信，点下面退订。", footLast: "这一卦的信到此为止。",
    memSubject: "会员还没开通", memFoot: "",
  },
  "zh-hant": {
    subject1: "剛才的付款沒有完成：{hex}", subject2: "那一卦還在：{hex}", subject3: "卦裡的日子在往前走：{hex}", subject4: "最後一封：{hex}",
    lead1: "剛才的付款沒有完成，沒有扣款。如果是付款頁出了問題，換一種付款方式通常就行。",
    step2: "過了一天，這一卦還在，還是同一卦，不用再起。",
    step3: "卦裡說的日子在往前走，早點看，能用上的日子越多。",
    step4: "之後不會再寄。",
    price: "這份深斷是 {price}，和你當時看到的一樣。",
    foot: "不想再收到這類信，點下面退訂。", footLast: "這一卦的信到此為止。",
    memSubject: "會員還沒開通", memFoot: "",
  },
  en: {
    subject1: "Your payment didn't go through: {hex}", subject2: "Your cast is still here: {hex}", subject3: "The days in your cast are moving: {hex}", subject4: "Last letter: {hex}",
    lead1: "The payment just now didn't go through, and nothing was charged. If the payment page was the problem, another way to pay usually works.",
    step2: "A day on, the cast is still here — the same figure, no need to cast again.",
    step3: "The days named in your cast are moving; the sooner you read it, the more of them you can use.",
    step4: "No more letters will follow.",
    price: "This full reading is {price}, as the page showed.",
    foot: "Don't want letters like this? Unsubscribe below.", footLast: "That's the last of them.",
    memSubject: "Your membership wasn't started", memFoot: "",
  },
  ja: {
    subject1: "先ほどのお支払いは完了していません：{hex}", subject2: "あの卦はまだ残っています：{hex}", subject3: "卦が示す日が近づいています：{hex}", subject4: "最後のお知らせ：{hex}",
    lead1: "先ほどのお支払いは完了しておらず、請求もありません。支払いページの問題なら、別の支払い方法で通ることが多いです。",
    step2: "一日たちましたが、この卦はそのまま残っています。同じ卦なので立て直す必要はありません。",
    step3: "卦が示す日は進んでいます。早めに読むほど、使える日が多く残ります。",
    step4: "これ以降はお送りしません。",
    price: "この本格鑑定は {price}（表示されていた金額のままです）。",
    foot: "この種のお知らせが不要でしたら、下のリンクから配信停止できます。", footLast: "お知らせはここまでです。",
    memSubject: "メンバー登録が完了していません", memFoot: "",
  },
  ko: {
    subject1: "방금 결제가 완료되지 않았어요: {hex}", subject2: "그 괘는 그대로 있어요: {hex}", subject3: "괘가 짚은 날이 다가와요: {hex}", subject4: "마지막 메일: {hex}",
    lead1: "방금 결제는 완료되지 않았고 청구도 없었어요. 결제 페이지 문제였다면 다른 결제 방법으로 대개 해결돼요.",
    step2: "하루가 지났지만 이 괘는 그대로 있어요. 같은 괘라 다시 뽑을 필요가 없어요.",
    step3: "괘에서 말한 날짜가 흘러가고 있어요. 일찍 볼수록 쓸 수 있는 날이 많아요.",
    step4: "이후로는 보내지 않아요.",
    price: "이 심층 풀이는 {price}이에요(당시 보신 금액 그대로).",
    foot: "이런 메일을 더 받고 싶지 않다면 아래에서 수신 거부하세요.", footLast: "메일은 여기까지예요.",
    memSubject: "멤버십이 아직 시작되지 않았어요", memFoot: "",
  },
  fr: {
    subject1: "Votre paiement n'a pas abouti : {hex}", subject2: "Votre tirage est toujours là : {hex}", subject3: "Les jours de votre tirage avancent : {hex}", subject4: "Dernier e-mail : {hex}",
    lead1: "Le paiement n'a pas abouti et rien n'a été débité. Si la page de paiement posait problème, un autre moyen de paiement fonctionne en général.",
    step2: "Un jour plus tard, le tirage est toujours là — la même figure, inutile de retirer.",
    step3: "Les jours indiqués par votre tirage passent ; plus tôt vous lisez, plus il en reste à utiliser.",
    step4: "Vous n'en recevrez plus d'autres.",
    price: "Cette lecture approfondie coûte {price}, comme affiché.",
    foot: "Vous ne voulez plus de ces e-mails ? Désinscrivez-vous ci-dessous.", footLast: "C'était le dernier.",
    memSubject: "Votre abonnement n'a pas démarré", memFoot: "",
  },
  de: {
    subject1: "Deine Zahlung ist nicht durchgegangen: {hex}", subject2: "Dein Wurf ist noch da: {hex}", subject3: "Die Tage deines Wurfs rücken näher: {hex}", subject4: "Letzte E-Mail: {hex}",
    lead1: "Die Zahlung eben ist nicht durchgegangen, es wurde nichts abgebucht. Lag es an der Zahlungsseite, klappt eine andere Zahlart meistens.",
    step2: "Einen Tag später ist der Wurf noch da — dasselbe Bild, kein neuer Wurf nötig.",
    step3: "Die Tage aus deinem Wurf vergehen; je früher du liest, desto mehr kannst du nutzen.",
    step4: "Danach kommen keine weiteren.",
    price: "Diese Tiefendeutung kostet {price}, wie angezeigt.",
    foot: "Keine solchen E-Mails mehr? Unten abmelden.", footLast: "Das war die letzte.",
    memSubject: "Deine Mitgliedschaft wurde nicht gestartet", memFoot: "",
  },
  es: {
    subject1: "Tu pago no se completó: {hex}", subject2: "Tu tirada sigue aquí: {hex}", subject3: "Los días de tu tirada avanzan: {hex}", subject4: "Último correo: {hex}",
    lead1: "El pago no se completó y no se cobró nada. Si el problema fue la página de pago, otro método suele funcionar.",
    step2: "Un día después, la tirada sigue aquí: la misma figura, no hace falta tirar de nuevo.",
    step3: "Los días que señala tu tirada avanzan; cuanto antes la leas, más días podrás usar.",
    step4: "No enviaremos más.",
    price: "Esta lectura completa cuesta {price}, como se mostraba.",
    foot: "¿No quieres más correos así? Date de baja abajo.", footLast: "Fue el último.",
    memSubject: "Tu membresía no se inició", memFoot: "",
  },
  pt: {
    subject1: "Seu pagamento não foi concluído: {hex}", subject2: "Sua tiragem continua aqui: {hex}", subject3: "Os dias da sua tiragem estão passando: {hex}", subject4: "Último e-mail: {hex}",
    lead1: "O pagamento não foi concluído e nada foi cobrado. Se o problema foi a página de pagamento, outra forma de pagar costuma funcionar.",
    step2: "Um dia depois, a tiragem continua aqui — a mesma figura, não precisa tirar de novo.",
    step3: "Os dias que a tiragem aponta estão passando; quanto antes ler, mais dias poderá usar.",
    step4: "Não enviaremos mais.",
    price: "Esta leitura completa custa {price}, como foi mostrado.",
    foot: "Não quer mais e-mails assim? Cancele abaixo.", footLast: "Foi o último.",
    memSubject: "Sua assinatura não foi iniciada", memFoot: "",
  },
};

export function rsT(locale: string, key: keyof RecoverSeqCopy, vars: Record<string, string | number> = {}): string {
  const table = RECOVER_SEQ_T[locale] ?? RECOVER_SEQ_T.en!;
  return table[key].replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? `{${k}}`));
}
