/**
 * The trust layer (home-page trust points, source notes, the About page) in
 * the six languages beyond Chinese and English. zh and en are authored in
 * lib/trust.ts; these are merged in there so contentFor() finds them.
 * Legal pages are deliberately NOT translated — they stay English with a
 * note, because a translation of a contract is a new contract.
 */

export interface TrustL10n {
  points: Record<"text" | "engine" | "honest", { title: string; body: string }>;
  /** keyed by source href */
  sources: Record<string, { title: string; note: string }>;
  about: { h: string; p: string[] }[];
  aboutMeta: string;
}

const SEP = "https://plato.stanford.edu/entries/chinese-change/";
const CTEXT = "https://ctext.org/book-of-changes";
const WIKI = "https://zh.wikisource.org/wiki/%E5%91%A8%E6%98%93";
const MET = "https://www.metmuseum.org/art/collection/search/42025";
const LEGGE = "https://www.gutenberg.org/ebooks/16061";

export const TRUST_L10N: Record<"ja" | "ko" | "fr" | "de" | "es" | "pt", TrustL10n> = {
  ja: {
    points: {
      text: {
        title: "経文は本物です",
        body: "六十四卦の卦辞と三百八十四条の爻辞は、すべて通行本『周易』の原文（ウィキソース、パブリックドメイン）をそのまま収録しています。ここで読む一句一句は、古典の中に一字ずつ対応があります。",
      },
      engine: {
        title: "盤面は古法どおりに組みます",
        body: "納甲、八宮と世応、六親・六獣、空亡・月破、旺衰——すべて『卜筮正宗』『京氏易伝』の古い決まりどおりに組みます。あなたが目にする一つひとつは、古典の中で確かめられます。",
      },
      honest: {
        title: "予言はしません。見通す手助けをするだけです",
        body: "「こうなります」と保証する言い方はしません。開運グッズも売りません。医療・法律・投資の助言もしません。これは三千年の文献伝統を持つ記号の体系であり、決めかねている事柄に考えるための構造を与えるものです——最後に決めるのは、いつもあなた自身です。",
      },
    },
    sources: {
      [SEP]: { title: "Chinese Philosophy of Change", note: "スタンフォード哲学百科事典 — 『易』のテキスト層と思想史" },
      [CTEXT]: { title: "『周易』原文", note: "中国哲学書電子化計画 — 経文と歴代の注疏" },
      [WIKI]: { title: "ウィキソース『周易』", note: "本サイトの卦辞・爻辞の直接の出典（パブリックドメイン）" },
      [MET]: { title: "殷代の卜骨", note: "メトロポリタン美術館所蔵 — 中国の占卜に関する最古の物質的証拠" },
      [LEGGE]: { title: "レッグ英訳『易経』（1882）", note: "プロジェクト・グーテンベルク — 英訳の参照底本（パブリックドメイン）" },
    },
    about: [
      {
        h: "これは何か",
        p: [
          "YaoFlow は、易の立卦を使って考えを整理する場所です。決めかねていることを一つ書き、六回投げて卦を得て、それを読む——まず三千年前に残された経文を、次にその卦とあなたの状況を結びつける現代の読み解きを。",
          "YaoFlow がするのは、古い記号の体系を、その本来の規則どおりに、あなたの問いの隣に置くことです。すでに半分は分かっているのに考え切れていないことを、別の構造から眺めてもらうために。",
        ],
      },
      {
        h: "盤面はどこから来るのか",
        p: [
          "盤面は古法どおりに組み、同じ時刻に立てた卦なら盤面も同じです。読み解きはこの盤面だけを語り、ほかに作り足しません。",
        ],
      },
      {
        h: "一事一卦",
        p: [
          "『易経』蒙卦にこうあります：「初筮は告ぐ。再三すれば瀆る。瀆るれば告げず。」最初の問いには卦が答える。同じ件を繰り返し問えば、もう数に入らない。",
          "同じ件は、一度問えば十分です。本当に新しい進展があったら、新しい局面のために卦を立ててください。",
        ],
      },
      {
        h: "誰が作っているのか",
        p: [
          "YaoFlow は一人の独立した開発者が作り、運営しています。投資家はいません。作った理由は単純です：自分が静かに物事を考えられる場所が欲しかったのに、世にある同種のサービスは、でたらめを言うか、利用者を馬鹿にするかのどちらかだったからです。",
          "ご質問や、誤りの発見（とくに盤面や経文の誤りは、とても気にしています）があれば、ぜひメールをください。",
        ],
      },
    ],
    aboutMeta: "YaoFlow は六爻で考えを整理する場所です。盤面は古法どおりに組み、典拠はすべて公開されており確認できます。",
  },

  ko: {
    points: {
      text: {
        title: "경문은 진짜입니다",
        body: "64괘의 괘사와 384개 효사는 모두 통행본 『주역』 원문(위키문헌, 퍼블릭 도메인)을 그대로 실었습니다. 여기서 읽는 경문 한 구절 한 구절은 고전에서 글자 그대로 대조할 수 있습니다.",
      },
      engine: {
        title: "괘는 옛 법대로 세웁니다",
        body: "납갑, 팔궁과 세응, 육친과 육수, 공망·월파, 왕쇠 — 모두 『복서정종』『경씨역전』의 옛 규칙대로 배치합니다. 보시는 항목 하나하나를 고전에서 찾아볼 수 있습니다.",
      },
      honest: {
        title: "예언하지 않습니다. 또렷이 보도록 도울 뿐입니다",
        body: "\"반드시 이렇게 된다\"고 말하지 않고, 개운 상품을 팔지 않으며, 의료·법률·투자 조언을 하지 않습니다. 이것은 삼천 년 문헌 전통을 가진 기호 체계이며, 결정하지 못한 일에 생각할 구조를 하나 주는 것입니다 — 마지막 결정은 언제나 당신의 몫입니다.",
      },
    },
    sources: {
      [SEP]: { title: "Chinese Philosophy of Change", note: "스탠퍼드 철학 백과사전 — 『역』의 텍스트 층위와 사상사" },
      [CTEXT]: { title: "『주역』 원문", note: "중국철학서전자화계획 — 경문과 역대 주소" },
      [WIKI]: { title: "위키문헌 『주역』", note: "이 사이트 괘사·효사의 직접 출처 (퍼블릭 도메인)" },
      [MET]: { title: "상나라 복골", note: "메트로폴리탄 미술관 소장 — 중국 점복의 가장 오래된 물질적 증거" },
      [LEGGE]: { title: "레그 영역 『역경』(1882)", note: "프로젝트 구텐베르크 — 영어 번역의 참고 저본 (퍼블릭 도메인)" },
    },
    about: [
      {
        h: "이것은 무엇인가",
        p: [
          "YaoFlow는 육효 작괘로 생각을 정리하는 곳입니다. 결정하지 못한 일 하나를 적고, 여섯 번 던져 괘를 얻고, 그것을 읽습니다 — 먼저 삼천 년 전에 남겨진 경문을, 그다음 그 괘와 지금의 처지를 잇는 오늘의 풀이를.",
          "YaoFlow가 하는 일은 오래된 기호 체계를 그 본래의 규칙대로 당신의 질문 옆에 놓아, 이미 반쯤 알고 있지만 미처 정리하지 못한 것을 다른 구조로 보게 하는 것입니다.",
        ],
      },
      {
        h: "괘는 어떻게 나오는가",
        p: [
          "괘 배치는 옛 법대로 세우며, 같은 시각에 세운 괘는 배치도 같습니다. 풀이는 이 배치만 말하고, 따로 지어내지 않습니다.",
        ],
      },
      {
        h: "한 가지 일에 한 번의 점괘",
        p: [
          "『주역』 몽괘에 이런 구절이 있습니다: \"처음 점치면 알려 주고, 두 번 세 번 거듭하면 모독이니, 모독하면 알려 주지 않는다.\" 처음 물으면 괘가 답하고, 같은 일을 되풀이해 물으면 더는 셈에 넣지 않습니다.",
          "같은 일은 한 번 물으면 됩니다. 정말 새로운 진전이 있으면, 새 국면을 위해 괘를 다시 세우세요.",
        ],
      },
      {
        h: "누가 만드는가",
        p: [
          "YaoFlow는 독립 개발자 한 사람이 만들고 운영합니다. 투자자는 없습니다. 만든 이유는 단순합니다: 조용히 생각을 정리할 곳이 필요했는데, 시중의 비슷한 제품은 지어내거나 사용자를 바보 취급했기 때문입니다.",
          "질문이 있거나 오류를 발견하셨다면(특히 괘 배치나 경문의 오류는 무척 신경 씁니다) 메일을 보내 주세요.",
        ],
      },
    ],
    aboutMeta: "YaoFlow는 육효로 생각을 정리하는 곳입니다. 괘는 옛 법대로 세우고, 문헌 출처는 모두 공개되어 확인할 수 있습니다.",
  },

  fr: {
    points: {
      text: {
        title: "Le texte classique, tel quel",
        body: "Les 64 jugements et les 384 textes de traits sont le Zhouyi transmis, transcrits de l'édition Wikisource chinoise du domaine public — ni paraphrasés, ni inventés. Chaque phrase classique que vous lisez ici se retrouve mot pour mot dans les livres anciens.",
      },
      engine: {
        title: "Le tableau suit les règles anciennes",
        body: "Na Jia des troncs et branches, palais et traits Soi/Autre, six parentés et six esprits, vides et chocs du mois, force saisonnière — tout est disposé selon les règles anciennes du Bushi Zhengzong et du Jingshi Yizhuan. Chaque élément que vous voyez se retrouve dans ces livres.",
      },
      honest: {
        title: "Aucune promesse sur votre avenir",
        body: "Nous ne vous disons pas ce qui va arriver, nous ne vendons pas de chance, et nous ne donnons aucun conseil médical, juridique ou financier. C'est un système symbolique porté par trois millénaires de tradition écrite, utilisé ici pour donner à une question en suspens une structure dans laquelle réfléchir. La décision vous appartient.",
      },
    },
    sources: {
      [SEP]: { title: "Chinese Philosophy of Change", note: "Stanford Encyclopedia of Philosophy — strates du texte et histoire de sa réception" },
      [CTEXT]: { title: "Le Livre des mutations", note: "Chinese Text Project — texte source et commentaires" },
      [WIKI]: { title: "Le Zhouyi sur Wikisource", note: "La source directe de nos textes d'hexagrammes et de traits (domaine public)" },
      [MET]: { title: "Fragment d'os divinatoire, dynastie Shang", note: "The Metropolitan Museum of Art — la plus ancienne trace matérielle de la divination chinoise" },
      [LEGGE]: { title: "Le Yi King de Legge (1882)", note: "Projet Gutenberg — la traduction du domaine public qui informe notre version anglaise" },
    },
    about: [
      {
        h: "Ce que c'est",
        p: [
          "YaoFlow est un endroit pour réfléchir à une question en suspens avec le Yi Jing. Vous écrivez la chose autour de laquelle vous tournez, vous tirez six traits et vous recevez une figure — d'abord le texte transmis depuis trois mille ans, puis une lecture moderne qui relie cette figure à votre situation.",
          "Ce que fait YaoFlow, c'est poser un vieux système symbolique à côté de votre question, joué selon ses propres règles, pour que vous regardiez depuis une autre structure quelque chose que vous savez déjà à moitié.",
        ],
      },
      {
        h: "D'où vient le tableau",
        p: [
          "Le tableau est disposé selon les règles anciennes : le même tirage au même instant donne le même tableau. La lecture ne parle que de ce tableau et n'invente rien d'autre.",
        ],
      },
      {
        h: "Une affaire, un tirage",
        p: [
          "L'hexagramme 4 du Yi Jing dit\u00a0: le premier tirage répond\u202f; demander encore et encore use la réponse.",
          "Pour une même affaire, une seule question suffit. S'il y a vraiment du nouveau, faites un tirage pour la nouvelle situation.",
        ],
      },
      {
        h: "Qui est derrière YaoFlow",
        p: [
          "YaoFlow est construit et géré par un seul développeur indépendant. Pas d'investisseurs. La raison d'être est simple\u00a0: je voulais un endroit calme pour réfléchir à une décision, et les produits similaires que j'ai trouvés inventaient n'importe quoi ou prenaient leurs utilisateurs pour des idiots.",
          "Si vous avez une question, ou si vous trouvez une erreur — surtout dans le calcul du tableau ou le texte classique, auxquels je tiens beaucoup — écrivez-moi.",
        ],
      },
    ],
    aboutMeta: "YaoFlow est un endroit pour réfléchir avec le Liu Yao : le tableau suit les règles anciennes, et toutes les sources sont publiques et vérifiables.",
  },

  de: {
    points: {
      text: {
        title: "Der Text ist der echte Text",
        body: "Alle 64 Urteile und 384 Linientexte sind das überlieferte Zhouyi, übernommen aus der gemeinfreien chinesischen Wikisource-Ausgabe — nicht paraphrasiert, nicht erfunden. Jeder klassische Satz, den du hier liest, steht Wort für Wort in den alten Büchern.",
      },
      engine: {
        title: "Das Bild folgt den alten Regeln",
        body: "Najia-Stämme und -Zweige, Palast und Selbst/Gegenüber-Linien, die sechs Beziehungen und sechs Geister, Leerstellen und Monatskonflikte, die jahreszeitliche Kraft — alles nach den alten Regeln des Bushi Zhengzong und des Jingshi Yizhuan gelegt. Jeden Punkt, den du siehst, kannst du in diesen Büchern nachschlagen.",
      },
      honest: {
        title: "Keine Versprechen über deine Zukunft",
        body: "Wir sagen dir nicht, was passieren wird, wir verkaufen kein Glück, und wir geben keinen medizinischen, rechtlichen oder finanziellen Rat. Das ist ein Symbolsystem mit drei Jahrtausenden Textüberlieferung, hier benutzt, um einer offenen Frage eine Struktur zu geben, in der du denken kannst. Die Entscheidung liegt bei dir.",
      },
    },
    sources: {
      [SEP]: { title: "Chinese Philosophy of Change", note: "Stanford Encyclopedia of Philosophy — Textschichten und Rezeptionsgeschichte" },
      [CTEXT]: { title: "Das Buch der Wandlungen", note: "Chinese Text Project — Quelltext und Kommentare" },
      [WIKI]: { title: "Zhouyi auf Wikisource", note: "Die direkte Quelle unserer Hexagramm- und Linientexte (gemeinfrei)" },
      [MET]: { title: "Fragment eines Orakelknochens, Shang-Dynastie", note: "The Metropolitan Museum of Art — das älteste materielle Zeugnis chinesischer Weissagung" },
      [LEGGE]: { title: "Legges I Ging (1882)", note: "Project Gutenberg — die gemeinfreie Übersetzung, an der sich unser Englisch orientiert" },
    },
    about: [
      {
        h: "Was das ist",
        p: [
          "YaoFlow ist ein Ort, um eine offene Frage mit dem I Ging zu durchdenken. Du schreibst die eine Sache auf, um die du kreist, wirfst sechs Linien und erhältst ein Bild — erst den überlieferten Text von vor dreitausend Jahren, dann eine moderne Deutung, die dieses Bild mit deiner Lage verbindet.",
          "Was YaoFlow tut: ein altes Symbolsystem nach seinen eigenen Regeln neben deine Frage stellen, damit du etwas, das du schon halb weißt, aus einer anderen Struktur heraus betrachten kannst.",
        ],
      },
      {
        h: "Woher das Bild kommt",
        p: [
          "Das Bild wird nach den alten Regeln gelegt: Derselbe Wurf im selben Moment ergibt dasselbe Bild. Die Deutung spricht nur über dieses Bild und erfindet nichts hinzu.",
        ],
      },
      {
        h: "Eine Sache, ein Wurf",
        p: [
          "Hexagramm 4 des I Ging, Die Jugendtorheit, sagt: „Beim ersten Orakel belehre ich; fragt er zwei- oder dreimal, so ist das eine Belästigung; belästigt er, so belehre ich nicht.“",
          "Zu derselben Sache reicht eine Frage. Gibt es wirklich etwas Neues, wirf für die neue Lage.",
        ],
      },
      {
        h: "Wer das macht",
        p: [
          "YaoFlow wird von einem einzelnen unabhängigen Entwickler gebaut und betrieben. Keine Investoren. Der Grund ist simpel: Ich wollte einen ruhigen Ort, um eine Entscheidung zu durchdenken, und die ähnlichen Produkte, die ich fand, erfanden entweder Dinge oder redeten mit ihren Nutzern wie mit Dummköpfen.",
          "Wenn du eine Frage hast oder einen Fehler findest — besonders in der Berechnung des Bildes oder im klassischen Text, die mir sehr am Herzen liegen — schreib mir bitte.",
        ],
      },
    ],
    aboutMeta: "YaoFlow ist ein Ort, um mit Liu Yao Gedanken zu ordnen: Das Bild folgt den alten Regeln, alle Quellen sind öffentlich und nachprüfbar.",
  },

  es: {
    points: {
      text: {
        title: "El texto es el texto real",
        body: "Los 64 dictámenes y los 384 textos de líneas son el Zhouyi recibido, transcritos de la edición china de Wikisource en dominio público — sin parafrasear, sin inventar. Cada frase clásica que lees aquí se corresponde palabra por palabra con los libros antiguos.",
      },
      engine: {
        title: "La figura sigue las reglas antiguas",
        body: "Troncos y ramas najia, palacio y líneas Yo/Otro, las seis relaciones y los seis espíritus, vacíos y choques del mes, fuerza estacional — todo se dispone según las reglas antiguas del Bushi Zhengzong y el Jingshi Yizhuan. Cada elemento que ves puede consultarse en esos libros.",
      },
      honest: {
        title: "Ninguna promesa sobre tu futuro",
        body: "No te decimos qué va a pasar, no vendemos suerte y no damos consejo médico, legal ni financiero. Es un sistema simbólico con tres milenios de tradición escrita, usado aquí para darle a una pregunta abierta una estructura dentro de la cual pensar. La decisión sigue siendo tuya.",
      },
    },
    sources: {
      [SEP]: { title: "Chinese Philosophy of Change", note: "Stanford Encyclopedia of Philosophy — capas del texto e historia de su recepción" },
      [CTEXT]: { title: "El Libro de los Cambios", note: "Chinese Text Project — texto fuente y comentarios" },
      [WIKI]: { title: "El Zhouyi en Wikisource", note: "La fuente directa de nuestros textos de hexagramas y líneas (dominio público)" },
      [MET]: { title: "Fragmento de hueso adivinatorio, dinastía Shang", note: "The Metropolitan Museum of Art — el registro material más antiguo de la adivinación china" },
      [LEGGE]: { title: "El I Ching de Legge (1882)", note: "Proyecto Gutenberg — la traducción en dominio público que informa nuestra versión inglesa" },
    },
    about: [
      {
        h: "Qué es esto",
        p: [
          "YaoFlow es un lugar para pensar una pregunta abierta con el I Ching. Escribes eso a lo que le das vueltas, tiras seis líneas y recibes una figura — primero el texto recibido de hace tres mil años, luego una lectura moderna que conecta esa figura con tu situación.",
          "Lo que hace YaoFlow es poner un viejo sistema simbólico, jugado con sus propias reglas, junto a tu pregunta, para que mires desde otra estructura algo que ya sabes a medias.",
        ],
      },
      {
        h: "De dónde sale la figura",
        p: [
          "La figura se dispone según las reglas antiguas: la misma tirada en el mismo momento da la misma figura. La lectura habla solo de esa figura y no inventa nada más.",
        ],
      },
      {
        h: "Un asunto, una tirada",
        p: [
          "El hexagrama 4 del I Ching dice: la primera tirada responde; preguntar una y otra vez desgasta la respuesta.",
          "Sobre un mismo asunto, basta con preguntar una vez. Si de verdad hay algo nuevo, haz una tirada para la nueva situación.",
        ],
      },
      {
        h: "Quién hace esto",
        p: [
          "YaoFlow lo construye y lo mantiene un solo desarrollador independiente. Sin inversores. La razón es sencilla: quería un lugar tranquilo para pensar una decisión, y los productos similares que encontré o inventaban cosas o trataban a sus usuarios como tontos.",
          "Si tienes una pregunta, o encuentras un error — sobre todo en el cálculo de la figura o en el texto clásico, que me importan mucho — escríbeme.",
        ],
      },
    ],
    aboutMeta: "YaoFlow es un lugar para ordenar ideas con el Liu Yao: la figura sigue las reglas antiguas y todas las fuentes son públicas y comprobables.",
  },

  pt: {
    points: {
      text: {
        title: "O texto é o texto verdadeiro",
        body: "Os 64 julgamentos e os 384 textos das linhas são o Zhouyi recebido, transcritos da edição chinesa do Wikisource em domínio público — sem paráfrase, sem invenção. Cada frase clássica que você lê aqui corresponde palavra por palavra aos livros antigos.",
      },
      engine: {
        title: "A figura segue as regras antigas",
        body: "Troncos e ramos najia, palácio e linhas Eu/Outro, as seis relações e os seis espíritos, vazios e choques do mês, força sazonal — tudo disposto segundo as regras antigas do Bushi Zhengzong e do Jingshi Yizhuan. Cada item que você vê pode ser conferido nesses livros.",
      },
      honest: {
        title: "Nenhuma promessa sobre o seu futuro",
        body: "Não dizemos o que vai acontecer, não vendemos sorte e não damos aconselhamento médico, jurídico ou financeiro. Este é um sistema simbólico com três milênios de tradição escrita, usado aqui para dar a uma pergunta em aberto uma estrutura dentro da qual pensar. A decisão continua sendo sua.",
      },
    },
    sources: {
      [SEP]: { title: "Chinese Philosophy of Change", note: "Stanford Encyclopedia of Philosophy — camadas do texto e história da recepção" },
      [CTEXT]: { title: "O Livro das Mutações", note: "Chinese Text Project — texto-fonte e comentários" },
      [WIKI]: { title: "O Zhouyi no Wikisource", note: "A fonte direta dos nossos textos de hexagramas e linhas (domínio público)" },
      [MET]: { title: "Fragmento de osso oracular, dinastia Shang", note: "The Metropolitan Museum of Art — o registro material mais antigo da adivinhação chinesa" },
      [LEGGE]: { title: "O I Ching de Legge (1882)", note: "Projeto Gutenberg — a tradução em domínio público que orienta a nossa versão em inglês" },
    },
    about: [
      {
        h: "O que é isto",
        p: [
          "O YaoFlow é um lugar para pensar uma pergunta em aberto com o I Ching. Você escreve aquilo que não sai da sua cabeça, lança as moedas seis vezes e recebe uma figura — primeiro o texto recebido de três mil anos atrás, depois uma leitura moderna que liga essa figura à sua situação.",
          "O que o YaoFlow faz é colocar um velho sistema simbólico, jogado pelas suas próprias regras, ao lado da sua pergunta, para que você olhe de outra estrutura para algo que já sabe pela metade.",
        ],
      },
      {
        h: "De onde vem a figura",
        p: [
          "A figura é disposta segundo as regras antigas: a mesma tiragem no mesmo momento dá a mesma figura. A leitura fala só dessa figura e não inventa nada além.",
        ],
      },
      {
        h: "Um assunto, uma tiragem",
        p: [
          "O hexagrama 4 do I Ching diz: a primeira consulta responde; perguntar de novo e de novo desgasta a resposta.",
          "Sobre o mesmo assunto, basta perguntar uma vez. Se houver de fato algo novo, faça uma tiragem para a nova situação.",
        ],
      },
      {
        h: "Quem faz isto",
        p: [
          "O YaoFlow é construído e mantido por um único desenvolvedor independente. Sem investidores. O motivo é simples: eu queria um lugar tranquilo para pensar uma decisão, e os produtos semelhantes que encontrei ou inventavam coisas ou tratavam os usuários como tolos.",
          "Se você tiver uma pergunta, ou encontrar um erro — sobretudo no cálculo da figura ou no texto clássico, com os quais me importo muito — escreva para mim.",
        ],
      },
    ],
    aboutMeta: "O YaoFlow é um lugar para organizar as ideias com o Liu Yao: a figura segue as regras antigas, e todas as fontes são públicas e verificáveis.",
  },
};
