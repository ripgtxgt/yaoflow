/**
 * 10-12 B② (Neil: 「做 1–4」; 10-12 复查: of 92 people who asked 5+ times without paying, 18.5% had left an address).
 * On the 3rd or 4th cast of one matter, a signed-out reader with no address on file is offered to keep the matter: the
 * casts kept together, and ONE letter when the first time the chart names comes near. {n} casts so far, {when} the
 * fuzzy time ("10月中旬"). Same keys in every language (test/matter-save.test.ts).
 */
export interface MatterSaveCopy {
  title: string;
  body: string;
  bodyNoWhen: string;
  go: string;
  note: string;
  done: string;
  /** the save letter's last line, instead of 「明天我們會再寄一封提醒」 */
  sNext: string;
  sNextNoWhen: string;
  /** the reminder letter */
  rSubject: string;
  rLead: string;
  rWhat: string;
  rCta: string;
  rFoot: string;
}

export const MATTER_SAVE_T: Record<string, MatterSaveCopy> = {
  zh: {
    title: "这件事你问了 {n} 卦",
    body: "留个邮箱：这几卦帮你存在一起，卦里第一个时间点（{when}）快到时，寄一封信提醒你。",
    bodyNoWhen: "留个邮箱：这几卦帮你存在一起，随时能回来接着看。",
    go: "存起来，到时提醒我",
    note: "只寄两封：现在一封，日子快到时一封；随时可退订。",
    done: "存好了，信已寄到 {email}。",
    sNext: "卦里第一个时间点在{when}，快到时我们再寄一封提醒，只有这一封。",
    sNextNoWhen: "之后不会再寄别的信。",
    rSubject: "你问的那件事，卦里的日子快到了",
    rLead: "你之前在 YaoFlow 问「{q}」，得到{hex}。卦里第一个时间点在{when}，就快到了。",
    rWhat: "确切是哪几天、到时候先做什么、要避开什么，深断在同一卦上讲完，读完还能追问。",
    rCta: "回到这一卦",
    rFoot: "这是这件事的最后一封信。",
  },
  "zh-hant": {
    title: "這件事你問了 {n} 卦",
    body: "留個信箱：這幾卦幫你存在一起，卦裡第一個時間點（{when}）快到時，寄一封信提醒你。",
    bodyNoWhen: "留個信箱：這幾卦幫你存在一起，隨時能回來接著看。",
    go: "存起來，到時提醒我",
    note: "只寄兩封：現在一封，日子快到時一封；隨時可退訂。",
    done: "存好了，信已寄到 {email}。",
    sNext: "卦裡第一個時間點在{when}，快到時我們再寄一封提醒，只有這一封。",
    sNextNoWhen: "之後不會再寄別的信。",
    rSubject: "你問的那件事，卦裡的日子快到了",
    rLead: "你之前在 YaoFlow 問「{q}」，得到{hex}。卦裡第一個時間點在{when}，就快到了。",
    rWhat: "確切是哪幾天、到時候先做什麼、要避開什麼，深斷在同一卦上講完，讀完還能追問。",
    rCta: "回到這一卦",
    rFoot: "這是這件事的最後一封信。",
  },
  en: {
    title: "You've asked about this {n} times",
    body: "Leave an address: we'll keep these casts together and write once when the first time the chart names ({when}) is near.",
    bodyNoWhen: "Leave an address: we'll keep these casts together so you can come back to them any time.",
    go: "Keep it and remind me",
    note: "Two letters only: one now, one when the time is near. Unsubscribe any time.",
    done: "Kept — the letter is on its way to {email}.",
    sNext: "The first time the chart names is {when}; we'll write once more when it's near — just that one.",
    sNextNoWhen: "We won't send anything else.",
    rSubject: "The time your cast named is coming up",
    rLead: "You asked “{q}” on YaoFlow and drew {hex}. The first time the chart names is {when} — it's nearly here.",
    rWhat: "Which days exactly, what to do first and what to avoid: the full reading finishes it on the same figure, with follow-up questions after.",
    rCta: "Back to this cast",
    rFoot: "This is the last letter about this matter.",
  },
  ja: {
    title: "この件は {n} 回目の卦です",
    body: "メールアドレスを残せば、これまでの卦をまとめて保存し、卦が示す最初の時期（{when}）が近づいたら一通だけお知らせします。",
    bodyNoWhen: "メールアドレスを残せば、これまでの卦をまとめて保存し、いつでも続きを見られます。",
    go: "保存して、時期が来たら知らせて",
    note: "お送りするのは二通だけ：今と、時期が近づいたとき。いつでも配信停止できます。",
    done: "保存しました。{email} にメールをお送りしました。",
    sNext: "卦が示す最初の時期は{when}です。近づいたら一通だけお知らせします。",
    sNextNoWhen: "これ以上メールはお送りしません。",
    rSubject: "あの件、卦が示した時期がもうすぐです",
    rLead: "YaoFlow で「{q}」と問い、{hex}が出ました。卦が示す最初の時期は{when}、もうすぐです。",
    rWhat: "具体的にどの日か、まず何をして何を避けるか——本格鑑定が同じ卦で最後まで読み、その後の質問もできます。",
    rCta: "この卦に戻る",
    rFoot: "この件についてのメールはこれが最後です。",
  },
  ko: {
    title: "이 일로 {n}번째 괘예요",
    body: "메일 주소를 남기면 이 괘들을 함께 저장하고, 괘가 짚은 첫 시기({when})가 다가오면 한 번만 알려 드려요.",
    bodyNoWhen: "메일 주소를 남기면 이 괘들을 함께 저장해 두고 언제든 이어서 볼 수 있어요.",
    go: "저장하고, 때가 되면 알려 주세요",
    note: "메일은 두 통뿐이에요: 지금 한 통, 시기가 다가올 때 한 통. 언제든 수신 거부할 수 있어요.",
    done: "저장했어요. {email}(으)로 메일을 보냈어요.",
    sNext: "괘가 짚은 첫 시기는 {when}이에요. 다가오면 한 번만 알려 드릴게요.",
    sNextNoWhen: "다른 메일은 보내지 않아요.",
    rSubject: "물었던 그 일, 괘가 짚은 시기가 다가와요",
    rLead: "YaoFlow에서 “{q}”라고 묻고 {hex}을(를) 얻었어요. 괘가 짚은 첫 시기는 {when}, 곧이에요.",
    rWhat: "정확히 어느 날인지, 먼저 할 일과 피할 일은 심층 풀이가 같은 괘에서 끝까지 풀어 드리고, 추가 질문도 할 수 있어요.",
    rCta: "이 괘로 돌아가기",
    rFoot: "이 일에 관한 마지막 메일이에요.",
  },
  fr: {
    title: "Vous avez posé cette question {n} fois",
    body: "Laissez une adresse : nous gardons ces tirages ensemble et vous écrivons une fois quand le premier moment indiqué ({when}) approche.",
    bodyNoWhen: "Laissez une adresse : nous gardons ces tirages ensemble pour que vous puissiez y revenir quand vous voulez.",
    go: "Garder et me prévenir",
    note: "Deux e-mails seulement : un maintenant, un quand le moment approche. Désinscription à tout moment.",
    done: "C'est gardé — l'e-mail part vers {email}.",
    sNext: "Le premier moment indiqué est {when} ; nous vous écrirons une seule fois quand il approchera.",
    sNextNoWhen: "Nous ne vous enverrons rien d'autre.",
    rSubject: "Le moment indiqué par votre tirage approche",
    rLead: "Vous aviez demandé « {q} » sur YaoFlow et obtenu {hex}. Le premier moment indiqué est {when} — c'est bientôt.",
    rWhat: "Quels jours exactement, quoi faire d'abord et quoi éviter : la lecture approfondie le dit sur la même figure, avec des questions de suivi ensuite.",
    rCta: "Revenir à ce tirage",
    rFoot: "C'est le dernier e-mail sur cette question.",
  },
  de: {
    title: "Du hast das schon {n}-mal gefragt",
    body: "Hinterlass eine Adresse: Wir heben diese Würfe zusammen auf und schreiben einmal, wenn der erste genannte Zeitpunkt ({when}) näher rückt.",
    bodyNoWhen: "Hinterlass eine Adresse: Wir heben diese Würfe zusammen auf, damit du jederzeit weitermachen kannst.",
    go: "Aufheben und erinnern",
    note: "Nur zwei E-Mails: eine jetzt, eine wenn es so weit ist. Abmelden jederzeit.",
    done: "Aufgehoben — die E-Mail geht an {email}.",
    sNext: "Der erste genannte Zeitpunkt ist {when}; wenn er näher rückt, schreiben wir noch genau einmal.",
    sNextNoWhen: "Wir schicken dir sonst nichts.",
    rSubject: "Der Zeitpunkt aus deinem Wurf rückt näher",
    rLead: "Du hast auf YaoFlow „{q}“ gefragt und {hex} erhalten. Der erste genannte Zeitpunkt ist {when} — bald ist es so weit.",
    rWhat: "Welche Tage genau, was zuerst zu tun und was zu meiden ist: Die Tiefendeutung sagt es auf demselben Bild, danach mit Folgefragen.",
    rCta: "Zurück zu diesem Wurf",
    rFoot: "Das ist die letzte E-Mail zu dieser Sache.",
  },
  es: {
    title: "Ya preguntaste esto {n} veces",
    body: "Deja un correo: guardamos estas tiradas juntas y te escribimos una vez cuando se acerque el primer momento que señala ({when}).",
    bodyNoWhen: "Deja un correo: guardamos estas tiradas juntas para que vuelvas cuando quieras.",
    go: "Guardar y avisarme",
    note: "Solo dos correos: uno ahora y otro cuando se acerque la fecha. Puedes darte de baja cuando quieras.",
    done: "Guardado: el correo va a {email}.",
    sNext: "El primer momento que señala es {when}; te escribiremos una sola vez cuando se acerque.",
    sNextNoWhen: "No te enviaremos nada más.",
    rSubject: "Se acerca el momento que señaló tu tirada",
    rLead: "Preguntaste «{q}» en YaoFlow y te salió {hex}. El primer momento que señala es {when}: ya casi.",
    rWhat: "Qué días exactamente, qué hacer primero y qué evitar: la lectura completa lo termina sobre la misma figura, con preguntas de seguimiento después.",
    rCta: "Volver a esta tirada",
    rFoot: "Este es el último correo sobre este asunto.",
  },
  pt: {
    title: "Você já perguntou isto {n} vezes",
    body: "Deixe um e-mail: guardamos estas tiragens juntas e escrevemos uma vez quando o primeiro momento indicado ({when}) estiver perto.",
    bodyNoWhen: "Deixe um e-mail: guardamos estas tiragens juntas para você voltar quando quiser.",
    go: "Guardar e me avisar",
    note: "Só dois e-mails: um agora e outro quando a data chegar perto. Cancele quando quiser.",
    done: "Guardado — o e-mail vai para {email}.",
    sNext: "O primeiro momento indicado é {when}; escreveremos uma única vez quando estiver perto.",
    sNextNoWhen: "Não enviaremos mais nada.",
    rSubject: "O momento que sua tiragem indicou está chegando",
    rLead: "Você perguntou “{q}” no YaoFlow e saiu {hex}. O primeiro momento indicado é {when} — já está perto.",
    rWhat: "Quais dias exatamente, o que fazer primeiro e o que evitar: a leitura completa termina isso na mesma figura, com perguntas de acompanhamento depois.",
    rCta: "Voltar a esta tiragem",
    rFoot: "Este é o último e-mail sobre este assunto.",
  },
};

export function msT(locale: string, key: keyof MatterSaveCopy, vars: Record<string, string | number> = {}): string {
  const table = MATTER_SAVE_T[locale] ?? MATTER_SAVE_T.en!;
  return table[key].replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? `{${k}}`));
}
