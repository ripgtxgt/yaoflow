import type { HowToAsk } from "./how-to-ask";

/**
 * 「怎麼問、怎麼看」 — the five languages written after the first four (09-30, Neil: 「所有的语言版本都上吧」).
 * Same four parts and the same plain voice; the site's own words for the reading (심층 풀이 / lecture approfondie /
 * Tiefendeutung / lectura completa / leitura completa) and for the follow-up box and the progress note.
 */
export const KO: HowToAsk = {
  title: "어떻게 물을까, 괘가 나쁘면 어떻게 볼까",
  metaTitle: "육효는 어떻게 물어야 답이 나올까 — 괘가 나쁠 때 보는 법, 다시 묻는 때",
  lead: "같은 괘라도 묻는 법이 다르면 답할 수 있는 것이 달라집니다. 이 페이지는 네 가지를 말합니다: 어떻게 묻는지, 괘가 나쁠 때 어떻게 보는지, 언제 다시 묻는지, 어떻게 확인하는지.",
  ask: {
    h: "어떻게 물을까",
    rules: [
      "한 번에 한 가지만. 두 가지를 한 문장에 넣으면 괘는 어느 쪽에 답할지 모릅니다.",
      "상대와 기한을 말하세요. 상대가 있어야 괘가 누구를 볼지 알고, 기한이 있어야 시기가 내려앉을 자리가 생깁니다.",
      "「될까요」「언제」「해야 할까요」를 묻고, 「왜」는 되도록 피하세요. 괘가 보는 것은 흐름이지 동기가 아닙니다.",
    ],
    pairsLead: "몇 쌍을 놓아 봅니다. 왼쪽은 흔한 물음, 오른쪽은 괘가 답할 수 있는 물음입니다:",
    vague: "막연한",
    specific: "구체적인",
    pairs: [
      { topic: "연애", from: "그 사람은 나를 어떻게 생각할까?", to: "이달 안에 그 사람이 먼저 연락할까요?" },
      { topic: "연애", from: "우리에게 아직 가능성이 있을까?", to: "올해 안에 우리는 다시 만날까요?" },
      { topic: "연애", from: "이 관계, 어떻게 해야 하지?", to: "이달에 그 사람과 확실히 이야기해야 할까요?" },
      { topic: "일", from: "올해 내 직장운은?", to: "이 제안, 받아야 할까요?" },
      { topic: "일", from: "직장을 옮겨야 할까?", to: "석 달 안에 그만두면, 다음 직장이 지금보다 나을까요?" },
      { topic: "일", from: "면접 잘 될까?", to: "다음 주 수요일 면접에서 다음 단계 연락이 올까요?" },
      { topic: "돈", from: "올해 금전운이 좋을까?", to: "이 돈을 지금 빌려주면, 올해 안에 돌아올까요?" },
      { topic: "돈", from: "투자해야 할까?", to: "이 주식, 이달에 팔아야 할까요?" },
      { topic: "학업", from: "합격할 수 있을까?", to: "내년 2월 이 시험, 통과할까요?" },
      { topic: "학업", from: "유학을 가야 할까?", to: "내년 가을 이 과정에 지원하면 붙을까요?" },
      { topic: "이사", from: "이사해야 할까?", to: "올해 안에 그곳으로 옮기면, 사는 게 순조로울까요?" },
      { topic: "결정", from: "어떻게 해야 하지?", to: "A와 B 중 하나만 고른다면, A를 고른 길은 순조로울까요?" },
    ],
    after: "무엇을 물을지 아직 정해지지 않았다면 서둘러 던지지 마세요. 사람, 일, 시기가 들어간 한 문장으로 쓴 다음 시작하세요.",
  },
  bad: {
    h: "괘가 나쁘면, 어떻게 볼까",
    intro: [
      "나쁜 괘는 이 길을 계속 가면 순조롭지 않다는 뜻이지, 당신에게 내려진 판결이 아닙니다. 한 가지 일에도 길은 하나가 아닙니다.",
      "이때 괘를 다시 세울 필요는 없습니다. 같은 풀이 아래 「추가 질문」으로 각도를 바꿔 물으세요:",
    ],
    angles: [
      { q: "그래도 내가 할 수 있는 건?", note: "풀이에는 보통 피할 것과 지켜볼 것이 이미 적혀 있습니다. 그 둘을 먼저 물으세요." },
      { q: "다른 길이라면?", note: "하지 않기, 기다리기, 방법 바꾸기 — 각각 어떤 국면이 되는지 하나씩 물을 수 있습니다." },
      { q: "이 일이 나에게 정말 무엇을 바꾸는가?", note: "괘가 말하는 「순조롭지 않다」는 한 구간의 이야기일 때가 많고, 전체가 아닙니다." },
    ],
    after: "세 각도는 모두 같은 풀이 안에서 묻습니다. 괘는 바뀌지 않았고, 바뀐 것은 보는 각도이기 때문입니다. 같은 일로 괘를 다시 세우면 다른 괘가 하나 더 나올 뿐, 더 좋아진다는 보장은 없습니다.",
  },
  again: {
    h: "언제 다시 묻고, 언제 멈출까",
    rules: [
      "같은 일은 하루에 한 괘. 오늘 물었으면 괘는 이미 답했습니다. 먼저 그 한 걸음을.",
      "묻는 말을 바꿔도 답은 바뀌지 않습니다. 「그 사람이 돌아올까」와 「우리에게 아직 기회가 있을까」는 같은 일입니다.",
      "새로운 움직임이 있으면 다시 묻습니다. 정말 답장이 왔다, 정말 제안이 왔다 — 그때는 풀이 페이지의 「경과 적기」에 쓰거나, 새 국면으로 괘를 세우세요.",
      "시기가 오면 먼저 맞춰 보세요. 괘가 10월 중순이라 했으면 10월 중순까지 기다려 어떻게 됐는지 보고, 그다음 다시 물을지 정하세요.",
      "멈출 때: 괘가 두 번 연속 「아직 움직이지 마라」고 했는데 당신은 「움직여라」만 듣고 싶다면 — 멈추세요. 답은 이미 나왔습니다.",
    ],
  },
  check: {
    h: "어떻게 확인할까",
    intro: "괘가 그대로 되었는지는 우리가 말할 일이 아니라 당신이 맞춰 볼 일입니다. 세 가지 동작:",
    steps: [
      "시기가 지나면 메일을 한 통 보내 묻습니다: 그 일, 어떻게 되었나요. 한 번 누르면 됩니다.",
      "모든 답은 당신의 「적중 기록」에 남습니다 — 그대로 됐다, 일부 그대로, 일어나지 않았다. 한 건도 지우지 않습니다.",
      "공개 괘 사례는 다른 사람의 괘입니다: 어떤 종류의 물음이었고, 괘는 무엇을 말했고, 시기가 지난 뒤 어떻게 됐는지. 먼저 읽고, 그다음 자기 일을 물어도 됩니다.",
    ],
    after: "몇 번 맞춰 보면, 괘가 당신에게서 어떻게 작동하는지 스스로 알게 됩니다. 그것이 어떤 숫자보다 확실합니다.",
  },
  links: { cases: "다른 사람은 어떻게 묻는지 보기 (공개 괘 사례)", timing: "시기는 어디서 나오는가", glossary: "육효 용어집" },
  entry: { cast: "어떻게 물을지 모르겠다면, 이 페이지", followup: "괘가 나쁘다면? 세 가지 각도로 다시 묻기", account: "묻는 법, 보는 법", back: "어떻게 물을까, 괘가 나쁘면 어떻게 볼까" },
};

export const FR: HowToAsk = {
  title: "Comment poser la question, et que faire d'un mauvais hexagramme",
  metaTitle: "Comment interroger le Yi Jing pour obtenir une réponse — et que faire quand l'hexagramme est mauvais",
  lead: "Le même hexagramme répond autrement selon la question. Quatre choses sur cette page : comment demander, que faire quand l'hexagramme est mauvais, quand redemander, comment vérifier.",
  ask: {
    h: "Comment demander",
    rules: [
      "Une seule affaire par question. Deux affaires dans une phrase, et l'hexagramme ne sait pas à laquelle répondre.",
      "Nommez la personne et l'échéance. Avec une personne, l'hexagramme sait qui regarder ; avec une échéance, la date qu'il donne a où se poser.",
      "Demandez « est-ce que », « quand », « dois-je » — rarement « pourquoi ». Un hexagramme lit où vont les choses, pas les motifs.",
    ],
    pairsLead: "Quelques paires : à gauche, la façon habituelle de demander ; à droite, celle à laquelle un hexagramme peut répondre :",
    vague: "Vague",
    specific: "Précise",
    pairs: [
      { topic: "Amour", from: "Que pense-t-il vraiment de moi ?", to: "Va-t-il me recontacter d'ici la fin du mois ?" },
      { topic: "Amour", from: "Y a-t-il encore une chance pour nous ?", to: "Allons-nous nous remettre ensemble avant la fin de l'année ?" },
      { topic: "Amour", from: "Que faire de cette relation ?", to: "Dois-je avoir la conversation avec lui ce mois-ci ?" },
      { topic: "Travail", from: "Comment est ma carrière cette année ?", to: "Dois-je accepter cette offre ?" },
      { topic: "Travail", from: "Dois-je changer de travail ?", to: "Si je pars dans les trois mois, le prochain poste sera-t-il meilleur que celui-ci ?" },
      { topic: "Travail", from: "L'entretien va-t-il bien se passer ?", to: "L'entretien de mercredi prochain mènera-t-il à un second tour ?" },
      { topic: "Argent", from: "Ai-je de la chance avec l'argent cette année ?", to: "Si je prête cet argent maintenant, le récupérerai-je avant la fin de l'année ?" },
      { topic: "Argent", from: "Dois-je investir ?", to: "Dois-je vendre cette action ce mois-ci ?" },
      { topic: "Études", from: "Vais-je réussir ?", to: "Vais-je réussir l'examen de février ?" },
      { topic: "Études", from: "Dois-je partir à l'étranger ?", to: "Si je candidate à ce programme l'automne prochain, serai-je admis ?" },
      { topic: "Déménagement", from: "Dois-je déménager ?", to: "Si je m'installe là-bas avant la fin de l'année, la vie s'y passera-t-elle bien ?" },
      { topic: "Une décision", from: "Que dois-je faire ?", to: "C'est A ou B — si je choisis A, la route sera-t-elle dégagée ?" },
    ],
    after: "Si vous ne savez pas encore ce que vous demandez, ne vous pressez pas de lancer. Écrivez l'affaire en une phrase — une personne, une chose, un moment — puis commencez.",
  },
  bad: {
    h: "Quand l'hexagramme est mauvais",
    intro: [
      "Un mauvais hexagramme dit que cette route sera difficile si vous continuez. Ce n'est pas une sentence prononcée contre vous. Une affaire a plus d'une route.",
      "Ne retirez pas. Sous la même lecture, utilisez la case de suivi et demandez sous un autre angle :",
    ],
    angles: [
      { q: "Alors que puis-je encore faire ?", note: "La lecture dit généralement déjà quoi éviter et quoi surveiller. Demandez d'abord ces deux choses." },
      { q: "Et une autre route ?", note: "Ne pas le faire, attendre, faire autrement — demandez à quoi ressemble chacune, une à la fois." },
      { q: "Qu'est-ce que cela change vraiment pour moi ?", note: "Souvent le « difficile » de l'hexagramme désigne un tronçon, pas l'ensemble." },
    ],
    after: "Les trois angles se demandent dans la même lecture, parce que l'hexagramme n'a pas changé — seul l'angle d'où vous regardez a changé. Retirer sur la même affaire ne donne qu'un autre hexagramme, pas forcément meilleur.",
  },
  again: {
    h: "Quand redemander, et quand s'arrêter",
    rules: [
      "Une affaire, un tirage par jour. Vous avez demandé aujourd'hui ; l'hexagramme a répondu ; allez faire ce pas.",
      "Reformuler la question ne change pas la réponse. « Va-t-il revenir » et « y a-t-il encore une chance pour nous » sont la même affaire.",
      "Redemandez quand quelque chose s'est vraiment passé. Il a vraiment répondu, l'offre est vraiment arrivée — alors notez un progrès sur la page de lecture, ou tirez pour la nouvelle situation.",
      "Quand la date arrive, vérifiez d'abord. Si l'hexagramme a dit mi-octobre, attendez la mi-octobre, voyez ce qui s'est passé, et décidez ensuite seulement de redemander.",
      "Quand s'arrêter : l'hexagramme a dit deux fois « ne bougez pas encore », et vous ne voulez entendre que « bougez » — arrêtez. La réponse est déjà là.",
    ],
  },
  check: {
    h: "Comment vérifier",
    intro: "Si un hexagramme avait raison, c'est à vous de le voir, pas à nous de le dire. Trois gestes :",
    steps: [
      "Quand la date arrive, nous vous envoyons un courriel : qu'est devenue cette affaire ? Un geste suffit pour répondre.",
      "Chaque réponse entre dans votre propre registre — s'est réalisé, en partie, ne s'est pas produit — et aucune n'en est jamais retirée.",
      "Les cas publics sont les hexagrammes d'autres personnes : quel type de question, ce que l'hexagramme a dit, ce qui s'est passé après la date. Vous pouvez les lire d'abord, puis poser la vôtre.",
    ],
    after: "Après quelques vérifications, vous saurez par vous-même comment les hexagrammes tournent pour vous. Cela vaut plus que n'importe quel chiffre.",
  },
  links: { cases: "Voir comment les autres demandent (cas publics)", timing: "D'où vient la date d'une lecture", glossary: "Glossaire des termes" },
  entry: { cast: "Vous ne savez pas comment demander ? Lisez ceci", followup: "Mauvais hexagramme ? Trois autres angles", account: "Comment demander, comment lire", back: "Comment poser la question, et que faire d'un mauvais hexagramme" },
};

export const DE: HowToAsk = {
  title: "Wie man fragt – und was man mit einem schlechten Hexagramm macht",
  metaTitle: "Wie fragt man das I Ging, damit es antwortet – und was tun, wenn das Hexagramm schlecht ist",
  lead: "Dasselbe Hexagramm antwortet auf eine andere Frage anders. Vier Dinge auf dieser Seite: wie man fragt, was man bei einem schlechten Hexagramm tut, wann man noch einmal fragt, wie man prüft.",
  ask: {
    h: "Wie man fragt",
    rules: [
      "Eine Sache pro Frage. Zwei Sachen in einem Satz, und das Hexagramm weiß nicht, welche es beantworten soll.",
      "Nenne die Person und den Zeitrahmen. Mit einer Person weiß das Hexagramm, wen es ansehen soll; mit einem Zeitrahmen hat das Datum, das es nennt, einen Ort zum Landen.",
      "Frage „wird es“, „wann“, „soll ich“ – selten „warum“. Ein Hexagramm liest, wohin die Dinge gehen, nicht die Motive.",
    ],
    pairsLead: "Ein paar Paare – links, wie meist gefragt wird; rechts, wie ein Hexagramm antworten kann:",
    vague: "Vage",
    specific: "Konkret",
    pairs: [
      { topic: "Liebe", from: "Was denkt er wirklich über mich?", to: "Meldet er sich noch in diesem Monat bei mir?" },
      { topic: "Liebe", from: "Gibt es für uns noch eine Chance?", to: "Kommen wir vor Jahresende wieder zusammen?" },
      { topic: "Liebe", from: "Was soll ich mit dieser Beziehung machen?", to: "Soll ich das Gespräch mit ihm in diesem Monat führen?" },
      { topic: "Arbeit", from: "Wie läuft es beruflich dieses Jahr?", to: "Soll ich dieses Angebot annehmen?" },
      { topic: "Arbeit", from: "Soll ich den Job wechseln?", to: "Wenn ich innerhalb von drei Monaten gehe – wird die nächste Stelle besser als diese?" },
      { topic: "Arbeit", from: "Läuft das Vorstellungsgespräch gut?", to: "Führt das Gespräch am nächsten Mittwoch zu einer nächsten Runde?" },
      { topic: "Geld", from: "Habe ich dieses Jahr Glück mit Geld?", to: "Wenn ich dieses Geld jetzt verleihe – bekomme ich es bis Jahresende zurück?" },
      { topic: "Geld", from: "Soll ich investieren?", to: "Soll ich diese Aktie in diesem Monat verkaufen?" },
      { topic: "Studium", from: "Bestehe ich?", to: "Bestehe ich die Prüfung im Februar?" },
      { topic: "Studium", from: "Soll ich ins Ausland gehen?", to: "Wenn ich mich im nächsten Herbst für dieses Programm bewerbe – werde ich angenommen?" },
      { topic: "Umzug", from: "Soll ich umziehen?", to: "Wenn ich vor Jahresende dorthin ziehe – lebt es sich dort gut?" },
      { topic: "Eine Entscheidung", from: "Was soll ich tun?", to: "Es ist A oder B – läuft der Weg glatt, wenn ich A wähle?" },
    ],
    after: "Wenn du noch nicht weißt, was du fragst, wirf nicht überstürzt. Schreib die Sache als einen Satz – eine Person, eine Sache, ein Zeitpunkt – und fang dann an.",
  },
  bad: {
    h: "Wenn das Hexagramm schlecht ist",
    intro: [
      "Ein schlechtes Hexagramm sagt: Dieser Weg wird holprig, wenn du weitergehst. Es ist kein Urteil über dich. Eine Sache hat mehr als einen Weg.",
      "Wirf nicht noch einmal. Nutze unter derselben Deutung das Nachfrage-Feld und frage aus einem anderen Winkel:",
    ],
    angles: [
      { q: "Was kann ich dann noch tun?", note: "Die Deutung sagt meist schon, was zu meiden und was zu beobachten ist. Frag zuerst nach diesen beiden." },
      { q: "Und ein anderer Weg?", note: "Es nicht tun, warten, es anders machen – frag nacheinander, wie jeder aussieht." },
      { q: "Was ändert das wirklich für mich?", note: "Oft meint das „holprig“ des Hexagramms eine Strecke, nicht das Ganze." },
    ],
    after: "Alle drei Winkel fragst du innerhalb derselben Deutung, denn das Hexagramm hat sich nicht geändert – nur der Winkel, aus dem du schaust. Noch einmal zur selben Sache zu werfen bringt nur ein weiteres Hexagramm, nicht unbedingt ein besseres.",
  },
  again: {
    h: "Wann noch einmal fragen – und wann aufhören",
    rules: [
      "Eine Sache, ein Wurf am Tag. Du hast heute gefragt; das Hexagramm hat geantwortet; geh und mach diesen Schritt.",
      "Die Frage umzuformulieren ändert die Antwort nicht. „Kommt er zurück“ und „gibt es für uns noch eine Chance“ sind dieselbe Sache.",
      "Frag noch einmal, wenn wirklich etwas passiert ist. Er hat wirklich geschrieben, das Angebot ist wirklich gekommen – dann trag auf der Deutungsseite einen Fortschritt ein oder wirf für die neue Lage.",
      "Wenn das Datum kommt, prüfe zuerst. Sagte das Hexagramm Mitte Oktober, warte bis Mitte Oktober, sieh, was passiert ist, und entscheide erst dann, ob du noch einmal fragst.",
      "Wann aufhören: Das Hexagramm hat zweimal „noch nicht bewegen“ gesagt, und du willst nur „bewegen“ hören – dann hör auf. Die Antwort ist schon da.",
    ],
  },
  check: {
    h: "Wie man prüft",
    intro: "Ob ein Hexagramm recht hatte, siehst du selbst – wir sagen es nicht. Drei Handgriffe:",
    steps: [
      "Wenn das Datum kommt, schicken wir dir eine E-Mail: Wie ist es mit dieser Sache ausgegangen? Ein Tipp genügt als Antwort.",
      "Jede Antwort geht in dein eigenes Verzeichnis – eingetreten, teilweise, nicht passiert – und keine wird je entfernt.",
      "Die öffentlichen Fälle sind Hexagramme anderer Leute: welche Art Frage, was das Hexagramm sagte, was nach dem Datum geschah. Du kannst sie zuerst lesen und dann deine eigene stellen.",
    ],
    after: "Nach ein paar Prüfungen weißt du selbst, wie Hexagramme bei dir ausgehen. Das ist mehr wert als jede Zahl.",
  },
  links: { cases: "Sehen, wie andere fragen (öffentliche Fälle)", timing: "Woher das Datum einer Deutung kommt", glossary: "Glossar der Begriffe" },
  entry: { cast: "Unsicher, wie du fragen sollst? Lies das", followup: "Schlechtes Hexagramm? Drei andere Winkel", account: "Wie fragen, wie lesen", back: "Wie man fragt – und was man mit einem schlechten Hexagramm macht" },
};

export const ES: HowToAsk = {
  title: "Cómo preguntar, y qué hacer con un hexagrama malo",
  metaTitle: "Cómo preguntarle al I Ching para que responda — y qué hacer cuando el hexagrama es malo",
  lead: "El mismo hexagrama responde distinto a una pregunta distinta. Cuatro cosas en esta página: cómo preguntar, qué hacer cuando el hexagrama es malo, cuándo volver a preguntar y cómo comprobar.",
  ask: {
    h: "Cómo preguntar",
    rules: [
      "Un asunto por pregunta. Dos asuntos en una frase, y el hexagrama no sabe a cuál responder.",
      "Nombra a la persona y el plazo. Con una persona, el hexagrama sabe a quién mirar; con un plazo, la fecha que da tiene dónde caer.",
      "Pregunta “¿pasará?”, “¿cuándo?”, “¿debería?” — rara vez “¿por qué?”. Un hexagrama lee hacia dónde van las cosas, no los motivos.",
    ],
    pairsLead: "Algunos pares: a la izquierda, cómo suele preguntar la gente; a la derecha, cómo puede responder un hexagrama:",
    vague: "Vaga",
    specific: "Concreta",
    pairs: [
      { topic: "Amor", from: "¿Qué piensa él realmente de mí?", to: "¿Me escribirá él antes de que acabe el mes?" },
      { topic: "Amor", from: "¿Todavía hay una oportunidad para nosotros?", to: "¿Volveremos antes de fin de año?" },
      { topic: "Amor", from: "¿Qué hago con esta relación?", to: "¿Debería tener la conversación con él este mes?" },
      { topic: "Trabajo", from: "¿Cómo va mi carrera este año?", to: "¿Debería aceptar esta oferta?" },
      { topic: "Trabajo", from: "¿Debería cambiar de trabajo?", to: "Si me voy en tres meses, ¿el próximo trabajo será mejor que este?" },
      { topic: "Trabajo", from: "¿Irá bien la entrevista?", to: "¿La entrevista del miércoles que viene llevará a una siguiente ronda?" },
      { topic: "Dinero", from: "¿Tengo suerte con el dinero este año?", to: "Si presto este dinero ahora, ¿lo recuperaré antes de fin de año?" },
      { topic: "Dinero", from: "¿Debería invertir?", to: "¿Debería vender esta acción este mes?" },
      { topic: "Estudios", from: "¿Aprobaré?", to: "¿Aprobaré el examen de febrero?" },
      { topic: "Estudios", from: "¿Debería irme al extranjero?", to: "Si solicito este programa el próximo otoño, ¿me admitirán?" },
      { topic: "Mudanza", from: "¿Debería mudarme?", to: "Si me mudo allí antes de fin de año, ¿me irá bien viviendo allí?" },
      { topic: "Una decisión", from: "¿Qué hago?", to: "Es A o B: si elijo A, ¿el camino irá fluido?" },
    ],
    after: "Si aún no tienes claro qué preguntas, no te apresures a lanzar. Escribe el asunto en una frase — una persona, una cosa, un momento — y luego empieza.",
  },
  bad: {
    h: "Cuando el hexagrama es malo",
    intro: [
      "Un hexagrama malo dice que este camino será difícil si sigues por él. No es una sentencia contra ti. Un asunto tiene más de un camino.",
      "No vuelvas a tirar. Bajo la misma lectura, usa la casilla de seguimiento y pregunta desde otro ángulo:",
    ],
    angles: [
      { q: "¿Entonces qué puedo hacer todavía?", note: "La lectura normalmente ya dice qué evitar y qué vigilar. Pregunta primero por esas dos cosas." },
      { q: "¿Y otro camino?", note: "No hacerlo, esperar, hacerlo de otra forma — pregunta cómo se ve cada uno, de uno en uno." },
      { q: "¿Qué cambia esto realmente para mí?", note: "Muchas veces lo “difícil” del hexagrama es un tramo, no el conjunto." },
    ],
    after: "Los tres ángulos se preguntan dentro de la misma lectura, porque el hexagrama no ha cambiado; solo el ángulo desde el que miras. Volver a tirar sobre el mismo asunto solo da otro hexagrama, no necesariamente mejor.",
  },
  again: {
    h: "Cuándo volver a preguntar, y cuándo parar",
    rules: [
      "Un asunto, una tirada al día. Preguntaste hoy; el hexagrama respondió; ve y da ese paso.",
      "Cambiar las palabras no cambia la respuesta. “¿Volverá?” y “¿todavía hay una oportunidad?” son el mismo asunto.",
      "Vuelve a preguntar cuando de verdad haya pasado algo. Él sí escribió, la oferta sí llegó — entonces anota el avance en la página de la lectura, o tira para la nueva situación.",
      "Cuando llegue la fecha, comprueba primero. Si el hexagrama dijo mediados de octubre, espera a mediados de octubre, mira qué pasó, y solo entonces decide si preguntas de nuevo.",
      "Cuándo parar: el hexagrama ha dicho dos veces “no te muevas aún” y tú solo quieres oír “muévete” — para. La respuesta ya está.",
    ],
  },
  check: {
    h: "Cómo comprobar",
    intro: "Si un hexagrama acertó, eso lo ves tú, no lo decimos nosotros. Tres acciones:",
    steps: [
      "Cuando llegue la fecha, te enviamos un correo: ¿cómo terminó ese asunto? Un toque basta para responder.",
      "Cada respuesta entra en tu propio registro — se cumplió, en parte, no pasó — y ninguna se borra nunca.",
      "Los casos públicos son hexagramas de otras personas: qué tipo de pregunta, qué dijo el hexagrama, qué pasó después de la fecha. Puedes leerlos primero y luego preguntar lo tuyo.",
    ],
    after: "Después de comprobar unas cuantas veces, sabrás por ti mismo cómo te resultan los hexagramas. Eso vale más que cualquier número.",
  },
  links: { cases: "Ver cómo preguntan otros (casos públicos)", timing: "De dónde sale la fecha de una lectura", glossary: "Glosario de términos" },
  entry: { cast: "¿No sabes cómo preguntar? Lee esto", followup: "¿Hexagrama malo? Tres ángulos más", account: "Cómo preguntar, cómo leer", back: "Cómo preguntar, y qué hacer con un hexagrama malo" },
};

export const PT: HowToAsk = {
  title: "Como perguntar, e o que fazer com um hexagrama ruim",
  metaTitle: "Como perguntar ao I Ching para ter resposta — e o que fazer quando o hexagrama é ruim",
  lead: "O mesmo hexagrama responde de outro jeito a outra pergunta. Quatro coisas nesta página: como perguntar, o que fazer quando o hexagrama é ruim, quando perguntar de novo e como conferir.",
  ask: {
    h: "Como perguntar",
    rules: [
      "Um assunto por pergunta. Dois assuntos numa frase, e o hexagrama não sabe qual responder.",
      "Diga a pessoa e o prazo. Com uma pessoa, o hexagrama sabe para quem olhar; com um prazo, a data que ele dá tem onde pousar.",
      "Pergunte “vai acontecer?”, “quando?”, “devo?” — raramente “por quê?”. Um hexagrama lê para onde as coisas vão, não os motivos.",
    ],
    pairsLead: "Alguns pares: à esquerda, como as pessoas costumam perguntar; à direita, como um hexagrama consegue responder:",
    vague: "Vaga",
    specific: "Específica",
    pairs: [
      { topic: "Amor", from: "O que ele pensa de mim de verdade?", to: "Ele vai me procurar até o fim deste mês?" },
      { topic: "Amor", from: "Ainda existe chance para nós?", to: "Vamos voltar antes do fim do ano?" },
      { topic: "Amor", from: "O que faço com essa relação?", to: "Devo ter a conversa com ele neste mês?" },
      { topic: "Trabalho", from: "Como vai minha carreira este ano?", to: "Devo aceitar esta proposta?" },
      { topic: "Trabalho", from: "Devo mudar de emprego?", to: "Se eu sair em três meses, o próximo emprego será melhor que este?" },
      { topic: "Trabalho", from: "A entrevista vai dar certo?", to: "A entrevista da próxima quarta vai levar a uma próxima etapa?" },
      { topic: "Dinheiro", from: "Tenho sorte com dinheiro este ano?", to: "Se eu emprestar esse dinheiro agora, recebo de volta até o fim do ano?" },
      { topic: "Dinheiro", from: "Devo investir?", to: "Devo vender esta ação neste mês?" },
      { topic: "Estudos", from: "Vou passar?", to: "Vou passar na prova de fevereiro?" },
      { topic: "Estudos", from: "Devo ir para fora?", to: "Se eu me candidatar a este programa no próximo outono, vou ser aceito?" },
      { topic: "Mudança", from: "Devo me mudar?", to: "Se eu me mudar para lá até o fim do ano, vai ser tranquilo morar lá?" },
      { topic: "Uma decisão", from: "O que eu faço?", to: "É A ou B: se eu escolher A, o caminho vai fluir?" },
    ],
    after: "Se ainda não sabe o que está perguntando, não corra para jogar. Escreva o assunto numa frase — uma pessoa, uma coisa, um momento — e então comece.",
  },
  bad: {
    h: "Quando o hexagrama é ruim",
    intro: [
      "Um hexagrama ruim diz que este caminho vai ser difícil se você continuar nele. Não é uma sentença contra você. Um assunto tem mais de um caminho.",
      "Não jogue de novo. Sob a mesma leitura, use a caixa de acompanhamento e pergunte por outro ângulo:",
    ],
    angles: [
      { q: "Então o que eu ainda posso fazer?", note: "A leitura normalmente já diz o que evitar e o que observar. Pergunte primeiro sobre esses dois." },
      { q: "E outro caminho?", note: "Não fazer, esperar, fazer de outro jeito — pergunte como fica cada um, um de cada vez." },
      { q: "O que isso muda de verdade para mim?", note: "Muitas vezes o “difícil” do hexagrama é um trecho, não o todo." },
    ],
    after: "Os três ângulos são perguntados dentro da mesma leitura, porque o hexagrama não mudou — só o ângulo de onde você olha. Jogar de novo sobre o mesmo assunto só dá outro hexagrama, não necessariamente melhor.",
  },
  again: {
    h: "Quando perguntar de novo, e quando parar",
    rules: [
      "Um assunto, uma tiragem por dia. Você perguntou hoje; o hexagrama respondeu; vá dar esse passo.",
      "Mudar as palavras não muda a resposta. “Ele vai voltar?” e “ainda existe chance para nós?” são o mesmo assunto.",
      "Pergunte de novo quando algo de fato tiver acontecido. Ele realmente respondeu, a proposta realmente chegou — então registre o avanço na página da leitura, ou jogue para a nova situação.",
      "Quando a data chegar, confira primeiro. Se o hexagrama disse meados de outubro, espere meados de outubro, veja o que aconteceu, e só então decida se pergunta de novo.",
      "Quando parar: o hexagrama disse duas vezes “ainda não se mova” e você só quer ouvir “mova-se” — pare. A resposta já está aí.",
    ],
  },
  check: {
    h: "Como conferir",
    intro: "Se um hexagrama acertou, é você quem vê, não nós que dizemos. Três ações:",
    steps: [
      "Quando a data chegar, mandamos um e-mail: como terminou aquele assunto? Um toque responde.",
      "Cada resposta entra no seu próprio registro — aconteceu, em parte, não aconteceu — e nenhuma é apagada.",
      "Os casos públicos são hexagramas de outras pessoas: que tipo de pergunta, o que o hexagrama disse, o que aconteceu depois da data. Você pode ler primeiro e depois perguntar o seu.",
    ],
    after: "Depois de conferir algumas vezes, você vai saber por si mesmo como os hexagramas funcionam para você. Isso vale mais que qualquer número.",
  },
  links: { cases: "Ver como os outros perguntam (casos públicos)", timing: "De onde vem a data de uma leitura", glossary: "Glossário de termos" },
  entry: { cast: "Não sabe como perguntar? Leia isto", followup: "Hexagrama ruim? Três outros ângulos", account: "Como perguntar, como ler", back: "Como perguntar, e o que fazer com um hexagrama ruim" },
};
