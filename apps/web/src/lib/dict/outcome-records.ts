import type { Locale } from "../locales";

/**
 * 匿名「應驗紀錄」(进度表 28): the words around the records, in the nine languages. Shown only when
 * SHOW_OUTCOME_RECORDS=1 (lib/outcome-records.ts). The result words themselves reuse the case page's
 * caseOutcomeHit / caseOutcomeMiss, so a record and its case page always say the same thing.
 * No percentages, no totals, no "accurate".
 */
type Key = "titleGua" | "titleCase" | "titleTiming" | "lead" | "reported" | "open" | "stPartial" | "stOpen" | "stUnclear" | "stQueued";

const T: Record<Locale, Record<Key, string>> = {
  zh: {
    titleGua: "这一卦的应验记录",
    titleCase: "同一卦的其他应验记录",
    titleTiming: "最近的应验记录",
    lead: "应期过后，问卦的人自己回报的结果，好坏都在这里。",
    reported: "{date} 回报",
    open: "看这个卦例",
    stPartial: "部分应了",
    stOpen: "还没定",
    stUnclear: "不确定",
    stQueued: "应期已过，等回访",
  },
  "zh-hant": {
    titleGua: "這一卦的應驗紀錄",
    titleCase: "同一卦的其他應驗紀錄",
    titleTiming: "最近的應驗紀錄",
    lead: "應期過後，問卦的人自己回報的結果，好壞都在這裡。",
    reported: "{date} 回報",
    open: "看這個卦例",
    stPartial: "部分應了",
    stOpen: "還沒定",
    stUnclear: "不確定",
    stQueued: "應期已過，等回訪",
  },
  en: {
    titleGua: "Outcome records for this hexagram",
    titleCase: "Other outcome records for the same hexagram",
    titleTiming: "Recent outcome records",
    lead: "What people who asked reported themselves once the timing had passed — good and bad alike.",
    reported: "reported {date}",
    open: "Open this case",
    stPartial: "Partly",
    stOpen: "Not settled yet",
    stUnclear: "Unclear",
    stQueued: "Window closed — check-in coming",
  },
  ja: {
    titleGua: "この卦の応験の記録",
    titleCase: "同じ卦のほかの応験の記録",
    titleTiming: "最近の応験の記録",
    lead: "応期を過ぎたあとに、問いを立てた本人が知らせてくれた結果です。良いものも悪いものもここにあります。",
    reported: "{date} に報告",
    open: "この卦例を見る",
    stPartial: "一部応じた",
    stOpen: "まだ定まらない",
    stUnclear: "判断がつかない",
    stQueued: "応期を過ぎ、確認待ち",
  },
  ko: {
    titleGua: "이 괘의 응험 기록",
    titleCase: "같은 괘의 다른 응험 기록",
    titleTiming: "최근 응험 기록",
    lead: "응기가 지난 뒤 질문한 사람이 직접 알려 준 결과입니다. 좋은 것도 나쁜 것도 모두 여기 있어요.",
    reported: "{date} 보고",
    open: "이 사례 보기",
    stPartial: "일부 맞음",
    stOpen: "아직 정해지지 않음",
    stUnclear: "판단하기 어려움",
    stQueued: "응기 지남, 확인 대기 중",
  },
  fr: {
    titleGua: "Résultats rapportés pour cet hexagramme",
    titleCase: "Autres résultats rapportés pour le même hexagramme",
    titleTiming: "Derniers résultats rapportés",
    lead: "Ce que les personnes qui ont posé la question ont elles-mêmes rapporté une fois l'échéance passée — le bon comme le moins bon.",
    reported: "rapporté le {date}",
    open: "Voir ce cas",
    stPartial: "En partie",
    stOpen: "Pas encore tranché",
    stUnclear: "Incertain",
    stQueued: "Échéance passée — suivi à venir",
  },
  de: {
    titleGua: "Gemeldete Ergebnisse zu diesem Hexagramm",
    titleCase: "Weitere gemeldete Ergebnisse zum selben Hexagramm",
    titleTiming: "Zuletzt gemeldete Ergebnisse",
    lead: "Was die Fragenden selbst gemeldet haben, nachdem das Zeitfenster vorbei war — Gutes wie Schlechtes.",
    reported: "gemeldet am {date}",
    open: "Diesen Fall ansehen",
    stPartial: "Teilweise",
    stOpen: "Noch offen",
    stUnclear: "Unklar",
    stQueued: "Zeitfenster vorbei – Nachfrage folgt",
  },
  es: {
    titleGua: "Resultados reportados de este hexagrama",
    titleCase: "Otros resultados reportados del mismo hexagrama",
    titleTiming: "Últimos resultados reportados",
    lead: "Lo que contaron quienes preguntaron, una vez pasado el plazo: lo bueno y lo malo.",
    reported: "reportado el {date}",
    open: "Ver este caso",
    stPartial: "En parte",
    stOpen: "Aún sin definir",
    stUnclear: "Incierto",
    stQueued: "Plazo cumplido: seguimiento pendiente",
  },
  pt: {
    titleGua: "Resultados relatados deste hexagrama",
    titleCase: "Outros resultados relatados do mesmo hexagrama",
    titleTiming: "Resultados relatados recentes",
    lead: "O que quem perguntou relatou depois que o prazo passou — o bom e o ruim.",
    reported: "relatado em {date}",
    open: "Ver este caso",
    stPartial: "Em parte",
    stOpen: "Ainda indefinido",
    stUnclear: "Incerto",
    stQueued: "Prazo encerrado — acompanhamento a caminho",
  },
};

export function orT(l: Locale, key: Key, vars: Record<string, string | number> = {}): string {
  let s = (T[l] ?? T.en)[key];
  for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, String(v));
  return s;
}
