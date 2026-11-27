import type { Locale } from "../locales";

/**
 * 11-05 进度表 135 回访多问两句 (《易学人格学×YaoFlow》P3): after the answer, two optional taps — the state they were in,
 * and whether they did what they planned. 「撐不住」 is answered with care and the helplines (lib/crisis.ts), never a judgement.
 */
export interface StateCopy {
  ask: string; states: [string, string, string, string]; planAsk: (plan: string) => string; acted: [string, string, string];
  submit: string; skip: string; thanks: string; care: string;
}

export const STATE_T: Record<Locale, StateCopy> = {
  "zh-hant": {
    ask: "這段時間你大概在哪個狀態？（可以不答）", states: ["順", "有點緊", "壓力大", "快撐不住了"],
    planAsk: (p) => `上次你打算「${p}」，做了嗎？`, acted: ["做了", "做了一部分", "沒做"],
    submit: "送出", skip: "不答也沒關係，上面那一題已經記下了。", thanks: "謝謝你。這兩題只用來讓解讀更貼近像你這樣的人。",
    care: "聽起來這陣子真的很辛苦。卦可以等，你比較重要——如果想找人說說，下面這些電話隨時都有人接。",
  },
  zh: {
    ask: "这段时间你大概在哪个状态？（可以不答）", states: ["顺", "有点紧", "压力大", "快撑不住了"],
    planAsk: (p) => `上次你打算「${p}」，做了吗？`, acted: ["做了", "做了一部分", "没做"],
    submit: "提交", skip: "不答也没关系，上面那一题已经记下了。", thanks: "谢谢你。这两题只用来让解读更贴近像你这样的人。",
    care: "听起来这阵子真的很辛苦。卦可以等，你比较重要——如果想找人说说，下面这些电话随时都有人接。",
  },
  en: {
    ask: "How have you been lately? (optional)", states: ["Things are flowing", "A bit tight", "Under a lot of pressure", "Barely holding on"],
    planAsk: (p) => `Last time you planned to "${p}". Did you?`, acted: ["Yes", "Partly", "No"],
    submit: "Send", skip: "You can skip this — your answer above is already saved.", thanks: "Thank you. These two only help us write readings that fit people like you.",
    care: "It sounds like things have been really hard. The reading can wait; you matter more. If you'd like to talk to someone, these lines are always open.",
  },
  ja: {
    ask: "この間、どんな状態でしたか？（答えなくても大丈夫です）", states: ["順調", "少しきつい", "プレッシャーが大きい", "もう限界に近い"],
    planAsk: (p) => `前回「${p}」とお考えでした。できましたか？`, acted: ["できた", "一部できた", "できなかった"],
    submit: "送信", skip: "答えなくても大丈夫です。上の回答はもう記録されています。", thanks: "ありがとうございます。この二つは、あなたのような方に合う鑑定にするためだけに使います。",
    care: "この間、本当につらかったのですね。卦は待てます。あなたの方が大切です。誰かに話したいときは、下の窓口がいつでもつながります。",
  },
  ko: {
    ask: "요즘 어떤 상태였나요? (답하지 않아도 돼요)", states: ["순조로움", "조금 빠듯함", "부담이 큼", "버티기 힘듦"],
    planAsk: (p) => `지난번에 「${p}」 하겠다고 하셨죠. 해 보셨나요?`, acted: ["했어요", "일부만", "못 했어요"],
    submit: "보내기", skip: "답하지 않아도 괜찮아요. 위의 답은 이미 저장됐어요.", thanks: "고마워요. 이 두 가지는 당신 같은 분께 더 맞는 풀이를 쓰는 데만 써요.",
    care: "요즘 정말 힘드셨던 것 같아요. 괘는 기다릴 수 있어요. 당신이 더 중요해요. 이야기할 사람이 필요하면 아래 번호로 언제든 연락하세요.",
  },
  fr: {
    ask: "Comment allez-vous ces temps-ci ? (facultatif)", states: ["Ça avance bien", "Un peu tendu", "Beaucoup de pression", "Je tiens à peine"],
    planAsk: (p) => `La dernière fois, vous comptiez « ${p} ». L'avez-vous fait ?`, acted: ["Oui", "En partie", "Non"],
    submit: "Envoyer", skip: "Vous pouvez passer : votre réponse ci-dessus est déjà enregistrée.", thanks: "Merci. Ces deux réponses servent seulement à mieux écrire pour des personnes comme vous.",
    care: "On dirait que ces temps-ci sont vraiment durs. La lecture peut attendre ; vous comptez davantage. Si vous voulez parler à quelqu'un, ces lignes sont toujours ouvertes.",
  },
  de: {
    ask: "Wie ging es Ihnen in letzter Zeit? (freiwillig)", states: ["Es läuft", "Etwas eng", "Viel Druck", "Ich halte kaum noch durch"],
    planAsk: (p) => `Letztes Mal hatten Sie vor: „${p}“. Haben Sie es getan?`, acted: ["Ja", "Teilweise", "Nein"],
    submit: "Senden", skip: "Sie können das überspringen – Ihre Antwort oben ist schon gespeichert.", thanks: "Danke. Diese beiden Angaben helfen nur, Deutungen für Menschen wie Sie besser zu schreiben.",
    care: "Es klingt, als wäre es gerade wirklich schwer. Die Deutung kann warten; Sie sind wichtiger. Wenn Sie mit jemandem reden möchten, sind diese Nummern jederzeit erreichbar.",
  },
  es: {
    ask: "¿Cómo has estado últimamente? (opcional)", states: ["Fluye", "Un poco justo", "Mucha presión", "Apenas aguanto"],
    planAsk: (p) => `La última vez pensabas «${p}». ¿Lo hiciste?`, acted: ["Sí", "En parte", "No"],
    submit: "Enviar", skip: "Puedes saltarlo: tu respuesta de arriba ya quedó guardada.", thanks: "Gracias. Estas dos respuestas solo nos ayudan a escribir mejor para personas como tú.",
    care: "Parece que estos días han sido muy duros. La lectura puede esperar; tú importas más. Si quieres hablar con alguien, estas líneas están siempre abiertas.",
  },
  pt: {
    ask: "Como você tem estado ultimamente? (opcional)", states: ["Fluindo", "Um pouco apertado", "Muita pressão", "Mal aguentando"],
    planAsk: (p) => `Da última vez você planejava "${p}". Conseguiu?`, acted: ["Sim", "Em parte", "Não"],
    submit: "Enviar", skip: "Pode pular: sua resposta acima já foi salva.", thanks: "Obrigado. Essas duas respostas só nos ajudam a escrever melhor para pessoas como você.",
    care: "Parece que estes dias têm sido muito difíceis. A leitura pode esperar; você importa mais. Se quiser falar com alguém, estas linhas estão sempre abertas.",
  },
};
