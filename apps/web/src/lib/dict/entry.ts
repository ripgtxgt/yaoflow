/**
 * 09-30 (Neil: 「1，2，3都做吧」) — three leaks the new-vs-returning split showed:
 *   ① home: 700 new visitors a week left the home page without starting, median 4 s, not scrolled, 83% from Threads.
 *      The h1 arm leads with the reader's own situation and one-tap example questions (lib/ab.ts, bit h).
 *   ② share card: 155 landings a week, 43% cast. The door went to the home page (one more hop) and never said
 *      the first full reading is free for someone a friend brought.
 *   ③ the topic cap: 491 sessions a week met 「今天这件事已经问了 n 卦」 and the only door was "home" — 87% stopped there.
 * Words follow the site: 深断 / full reading / 本格鑑定 / 심층 풀이 / lecture approfondie / Tiefendeutung / lectura completa / leitura completa.
 */
export type EntryCopy = {
  heroTitle: string;
  heroSub: string;
  chipsLead: string;
  chips: [string, string, string, string];
  shareFree: string;
  capOther: string;
  /** 10-02 (Neil: 「直接做 1 吧」): the cap no longer stops a cast — this stands where the free line would be. {n} {hex} */
  capNoteTopic: string;
  capNoteCircling: string;
};

export const ENTRY_T: Record<string, EntryCopy> = {
  zh: {
    heroTitle: "心里悬着一件事？",
    heroSub: "写一句话，摇六次，给它一个说法。起卦不花钱，盘面当场就看得到。",
    chipsLead: "不知道怎么问？点一个就开始：",
    // 10-22 进度表 88 (设计稿 H1): the design's four — no money question (investment advice is out of bounds)
    chips: ["复合有没有机会？", "这份 offer 该不该接？", "暧昧会不会往前？", "这个案子能不能成？"],
    shareFree: "第一次来的话，经朋友分享的第一份深断免费。",
    capOther: "问另一件事",
    capNoteTopic: "这一类的事今天已经问了 {n} 卦（上一卦是【{hex}】）。先回去看那一卦；想看这一卦，可以看完整解读。",
    capNoteCircling: "同一件事今天已经问了 {n} 卦（上一卦是【{hex}】）。先回去看那一卦；想看这一卦，可以看完整解读。",
  },
  "zh-hant": {
    heroTitle: "心裡懸著一件事？",
    heroSub: "寫一句話，搖六次，給它一個說法。起卦不花錢，盤面當場就看得到。",
    chipsLead: "不知道怎麼問？點一個就開始：",
    // 10-22 进度表 88 (设计稿 H1): the design's four — no money question (investment advice is out of bounds)
    chips: ["復合有沒有機會？", "這份 offer 該不該接？", "曖昧會不會往前？", "這個案子能不能成？"],
    shareFree: "第一次來的話，經朋友分享的第一份深斷免費。",
    capOther: "問另一件事",
    capNoteTopic: "這一類的事今天已經問了 {n} 卦（上一卦是【{hex}】）。先回去看那一卦；想看這一卦，可以看完整解讀。",
    capNoteCircling: "同一件事今天已經問了 {n} 卦（上一卦是【{hex}】）。先回去看那一卦；想看這一卦，可以看完整解讀。",
  },
  en: {
    heroTitle: "Something on your mind?",
    heroSub: "Write it in one line, throw six times, and it gets an answer. Casting is free, and you see the chart right away.",
    chipsLead: "Not sure how to ask? Tap one to begin:",
    chips: ["Will they come back?", "Should I change jobs?", "Will this interview go my way?", "Should I put this money in?"],
    shareFree: "New here? Coming through a friend, your first full reading is free.",
    capOther: "Ask about something else",
    capNoteTopic: "You've already cast {n} times on this kind of question today (the last was {hex}). Go back to that one first; for this cast, the full reading is here.",
    capNoteCircling: "You've already asked about this same matter {n} times today (the last was {hex}). Go back to that one first; for this cast, the full reading is here.",
  },
  ja: {
    heroTitle: "気がかりなことがありますか？",
    heroSub: "一問一答。一行で書いて六回振れば、吉凶がはっきり出て、応期（動きが出る時期の目安）も分かります。卦を立てるのは無料です。",
    chipsLead: "どう聞けばいいか迷ったら、ひとつ選んで始めましょう：",
    chips: ["あの人は戻ってきますか？", "この仕事は変えるべき？", "今回の面接は通りますか？", "このお金は投資すべき？"],
    shareFree: "初めての方は、友だちのシェアから来た最初の本格鑑定が無料です。",
    capOther: "別のことを聞く",
    capNoteTopic: "この種類のことは今日すでに {n} 回占っています（前回は【{hex}】）。まず前回の卦を見返してください。今回の卦は本格鑑定で読めます。",
    capNoteCircling: "同じことを今日すでに {n} 回占っています（前回は【{hex}】）。まず前回の卦を見返してください。今回の卦は本格鑑定で読めます。",
  },
  ko: {
    heroTitle: "마음에 걸린 일이 있나요?",
    heroSub: "한 줄로 쓰고, 여섯 번 던지면 답이 나옵니다. 괘를 세우는 건 무료이고, 괘상은 바로 볼 수 있어요.",
    chipsLead: "어떻게 물어야 할지 모르겠다면, 하나를 눌러 시작하세요:",
    chips: ["그 사람이 돌아올까요?", "이 직장을 옮겨야 할까요?", "이번 면접에 붙을까요?", "이 돈을 투자해도 될까요?"],
    shareFree: "처음이라면, 친구의 공유로 온 첫 심층 풀이는 무료입니다.",
    capOther: "다른 일 묻기",
    capNoteTopic: "이런 종류의 일은 오늘 이미 {n}번 물었어요(지난번 괘는 【{hex}】). 먼저 그 괘를 다시 보세요. 이번 괘는 심층 풀이로 볼 수 있어요.",
    capNoteCircling: "같은 일을 오늘 이미 {n}번 물었어요(지난번 괘는 【{hex}】). 먼저 그 괘를 다시 보세요. 이번 괘는 심층 풀이로 볼 수 있어요.",
  },
  fr: {
    heroTitle: "Quelque chose vous préoccupe ?",
    heroSub: "Écrivez-le en une ligne, lancez six fois, et il reçoit une réponse. Le tirage est gratuit et la figure s'affiche aussitôt.",
    chipsLead: "Vous ne savez pas comment demander ? Touchez-en une pour commencer :",
    chips: ["Va-t-il/elle revenir ?", "Dois-je changer de travail ?", "Cet entretien va-t-il marcher ?", "Dois-je placer cet argent ?"],
    shareFree: "Première visite ? Venu par un ami, votre première lecture approfondie est offerte.",
    capOther: "Demander autre chose",
    capNoteTopic: "Vous avez déjà tiré {n} fois aujourd'hui sur ce genre de question (le dernier : {hex}). Revoyez d'abord celui-là ; pour ce tirage-ci, la lecture approfondie est disponible.",
    capNoteCircling: "Vous avez déjà posé cette même question {n} fois aujourd'hui (le dernier : {hex}). Revoyez d'abord celui-là ; pour ce tirage-ci, la lecture approfondie est disponible.",
  },
  de: {
    heroTitle: "Beschäftigt dich etwas?",
    heroSub: "Schreib es in einer Zeile auf, wirf sechsmal, und es bekommt eine Antwort. Das Werfen ist kostenlos, das Bild siehst du sofort.",
    chipsLead: "Unsicher, wie du fragen sollst? Tipp eine an, um zu beginnen:",
    chips: ["Kommt er/sie zurück?", "Soll ich den Job wechseln?", "Klappt dieses Vorstellungsgespräch?", "Soll ich dieses Geld anlegen?"],
    shareFree: "Zum ersten Mal hier? Über einen Freund ist deine erste Tiefendeutung kostenlos.",
    capOther: "Etwas anderes fragen",
    capNoteTopic: "Zu dieser Art von Frage hast du heute schon {n}-mal geworfen (zuletzt {hex}). Schau dir zuerst diesen Wurf an; für diesen hier gibt es die Tiefendeutung.",
    capNoteCircling: "Dieselbe Sache hast du heute schon {n}-mal gefragt (zuletzt {hex}). Schau dir zuerst diesen Wurf an; für diesen hier gibt es die Tiefendeutung.",
  },
  es: {
    heroTitle: "¿Algo te ronda la cabeza?",
    heroSub: "Escríbelo en una línea, lanza seis veces y tendrá una respuesta. Tirar es gratis y ves la figura al momento.",
    chipsLead: "¿No sabes cómo preguntar? Toca una para empezar:",
    chips: ["¿Volverá?", "¿Debería cambiar de trabajo?", "¿Me irá bien en esta entrevista?", "¿Debería invertir este dinero?"],
    shareFree: "¿Primera vez? Si llegas por un amigo, tu primera lectura completa es gratis.",
    capOther: "Preguntar otra cosa",
    capNoteTopic: "Hoy ya tiraste {n} veces sobre este tipo de pregunta (la última: {hex}). Vuelve primero a esa; para esta tirada, tienes la lectura completa.",
    capNoteCircling: "Hoy ya preguntaste {n} veces por el mismo asunto (la última: {hex}). Vuelve primero a esa; para esta tirada, tienes la lectura completa.",
  },
  pt: {
    heroTitle: "Tem algo na cabeça?",
    heroSub: "Escreva em uma linha, jogue seis vezes e isso ganha uma resposta. Tirar é grátis e você vê a figura na hora.",
    chipsLead: "Não sabe como perguntar? Toque em uma para começar:",
    chips: ["Ele/ela vai voltar?", "Devo mudar de emprego?", "Vou passar nesta entrevista?", "Devo investir este dinheiro?"],
    shareFree: "Primeira vez? Vindo por um amigo, sua primeira leitura completa é grátis.",
    capOther: "Perguntar outra coisa",
    capNoteTopic: "Hoje você já tirou {n} vezes sobre esse tipo de pergunta (a última: {hex}). Volte primeiro àquela; para esta tiragem, há a leitura completa.",
    capNoteCircling: "Hoje você já perguntou {n} vezes sobre o mesmo assunto (a última: {hex}). Volte primeiro àquela; para esta tiragem, há a leitura completa.",
  },
};

export const entryT = (locale: string): EntryCopy => ENTRY_T[locale] ?? ENTRY_T.en!;
