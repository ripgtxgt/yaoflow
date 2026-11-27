/**
 * 起卦前的一句背景 (09-26, Neil: 「全做吧」). A love question reads very
 * differently for a couple, a slow flirt, an ex gone quiet, someone already
 * taken, or a crush who does not know — and the reading was guessing. The
 * reader may tap one; it rides with the cast into the prompt as a stated fact.
 * Client-safe (no db).
 */
export const SITUATIONS = ["together", "ambiguous", "apart", "other_partner", "oneway"] as const;
export type Situation = (typeof SITUATIONS)[number];

export function parseSituation(x: unknown): Situation | undefined {
  return typeof x === "string" && (SITUATIONS as readonly string[]).includes(x) ? (x as Situation) : undefined;
}

/** What the model is told — the reader's own words, as a fact about their situation. */
export const SITUATION_FOR_PROMPT: Record<Situation, string> = {
  together: "They are currently in a relationship with this person.",
  ambiguous: "They are in an undefined, ambiguous stage with this person — interest on both sides is possible but nothing is agreed.",
  apart: "They have broken up or contact has gone quiet — the question is about getting back in touch or back together.",
  other_partner: "The other person is already with someone else.",
  oneway: "The feeling is theirs; the other person may not know or has not responded in kind.",
};

export const SITUATION_LABELS: Record<string, Record<Situation, string>> = {
  zh: { together: "交往中", ambiguous: "暧昧中", apart: "分手或断联", other_partner: "对方有伴", oneway: "我单方面喜欢" },
  "zh-hant": { together: "交往中", ambiguous: "曖昧中", apart: "分手或斷聯", other_partner: "對方有伴", oneway: "我單方面喜歡" },
  en: { together: "Together", ambiguous: "Undefined", apart: "Broken up / no contact", other_partner: "They're with someone", oneway: "One-sided" },
  ja: { together: "交際中", ambiguous: "曖昧な関係", apart: "別れた・連絡が途絶えた", other_partner: "相手に恋人がいる", oneway: "片思い" },
  ko: { together: "연애 중", ambiguous: "썸 타는 중", apart: "헤어짐·연락 끊김", other_partner: "상대에게 애인이 있음", oneway: "짝사랑" },
  fr: { together: "En couple", ambiguous: "Relation floue", apart: "Rupture / plus de contact", other_partner: "L'autre est pris·e", oneway: "Sentiment à sens unique" },
  de: { together: "Zusammen", ambiguous: "Noch unklar", apart: "Getrennt / kein Kontakt", other_partner: "Person ist vergeben", oneway: "Einseitig" },
  es: { together: "En pareja", ambiguous: "Algo indefinido", apart: "Ruptura / sin contacto", other_partner: "Tiene pareja", oneway: "Unilateral" },
  pt: { together: "Namorando", ambiguous: "Algo indefinido", apart: "Término / sem contato", other_partner: "A pessoa tem alguém", oneway: "Unilateral" },
};
export const SITUATION_PROMPT_LABEL: Record<string, string> = {
  zh: "目前的状态（选填，解读会更准）", "zh-hant": "目前的狀態（選填，解讀會更準）", en: "Where things stand (optional — makes the reading fit)",
  ja: "今の状態（任意・読み解きが的確になります）", ko: "지금 상태 (선택, 풀이가 더 정확해져요)", fr: "Où en êtes-vous ? (facultatif, la lecture sera plus juste)",
  de: "Wo steht ihr? (optional, macht die Deutung genauer)", es: "¿En qué punto estás? (opcional, afina la lectura)", pt: "Em que ponto está? (opcional, deixa a leitura mais certeira)",
};

/** 五档倾向 (09-26): one word the reader can hold on to, above the call. */
export const ODDS = ["strong", "good", "even", "hard", "very_hard"] as const;
export type Odds = (typeof ODDS)[number];
export const parseOdds = (x: unknown): Odds | undefined =>
  typeof x === "string" && (ODDS as readonly string[]).includes(x.trim()) ? (x.trim() as Odds) : undefined;
