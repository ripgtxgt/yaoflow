import type { Locale } from "./locales";

/**
 * 危机词闸门 (Neil 09-26: 「要」— 关键词硬拦 + 各语言热线).
 *
 * A question that says the person may hurt themselves is not cast and not
 * sold. The page shows a short, warm note with a helpline for their language
 * instead; the reading API refuses it too (questionIssue → "crisis"), so no
 * path around the page produces a reading or a charge on it.
 *
 * Every language is checked whatever the page locale — people type in the
 * language they think in. Phrases are specific on purpose: 「想死你了」 (miss
 * you to death), 「笑死」, 「自杀式袭击」 and "suicide squad" are not crises.
 * Runs in the browser: NO lookbehind (old Safari rejects the whole bundle).
 *
 * Helplines checked 2026-09-26 (national health ministries / findahelpline.com).
 */
const RE: RegExp[] = [
  // 中文（简繁）
  /自[杀殺](?!式)|[轻輕]生|想死(?!你|我|他|她|它)|不想活|活不下去|[结結]束(?:自己的|我的)?生命|了[结結]自己|自[残殘]|割腕|跳[楼樓]|[寻尋]短[见見]|一死了之|吞[药藥]自/,
  // English
  /\b(?:kill(?:ing)? myself|suicid(?:e|al)(?! squad)|end(?:ing)? my (?:own )?life|take my (?:own )?life|want(?:ed)? to die|wanna die|don'?t want to (?:live|be alive)|self[- ]harm|hurt(?:ing)? myself|cut(?:ting)? myself)\b/i,
  // 日本語
  /死にたい|自殺|消えたい|生きていたくない|生きるのが辛い|自傷|リストカット|命を絶/,
  // 한국어
  /죽고\s?싶|자살|자해|극단적\s?선택|살고\s?싶지\s?않/,
  // français
  /suicid|me tuer|mettre fin à mes jours|en finir avec (?:la|ma) vie|envie de mourir|me faire du mal/i,
  // Deutsch
  /selbstmord|suizid|mich umbringen|nicht mehr leben|sterben will|mir das leben nehmen|mich selbst verletzen/i,
  // español
  /suicid|matarme|quitarme la vida|quiero morir|no quiero vivir|hacerme daño|autolesi/i,
  // português
  /suicid|me matar|tirar a minha vida|tirar minha vida|quero morrer|não quero (?:mais )?viver|me machucar|automutila|autolesão/i,
];

export function isCrisis(question: string): boolean {
  const s = (question ?? "").normalize("NFKC");
  return RE.some((r) => r.test(s));
}

export type Helpline = { where: string; name: string; tel: string };

type CrisisCopy = { lead: string; call: string; more: string; emergency: string; edit: string; lines: Helpline[] };

/** The note in the page's own language, with the lines people in that language most likely need. */
export const CRISIS_T: Record<Locale, CrisisCopy> = {
  zh: {
    lead: "这一卦我们先不起。你写下的这件事，比一个卦象更需要有人好好听你说。",
    call: "现在就可以打给他们，免费、保密：",
    more: "在其他国家或地区：",
    emergency: "如果你此刻有危险，请直接拨打当地急救电话。",
    edit: "如果是我们理解错了，改一下问题再起卦就好。",
    lines: [
      { where: "中国大陆", name: "全国心理援助热线", tel: "12356" },
      { where: "台湾", name: "安心专线", tel: "1925" },
      { where: "香港", name: "撒玛利亚防止自杀会", tel: "2389 2222" },
    ],
  },
  "zh-hant": {
    lead: "這一卦我們先不起。你寫下的這件事，比一個卦象更需要有人好好聽你說。",
    call: "現在就可以打給他們，免付費、保密：",
    more: "在其他國家或地區：",
    emergency: "如果你此刻有危險，請直接撥打當地緊急電話。",
    edit: "如果是我們理解錯了，改一下問題再起卦就好。",
    lines: [
      { where: "台灣", name: "安心專線", tel: "1925" },
      { where: "香港", name: "撒瑪利亞防止自殺會", tel: "2389 2222" },
      { where: "中國大陸", name: "心理援助熱線", tel: "12356" },
    ],
  },
  en: {
    lead: "We won't cast on this one. What you wrote deserves someone who can really listen, more than it needs a hexagram.",
    call: "You can reach someone right now — free and confidential:",
    more: "Elsewhere:",
    emergency: "If you are in danger right now, call your local emergency number.",
    edit: "If we misread you, just rephrase the question and cast again.",
    lines: [
      { where: "US", name: "988 Suicide & Crisis Lifeline", tel: "988" },
      { where: "UK & Ireland", name: "Samaritans", tel: "116 123" },
    ],
  },
  ja: {
    lead: "この一卦はいったん立てずにおきます。書いてくださったことは、卦よりも、ちゃんと話を聞いてくれる人を必要としていると思います。",
    call: "いま電話で話せます（無料・秘密厳守）：",
    more: "日本国外の方：",
    emergency: "いま危険な状況にある場合は、119 または 110 に電話してください。",
    edit: "私たちの読み違いでしたら、問いを書き直してからもう一度どうぞ。",
    lines: [
      { where: "日本", name: "よりそいホットライン（24時間）", tel: "0120-279-338" },
      { where: "日本", name: "いのちの電話", tel: "0570-783-556" },
    ],
  },
  ko: {
    lead: "이 괘는 지금 뽑지 않겠습니다. 적어 주신 일은 괘보다, 이야기를 제대로 들어 줄 사람이 더 필요해 보여요.",
    call: "지금 바로 전화할 수 있어요(무료·비밀 보장):",
    more: "한국 밖이라면:",
    emergency: "지금 위험한 상황이라면 119 또는 112로 전화하세요.",
    edit: "저희가 잘못 이해했다면 질문을 고쳐서 다시 뽑아 주세요.",
    lines: [{ where: "한국", name: "자살예방 상담전화 (24시간)", tel: "109" }],
  },
  fr: {
    lead: "Nous ne tirerons pas celui-ci. Ce que vous avez écrit mérite quelqu'un qui vous écoute vraiment, plus qu'un hexagramme.",
    call: "Vous pouvez parler à quelqu'un tout de suite, gratuitement et en toute confidentialité :",
    more: "Ailleurs :",
    emergency: "Si vous êtes en danger immédiat, appelez le 112 ou le numéro d'urgence local.",
    edit: "Si nous vous avons mal compris, reformulez la question et tirez à nouveau.",
    lines: [{ where: "France", name: "Numéro national de prévention du suicide (24 h/24)", tel: "3114" }],
  },
  de: {
    lead: "Diese Frage werfen wir nicht. Was du geschrieben hast, braucht eher jemanden, der dir wirklich zuhört, als ein Hexagramm.",
    call: "Du kannst jetzt sofort mit jemandem sprechen – kostenlos und vertraulich:",
    more: "Anderswo:",
    emergency: "Wenn du gerade in Gefahr bist, ruf 112 an.",
    edit: "Falls wir dich missverstanden haben: formuliere die Frage einfach um und wirf noch einmal.",
    lines: [{ where: "Deutschland", name: "TelefonSeelsorge (rund um die Uhr)", tel: "0800 111 0 111" }],
  },
  es: {
    lead: "Esta no la vamos a tirar. Lo que escribiste merece a alguien que te escuche de verdad, más que un hexagrama.",
    call: "Puedes hablar con alguien ahora mismo, gratis y de forma confidencial:",
    more: "En otros lugares:",
    emergency: "Si estás en peligro ahora mismo, llama al 112 o al número de emergencias local.",
    edit: "Si te entendimos mal, reformula la pregunta y vuelve a tirar.",
    lines: [{ where: "España", name: "Línea 024 (24 h)", tel: "024" }],
  },
  pt: {
    lead: "Esta não vamos tirar. O que você escreveu merece alguém que te escute de verdade, mais do que um hexagrama.",
    call: "Você pode falar com alguém agora mesmo, de graça e com sigilo:",
    more: "Em outros lugares:",
    emergency: "Se você está em perigo agora, ligue para o número de emergência local (192 no Brasil, 112 em Portugal).",
    edit: "Se entendemos errado, reformule a pergunta e tire de novo.",
    lines: [{ where: "Brasil", name: "CVV (24 h)", tel: "188" }],
  },
};

/** One page that lists a helpline for every country — for anyone outside the lines above. */
export const HELPLINE_DIRECTORY = "https://findahelpline.com";
