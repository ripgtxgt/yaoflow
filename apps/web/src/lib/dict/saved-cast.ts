/**
 * 10-02 存到信箱 — the two letters: the cast itself (asked for, sent at once) and the one reminder a day later
 * (commercial: unsubscribe link, (광고) in Korean, added by sendEmail for its kind).
 */
export const SAVED_T = {
  zh: {
    sSubject: "你存下的卦：{hex}", sLead: "你在 YaoFlow 存下了这一卦。", sAsked: "你问：「{q}」", sGot: "得到：{hex}", sFree: "免费的那一句：{teaser}",
    sBack: "随时可以回到这一卦——同一卦，不用再起。", sCta: "回到这一卦", sNext: "明天我们会再寄一封提醒（附深断的价格），只有这一封。", sStop: "不想收到这封提醒",
    fSubject: "「{qShort}」——{hex}的深断还在等你", fLead: "昨天你存下了这一卦：{hex}。你问：「{q}」",
    fWhat: "深断会在这一卦上告诉你：哪一天前后会有动静（应期）、现在先做的一步、要避开的，读完还能追问 {n} 次。",
    fPriceFirst: "第一次看深断是 {price}（原价 {full}）。", fPrice: "深断 {price}。",
    fPassFirst: "用 1 日通卡看深断：首张 {price}（之后 {full}），24 小时内其他事也不限次。", fPass: "用 1 日通卡看深断：{price}，24 小时内其他事也不限次。", fCta: "回到这一卦，看深断",
    fFoot: "这是你存下这一卦时说好的唯一一封提醒，之后不会再寄。", unsub: "不想再收到这类信",
  },
  "zh-hant": {
    sSubject: "你存下的卦：{hex}", sLead: "你在 YaoFlow 存下了這一卦。", sAsked: "你問：「{q}」", sGot: "得到：{hex}", sFree: "免費的那一句：{teaser}",
    sBack: "隨時可以回到這一卦——同一卦，不用再起。", sCta: "回到這一卦", sNext: "明天我們會再寄一封提醒（附深斷的價格），只有這一封。", sStop: "不想收到這封提醒",
    fSubject: "「{qShort}」——{hex}的深斷還在等你", fLead: "昨天你存下了這一卦：{hex}。你問：「{q}」",
    fWhat: "深斷會在這一卦上告訴你：哪一天前後會有動靜（應期）、現在先做的一步、要避開的，讀完還能追問 {n} 次。",
    fPriceFirst: "第一次看深斷是 {price}（原價 {full}）。", fPrice: "深斷 {price}。",
    fPassFirst: "用 1 日通卡看深斷：首張 {price}（之後 {full}），24 小時內其他事也不限次。", fPass: "用 1 日通卡看深斷：{price}，24 小時內其他事也不限次。", fCta: "回到這一卦，看深斷",
    fFoot: "這是你存下這一卦時說好的唯一一封提醒，之後不會再寄。", unsub: "不想再收到這類信",
  },
  en: {
    sSubject: "Your saved cast: {hex}", sLead: "You saved this cast on YaoFlow.", sAsked: "You asked: “{q}”", sGot: "You drew: {hex}", sFree: "The free line: {teaser}",
    sBack: "Come back to it any time — the same figure, no need to cast again.", sCta: "Back to this cast", sNext: "Tomorrow we'll send one reminder (with the full reading's price) — just that one.", sStop: "No reminder, thanks",
    fSubject: "“{qShort}” — the full reading of {hex} is still here", fLead: "Yesterday you saved this cast: {hex}. You asked: “{q}”",
    fWhat: "The full reading tells you, on this very figure: around which day things move (the timing), the step to take now, what to avoid — and you can ask {n} follow-up questions.",
    fPriceFirst: "Your first full reading is {price} (normally {full}).", fPrice: "The full reading is {price}.",
    fPassFirst: "Read it in full with a 1-day pass: your first pass is {price} (then {full}), and for 24 hours anything else you ask is included too.", fPass: "Read it in full with a 1-day pass for {price} — for 24 hours anything else you ask is included too.", fCta: "Back to this cast — read it in full",
    fFoot: "This is the one reminder you agreed to when you saved the cast; there won't be another.", unsub: "Stop letters like this",
  },
  ja: {
    sSubject: "保存した卦：{hex}", sLead: "YaoFlow でこの卦を保存しました。", sAsked: "問い：「{q}」", sGot: "得た卦：{hex}", sFree: "無料の一言：{teaser}",
    sBack: "いつでもこの卦に戻れます——同じ卦なので、立て直す必要はありません。", sCta: "この卦に戻る", sNext: "明日、本格鑑定の価格のお知らせを一通だけお送りします。", sStop: "お知らせは不要",
    fSubject: "「{qShort}」——{hex}の本格鑑定はまだここにあります", fLead: "昨日、この卦を保存されました：{hex}。問い：「{q}」",
    fWhat: "本格鑑定では、この卦にもとづいて、いつ頃に動きがあるか（応期の目安）、いま取る一歩、避けることをお伝えし、読んだあと {n} 回まで質問できます。",
    fPriceFirst: "初めての本格鑑定は {price}（通常 {full}）です。", fPrice: "本格鑑定は {price} です。",
    fPassFirst: "1日パスで本格鑑定が読めます。初回 {price}（以降 {full}）、24時間はほかの相談も回数制限なしです。", fPass: "1日パス {price} で本格鑑定が読めます。24時間はほかの相談も回数制限なしです。", fCta: "この卦に戻って本格鑑定を見る",
    fFoot: "保存のときにお約束した一度きりのお知らせです。これ以上はお送りしません。", unsub: "このようなメールを停止",
  },
  ko: {
    sSubject: "저장한 괘: {hex}", sLead: "YaoFlow에서 이 괘를 저장했어요.", sAsked: "물은 것: “{q}”", sGot: "얻은 괘: {hex}", sFree: "무료 한 줄: {teaser}",
    sBack: "언제든 이 괘로 돌아올 수 있어요——같은 괘라 다시 뽑을 필요가 없어요.", sCta: "이 괘로 돌아가기", sNext: "내일 심층 풀이 가격 안내를 한 번만 보내 드려요.", sStop: "안내 받지 않기",
    fSubject: "“{qShort}”——{hex}의 심층 풀이가 아직 기다리고 있어요", fLead: "어제 이 괘를 저장했어요: {hex}. 물은 것: “{q}”",
    fWhat: "심층 풀이는 바로 이 괘로 알려 드려요: 언제쯤 움직임이 있는지(응기), 지금 할 한 걸음, 피해야 할 것——읽은 뒤 {n}번까지 더 물어볼 수 있어요.",
    fPriceFirst: "첫 심층 풀이는 {price}(정가 {full})예요.", fPrice: "심층 풀이는 {price}예요.",
    fPassFirst: "1일 패스로 심층 풀이를 볼 수 있어요. 첫 패스 {price}(이후 {full}), 24시간 동안 다른 질문도 무제한이에요.", fPass: "1일 패스 {price}로 심층 풀이를 볼 수 있어요. 24시간 동안 다른 질문도 무제한이에요.", fCta: "이 괘로 돌아가 심층 풀이 보기",
    fFoot: "저장할 때 약속한 단 한 번의 안내예요. 더는 보내지 않아요.", unsub: "이런 메일 그만 받기",
  },
  fr: {
    sSubject: "Votre tirage enregistré : {hex}", sLead: "Vous avez enregistré ce tirage sur YaoFlow.", sAsked: "Votre question : « {q} »", sGot: "Votre tirage : {hex}", sFree: "La ligne offerte : {teaser}",
    sBack: "Revenez-y quand vous voulez — la même figure, inutile de retirer.", sCta: "Revenir à ce tirage", sNext: "Demain, nous vous enverrons un seul rappel (avec le prix de la lecture approfondie).", sStop: "Pas de rappel, merci",
    fSubject: "« {qShort} » — la lecture approfondie de {hex} vous attend", fLead: "Hier, vous avez enregistré ce tirage : {hex}. Votre question : « {q} »",
    fWhat: "La lecture approfondie vous dit, sur cette figure même : vers quel jour les choses bougent (l'échéance), le pas à faire maintenant, ce qu'il faut éviter — et vous pouvez poser {n} questions de suivi.",
    fPriceFirst: "Votre première lecture approfondie coûte {price} (au lieu de {full}).", fPrice: "La lecture approfondie coûte {price}.",
    fPassFirst: "Avec un pass 1 jour, vous la lisez en entier : premier pass {price} (ensuite {full}), et pendant 24 heures tout le reste est inclus aussi.", fPass: "Avec un pass 1 jour à {price}, vous la lisez en entier — et pendant 24 heures tout le reste est inclus aussi.", fCta: "Revenir à ce tirage et lire la suite",
    fFoot: "C'est le seul rappel convenu quand vous avez enregistré le tirage ; il n'y en aura pas d'autre.", unsub: "Ne plus recevoir ce type de message",
  },
  de: {
    sSubject: "Dein gespeicherter Wurf: {hex}", sLead: "Du hast diesen Wurf auf YaoFlow gespeichert.", sAsked: "Deine Frage: „{q}“", sGot: "Dein Bild: {hex}", sFree: "Die kostenlose Zeile: {teaser}",
    sBack: "Du kannst jederzeit zurückkommen — dasselbe Bild, kein neuer Wurf nötig.", sCta: "Zurück zu diesem Wurf", sNext: "Morgen schicken wir dir eine einzige Erinnerung (mit dem Preis der Tiefendeutung).", sStop: "Keine Erinnerung, danke",
    fSubject: "„{qShort}“ — die Tiefendeutung zu {hex} wartet noch", fLead: "Gestern hast du diesen Wurf gespeichert: {hex}. Deine Frage: „{q}“",
    fWhat: "Die Tiefendeutung sagt dir an genau diesem Bild: um welchen Tag sich etwas bewegt (das Zeitfenster), den Schritt für jetzt, was du meiden solltest — und du kannst {n} Folgefragen stellen.",
    fPriceFirst: "Deine erste Tiefendeutung kostet {price} (sonst {full}).", fPrice: "Die Tiefendeutung kostet {price}.",
    fPassFirst: "Mit einem 1-Tages-Pass liest du sie ganz: erster Pass {price} (danach {full}), und 24 Stunden lang ist auch alles andere enthalten.", fPass: "Mit einem 1-Tages-Pass für {price} liest du sie ganz — 24 Stunden lang ist auch alles andere enthalten.", fCta: "Zurück zum Wurf und ganz lesen",
    fFoot: "Das ist die eine Erinnerung, die beim Speichern vereinbart war; weitere kommen nicht.", unsub: "Solche Nachrichten abbestellen",
  },
  es: {
    sSubject: "Tu tirada guardada: {hex}", sLead: "Guardaste esta tirada en YaoFlow.", sAsked: "Preguntaste: «{q}»", sGot: "Te salió: {hex}", sFree: "La línea gratuita: {teaser}",
    sBack: "Vuelve cuando quieras: es la misma figura, no hace falta tirar de nuevo.", sCta: "Volver a esta tirada", sNext: "Mañana te enviaremos un único recordatorio (con el precio de la lectura completa).", sStop: "Sin recordatorio, gracias",
    fSubject: "«{qShort}»: la lectura completa de {hex} sigue aquí", fLead: "Ayer guardaste esta tirada: {hex}. Preguntaste: «{q}»",
    fWhat: "La lectura completa te dice, sobre esta misma figura: hacia qué día se moverán las cosas (el plazo), el paso que dar ahora y qué evitar; y puedes hacer {n} preguntas de seguimiento.",
    fPriceFirst: "Tu primera lectura completa cuesta {price} (normalmente {full}).", fPrice: "La lectura completa cuesta {price}.",
    fPassFirst: "Con un pase de 1 día la lees completa: primer pase {price} (luego {full}), y durante 24 horas todo lo demás también está incluido.", fPass: "Con un pase de 1 día por {price} la lees completa; durante 24 horas todo lo demás también está incluido.", fCta: "Volver a la tirada y leerla completa",
    fFoot: "Este es el único recordatorio acordado al guardar la tirada; no habrá otro.", unsub: "Dejar de recibir estos mensajes",
  },
  pt: {
    sSubject: "Sua tiragem salva: {hex}", sLead: "Você salvou esta tiragem no YaoFlow.", sAsked: "Você perguntou: “{q}”", sGot: "Saiu: {hex}", sFree: "A linha grátis: {teaser}",
    sBack: "Volte quando quiser — é a mesma figura, não precisa tirar de novo.", sCta: "Voltar a esta tiragem", sNext: "Amanhã enviaremos um único lembrete (com o preço da leitura completa).", sStop: "Sem lembrete, obrigado",
    fSubject: "“{qShort}” — a leitura completa de {hex} ainda está aqui", fLead: "Ontem você salvou esta tiragem: {hex}. Você perguntou: “{q}”",
    fWhat: "A leitura completa diz, sobre esta mesma figura: por volta de que dia as coisas se movem (o prazo), o passo a dar agora e o que evitar — e você pode fazer {n} perguntas de acompanhamento.",
    fPriceFirst: "Sua primeira leitura completa custa {price} (normalmente {full}).", fPrice: "A leitura completa custa {price}.",
    fPassFirst: "Com um passe de 1 dia você a lê completa: primeiro passe {price} (depois {full}), e durante 24 horas tudo o mais também está incluído.", fPass: "Com um passe de 1 dia por {price} você a lê completa; durante 24 horas tudo o mais também está incluído.", fCta: "Voltar à tiragem e ler completa",
    fFoot: "Este é o único lembrete combinado ao salvar a tiragem; não haverá outro.", unsub: "Parar de receber mensagens assim",
  },
} as const;

export type SavedKey = keyof (typeof SAVED_T)["zh"];
export function svT(locale: string, key: SavedKey, vars: Record<string, string | number> = {}): string {
  const table = (SAVED_T as Record<string, Record<SavedKey, string>>)[locale] ?? SAVED_T.en;
  return table[key].replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? `{${k}}`));
}
