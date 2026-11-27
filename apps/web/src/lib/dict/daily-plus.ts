/**
 * 今天的三卦 · 加强互动 (09-26, Neil: 「1，2，3 都做吧」):
 * ① write down what the pile brought to mind and cast on it, ② one-tap
 * reaction with what others picked, ③ tomorrow's three by email (double opt-in).
 */
export interface DailyPlusCopy {
  askLead: string; askPh: string; askGo: string;
  reactQ: string; reactHit: string; reactMiss: string; thanks: string;
  statPick: string; statHit: string; statFew: string;
  tomorrow: string;
  subLead: string; subPh: string; subGo: string; subNote: string; subSent: string; subOk: string; subBad: string; unsubOk: string; subError: string;
  mailSubject: string; mailLead: string; mailPile: string; mailCta: string; mailWhy: string; mailUnsub: string;
  confSubject: string; confBody: string; confCta: string; confIgnore: string;
}

export const DAILY_PLUS_T: Record<string, DailyPlusCopy> = {
  zh: {
    askLead: "这一卦让你想到哪件事？写下来，用它起你自己的一卦。", askPh: "例如：这个月该不该跟主管提加薪", askGo: "用这件事起卦",
    reactQ: "这一卦说中你了吗？", reactHit: "说中了", reactMiss: "没感觉", thanks: "记下了，谢谢。",
    statPick: "今天 {pct}% 的人选了这一堆", statHit: "其中 {pct}% 说说中了", statFew: "今天你是第 {n} 位选这一堆的人",
    tomorrow: "每天零点（北京/台北时间）换新的三卦。",
    subLead: "每天早上把今天的三卦寄给你", subPh: "你的邮箱", subGo: "订阅", subNote: "只寄这一封，每封都能一键退订。我们会先寄一封确认信，点了才开始。",
    subSent: "确认信已寄出，点信里的按钮就开始。", subOk: "订好了，明天早上见。", subBad: "这个邮箱看起来不太对。", unsubOk: "已退订每日三卦，不会再寄了。", subError: "暂时没寄出去，请稍后再试。",
    mailSubject: "今天的三卦：{a} · {b} · {c}", mailLead: "凭直觉选一堆，看看它今天对你说什么。", mailPile: "第 {n} 堆", mailCta: "去选一堆",
    mailWhy: "你订阅了 YaoFlow 的每日三卦，所以收到这封信。", mailUnsub: "退订每日三卦",
    confSubject: "确认订阅每日三卦", confBody: "点下面的按钮，每天早上就会收到今天的三卦。", confCta: "确认订阅", confIgnore: "如果不是你本人申请的，忽略这封信就好，我们不会再寄。",
  },
  "zh-hant": {
    askLead: "這一卦讓你想到哪件事？寫下來，用它起你自己的一卦。", askPh: "例如：這個月該不該跟主管提加薪", askGo: "用這件事起卦",
    reactQ: "這一卦說中你了嗎？", reactHit: "說中了", reactMiss: "沒感覺", thanks: "記下了，謝謝。",
    statPick: "今天 {pct}% 的人選了這一堆", statHit: "其中 {pct}% 說說中了", statFew: "今天你是第 {n} 位選這一堆的人",
    tomorrow: "每天零點（台北時間）換新的三卦。",
    subLead: "每天早上把今天的三卦寄給你", subPh: "你的信箱", subGo: "訂閱", subNote: "只寄這一封，每封都能一鍵退訂。我們會先寄一封確認信，點了才開始。",
    subSent: "確認信已寄出，點信裡的按鈕就開始。", subOk: "訂好了，明天早上見。", subBad: "這個信箱看起來不太對。", unsubOk: "已退訂每日三卦，不會再寄了。", subError: "暫時沒寄出去，請稍後再試。",
    mailSubject: "今天的三卦：{a} · {b} · {c}", mailLead: "憑直覺選一堆，看看它今天對你說什麼。", mailPile: "第 {n} 堆", mailCta: "去選一堆",
    mailWhy: "你訂閱了 YaoFlow 的每日三卦，所以收到這封信。", mailUnsub: "退訂每日三卦",
    confSubject: "確認訂閱每日三卦", confBody: "點下面的按鈕，每天早上就會收到今天的三卦。", confCta: "確認訂閱", confIgnore: "如果不是你本人申請的，忽略這封信就好，我們不會再寄。",
  },
  en: {
    askLead: "What did this bring to mind? Write it down and cast your own on it.", askPh: "e.g. Should I ask for a raise this month?", askGo: "Cast on this",
    reactQ: "Did this one land for you?", reactHit: "It did", reactMiss: "Not really", thanks: "Noted — thank you.",
    statPick: "{pct}% of today's visitors picked this pile", statHit: "{pct}% of them said it landed", statFew: "You are #{n} to pick this pile today",
    tomorrow: "A new three every day at midnight, Taipei time (UTC+8).",
    subLead: "Get today's three by email each morning", subPh: "Your email", subGo: "Subscribe", subNote: "Just this one email, with one-click unsubscribe in each. We'll send a confirmation first — nothing starts until you click it.",
    subSent: "Confirmation sent — click the button in it to start.", subOk: "You're in. See you tomorrow morning.", subBad: "That address doesn't look right.", unsubOk: "Unsubscribed from the daily three. No more emails.", subError: "Couldn't send just now — please try again shortly.",
    mailSubject: "Today's three: {a} · {b} · {c}", mailLead: "Pick one by instinct and see what it says to you today.", mailPile: "Pile {n}", mailCta: "Pick a pile",
    mailWhy: "You're getting this because you subscribed to YaoFlow's daily three.", mailUnsub: "Unsubscribe from the daily three",
    confSubject: "Confirm your daily three", confBody: "Click below and you'll get today's three every morning.", confCta: "Confirm", confIgnore: "If you didn't ask for this, just ignore this email — we won't write again.",
  },
  ja: {
    askLead: "この卦で思い浮かんだことは？ 書き出して、自分の一卦を立ててみましょう。", askPh: "例：今月、上司に昇給を相談すべき？", askGo: "このことで卦を立てる",
    reactQ: "この卦、その通りになっていましたか？", reactHit: "その通り", reactMiss: "ピンとこない", thanks: "記録しました。ありがとう。",
    statPick: "今日 {pct}% の人がこの山を選びました", statHit: "そのうち {pct}% が「その通り」", statFew: "今日この山を選んだ {n} 人目です",
    tomorrow: "毎日 0 時（台北時間）に新しい三卦に替わります。",
    subLead: "今日の三卦を毎朝メールで", subPh: "メールアドレス", subGo: "登録", subNote: "届くのはこの1通だけ、毎回ワンクリックで解除できます。まず確認メールを送ります。",
    subSent: "確認メールを送りました。中のボタンを押すと始まります。", subOk: "登録しました。明日の朝お届けします。", subBad: "このアドレスは正しくないようです。", unsubOk: "毎日の三卦の配信を停止しました。", subError: "送信できませんでした。少し後でお試しください。",
    mailSubject: "今日の三卦：{a} · {b} · {c}", mailLead: "直感でひとつ選んで、今日のあなたへの言葉を見てみましょう。", mailPile: "{n} 番目の山", mailCta: "山を選ぶ",
    mailWhy: "YaoFlow の「毎日の三卦」に登録されたため、このメールをお送りしています。", mailUnsub: "毎日の三卦を解除",
    confSubject: "毎日の三卦の登録確認", confBody: "下のボタンを押すと、毎朝今日の三卦が届きます。", confCta: "登録を確認", confIgnore: "お心当たりがなければ、このメールは無視してください。今後お送りしません。",
  },
  ko: {
    askLead: "이 괘를 보고 떠오른 일이 있나요? 적어서 나만의 괘를 뽑아 보세요.", askPh: "예: 이번 달에 연봉 인상을 말해야 할까?", askGo: "이 일로 괘 뽑기",
    reactQ: "이 괘가 와닿았나요?", reactHit: "맞았어요", reactMiss: "잘 모르겠어요", thanks: "기록했어요. 고마워요.",
    statPick: "오늘 {pct}%가 이 더미를 골랐어요", statHit: "그중 {pct}%가 맞았다고 했어요", statFew: "오늘 이 더미를 고른 {n}번째 사람이에요",
    tomorrow: "매일 자정(타이베이 시간) 새로운 세 괘로 바뀝니다.",
    subLead: "매일 아침 오늘의 세 괘를 메일로", subPh: "이메일", subGo: "구독", subNote: "이 메일 하나만 보내며, 매번 한 번에 해지할 수 있어요. 먼저 확인 메일을 보내요.",
    subSent: "확인 메일을 보냈어요. 메일 속 버튼을 누르면 시작돼요.", subOk: "구독 완료. 내일 아침에 만나요.", subBad: "이메일 주소가 올바르지 않아 보여요.", unsubOk: "매일 세 괘 구독을 해지했어요.", subError: "지금은 보내지 못했어요. 잠시 후 다시 시도해 주세요.",
    mailSubject: "오늘의 세 괘: {a} · {b} · {c}", mailLead: "직감으로 하나를 골라 오늘 나에게 하는 말을 확인해 보세요.", mailPile: "{n}번 더미", mailCta: "더미 고르기",
    mailWhy: "YaoFlow 매일 세 괘를 구독하셔서 이 메일을 받으셨어요.", mailUnsub: "매일 세 괘 구독 해지",
    confSubject: "매일 세 괘 구독 확인", confBody: "아래 버튼을 누르면 매일 아침 오늘의 세 괘를 받아요.", confCta: "구독 확인", confIgnore: "직접 신청하지 않았다면 이 메일은 무시하세요. 다시 보내지 않아요.",
  },
  fr: {
    askLead: "À quoi ce tirage vous a-t-il fait penser ? Écrivez-le et tirez votre propre hexagramme dessus.", askPh: "ex. : Demander une augmentation ce mois-ci ?", askGo: "Tirer sur cette question",
    reactQ: "Ce tirage vous a-t-il parlé ?", reactHit: "Oui", reactMiss: "Pas vraiment", thanks: "C'est noté, merci.",
    statPick: "{pct} % des visiteurs du jour ont choisi ce tas", statHit: "{pct} % d'entre eux disent qu'il leur a parlé", statFew: "Vous êtes la {n}e personne à choisir ce tas aujourd'hui",
    tomorrow: "Trois nouveaux tirages chaque jour à minuit, heure de Taipei (UTC+8).",
    subLead: "Recevoir les trois du jour chaque matin", subPh: "Votre e-mail", subGo: "S'abonner", subNote: "Uniquement cet e-mail, avec désabonnement en un clic dans chacun. Nous envoyons d'abord une confirmation.",
    subSent: "Confirmation envoyée — cliquez sur le bouton pour commencer.", subOk: "C'est fait. À demain matin.", subBad: "Cette adresse ne semble pas correcte.", unsubOk: "Désabonné·e des trois du jour.", subError: "Envoi impossible pour l'instant — réessayez bientôt.",
    mailSubject: "Les trois du jour : {a} · {b} · {c}", mailLead: "Choisissez-en un d'instinct et voyez ce qu'il vous dit aujourd'hui.", mailPile: "Tas {n}", mailCta: "Choisir un tas",
    mailWhy: "Vous recevez cet e-mail car vous êtes abonné·e aux trois du jour de YaoFlow.", mailUnsub: "Se désabonner des trois du jour",
    confSubject: "Confirmez vos trois du jour", confBody: "Cliquez ci-dessous pour recevoir les trois du jour chaque matin.", confCta: "Confirmer", confIgnore: "Si ce n'est pas vous, ignorez simplement cet e-mail — nous ne vous écrirons plus.",
  },
  de: {
    askLead: "Woran hat dich das erinnert? Schreib es auf und wirf dein eigenes Zeichen darauf.", askPh: "z. B. Soll ich diesen Monat nach einer Gehaltserhöhung fragen?", askGo: "Darauf werfen",
    reactQ: "Hat es dich getroffen?", reactHit: "Ja", reactMiss: "Eher nicht", thanks: "Notiert — danke.",
    statPick: "{pct} % der heutigen Besucher haben diesen Stapel gewählt", statHit: "{pct} % davon sagen, es hat getroffen", statFew: "Du bist heute Nr. {n}, die diesen Stapel wählt",
    tomorrow: "Jeden Tag um Mitternacht (Taipeh-Zeit, UTC+8) drei neue.",
    subLead: "Die drei des Tages jeden Morgen per E-Mail", subPh: "Deine E-Mail", subGo: "Abonnieren", subNote: "Nur diese eine Mail, jede mit Abmeldung per Klick. Zuerst kommt eine Bestätigung.",
    subSent: "Bestätigung gesendet — klick auf den Button darin, um zu starten.", subOk: "Erledigt. Bis morgen früh.", subBad: "Diese Adresse sieht nicht richtig aus.", unsubOk: "Von den drei des Tages abgemeldet.", subError: "Gerade nicht versendet — bitte gleich noch einmal versuchen.",
    mailSubject: "Die drei des Tages: {a} · {b} · {c}", mailLead: "Wähle einen aus dem Bauch heraus und sieh, was er dir heute sagt.", mailPile: "Stapel {n}", mailCta: "Stapel wählen",
    mailWhy: "Du bekommst diese Mail, weil du die drei des Tages von YaoFlow abonniert hast.", mailUnsub: "Von den drei des Tages abmelden",
    confSubject: "Bestätige die drei des Tages", confBody: "Klick unten, dann bekommst du jeden Morgen die drei des Tages.", confCta: "Bestätigen", confIgnore: "Warst du das nicht, ignoriere diese Mail einfach — wir schreiben nicht wieder.",
  },
  es: {
    askLead: "¿Qué te vino a la mente? Escríbelo y haz tu propia tirada sobre ello.", askPh: "p. ej.: ¿Pido un aumento este mes?", askGo: "Tirar sobre esto",
    reactQ: "¿Te habló esta tirada?", reactHit: "Sí", reactMiss: "No mucho", thanks: "Anotado, gracias.",
    statPick: "El {pct}% de quienes vinieron hoy eligió este montón", statHit: "El {pct}% de ellos dice que le habló", statFew: "Eres la persona n.º {n} que elige este montón hoy",
    tomorrow: "Tres nuevas cada día a medianoche, hora de Taipéi (UTC+8).",
    subLead: "Recibe las tres del día cada mañana", subPh: "Tu correo", subGo: "Suscribirme", subNote: "Solo este correo, con baja en un clic en cada uno. Primero te enviamos una confirmación.",
    subSent: "Confirmación enviada: pulsa el botón del correo para empezar.", subOk: "Listo. Nos vemos mañana por la mañana.", subBad: "Esa dirección no parece correcta.", unsubOk: "Te diste de baja de las tres del día.", subError: "No se pudo enviar ahora; inténtalo en un momento.",
    mailSubject: "Las tres de hoy: {a} · {b} · {c}", mailLead: "Elige una por intuición y mira qué te dice hoy.", mailPile: "Montón {n}", mailCta: "Elegir un montón",
    mailWhy: "Recibes este correo porque te suscribiste a las tres del día de YaoFlow.", mailUnsub: "Darme de baja de las tres del día",
    confSubject: "Confirma las tres del día", confBody: "Pulsa abajo y cada mañana recibirás las tres del día.", confCta: "Confirmar", confIgnore: "Si no fuiste tú, ignora este correo: no volveremos a escribir.",
  },
  pt: {
    askLead: "O que isso te fez lembrar? Escreva e faça sua própria tiragem sobre isso.", askPh: "ex.: Devo pedir um aumento este mês?", askGo: "Tirar sobre isto",
    reactQ: "Essa tiragem falou com você?", reactHit: "Falou", reactMiss: "Nem tanto", thanks: "Anotado, obrigado.",
    statPick: "{pct}% dos visitantes de hoje escolheram este monte", statHit: "{pct}% deles disseram que falou com eles", statFew: "Você é a {n}ª pessoa a escolher este monte hoje",
    tomorrow: "Três novas todo dia à meia-noite, horário de Taipé (UTC+8).",
    subLead: "Receba as três do dia toda manhã", subPh: "Seu e-mail", subGo: "Assinar", subNote: "Só este e-mail, com cancelamento em um clique em cada um. Primeiro enviamos uma confirmação.",
    subSent: "Confirmação enviada — clique no botão dela para começar.", subOk: "Pronto. Até amanhã de manhã.", subBad: "Esse endereço não parece correto.", unsubOk: "Você cancelou as três do dia.", subError: "Não deu para enviar agora — tente de novo em instantes.",
    mailSubject: "As três de hoje: {a} · {b} · {c}", mailLead: "Escolha uma por intuição e veja o que ela diz a você hoje.", mailPile: "Monte {n}", mailCta: "Escolher um monte",
    mailWhy: "Você recebe este e-mail porque assinou as três do dia do YaoFlow.", mailUnsub: "Cancelar as três do dia",
    confSubject: "Confirme as três do dia", confBody: "Clique abaixo e receba as três do dia toda manhã.", confCta: "Confirmar", confIgnore: "Se não foi você, ignore este e-mail — não escreveremos de novo.",
  },
};

export function dpT(locale: string, key: keyof DailyPlusCopy, vars: Record<string, string | number> = {}): string {
  const table = DAILY_PLUS_T[locale] ?? DAILY_PLUS_T.en!;
  return table[key].replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? `{${k}}`));
}
