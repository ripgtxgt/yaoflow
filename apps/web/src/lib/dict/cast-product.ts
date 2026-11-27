/**
 * 10-22 进度表 76 ⑤: the cast page on the product template — the blocks under the rite (適合問／不適合問, 怎麼做, 免費／付費,
 * 界線) in nine languages. They show only before a figure is on the page; the cast's own words stay in lib/i18n.
 */
export interface CastProductCopy {
  title: string;
  fitYes: string[];
  fitNo: string[];
  how: string[];
  free: string;
  paid: string;
  boundary: string[];
}

export const CAST_PRODUCT: Record<string, CastProductCopy> = {
  "zh-hant": {
    title: "線上起卦",
    fitYes: ["一件懸而未決的事：該不該、要不要、什麼時候", "想知道這件事哪幾天會有動靜", "已經有決定，想看看時機"],
    fitNo: ["一次問好幾件事", "同一件事反覆起卦，直到出現想要的卦", "醫療、法律、財務上需要專業判斷的事"],
    how: ["寫下此刻真正讓你為難的一件事。", "搖六次，六爻成卦；每一爻都是你自己擲的。", "成卦後就能看深斷：怎麼走、哪幾天、你可以怎麼做。", "到卦裡說的日子，我們寫信問你應了沒。"],
    free: "起卦、排盤、卦辭爻辭都免費，不用註冊。",
    paid: "深斷：應期具體日期、眼下一步、忌諱、要盯的信號、卦理依據，可追問；會員與通卡已含。",
    boundary: ["說的是傾向，不是定論；日子是窗口，不是保證。", "一件事一卦；同一件事今天問過了，先放一放。"],
  },
  zh: {
    title: "在线起卦",
    fitYes: ["一件悬而未决的事：该不该、要不要、什么时候", "想知道这件事哪几天会有动静", "已经有决定，想看看时机"],
    fitNo: ["一次问好几件事", "同一件事反复起卦，直到出现想要的卦", "医疗、法律、财务上需要专业判断的事"],
    how: ["写下此刻真正让你为难的一件事。", "摇六次，六爻成卦；每一爻都是你自己掷的。", "成卦后就能看深断：怎么走、哪几天、你可以怎么做。", "到卦里说的日子，我们写信问你应了没。"],
    free: "起卦、排盘、卦辞爻辞都免费，不用注册。",
    paid: "深断：应期具体日期、眼下一步、忌讳、要盯的信号、卦理依据，可追问；会员与通卡已含。",
    boundary: ["说的是倾向，不是定论；日子是窗口，不是保证。", "一件事一卦；同一件事今天问过了，先放一放。"],
  },
  en: {
    title: "Cast a hexagram",
    fitYes: ["One matter still open: whether, which, when", "When this matter is likely to move — which days", "A decision already made, and its timing"],
    fitNo: ["Several matters in one question", "Casting the same matter again until the figure you want shows up", "Medical, legal or financial questions that need a professional"],
    how: ["Write down the one thing that is weighing on you right now.", "Shake six times; six lines make the figure — every line thrown by you.", "Once the figure is up, the full reading gives the call, the days and the step.", "When the days the chart names come, we write and ask how it went."],
    free: "The cast, the chart and the classical texts are free, with no sign-up.",
    paid: "The full reading: a dated timing window, the immediate step, what to avoid, what to watch, the chart's reasoning, with follow-up questions; included for members and pass holders.",
    boundary: ["It speaks of tendencies, not verdicts; the dates are a window, not a guarantee.", "One matter, one cast; a matter already asked about today can rest."],
  },
  ja: {
    title: "オンラインで卦を立てる",
    fitYes: ["まだ決まっていない一つのこと：するか、どちらか、いつか", "このことがいつ動くか——どの日あたりか", "決めたことの時機"],
    fitNo: ["一度にいくつものことを問う", "望む卦が出るまで同じことを何度も立てる", "医療・法律・財務など専門家の判断が要ること"],
    how: ["いま本当に迷っている一つのことを書く。", "六回振って六爻を立てる。どの爻もあなた自身が投げたもの。", "卦が立ったら、深い読み解きで流れ・日取り・手立てを。", "卦の示す日が来たら、どうなったかを手紙で伺う。"],
    free: "立卦、排盤、卦辞・爻辞は無料。登録は不要です。",
    paid: "深断：応期の具体的な日取り、いま打つ一手、避けること、見るべき兆し、卦理の根拠、追問つき。会員とパスは込み。",
    boundary: ["語るのは傾向であって断定ではない。日取りは窓であって保証ではない。", "一事一卦。今日すでに問うたことは、いったん置く。"],
  },
  ko: {
    title: "온라인 점괘",
    fitYes: ["아직 결정되지 않은 한 가지: 할지, 어느 쪽일지, 언제일지", "이 일이 언제 움직일지 — 어느 날들인지", "이미 내린 결정의 시기"],
    fitNo: ["한 번에 여러 일을 묻는 것", "원하는 괘가 나올 때까지 같은 일을 다시 묻는 것", "의료·법률·재무처럼 전문가의 판단이 필요한 일"],
    how: ["지금 정말 고민되는 한 가지를 적습니다.", "여섯 번 흔들어 여섯 효를 세웁니다. 모든 효는 당신이 직접 던진 것.", "괘가 서면 깊은 풀이로 흐름과 날짜, 할 일을 봅니다.", "괘가 말한 날이 오면, 어떻게 됐는지 편지로 묻습니다."],
    free: "점괘, 괘 도표, 괘사·효사는 무료이며 가입이 필요 없어요.",
    paid: "깊은 풀이: 구체적인 응기 날짜, 지금 할 한 걸음, 피할 것, 살필 신호, 괘리의 근거, 추가 질문 가능. 멤버십과 패스에 포함.",
    boundary: ["말하는 것은 경향이지 단정이 아닙니다. 날짜는 창이지 보증이 아닙니다.", "한 가지 일에 한 괘. 오늘 이미 물은 일은 잠시 내려놓습니다."],
  },
  fr: {
    title: "Tirer un hexagramme",
    fitYes: ["Une affaire encore ouverte : faut-il, laquelle, quand", "Quand cette affaire pourrait bouger — quels jours", "Une décision déjà prise, et son moment"],
    fitNo: ["Plusieurs affaires dans une seule question", "Relancer la même affaire jusqu'à obtenir la figure voulue", "Des questions médicales, juridiques ou financières qui demandent un professionnel"],
    how: ["Écrivez la seule chose qui vous pèse en ce moment.", "Secouez six fois ; six traits font la figure — chacun lancé par vous.", "Une fois la figure posée, la lecture complète donne la réponse, les jours et le pas à faire.", "Quand viennent les jours que nomme le tirage, nous écrivons pour savoir ce qu'il en est."],
    free: "Le tirage, le tableau et les textes classiques sont gratuits, sans inscription.",
    paid: "La lecture complète : une fenêtre datée, le pas immédiat, ce qu'il faut éviter, ce qu'il faut surveiller, le raisonnement du tableau, avec des questions de suivi ; incluse pour les membres et les pass.",
    boundary: ["Elle parle de tendances, pas de verdicts ; les dates sont une fenêtre, pas une garantie.", "Une affaire, un tirage ; une affaire déjà posée aujourd'hui peut attendre."],
  },
  de: {
    title: "Ein Hexagramm werfen",
    fitYes: ["Eine offene Sache: ob, welche, wann", "Wann sich diese Sache bewegen dürfte — an welchen Tagen", "Eine getroffene Entscheidung und ihr Zeitpunkt"],
    fitNo: ["Mehrere Sachen in einer Frage", "Dieselbe Sache so lange werfen, bis die gewünschte Figur erscheint", "Medizinische, rechtliche oder finanzielle Fragen, die Fachleute brauchen"],
    how: ["Schreiben Sie die eine Sache auf, die Sie gerade beschäftigt.", "Sechsmal schütteln; sechs Linien ergeben die Figur — jede von Ihnen geworfen.", "Steht die Figur, gibt die volle Deutung die Antwort, die Tage und den nächsten Schritt.", "Wenn die Tage kommen, die das Bild nennt, schreiben wir und fragen, wie es ausging."],
    free: "Der Wurf, das Bild und die klassischen Texte sind kostenlos, ohne Anmeldung.",
    paid: "Die volle Deutung: ein datiertes Zeitfenster, der nächste Schritt, was zu meiden ist, worauf zu achten ist, die Begründung aus dem Bild, mit Nachfragen; für Mitglieder und Pass-Inhaber enthalten.",
    boundary: ["Sie spricht von Tendenzen, nicht von Urteilen; die Daten sind ein Fenster, keine Garantie.", "Eine Sache, ein Wurf; eine heute schon gefragte Sache darf ruhen."],
  },
  es: {
    title: "Tirar un hexagrama",
    fitYes: ["Un asunto aún abierto: si, cuál, cuándo", "Cuándo podría moverse este asunto — qué días", "Una decisión ya tomada, y su momento"],
    fitNo: ["Varios asuntos en una sola pregunta", "Repetir la tirada del mismo asunto hasta que salga la figura deseada", "Cuestiones médicas, legales o financieras que requieren un profesional"],
    how: ["Escribe lo único que te pesa ahora mismo.", "Agita seis veces; seis líneas forman la figura — cada una lanzada por ti.", "Con la figura hecha, la lectura completa da la respuesta, los días y el paso.", "Cuando lleguen los días que nombra la tirada, te escribimos para saber cómo fue."],
    free: "La tirada, el cuadro y los textos clásicos son gratis, sin registrarte.",
    paid: "La lectura completa: una ventana con fechas, el paso inmediato, qué evitar, qué vigilar, el razonamiento del cuadro, con preguntas de seguimiento; incluida para miembros y pases.",
    boundary: ["Habla de tendencias, no de veredictos; las fechas son una ventana, no una garantía.", "Un asunto, una tirada; un asunto ya preguntado hoy puede esperar."],
  },
  pt: {
    title: "Tirar um hexagrama",
    fitYes: ["Um assunto ainda em aberto: se, qual, quando", "Quando este assunto pode mover-se — em que dias", "Uma decisão já tomada, e o seu momento"],
    fitNo: ["Vários assuntos numa só pergunta", "Repetir a tiragem do mesmo assunto até sair a figura desejada", "Questões médicas, jurídicas ou financeiras que pedem um profissional"],
    how: ["Escreva a única coisa que pesa em você agora.", "Agite seis vezes; seis linhas formam a figura — cada uma lançada por você.", "Com a figura pronta, a leitura completa dá a resposta, os dias e o passo.", "Quando chegarem os dias que a tiragem nomeia, escrevemos para saber como foi."],
    free: "A tiragem, o quadro e os textos clássicos são grátis, sem cadastro.",
    paid: "A leitura completa: uma janela com datas, o passo imediato, o que evitar, o que observar, o raciocínio do quadro, com perguntas de acompanhamento; incluída para membros e passes.",
    boundary: ["Fala de tendências, não de veredictos; as datas são uma janela, não uma garantia.", "Um assunto, uma tiragem; um assunto já perguntado hoje pode esperar."],
  },
};

export const castProductT = (locale: string): CastProductCopy => CAST_PRODUCT[locale] ?? CAST_PRODUCT.en!;
