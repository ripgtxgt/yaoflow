/**
 * 64 卦页卦例补齐（09-23，Neil：「补啊」）。
 *   cd ~/yaoflow/apps/web && npx -y tsx ../../scripts/gen-gua-cases.ts <locale> <out.jsonl>
 *
 * 对每个还没有卦例的卦：按三枚铜钱真实概率反复起卦，取第一次落在这一卦上的那次
 * （等于「随机起卦、恰好是这一卦」的条件分布，动爻也是真随机），再走线上同一条深断管线。
 * 每生成一条就追加一行 JSON，中途断了重跑会跳过已完成的卦。
 */
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { resolveCast, type LineValue } from "@yaoflow/engine";
import type { Locale } from "../apps/web/src/lib/locales";

// bare tsx does not read .env.local — the model keys live there
for (const l of readFileSync(new URL("../apps/web/.env.local", import.meta.url), "utf8").split("\n")) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(l);
  if (m && !process.env[m[1]!]) process.env[m[1]!] = m[2]!;
}

const QUESTIONS: Record<string, [string, string][]> = {
  "zh-hant": [
    ["工作", "年底前換工作，能不能找到比現在更好的？"], ["感情", "這段曖昧，他是認真的嗎？"], ["錢", "這筆投資現在出場，會不會後悔？"],
    ["抉擇", "要不要搬去台中跟家人住近一點？"], ["考試", "明年的研究所考試，這次有機會上嗎？"], ["工作", "主管說下個月談升遷，談得成嗎？"],
    ["感情", "吵架冷戰一週了，他會先來找我嗎？"], ["錢", "開一家小店的計畫，今年適合動嗎？"], ["工作", "面試過了兩週還沒消息，還有機會嗎？"],
    ["感情", "跟交往三年的他，明年會走到結婚嗎？"], ["抉擇", "要不要辭職去澳洲打工度假一年？"], ["錢", "借給朋友的錢，年底前拿得回來嗎？"],
    ["人際", "和合夥人的分歧，還修得回來嗎？"], ["健康作息", "這陣子一直睡不好，換個工作節奏會好轉嗎？"], ["工作", "這個接案合作，值得長期做下去嗎？"],
    ["感情", "分手半年了，還該不該等他？"], ["家庭", "今年過年要不要跟爸媽攤牌說要搬出去？"],
  ],
  en: [
    ["career", "Will the job I interviewed for last week come through?"], ["love", "Is it worth asking her out before the holidays?"],
    ["money", "Should I sell my stock position now or hold until spring?"], ["move", "Is moving to Denver next year the right call?"],
    ["study", "Will I get into the master's program I applied to?"], ["career", "Should I ask for a raise at my review next month?"],
    ["love", "Will my ex and I talk again before the new year?"], ["business", "Is this the year to launch my side business?"],
    ["decision", "Should I take the remote offer or stay with my team?"], ["money", "Will the freelance client who owes me pay by November?"],
    ["love", "Is the person I've been dating serious about us?"], ["career", "Will the reorg at work leave my role intact?"],
    ["family", "Should I move back closer to my parents this year?"], ["study", "Will I finish my certification before the deadline?"],
  ],
  ja: [
    ["仕事", "来月の昇進の話は通るでしょうか"], ["恋愛", "気になっている人に年内に気持ちを伝えるべきでしょうか"], ["お金", "今の投資信託はこのまま持ち続けていいでしょうか"],
    ["転居", "来年の春に地元へ戻るのはいい選択でしょうか"], ["試験", "次の資格試験には合格できるでしょうか"], ["仕事", "先週受けた面接の結果は良い知らせでしょうか"],
    ["恋愛", "喧嘩したままの彼と、今月中に仲直りできるでしょうか"], ["副業", "副業を本格的に始めるなら今年でしょうか"], ["人間関係", "職場の先輩との気まずさは解けるでしょうか"],
    ["お金", "貸したお金は年内に返ってくるでしょうか"], ["恋愛", "元恋人とまた会う機会はあるでしょうか"], ["決断", "転職するか今の会社に残るか、どちらがいいでしょうか"],
  ],
  // 09-27 (Neil: 「卦例补齐…也做完吧」): the five remaining languages, questions as a reader there would ask them
  ko: [
    ["직장", "지난주에 본 면접, 좋은 소식이 올까요?"], ["연애", "요즘 연락하는 그 사람, 저를 진지하게 생각할까요?"], ["돈", "지금 들고 있는 주식, 봄까지 버텨도 될까요?"],
    ["이사", "내년에 부산으로 내려가는 게 맞는 선택일까요?"], ["시험", "이번 자격증 시험, 합격할 수 있을까요?"], ["직장", "다음 달 연봉 협상에서 인상을 요구해도 될까요?"],
    ["연애", "크게 싸운 뒤 연락이 끊겼는데, 연말 전에 다시 이야기할 수 있을까요?"], ["사업", "올해 작은 가게를 여는 게 좋을까요?"], ["결정", "이직 제안을 받을까요, 지금 회사에 남을까요?"],
    ["돈", "친구에게 빌려준 돈, 연말까지 돌려받을 수 있을까요?"], ["인간관계", "팀장님과의 어색한 관계가 풀릴까요?"], ["가족", "올해 부모님 댁 가까이로 이사하는 게 좋을까요?"],
    ["공부", "대학원 진학, 내년에 도전해도 될까요?"], ["직장", "회사 구조조정에서 제 자리는 괜찮을까요?"],
  ],
  fr: [
    ["travail", "L'entretien de la semaine dernière va-t-il aboutir ?"], ["amour", "La personne que je fréquente est-elle sérieuse ?"], ["argent", "Dois-je vendre mes actions maintenant ou attendre le printemps ?"],
    ["déménagement", "Partir m'installer à Lyon l'an prochain, est-ce le bon choix ?"], ["études", "Vais-je être admis dans le master où j'ai postulé ?"], ["travail", "Dois-je demander une augmentation à mon entretien annuel ?"],
    ["amour", "Mon ex et moi, allons-nous nous reparler avant la fin de l'année ?"], ["projet", "Est-ce l'année pour lancer mon activité à côté ?"], ["décision", "Accepter l'offre en télétravail ou rester dans mon équipe ?"],
    ["argent", "Le client qui me doit de l'argent va-t-il payer d'ici novembre ?"], ["relations", "Le froid avec ma collègue va-t-il se dissiper ?"], ["famille", "Dois-je me rapprocher de mes parents cette année ?"],
    ["études", "Vais-je finir ma formation avant la date limite ?"], ["travail", "La réorganisation va-t-elle préserver mon poste ?"],
  ],
  de: [
    ["Beruf", "Wird das Vorstellungsgespräch von letzter Woche zu einer Zusage führen?"], ["Liebe", "Meint es die Person, mit der ich mich treffe, ernst mit mir?"], ["Geld", "Soll ich meine Aktien jetzt verkaufen oder bis zum Frühjahr halten?"],
    ["Umzug", "Ist der Umzug nach Hamburg im nächsten Jahr die richtige Entscheidung?"], ["Studium", "Werde ich für den Master angenommen, auf den ich mich beworben habe?"], ["Beruf", "Soll ich beim Jahresgespräch nach einer Gehaltserhöhung fragen?"],
    ["Liebe", "Werden mein Ex und ich vor Jahresende wieder miteinander reden?"], ["Projekt", "Ist dieses Jahr das richtige, um mich nebenbei selbstständig zu machen?"], ["Entscheidung", "Soll ich das Remote-Angebot annehmen oder in meinem Team bleiben?"],
    ["Geld", "Zahlt der Kunde, der mir noch Geld schuldet, bis November?"], ["Beziehungen", "Löst sich die Spannung mit meinem Kollegen wieder?"], ["Familie", "Soll ich dieses Jahr näher zu meinen Eltern ziehen?"],
    ["Prüfung", "Bestehe ich die Zertifizierung vor der Frist?"], ["Beruf", "Bleibt meine Stelle bei der Umstrukturierung erhalten?"],
  ],
  es: [
    ["trabajo", "¿Saldrá bien la entrevista que tuve la semana pasada?"], ["amor", "¿La persona con la que estoy saliendo va en serio conmigo?"], ["dinero", "¿Vendo mis acciones ahora o espero hasta la primavera?"],
    ["mudanza", "¿Mudarme a Guadalajara el próximo año es la decisión correcta?"], ["estudios", "¿Me aceptarán en la maestría a la que apliqué?"], ["trabajo", "¿Debo pedir un aumento en mi evaluación del próximo mes?"],
    ["amor", "¿Mi ex y yo volveremos a hablar antes de fin de año?"], ["negocio", "¿Es este el año para lanzar mi emprendimiento?"], ["decisión", "¿Acepto la oferta remota o me quedo con mi equipo?"],
    ["dinero", "¿El cliente que me debe me pagará antes de noviembre?"], ["relaciones", "¿Se arreglará la tensión con mi jefa?"], ["familia", "¿Debo mudarme más cerca de mis papás este año?"],
    ["estudios", "¿Terminaré mi certificación antes de la fecha límite?"], ["trabajo", "¿Mi puesto sobrevivirá a la reestructuración?"],
  ],
  pt: [
    ["trabalho", "A entrevista da semana passada vai dar certo?"], ["amor", "A pessoa com quem estou saindo está levando a gente a sério?"], ["dinheiro", "Vendo minhas ações agora ou espero até o ano que vem?"],
    ["mudança", "Me mudar para Curitiba no ano que vem é a escolha certa?"], ["estudos", "Vou passar no mestrado que eu tentei?"], ["trabalho", "Devo pedir aumento na minha avaliação do mês que vem?"],
    ["amor", "Eu e meu ex vamos voltar a conversar antes do fim do ano?"], ["negócio", "Este é o ano de abrir meu próprio negócio?"], ["decisão", "Aceito a proposta remota ou fico com a minha equipe?"],
    ["dinheiro", "O cliente que me deve vai pagar até novembro?"], ["relações", "O clima ruim com meu colega de trabalho vai melhorar?"], ["família", "Devo morar mais perto dos meus pais este ano?"],
    ["estudos", "Vou terminar minha certificação antes do prazo?"], ["trabalho", "Meu cargo vai continuar depois da reestruturação?"],
  ],
};
// the reader's clock the timing is counted on: Seoul, Paris, Berlin, Mexico City, São Paulo (September)
const TZ: Record<string, number> = { "zh-hant": 480, en: -300, ja: 540, ko: 540, fr: 120, de: 120, es: -360, pt: -180 };

function coin(): LineValue {
  let heads = 0;
  for (let i = 0; i < 3; i++) if (Math.random() < 0.5) heads++;
  return heads === 3 ? 9 : heads === 0 ? 6 : heads === 2 ? 8 : 7;
}

function castLandingOn(hex: number): LineValue[] {
  for (;;) {
    const v = Array.from({ length: 6 }, coin);
    if (resolveCast(v).primary.number === hex) return v;
  }
}

async function main() {
  const { generateReading } = await import("../apps/web/src/lib/generate");
  const { pick } = await import("../apps/web/src/lib/reading");
  const { caseForHex } = await import("../apps/web/src/lib/gua-cases");
  const locale = process.argv[2] as Locale;
  const outFile = process.argv[3]!;
  const done = new Set<number>();
  if (existsSync(outFile)) for (const l of readFileSync(outFile, "utf8").split("\n")) if (l) done.add(JSON.parse(l).hex);
  const pool = QUESTIONS[locale]!;
  let qi = 0;
  for (let hex = 1; hex <= 64; hex++) {
    if (done.has(hex) || caseForHex(hex, locale)) continue;
    const [topic, question] = pool[qi++ % pool.length]!;
    const values = castLandingOn(hex);
    const castAtMs = Date.now();
    const input = { question, values, castAtMs, tzOffsetMinutes: TZ[locale]! };
    try {
      const r = (await generateReading("deep", input, false, locale)) as Record<string, Record<string, string>>;
      const item = {
        hex, locale, topic, question, code: values.join(""), cast_at: new Date(castAtMs).toISOString(), tz: TZ[locale]!,
        primary_zh: resolveCast(values).primary.fullZh, verdict: pick(r.verdict, locale), timing: pick(r.timing, locale),
      };
      if (!item.verdict || !item.timing) throw new Error("empty verdict/timing");
      appendFileSync(outFile, JSON.stringify(item) + "\n");
      console.error(`${locale} ${hex} ok`);
    } catch (e) {
      console.error(`${locale} ${hex} FAIL ${e instanceof Error ? e.message : e}`);
    }
  }
}
void main();
