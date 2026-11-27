import { inRepeatArm, repeatTestOn } from "./repeat-test";
import { createHash, randomBytes } from "node:crypto";
import { db, recordOps } from "./db";
import { chatJson } from "./llm";
import { featureState } from "./features";
import { ensureHant, toHans } from "./hant";
import { LOCALE_META, LOCALES, type Locale } from "./locales";
import { DEEP_PER_MONTH } from "./sub-plan";
import { scrubNet } from "./browser-net";
import { logRow, personalFacts, personBids, purgeCastLog, setLogNudgeLean, spanDays, type LogRow, type PersonalFacts, type ThreadInfo } from "./cast-log";
import { personResolver, purchaseRecords, REWARD_MS, SETTLE_MS, type PurchaseRec } from "./purchases";
import { segmentTable, type StageKey } from "./stage-funnel";

// the person and purchase helpers moved to lib/purchases.ts (shared with the funnel, the group tables and the weekly review)
export { personResolver, purchaseRecords, REWARD_MS, SETTLE_MS, type PurchaseRec };


/** node:sqlite run() result: rows changed (typed loosely — older @types/node lack the field) */
const changesOf = (r: unknown): number => Number((r as { changes?: number | bigint }).changes ?? 0);
/**
 * 10-03 付费话术自动学习 (Neil: 「……对之后的卦象和付费引导的话术进行不停地学习和优化，能让更多的人在多次摇卦之后有动力去付费」).
 *
 * On the 2nd, 3rd and 4th-or-later cast on one matter (lib/cast-log.ts threads) the cast page shows a short block before
 * the price — a title, a line, a button. Which words are shown is learned:
 *
 *   - slots: n2 (the 2nd cast), n3 (the 3rd), n4 (4th and later, the cap's casts included), and `style` — the way the
 *     2nd+ free line ties this chart to the earlier ones (an instruction to the model, never shown as such);
 *   - each slot holds variants; a Thompson sampler (Beta(1+paid, 1+not paid)) picks one per cast, so better words get
 *     shown more while every live variant still gets tried;
 *   - the reward: the same person (browser, or every browser of their account) pays for a reading or starts a
 *     membership within 72 hours of SEEING the block (the page confirms with nudge_shown). A purchase credits the last
 *     block they saw before it. Shown less than 24 hours ago and not yet paid = still pending, not counted either way
 *     (10-06: 24 hours, was 72 — see lib/purchases.ts SETTLE_MS);
 *   - every week the model reads the numbers (only the numbers and the words — never anyone's question) and drafts new
 *     variants; they wait on /admin/nudges for a yes (NUDGE_AI_MODE=review, the default since 10-06) — with
 *     NUDGE_AI_MODE=auto, drafts that pass the guards go live if the slot has room (at most NUDGE_AI_MAX AI variants
 *     live per slot). Style drafts always wait.
 *   - a non-seed variant that has clearly lost (80+ settled showings, under 2% chance of being the best) is retired.
 *
 * The guards are the point: no urgency, no discount but the real price, no guarantee or accuracy claim, no fear, no
 * health words, no statistics about other people, no digits the copy cannot back. NUDGE_LEARN=off shows the first seed
 * of each slot to everyone; NUDGE_AI=off stops the drafting.
 *
 * 10-06 瘦身 (Neil: 「在改之前，我在想这么设计是不是合理的」→「好，一起做完吧」). Three days of data said what the traffic can
 * carry: ~100 showings a day at the 2nd cast, rates of 2–7% — telling 5% from 7% apart takes ~2,200 settled showings
 * per version, so only a version that differs by about double can ever be found, and only with few versions in a slot.
 * The 4th+ slot was 84 people, ten of them more than half its showings — its numbers say whether those few pay, not
 * which words work. So: at most two ready versions per slot (n2: 合起来断 / 直接说; n3: 定下来 / 不顺版), the 4th+ cast
 * shows one fixed block that offers the membership (n4-member — the button goes to the membership page), AI drafting
 * only drafts, and the written-per-reader version stays in n2 / n3 only until the 10-17 review (SLIM_1006 below).
 * Big ideas are tested as person-level A/B tests (like the 10-02 preview test), not fed to the sampler.
 *
 * 10-17 全自动 (Neil: 「你每次把数据看完了，就直接操作好就行了」). The loop runs without a hand on the dashboard: the hourly
 * check retires any live version that has clearly lost (seeds too; the per-reader version on its own bar — 150 settled
 * and not 1.5× the ready versions), the weekly drafting fills the one AI seat a slot has (n2, n3, style; the 4th+ block
 * is fixed) with the first candidate that passes the guards, the near-copy check and the claim check, and a candidate
 * that fails is dropped, not parked. The 10-03..13 drafts were cleared once (auto_1017). The dashboard still lets the
 * owner switch any version on or off; NUDGE_AI_MODE=review restores the waiting.
 */

export type Slot = "n1" | "n2" | "n3" | "n4" | "style";
export const NUDGE_SLOTS: Slot[] = ["n1", "n2", "n3", "n4"];
export const ALL_SLOTS: Slot[] = ["n1", "n2", "n3", "n4", "style"];
const STATS_DAYS = 120;
const RETIRE_MIN = 80;
const RETIRE_P = 0.02;
/**
 * 10-17 全自动 (Neil: 「我们这个不能做到自动化吗？你每次把数据看完了，就直接操作好就行了」): the written-per-reader version
 * costs a model call every time it is shown, so it earns its place only by beating the slot's ready versions clearly —
 * 150 settled showings in its slot, and a rate at least 1.5× theirs together (the 10-06 bar); under that it is retired.
 */
/** 10-17: the slots the weekly drafting may fill — the 4th+ cast is one fixed block (n4-member) and gets no drafts. */
export const DRAFT_SLOTS: Slot[] = ["n2", "n3", "style"];

// 10-31 进度表 131: the first cast has a block too (n1) — with no free line, the block is what follows the figure
export const slotFor = (n: number): Exclude<Slot, "style"> | null => (n < 1 ? null : n === 1 ? "n1" : n === 2 ? "n2" : n === 3 ? "n3" : "n4");
export const learnOn = (): boolean => (process.env.NUDGE_LEARN ?? "on") !== "off";
export const aiOn = (): boolean => (process.env.NUDGE_AI ?? "on") !== "off";
/**
 * 10-17: auto is the default again (Neil asked for the whole loop to run by itself) — a draft that passes the guards, the
 * near-copy check and the claim check goes live if its slot has an AI seat free; one that fails is dropped, not parked.
 * NUDGE_AI_MODE=review brings back 10-06's "wait for a yes on the dashboard".
 */
export const aiMode = (): "auto" | "review" => (process.env.NUDGE_AI_MODE === "review" ? "review" : "auto");
/** AI seats per slot: one (10-06: two ready versions a slot is what the traffic can tell apart; the AI one is the third). */
export const aiMax = (): number => Math.max(0, Math.min(6, Number(process.env.NUDGE_AI_MAX ?? 1) || 0));

export interface NudgeText { title: string; body: string; cta: string }
export type VariantTexts = Partial<Record<Locale | "*", NudgeText>>;
export interface Variant {
  id: string; slot: Slot; status: "active" | "draft" | "retired"; source: "seed" | "ai" | "admin" | "personal";
  texts: VariantTexts; parent: string | null; notes: string | null; created_at: number; updated_at: number; status_why: string | null;
  /** 10-03 按组挑版本: "topic:relationship" = shown only on casts about that kind of question; null = every cast */
  segment: string | null;
  /** 10-03 说法核对: when its claims were last read by claimCheck (AI versions only) */
  checked_at: number | null;
}

/** The kinds of question a version can be meant for (lib/topic.ts). */
export const TOPICS = ["career", "relationship", "money", "health", "study", "decision", "other"] as const;
export const topicSegment = (t: string | null | undefined): string | null => (t && (TOPICS as readonly string[]).includes(t) ? `topic:${t}` : null);
/**
 * 10-05 不顺卦话术 (Neil: 「要，然后把下面这个也做了」): a second kind of segment — the lean of the free line the reader saw
 * last on this matter (lib/cast-log.ts classifyLean: good / mixed / bad). Over 10-03..05 a first line that leaned "bad"
 * paid about half as often as a "mixed" one (4.7% against 8.8%); those readers re-cast hoping for a better answer. A
 * version marked `lean:bad` is shown only after a line that leaned against them, and on such casts every version is
 * judged by its results on such casts (leanPosterior), not by its overall rate.
 */
export const LEAN_SEGMENTS = ["bad"] as const;
export const leanSegment = (l: string | null | undefined): string | null => (l && (LEAN_SEGMENTS as readonly string[]).includes(l) ? `lean:${l}` : null);
/** What a version's segment means: the kind of question, or the lean of the line last seen. */
export function segmentOf(seg: string | null | undefined): { kind: "topic" | "lean"; value: string } | null {
  if (!seg) return null;
  const m = /^(topic|lean):(.+)$/.exec(seg);
  return m ? { kind: m[1] as "topic" | "lean", value: m[2]! } : null;
}
/** The lean the reader saw last on the matter: this cast's line when already judged (a refresh), else the latest judged earlier one. */
export function leanSeen(info: Pick<ThreadInfo, "row" | "earlier">): string | null {
  if (info.row.lean) return info.row.lean;
  for (let i = info.earlier.length - 1; i >= 0; i--) { const l = info.earlier[i]!.lean; if (l) return l; }
  return null;
}
/** prior strength: a kind of question with little data of its own borrows this many showings' worth of the version's overall rate */
const SEGMENT_PRIOR = 6;

/* ---------------- the seeds ---------------- */

const T = (title: string, body: string, cta: string): NudgeText => ({ title, body, cta });

/** Written by hand, in all nine languages; honest about what the full reading holds once the thread is read with it. */
export const SEEDS: { id: string; slot: Slot; texts: VariantTexts; segment?: string }[] = [
  // 10-31 进度表 131: no free line any more — the first cast goes straight to the block before the price
  {
    id: "n1-full", slot: "n1", texts: {
      "zh-hant": T("這一卦已經排好了", "卦象、動爻和應期都在盤上。深斷把它讀成白話：這件事會怎麼走、關鍵在哪、哪幾天要留意、你現在可以做什麼。", "看這一卦的深斷 · {price}"),
      zh: T("这一卦已经排好了", "卦象、动爻和应期都在盘上。深断把它读成白话：这件事会怎么走、关键在哪、哪几天要留意、你现在可以做什么。", "看这一卦的深断 · {price}"),
      en: T("Your figure is cast", "The figure, its moving lines and its timing are all on the chart. The full reading puts it in plain words: where this is heading, what it hinges on, which days to watch, and what you can do now.", "Read this figure · {price}"),
      ja: T("卦が立ちました", "卦の形、動く爻、応期はすべて盤に出ています。深い読み解きはそれを平易な言葉にして、この件の行方、鍵になること、気をつける日、今できることを伝えます。", "この卦の深い読み解き · {price}"),
      ko: T("괘가 섰습니다", "괘의 모양과 움직이는 효, 응기가 모두 판에 나와 있습니다. 심층 풀이는 이를 쉬운 말로 풀어 이 일이 어떻게 흘러갈지, 무엇이 관건인지, 어느 날을 지켜볼지, 지금 무엇을 할 수 있는지 알려 드립니다.", "이 괘의 심층 풀이 · {price}"),
      fr: T("Votre figure est posée", "La figure, ses traits mobiles et son échéance sont tous sur le tableau. La lecture approfondie met tout cela en mots simples : où va cette affaire, ce dont elle dépend, quels jours surveiller et ce que vous pouvez faire maintenant.", "Lire cette figure · {price}"),
      de: T("Deine Figur steht", "Die Figur, ihre bewegten Linien und der Zeitpunkt stehen im Bild. Die Tiefendeutung sagt es in klaren Worten: wohin die Sache läuft, worauf es ankommt, auf welche Tage du achten solltest und was du jetzt tun kannst.", "Diese Figur deuten · {price}"),
      es: T("Tu figura está hecha", "La figura, sus líneas móviles y su plazo ya están en el cuadro. La lectura completa lo pone en palabras sencillas: hacia dónde va esto, de qué depende, qué días vigilar y qué puedes hacer ahora.", "Leer esta figura · {price}"),
      pt: T("Sua figura está pronta", "A figura, as linhas móveis e o prazo já estão no quadro. A leitura completa põe tudo em palavras simples: para onde isto vai, do que depende, quais dias observar e o que você pode fazer agora.", "Ler esta figura · {price}"),
    },
  },
  {
    id: "n1-answer", slot: "n1", texts: {
      "zh-hant": T("你問的這件事，答案在卦裡", "深斷直接回答你的問題：會不會、為什麼、什麼時候。到了卦裡說的日子，我們寫信問你後來怎樣；有新進展也能接著追問。", "看完整解讀 · {price}"),
      zh: T("你问的这件事，答案在卦里", "深断直接回答你的问题：会不会、为什么、什么时候。到了卦里说的日子，我们写信问你后来怎样；有新进展也能接着追问。", "看完整解读 · {price}"),
      en: T("The answer to your question is in this figure", "The full reading answers what you asked: whether, why and when. When the days it names come, we write to ask how it went, and you can ask follow-ups as things move.", "Get the full reading · {price}"),
      ja: T("あなたの問いの答えは、この卦にあります", "深い読み解きは問いにそのまま答えます。そうなるか、なぜか、いつか。卦の示す日が来たら、その後どうなったかを手紙で伺います。新しい動きがあれば続けて質問もできます。", "深い読み解きを見る · {price}"),
      ko: T("물으신 일의 답은 이 괘에 있습니다", "심층 풀이는 질문에 바로 답합니다. 될지, 왜인지, 언제인지. 괘가 말한 날이 오면 어떻게 됐는지 편지로 여쭙고, 새 소식이 생기면 이어서 질문하실 수 있습니다.", "심층 풀이 보기 · {price}"),
      fr: T("La réponse à votre question est dans cette figure", "La lecture approfondie répond à ce que vous avez demandé : si, pourquoi et quand. Quand viennent les jours qu'elle nomme, nous vous écrivons pour savoir comment cela s'est passé, et vous pouvez poser des questions de suivi.", "Voir la lecture complète · {price}"),
      de: T("Die Antwort auf deine Frage steckt in dieser Figur", "Die Tiefendeutung beantwortet, was du gefragt hast: ob, warum und wann. Wenn die genannten Tage kommen, schreiben wir dir und fragen, wie es lief; du kannst jederzeit Folgefragen stellen.", "Ganze Tiefendeutung · {price}"),
      es: T("La respuesta a tu pregunta está en esta figura", "La lectura completa responde lo que preguntaste: si pasará, por qué y cuándo. Cuando lleguen los días que señala, te escribimos para saber cómo fue, y puedes hacer preguntas de seguimiento.", "Ver la lectura completa · {price}"),
      pt: T("A resposta à sua pergunta está nesta figura", "A leitura completa responde ao que você perguntou: se, por quê e quando. Quando chegarem os dias que ela aponta, escrevemos para saber como foi, e você pode fazer perguntas de acompanhamento.", "Ver a leitura completa · {price}"),
    },
  },
  // 11-05 进度表 141: the line is back — the first cast's block says what the line is (the direction) and what the
  // reading adds; it does not say "free" (payment copy never does)
  {
    id: "n1-line", slot: "n1", texts: {
      "zh-hant": T("上面那句是方向，深斷是全貌", "那一句只說往哪邊走。深斷把這一卦讀完：會不會、卡在哪、哪幾天要留意、你現在先做哪一步。到了那幾天，我們寫信問你後來怎樣。", "看這一卦的深斷 · {price}"),
      zh: T("上面那句是方向，深断是全貌", "那一句只说往哪边走。深断把这一卦读完：会不会、卡在哪、哪几天要留意、你现在先做哪一步。到了那几天，我们写信问你后来怎样。", "看这一卦的深断 · {price}"),
      en: T("The line is the direction; the reading, the whole picture", "That line only says which way it leans. The full reading goes through the whole figure: whether, where it's stuck, which days to watch, and the first step to take now. When those days come, we write to ask how it went.", "Read this figure in full · {price}"),
      ja: T("上の一言は方向、深い読み解きは全体像", "あの一言は向きだけ。深い読み解きはこの卦を最後まで読み、そうなるか、どこで止まっているか、気をつける日、いまの一歩を伝えます。その日が来たら、どうなったか伺います。", "この卦を深く読み解く · {price}"),
      ko: T("위의 한 줄은 방향, 심층 풀이는 전체 그림", "그 한 줄은 어느 쪽으로 기우는지만 말합니다. 심층 풀이는 이 괘를 끝까지 읽고, 될지, 어디서 막혔는지, 지켜볼 날, 지금 할 첫걸음을 알려 드립니다. 그날이 오면 어떻게 됐는지 편지로 여쭙습니다.", "이 괘 심층 풀이 · {price}"),
      fr: T("La ligne donne la direction ; la lecture, tout le tableau", "Cette ligne dit seulement de quel côté cela penche. La lecture approfondie parcourt toute la figure : si, où cela bloque, quels jours surveiller et le premier pas à faire. Quand ces jours arrivent, nous vous écrivons pour savoir comment cela s'est passé.", "Lire cette figure en entier · {price}"),
      de: T("Die Zeile zeigt die Richtung, die Deutung das ganze Bild", "Diese Zeile sagt nur, wohin es neigt. Die Tiefendeutung liest die ganze Figur: ob, wo es hakt, auf welche Tage du achten solltest und welcher erste Schritt jetzt dran ist. Wenn diese Tage kommen, schreiben wir dir und fragen, wie es lief.", "Diese Figur ganz deuten · {price}"),
      es: T("La línea es la dirección; la lectura, el cuadro entero", "Esa línea solo dice hacia dónde se inclina. La lectura completa recorre toda la figura: si pasará, dónde se atasca, qué días vigilar y el primer paso para ahora. Cuando lleguen esos días, te escribimos para saber cómo fue.", "Leer esta figura completa · {price}"),
      pt: T("A linha é a direção; a leitura, o quadro inteiro", "Essa linha só diz para que lado pende. A leitura completa percorre a figura toda: se vai acontecer, onde trava, quais dias observar e o primeiro passo a dar agora. Quando esses dias chegarem, escrevemos para saber como foi.", "Ler esta figura completa · {price}"),
    },
  },
  {
    id: "n2-merge", slot: "n2", texts: {
      "zh-hant": T("這件事，你問第二次了", "上一卦和這一卦各看到一面。深斷會把兩卦放在一起讀：哪裡沒變、哪裡變了、接下來留意哪幾天。", "把這兩卦合起來斷 · {price}"),
      zh: T("这件事，你问第二次了", "上一卦和这一卦各看到一面。深断会把两卦放在一起读：哪里没变、哪里变了、接下来留意哪几天。", "把这两卦合起来断 · {price}"),
      en: T("Your second cast on this", "Each cast shows one side of it. The full reading reads the last cast and this one together: what has held, what has shifted, and which days to watch next.", "Read both casts together · {price}"),
      ja: T("この件、二度目の卦です", "前の卦とこの卦は、それぞれ一面を見せています。深い読み解きでは二つを合わせて読み、変わらないこと・変わったこと・次に気をつける日を示します。", "二つの卦を合わせて読む · {price}"),
      ko: T("이 일로 두 번째 괘입니다", "지난 괘와 이번 괘는 각각 한 면을 보여 줍니다. 심층 풀이는 두 괘를 함께 읽고, 그대로인 것과 달라진 것, 다음에 지켜볼 날을 알려 드립니다.", "두 괘를 함께 풀이 · {price}"),
      fr: T("Deuxième tirage sur cette question", "Chaque tirage en montre une facette. La lecture approfondie lit le tirage précédent et celui-ci ensemble : ce qui tient, ce qui a bougé, et les jours à surveiller.", "Lire les deux tirages ensemble · {price}"),
      de: T("Dein zweiter Wurf zu dieser Sache", "Jeder Wurf zeigt eine Seite davon. Die Tiefendeutung liest den letzten Wurf und diesen zusammen: was geblieben ist, was sich verschoben hat und auf welche Tage du achten solltest.", "Beide Würfe zusammen deuten · {price}"),
      es: T("Tu segunda tirada sobre esto", "Cada tirada muestra una cara del asunto. La lectura completa lee la tirada anterior y esta juntas: lo que se mantiene, lo que cambió y qué días vigilar.", "Leer las dos tiradas juntas · {price}"),
      pt: T("Sua segunda tiragem sobre isto", "Cada tiragem mostra um lado da questão. A leitura completa lê a tiragem anterior e esta juntas: o que se manteve, o que mudou e quais dias observar.", "Ler as duas tiragens juntas · {price}"),
    },
  },
  {
    id: "n2-plain", slot: "n2", texts: {
      "zh-hant": T("同一件事的第二卦", "深斷會連同上一卦一起看，講清楚這件事卡在哪、什麼時候會動、你可以怎麼做。", "看完整深斷 · {price}"),
      zh: T("同一件事的第二卦", "深断会连同上一卦一起看，讲清楚这件事卡在哪、什么时候会动、你可以怎么做。", "看完整深断 · {price}"),
      en: T("Same matter, second cast", "The full reading looks at your last cast too, and says where this is stuck, when it moves, and what you can do.", "Get the full reading · {price}"),
      ja: T("同じ件の二つ目の卦", "深い読み解きは前の卦も一緒に見て、どこで止まっているか、いつ動くか、何ができるかをはっきり伝えます。", "深い読み解きを見る · {price}"),
      ko: T("같은 일의 두 번째 괘", "심층 풀이는 지난 괘까지 함께 보고, 어디서 막혀 있는지, 언제 움직이는지, 무엇을 할 수 있는지 분명히 말씀드립니다.", "심층 풀이 보기 · {price}"),
      fr: T("Même question, deuxième tirage", "La lecture approfondie tient compte aussi de votre tirage précédent et dit où cela bloque, quand cela bouge et ce que vous pouvez faire.", "Voir la lecture complète · {price}"),
      de: T("Gleiche Sache, zweiter Wurf", "Die Tiefendeutung bezieht auch deinen letzten Wurf ein und sagt, wo es hakt, wann es sich bewegt und was du tun kannst.", "Ganze Tiefendeutung · {price}"),
      es: T("Mismo asunto, segunda tirada", "La lectura completa también mira tu tirada anterior y dice dónde está atascado, cuándo se mueve y qué puedes hacer.", "Ver la lectura completa · {price}"),
      pt: T("Mesmo assunto, segunda tiragem", "A leitura completa também olha a sua tiragem anterior e diz onde isto está travado, quando se move e o que você pode fazer.", "Ver a leitura completa · {price}"),
    },
  },
  {
    id: "n3-merge", slot: "n3", texts: {
      "zh-hant": T("{span}問了三次同一件事", "每一卦都只露出一角。深斷一次把這三卦合起來讀，說清楚前後有沒有變、關鍵在哪、應期落在哪幾天。", "把這三卦合起來斷 · {price}"),
      zh: T("{span}问了三次同一件事", "每一卦都只露出一角。深断一次把这三卦合起来读，说清楚前后有没有变、关键在哪、应期落在哪几天。", "把这三卦合起来断 · {price}"),
      en: T("Three casts on one matter", "Each cast shows one corner. The full reading puts all three together: whether anything has changed, what it hinges on, and which days the timing points to.", "Read all three together · {price}"),
      ja: T("同じ件で三つ目の卦", "一つの卦が見せるのは一面だけです。深い読み解きは三つの卦をまとめて読み、変化の有無、鍵になること、応期がどの日に来るかを示します。", "三つの卦を合わせて読む · {price}"),
      ko: T("한 가지 일로 세 번째 괘", "괘 하나는 한쪽 면만 보여 줍니다. 심층 풀이는 세 괘를 한데 모아 읽고, 달라진 것이 있는지, 무엇이 관건인지, 응기가 어느 날로 오는지 알려 드립니다.", "세 괘를 함께 풀이 · {price}"),
      fr: T("Trois tirages sur la même question", "Chaque tirage n'en montre qu'un coin. La lecture approfondie réunit les trois : ce qui a changé ou non, ce dont tout dépend, et les jours que désigne l'échéance.", "Lire les trois ensemble · {price}"),
      de: T("Drei Würfe zu einer Sache", "Jeder Wurf zeigt nur eine Ecke. Die Tiefendeutung liest alle drei zusammen: ob sich etwas verändert hat, worauf es ankommt und auf welche Tage der Zeitpunkt weist.", "Alle drei zusammen deuten · {price}"),
      es: T("Tres tiradas sobre un mismo asunto", "Cada tirada muestra solo una parte. La lectura completa reúne las tres: si algo ha cambiado, de qué depende y qué días señala el plazo.", "Leer las tres juntas · {price}"),
      pt: T("Três tiragens sobre um mesmo assunto", "Cada tiragem mostra só uma parte. A leitura completa junta as três: se algo mudou, do que depende e quais dias o prazo aponta.", "Ler as três juntas · {price}"),
    },
  },
  {
    id: "n3-settle", slot: "n3", texts: {
      "zh-hant": T("不用再重搖了", "同一件事每搖一次，只是多一個角度。深斷把你問過的這三卦一起讀完，之後有新進展，直接在解讀下面追問就好。", "一次看清楚 · {price}"),
      zh: T("不用再重摇了", "同一件事每摇一次，只是多一个角度。深断把你问过的这三卦一起读完，之后有新进展，直接在解读下面追问就好。", "一次看清楚 · {price}"),
      en: T("No need to cast again", "Each new cast on the same matter only adds another angle. The full reading reads all three of your casts, and when something new happens you can ask follow-ups under it.", "See it all at once · {price}"),
      ja: T("もう振り直さなくて大丈夫", "同じ件で卦を立て直しても、角度が一つ増えるだけです。深い読み解きでこれまでの三つの卦をまとめて読み、新しい動きがあれば読み解きの下で追加の質問ができます。", "一度でまとめて見る · {price}"),
      ko: T("다시 던지지 않으셔도 됩니다", "같은 일로 괘를 다시 던져도 보는 각도가 하나 늘 뿐입니다. 심층 풀이는 지금까지의 세 괘를 함께 읽고, 새 소식이 생기면 풀이 아래에서 추가 질문을 하시면 됩니다.", "한 번에 정리해 보기 · {price}"),
      fr: T("Inutile de retirer", "Chaque nouveau tirage sur la même question n'ajoute qu'un angle de plus. La lecture approfondie lit vos trois tirages, et si du nouveau arrive, vous posez vos questions de suivi sous la lecture.", "Tout voir d'un coup · {price}"),
      de: T("Kein neuer Wurf nötig", "Jeder neue Wurf zur selben Sache bringt nur einen weiteren Blickwinkel. Die Tiefendeutung liest deine drei Würfe zusammen, und wenn sich etwas Neues tut, stellst du darunter Folgefragen.", "Alles auf einmal sehen · {price}"),
      es: T("No hace falta volver a tirar", "Cada nueva tirada sobre lo mismo solo añade otro ángulo. La lectura completa lee tus tres tiradas, y si pasa algo nuevo, puedes hacer preguntas de seguimiento debajo.", "Verlo todo de una vez · {price}"),
      pt: T("Não precisa tirar outra vez", "Cada nova tiragem sobre o mesmo assunto só acrescenta outro ângulo. A leitura completa lê as suas três tiragens e, se algo novo acontecer, você faz perguntas de acompanhamento logo abaixo.", "Ver tudo de uma vez · {price}"),
    },
  },
  {
    id: "n4-merge", slot: "n4", texts: {
      "zh-hant": T("這件事已經問了 {n} 次", "與其再搖一卦，不如把這 {n} 卦一起讀完：深斷會說清楚這件事整體怎麼走、哪幾天要留意，之後有變化可以直接追問。", "把這 {n} 卦合起來斷 · {price}"),
      zh: T("这件事已经问了 {n} 次", "与其再摇一卦，不如把这 {n} 卦一起读完：深断会说清楚这件事整体怎么走、哪几天要留意，之后有变化可以直接追问。", "把这 {n} 卦合起来断 · {price}"),
      en: T("{n} casts on this matter", "Rather than one more cast, read these {n} together: the full reading says where this is heading overall and which days to watch, and you can ask follow-ups as things change.", "Read all {n} together · {price}"),
      ja: T("この件で {n} 回目の卦です", "もう一卦立てるより、この {n} つの卦をまとめて読みませんか。深い読み解きは全体の流れと気をつける日を示し、変化があれば追加で質問できます。", "{n} つの卦を合わせて読む · {price}"),
      ko: T("이 일로 {n}번째 괘입니다", "괘를 한 번 더 던지기보다 이 {n}개의 괘를 함께 읽어 보세요. 심층 풀이는 전체 흐름과 지켜볼 날을 알려 드리고, 상황이 바뀌면 추가 질문도 할 수 있습니다.", "{n}개의 괘를 함께 풀이 · {price}"),
      fr: T("{n} tirages sur cette question", "Plutôt qu'un tirage de plus, lisez ces {n} tirages ensemble : la lecture approfondie dit où tout cela mène et quels jours surveiller, et vous pourrez poser des questions de suivi.", "Lire les {n} ensemble · {price}"),
      de: T("{n} Würfe zu dieser Sache", "Statt eines weiteren Wurfs: lies diese {n} zusammen. Die Tiefendeutung sagt, wohin es insgesamt geht und auf welche Tage du achten solltest, und du kannst Folgefragen stellen.", "Alle {n} zusammen deuten · {price}"),
      es: T("{n} tiradas sobre este asunto", "En vez de una tirada más, lee estas {n} juntas: la lectura completa dice hacia dónde va todo y qué días vigilar, y puedes hacer preguntas de seguimiento.", "Leer las {n} juntas · {price}"),
      pt: T("{n} tiragens sobre este assunto", "Em vez de mais uma tiragem, leia estas {n} juntas: a leitura completa diz para onde tudo vai e quais dias observar, e você pode fazer perguntas de acompanhamento.", "Ler as {n} juntas · {price}"),
    },
  },
  {
    id: "n4-ask", slot: "n4", texts: {
      "zh-hant": T("同一件事，換個方式問", "再起新卦，也只會多一句。深斷讀完這 {n} 卦之後，你可以就這件事直接追問，不必重搖。", "深斷，附追問 · {price}"),
      zh: T("同一件事，换个方式问", "再起新卦，也只会多一句。深断读完这 {n} 卦之后，你可以就这件事直接追问，不必重摇。", "深断，附追问 · {price}"),
      en: T("Ask it a different way", "Another cast only adds another line. After the full reading of these {n} casts, you can ask follow-up questions on this matter instead of casting again.", "Full reading with follow-ups · {price}"),
      ja: T("同じ件は、聞き方を変えて", "新しい卦を立てても一言増えるだけです。この {n} つの卦を深く読み解いたあとは、卦を立て直さずにこの件について追加で質問できます。", "深い読み解き＋追加質問 · {price}"),
      ko: T("같은 일은 다른 방식으로", "새 괘를 던져도 한 줄이 늘 뿐입니다. 이 {n}개의 괘를 심층 풀이로 읽은 뒤에는 다시 던지지 않고 이 일에 대해 추가 질문을 할 수 있습니다.", "심층 풀이 + 추가 질문 · {price}"),
      fr: T("Posez-la autrement", "Un tirage de plus n'ajoute qu'une ligne. Après la lecture approfondie de ces {n} tirages, vous pouvez poser des questions de suivi sur cette affaire sans retirer.", "Lecture complète et suivi · {price}"),
      de: T("Frag es anders", "Ein weiterer Wurf bringt nur eine weitere Zeile. Nach der Tiefendeutung dieser {n} Würfe kannst du zu dieser Sache Folgefragen stellen, statt neu zu werfen.", "Tiefendeutung mit Folgefragen · {price}"),
      es: T("Pregúntalo de otra manera", "Otra tirada solo suma otra línea. Tras la lectura completa de estas {n} tiradas, puedes hacer preguntas de seguimiento sobre este asunto sin volver a tirar.", "Lectura completa con seguimiento · {price}"),
      pt: T("Pergunte de outro jeito", "Outra tiragem só acrescenta mais uma linha. Depois da leitura completa destas {n} tiragens, você pode fazer perguntas de acompanhamento sobre este assunto sem tirar outra vez.", "Leitura completa com acompanhamento · {price}"),
    },
  },
  // 10-06 瘦身: the one block of the 4th+ cast — the membership, for someone who keeps coming back to one matter
  // ({month} / {pass} are filled by the page in the buyer's currency, {deep} = DEEP_PER_MONTH; the button goes to the
  // membership page, see variantGoal)
  {
    id: "n4-member", slot: "n4", texts: {
      "zh-hant": T("這件事你問了 {n} 卦", "會員每月 {month}：輕解讀不限次、{deep} 份深斷。同一件事想問幾次都行，有新進展直接在解讀下面追問，不用再重搖。", "開會員 {month}/月"),
      zh: T("这件事你问了 {n} 卦", "会员每月 {month}：轻解读不限次、{deep} 份深断。同一件事想问几次都行，有新进展直接在解读下面追问，不用再重摇。", "开会员 {month}/月"),
      en: T("You've asked this {n} times", "Membership is {month} a month: unlimited light readings and {deep} full readings. Ask about this as often as you like, and when something new happens, ask follow-ups under the reading instead of casting again.", "Become a member · {month}/month"),
      ja: T("同じ件で {n} 回目の卦", "メンバーは月 {month}：ライト鑑定は回数無制限、本格鑑定は月 {deep} 回。同じ件を何度でも問えて、新しい動きがあれば鑑定の下で追加質問できます。", "メンバーになる · 月 {month}"),
      ko: T("같은 일로 {n}번째 괘", "멤버십은 월 {month}: 가벼운 풀이 무제한, 심층 풀이 {deep}회. 같은 일을 몇 번이든 물을 수 있고, 새 소식이 생기면 풀이 아래에서 추가 질문하세요.", "멤버십 시작 · 월 {month}"),
      fr: T("Vous avez posé cette question {n} fois", "L'abonnement : {month} par mois, lectures express illimitées et {deep} lectures approfondies. Revenez sur cette question autant que vous voulez, et quand du nouveau arrive, posez vos questions de suivi sous la lecture.", "S'abonner · {month}/mois"),
      de: T("Du hast das schon {n}-mal gefragt", "Die Mitgliedschaft kostet {month} im Monat: Kurzdeutungen unbegrenzt und {deep} Tiefendeutungen. Frag zu dieser Sache, so oft du willst, und wenn sich etwas Neues tut, stell Folgefragen unter der Deutung statt neu zu werfen.", "Mitglied werden · {month}/Monat"),
      es: T("Ya has preguntado esto {n} veces", "La membresía cuesta {month} al mes: lecturas breves sin límite y {deep} lecturas completas. Pregunta sobre esto cuantas veces quieras y, cuando pase algo nuevo, haz preguntas de seguimiento debajo de la lectura.", "Hazte miembro · {month}/mes"),
      pt: T("Você já perguntou isto {n} vezes", "A assinatura custa {month} por mês: leituras breves sem limite e {deep} leituras completas. Pergunte sobre isto quantas vezes quiser e, quando algo novo acontecer, faça perguntas de acompanhamento abaixo da leitura.", "Assinar · {month}/mês"),
    },
  },
  // 11-05 进度表 141: the 4th+ cast, sold as what the reader actually wants that day — the casts read together, and the
  // rest of the day's questions answered too (the button buys the 1 日通卡, {price}); n4-member converted 26 of 2,162
  {
    id: "n4-pass", slot: "n4", texts: {
      "zh-hant": T("這件事問了 {n} 卦，不如今天一次問清楚", "再搖一卦，也只多一句。通卡把這 {n} 卦合起來讀成一份深斷；通卡期間有新想法，直接追問，再起卦也都看得到完整解讀。", "今天問到清楚 · {price}"),
      zh: T("这件事问了 {n} 卦，不如今天一次问清楚", "再摇一卦，也只多一句。通卡把这 {n} 卦合起来读成一份深断；通卡期间有新想法，直接追问，再起卦也都看得到完整解读。", "今天问到清楚 · {price}"),
      en: T("{n} casts on this — settle it today instead", "Another cast only adds another line. A pass reads these {n} casts together as one full reading; while it runs, ask follow-ups or cast again and every reading is open to you.", "Settle it today · {price}"),
      ja: T("この件で {n} 回目、今日まとめて決着を", "もう一度振っても、一言増えるだけです。通しパスなら {n} つの卦をまとめて一つの深い読み解きに。期間中は追加質問も、新しい卦の読み解きもすべて見られます。", "今日はっきりさせる · {price}"),
      ko: T("이 일로 {n}번째 괘, 오늘 한 번에 정리하세요", "다시 던져도 한 줄이 늘 뿐입니다. 이용권은 이 {n}개의 괘를 함께 읽어 하나의 심층 풀이로 드리고, 기간 중에는 추가 질문도, 새 괘의 풀이도 모두 보실 수 있습니다.", "오늘 정리하기 · {price}"),
      fr: T("{n} tirages sur cette question — tranchez-la aujourd'hui", "Un tirage de plus n'ajoute qu'une ligne. Le pass lit ces {n} tirages ensemble en une lecture approfondie ; tant qu'il court, questions de suivi et nouveaux tirages sont lus en entier.", "Trancher aujourd'hui · {price}"),
      de: T("{n} Würfe zu dieser Sache — kläre es heute", "Ein weiterer Wurf bringt nur eine weitere Zeile. Der Pass liest diese {n} Würfe zusammen als eine Tiefendeutung; solange er läuft, sind Folgefragen und neue Würfe ganz gedeutet.", "Heute klären · {price}"),
      es: T("{n} tiradas sobre esto: acláralo hoy", "Otra tirada solo suma otra línea. El pase lee estas {n} tiradas juntas en una lectura completa; mientras dure, las preguntas de seguimiento y las nuevas tiradas se leen enteras.", "Aclararlo hoy · {price}"),
      pt: T("{n} tiragens sobre isto: resolva hoje", "Outra tiragem só acrescenta mais uma linha. O passe lê estas {n} tiragens juntas numa leitura completa; enquanto durar, perguntas de acompanhamento e novas tiragens são lidas por inteiro.", "Resolver hoje · {price}"),
    },
  },
  // 10-05 不顺卦话术: shown only after a free line that leaned against the reader (segment lean:bad) — a chart that leans
  // against you is not a closed door: the full reading says where it is stuck, the one step for now, and when it loosens
  {
    id: "n2-bad", slot: "n2", segment: "lean:bad", texts: {
      "zh-hant": T("卦象不順，不等於沒路", "上一卦不順，再搖一次也只會多一句。深斷會說清楚這件事卡在哪、現在先做哪一步、什麼時候會鬆動。", "看卡在哪、何時鬆動 · {price}"),
      zh: T("卦象不顺，不等于没路", "上一卦不顺，再摇一次也只会多一句。深断会说清楚这件事卡在哪、现在先做哪一步、什么时候会松动。", "看卡在哪、何时松动 · {price}"),
      en: T("A chart against you is not a closed door", "Your last line leaned against you, and another cast only adds another line. The full reading says where this is stuck, the one step to take now, and when it loosens.", "See where it's stuck · {price}"),
      ja: T("厳しい卦は、道がないという意味ではありません", "前の卦は厳しめでした。もう一度振っても、増えるのは一言だけです。深い読み解きは、どこで止まっているか、いま取る一歩、いつ動き出すかをはっきり伝えます。", "どこで止まっているかを見る · {price}"),
      ko: T("괘가 좋지 않다고 길이 없는 건 아닙니다", "지난 괘는 좋지 않게 기울었고, 다시 던져도 한 줄이 늘 뿐입니다. 심층 풀이는 어디서 막혀 있는지, 지금 할 한 걸음, 언제 풀리는지를 분명히 말씀드립니다.", "어디서 막혔는지 보기 · {price}"),
      fr: T("Un tirage défavorable n'est pas une porte fermée", "Votre dernière ligne penchait contre vous, et un tirage de plus n'ajoute qu'une ligne. La lecture approfondie dit où cela bloque, le pas à faire maintenant et quand cela se desserre.", "Voir où ça bloque · {price}"),
      de: T("Ein ungünstiger Wurf ist keine verschlossene Tür", "Deine letzte Zeile sprach gegen dich, und ein weiterer Wurf bringt nur eine weitere Zeile. Die Tiefendeutung sagt, wo es hakt, den einen Schritt für jetzt und wann es sich löst.", "Sehen, wo es hakt · {price}"),
      es: T("Una tirada en contra no es una puerta cerrada", "Tu última línea se inclinaba en tu contra, y otra tirada solo suma otra línea. La lectura completa dice dónde está atascado, el paso que dar ahora y cuándo se afloja.", "Ver dónde se atasca · {price}"),
      pt: T("Uma tiragem contrária não é uma porta fechada", "Sua última linha pendia contra você, e outra tiragem só acrescenta mais uma linha. A leitura completa diz onde isto está travado, o passo a dar agora e quando se solta.", "Ver onde está travado · {price}"),
    },
  },
  {
    id: "n3-bad", slot: "n3", segment: "lean:bad", texts: {
      "zh-hant": T("不順的卦，更要看清卡在哪", "之前那一句不順，換個說法再問，答案也不會變。深斷把這幾卦合起來讀，講清楚卡在哪一環、現在能做的一步、哪幾天會有轉機。", "把這幾卦合起來斷 · {price}"),
      zh: T("不顺的卦，更要看清卡在哪", "之前那一句不顺，换个说法再问，答案也不会变。深断把这几卦合起来读，讲清楚卡在哪一环、现在能做的一步、哪几天会有转机。", "把这几卦合起来断 · {price}"),
      en: T("When the chart is against you, see where it's stuck", "The line you got leaned against you, and asking it another way won't change the answer. The full reading reads these casts together: which link is stuck, the one step you can take now, and which days bring a turn.", "Read these casts together · {price}"),
      ja: T("厳しい卦ほど、どこで止まっているかを", "前の一言は厳しめで、聞き方を変えても答えは変わりません。深い読み解きはこれまでの卦をまとめて読み、どこで止まっているか、いまできる一歩、どの日に流れが変わるかを示します。", "まとめて読み解く · {price}"),
      ko: T("좋지 않은 괘일수록, 어디서 막혔는지", "먼저 받은 한 줄은 좋지 않게 기울었고, 다르게 물어도 답은 바뀌지 않습니다. 심층 풀이는 이 괘들을 함께 읽고, 어느 고리가 막혔는지, 지금 할 수 있는 한 걸음, 어느 날에 흐름이 바뀌는지를 알려 드립니다.", "이 괘들을 함께 풀이 · {price}"),
      fr: T("Quand le tirage est contre vous, voyez où ça bloque", "La ligne reçue penchait contre vous, et la reformuler ne changera pas la réponse. La lecture approfondie lit ces tirages ensemble : le maillon qui bloque, le pas possible maintenant, et les jours où cela tourne.", "Lire ces tirages ensemble · {price}"),
      de: T("Wenn der Wurf gegen dich spricht, sieh, wo es hakt", "Die Zeile, die du bekamst, sprach gegen dich, und anders gefragt ändert sich die Antwort nicht. Die Tiefendeutung liest diese Würfe zusammen: welches Glied hakt, der eine Schritt, der jetzt geht, und an welchen Tagen es sich wendet.", "Diese Würfe zusammen deuten · {price}"),
      es: T("Si la tirada va en contra, mira dónde se atasca", "La línea que recibiste se inclinaba en tu contra, y preguntarlo de otra forma no cambia la respuesta. La lectura completa lee estas tiradas juntas: qué eslabón se atasca, el paso posible ahora y qué días traen un giro.", "Leer estas tiradas juntas · {price}"),
      pt: T("Se a tiragem vai contra, veja onde trava", "A linha que você recebeu pendia contra você, e perguntar de outro jeito não muda a resposta. A leitura completa lê estas tiragens juntas: qual elo trava, o passo possível agora e quais dias trazem uma virada.", "Ler estas tiragens juntas · {price}"),
    },
  },
  {
    id: "n4-bad", slot: "n4", segment: "lean:bad", texts: {
      "zh-hant": T("這件事問了 {n} 次，答案偏不順", "再搖，卦還是這個方向。不順不等於沒路：深斷把這 {n} 卦一起讀完，說清楚卡在哪、現在先做哪一步、什麼時候會鬆動，之後有變化直接追問。", "看卡在哪、何時鬆動 · {price}"),
      zh: T("这件事问了 {n} 次，答案偏不顺", "再摇，卦还是这个方向。不顺不等于没路：深断把这 {n} 卦一起读完，说清楚卡在哪、现在先做哪一步、什么时候会松动，之后有变化直接追问。", "看卡在哪、何时松动 · {price}"),
      en: T("{n} casts on this, and the answer leans against you", "Cast again and the chart keeps its direction. Against you is not a closed door: the full reading reads all {n} casts, says where this is stuck, the one step for now and when it loosens — and you can ask follow-ups as things change.", "See where it's stuck · {price}"),
      ja: T("この件で {n} 回、答えは厳しめ", "また振っても卦の向きは変わりません。厳しくても道はあります。深い読み解きは {n} つの卦をまとめて読み、どこで止まっているか、いま取る一歩、いつ動き出すかを伝えます。", "どこで止まっているかを見る · {price}"),
      ko: T("이 일로 {n}번, 답은 좋지 않은 쪽", "다시 던져도 괘의 방향은 그대로입니다. 좋지 않다고 길이 없는 건 아닙니다. 심층 풀이는 {n}개의 괘를 함께 읽고, 어디서 막혔는지, 지금 할 한 걸음, 언제 풀리는지를 알려 드리며, 상황이 바뀌면 추가 질문도 할 수 있습니다.", "어디서 막혔는지 보기 · {price}"),
      fr: T("{n} tirages, et la réponse penche contre vous", "Retirez, et le tirage garde sa direction. Défavorable ne veut pas dire porte fermée : la lecture approfondie lit vos {n} tirages, dit où ça bloque, le pas à faire maintenant et quand cela se desserre, et vous pourrez poser des questions de suivi.", "Voir où ça bloque · {price}"),
      de: T("{n} Würfe, und die Antwort spricht gegen dich", "Wirf noch einmal, und der Wurf behält seine Richtung. Gegen dich heißt nicht verschlossen: Die Tiefendeutung liest alle {n} Würfe, sagt, wo es hakt, den einen Schritt für jetzt und wann es sich löst, und du kannst Folgefragen stellen.", "Sehen, wo es hakt · {price}"),
      es: T("{n} tiradas, y la respuesta va en tu contra", "Vuelve a tirar y la tirada mantiene su dirección. En contra no es puerta cerrada: la lectura completa lee las {n} tiradas, dice dónde se atasca, el paso para ahora y cuándo se afloja, y puedes hacer preguntas de seguimiento.", "Ver dónde se atasca · {price}"),
      pt: T("{n} tiragens, e a resposta pende contra você", "Tire de novo e a tiragem mantém a direção. Contrária não quer dizer porta fechada: a leitura completa lê as {n} tiragens, diz onde trava, o passo para agora e quando se solta, e você pode fazer perguntas de acompanhamento.", "Ver onde está travado · {price}"),
    },
  },
  // the free line's way of tying this chart to the earlier ones — an instruction to the model (title = the label on the dashboard)
  { id: "style-held", slot: "style", texts: { "*": T("前后对照", "say plainly whether the way it leans has held since their earlier casts or has turned, and the reason for that in THIS chart", "") } },
  { id: "style-core", slot: "style", texts: { "*": T("点出核心", "name in plain words the one thing their questions keep coming back to, and what THIS chart says about it", "") } },
  { id: "style-new", slot: "style", texts: { "*": T("这卦新在哪", "say what THIS chart adds that the earlier lines did not — the new piece, not the old lean restated", "") } },
];

/**
 * 10-04 按人写的引导 (Neil: 「像这种用户，AI会根据他前几次的问题和卦象来自动调整引导下一次摇卦的付费引导吗？」→「要」): one more
 * version in each of n2 / n3 / n4 whose words are not fixed — when the sampler picks it, a model reads this reader's
 * matter (what they asked, the figures, the free lines and how they leaned, the casts the day's limit left without one)
 * and the blocks they already saw, and writes a block for them alone (personalBlock). It is judged like any other
 * version: by who pays within 72 hours of seeing it. NUDGE_PERSONAL=off leaves it out of the draw.
 */
export const PERSONAL_ARMS: { id: string; slot: Exclude<Slot, "style"> }[] = [
  // 11-06 (Neil:「付费引导弱爆了，我们不会让AI根据用户的问题去自行调整吗？」): the first cast too
  { id: "n1-personal", slot: "n1" }, { id: "n2-personal", slot: "n2" }, { id: "n3-personal", slot: "n3" }, { id: "n4-personal", slot: "n4" },
];
export const personalOn = (): boolean => (process.env.NUDGE_PERSONAL ?? "on") !== "off";
/**
 * 11-06: the written-per-reader block is no longer one arm in the draw — it is what readers get, on every cast. A share of
 * browsers (by a hash of the browser id, the same answer every time; NUDGE_PERSONAL_SHARE, default 0.8) gets it; the rest
 * keep the ready versions as the control, so the two can still be compared on /admin/nudges. Numbers when this was decided
 * (paid within 72 hours): n2 written 18/307 = 5.9% against the ready versions' 4.0%; n3 7/150 = 4.7% against 4.5%.
 * Tests leave it out unless they set the share (a writing call would eat their scripted model answers).
 */
export const personalShare = (): number => {
  const v = Number(process.env.NUDGE_PERSONAL_SHARE ?? (process.env.VITEST === "true" ? 0 : 0.8));
  return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0.8;
};
export function inPersonalDefault(bid: string | null | undefined): boolean {
  if (!bid || !personalOn()) return false;
  const h = createHash("sha256").update(`nudgeai:${bid}`).digest();
  return h.readUInt16BE(0) / 65536 < personalShare();
}
export const isPersonal = (v: Pick<Variant, "source"> | null | undefined): boolean => v?.source === "personal";

/**
 * 10-06 瘦身: what the cut retires, applied once per database (nudge_runs kind slim_1006) so the owner's later choices on
 * the dashboard stand. Retired, not deleted: the words and numbers stay readable, and any can be switched back on.
 */
const SLIM_N4 = "10-06 瘦身：第 4 卦起固定一句推会员（n4-member），不再抽签";
export const SLIM_1006: { id: string; why: string }[] = [
  { id: "n3-merge", why: "10-06 瘦身：每格最多两个版本——第 3 卦留「定下来」和「不顺版」" },
  { id: "n2-bad", why: "10-06 瘦身：每格最多两个版本——第 2 卦留「合起来断」和「直接说」，不顺版在第 3 卦试" },
  { id: "n4-merge", why: SLIM_N4 },
  { id: "n4-ask", why: SLIM_N4 },
  { id: "n4-bad", why: SLIM_N4 },
  { id: "n4-personal", why: "10-06 瘦身：第 4 卦起固定推会员；按人写的留在第 2、3 卦，10-17 复查定去留" },
  { id: "ai-n2-r2-1", why: "10-06 瘦身：每格最多两个版本——第 2 卦留两个手写版本（三天下来和种子看不出差别）" },
  { id: "ai-n2-r2-2", why: "10-06 瘦身：每格最多两个版本——第 2 卦留两个手写版本（三天下来和种子看不出差别）" },
];

/**
 * 11-05 进度表 141 (Neil: 「引导话术再根据现有的数据进行升级」), once per database. Numbers as of 11-05 (paid within 72h
 * of seeing the block): n4-member 26/2,162 = 1.2% on the most-shown seat and still selling the old membership words;
 * n4-merge had 18/1,072 = 1.7% before it was cut on 10-06. n1-full was written for a page without the free line.
 */
export const UPGRADE_1105: { id: string; status: "active" | "retired"; why: string }[] = [
  { id: "n1-full", status: "retired", why: "11-05 免费一句回来：这版写的是没有那一句的页面（换 n1-line）" },
  { id: "n4-member", status: "retired", why: "11-05 数据：26/2162 = 1.2%，五格里最低；文案还是旧会员（轻解读不限次＋N 份深断）——换 n4-pass（1 日通卡）" },
  { id: "n4-merge", status: "active", why: "11-05 重开：10-06 前 18/1072 = 1.7%，高于 n4-member；和 n4-pass 对照" },
];

export const AUTO_1017_WHY = "10-17 全自动：待定的草稿一次清掉；以后 AI 版本过了检查直接上线、没过直接不要，空位由下一次每周起草补";

/** Where a version's button goes: a block that names the monthly price ({month}) sells the membership, the rest the full reading. */
export const variantGoal = (v: Pick<Variant, "texts" | "source">): "deep" | "member" =>
  v.source !== "personal" && Object.values(v.texts).some((t) => t && /\{month\}/.test(t.cta)) ? "member" : "deep";

let seeded = false;
/** Seeds in, once per process: new ones added, the words of existing seeds kept in step with the code (status untouched). */
export function ensureSeeds(now = Date.now()): void {
  if (seeded) return;
  const d = db();
  const ins = d.prepare("INSERT OR IGNORE INTO nudge_variants (id, slot, status, source, texts_json, created_at, updated_at, segment) VALUES (?,?,?,?,?,?,?,?)");
  const upd = d.prepare("UPDATE nudge_variants SET texts_json = ?, segment = ? WHERE id = ? AND source = 'seed' AND (texts_json <> ? OR COALESCE(segment, '') <> ?)");
  SEEDS.forEach((s, i) => {
    const json = JSON.stringify(s.texts);
    const seg = s.segment ?? null;
    ins.run(s.id, s.slot, "active", "seed", json, now + i, now + i, seg);
    upd.run(json, seg, s.id, json, seg ?? "");
  });
  // the written-per-reader version of each stage: no words of its own (the dashboard shows what it wrote)
  PERSONAL_ARMS.forEach((p, i) => ins.run(p.id, p.slot, "active", "personal", "{}", now + SEEDS.length + i, now + SEEDS.length + i));
  // 10-06 瘦身: once per database
  if (!lastRun("slim_1006")) {
    const ret = d.prepare("UPDATE nudge_variants SET status = 'retired', status_why = ?, updated_at = ? WHERE id = ? AND status <> 'retired'");
    const done = SLIM_1006.filter((s) => changesOf(ret.run(s.why, now, s.id)) > 0).map((s) => s.id);
    logRun("slim_1006", done.join(",") || "none", now);
  }
  // 10-17 全自动: the drafts parked since 10-03 are cleared once — from now on a draft is live or dropped, and a free
  // AI seat is filled by the next weekly drafting from fresh numbers, not from an old draft nobody read
  if (!lastRun("auto_1017")) {
    const rows = d.prepare("SELECT id FROM nudge_variants WHERE status = 'draft'").all() as { id: string }[];
    const ret = d.prepare("UPDATE nudge_variants SET status = 'retired', status_why = ?, updated_at = ? WHERE id = ? AND status = 'draft'");
    for (const r of rows) ret.run(AUTO_1017_WHY, now, r.id);
    logRun("auto_1017", rows.map((r) => r.id).join(",") || "none", now);
  }
  // 11-06: the written-per-reader arms back on (they are the default now, see inPersonalDefault)
  if (!lastRun("personal_1106")) {
    const set = d.prepare("UPDATE nudge_variants SET status = 'active', status_why = ?, updated_at = ? WHERE id = ? AND status <> 'active'");
    const done = PERSONAL_ARMS.filter((p) => changesOf(set.run("11-06 Neil：付费引导按读者的问题由 AI 写，默认给 80% 浏览器，20% 留现成版本对照", now, p.id)) > 0).map((p) => p.id);
    logRun("personal_1106", done.join(",") || "none", now);
  }
  // 11-05 进度表 141: the free line is back; the seats changed from the numbers (UPGRADE_1105)
  if (!lastRun("upgrade_1105")) {
    const set = d.prepare("UPDATE nudge_variants SET status = ?, status_why = ?, updated_at = ? WHERE id = ? AND status <> ?");
    const done = UPGRADE_1105.filter((u) => changesOf(set.run(u.status, u.why, now, u.id, u.status)) > 0).map((u) => `${u.id}:${u.status}`);
    logRun("upgrade_1105", done.join(",") || "none", now);
  }
  seeded = true;
}

const toVariant = (r: Record<string, unknown>): Variant => ({
  id: String(r.id), slot: r.slot as Slot, status: r.status as Variant["status"], source: r.source as Variant["source"],
  texts: (() => { try { return JSON.parse(String(r.texts_json)) as VariantTexts; } catch { return {}; } })(),
  parent: (r.parent as string | null) ?? null, notes: (r.notes as string | null) ?? null,
  created_at: Number(r.created_at), updated_at: Number(r.updated_at), status_why: (r.status_why as string | null) ?? null,
  segment: (r.segment as string | null) ?? null,
  checked_at: (r.checked_at as number | null) ?? null,
});

export function variants(slot?: Slot): Variant[] {
  ensureSeeds();
  const rows = slot
    ? db().prepare("SELECT * FROM nudge_variants WHERE slot = ? ORDER BY created_at").all(slot)
    : db().prepare("SELECT * FROM nudge_variants ORDER BY slot, created_at").all();
  return (rows as Record<string, unknown>[]).map(toVariant);
}
export const variantById = (id: string): Variant | null => {
  ensureSeeds();
  const r = db().prepare("SELECT * FROM nudge_variants WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  return r ? toVariant(r) : null;
};

export function setVariantStatus(id: string, status: Variant["status"], why: string, now = Date.now()): boolean {
  const r = db().prepare("UPDATE nudge_variants SET status = ?, status_why = ?, updated_at = ? WHERE id = ?").run(status, why.slice(0, 200), now, id);
  if (changesOf(r)) { logRun(`status_${status}`, `${id} ${why}`.slice(0, 300), now); STATS.clear(); }
  return changesOf(r) > 0;
}

export function logRun(kind: string, detail: string, now = Date.now()): void {
  try { db().prepare("INSERT INTO nudge_runs (at, kind, detail) VALUES (?,?,?)").run(now, kind, detail.slice(0, 2000)); } catch { /* diary only */ }
}
export function lastRun(kind: string): number | null {
  const r = db().prepare("SELECT MAX(at) AS t FROM nudge_runs WHERE kind = ?").get(kind) as { t: number | null };
  return r.t ?? null;
}
export function recentRuns(limit = 30): { at: number; kind: string; detail: string | null }[] {
  return db().prepare("SELECT at, kind, detail FROM nudge_runs ORDER BY at DESC LIMIT ?").all(limit) as { at: number; kind: string; detail: string | null }[];
}

/* ---------------- the guards ---------------- */

// 10-06: {month} / {pass} (the membership's prices, filled by the page) and {deep} (full readings a month) joined for n4-member
const PLACEHOLDER = /\{(n|k|span|price|month|pass|deep)\}/g;
const BAD: [string, RegExp][] = [
  ["urgency", /限時|限时|只剩|僅剩|仅剩|最後機會|最后机会|倒數|倒数|馬上|马上|立刻|立即|趕快|赶快|趕緊|赶紧|錯過|错过|即將|即将|搶|抢|名額|名额|截止|過期|过期|今天內|今天内|今晚前|今すぐ|急いで|限定|残りわずか|지금 바로|서두르|마감|한정|\b(hurry|last chance|limited|only today|today only|ends soon|deadline|act now|right now|don'?t miss|expires?|dernière chance|dépêchez|limitée?|letzte chance|beeil|begrenzt|última oportunidad|date prisa|limitad[oa]|última chance|corra)\b/i],
  ["discount", /折扣|打折|[一二三四五六七八九]折|優惠|优惠|特價|特价|省下|划算|便宜|半價|半价|免費送|免费送|割引|お得|セール|할인|저렴|\b(discount|deal|cheap|save|bargain|sale|réduction|promo|rabatt|günstig|descuento|oferta|barato|desconto|promoção)\b/i],
  ["guarantee", /保證|保证|一定會|一定会|必定|必然|絕對|绝对|百分之|準確|准确|靈驗|灵验|必中|包準|包准|精準|精准|保証|必ず|絶対|当たる|확실|반드시|보장|정확|\b(guarantee[sd]?|definitely|certainly|accurate|accuracy|proven|always right|garanti[e]?|garantiert|garantizad[oa]|garantid[oa])\b/i],
  ["fear", /災|灾|厄運|厄运|凶險|凶险|危險|危险|後果|后果|來不及|来不及|血光|破財|破财|後悔|后悔|災い|手遅れ|위험|후회|재앙|\b(danger|disaster|doom|regret|too late|bad luck|curse|regrett|trop tard|gefahr|bereuen|zu spät|peligro|arrepent\w*|demasiado tarde|perigo|arrepend\w*|tarde demais)\b/i],
  ["health", /病|醫|医|藥|药|治療|治疗|診斷|诊断|의사|치료|\b(medical|doctor|cure|diagnos\w*|treatment|illness|disease|médic\w*|maladie|arzt|krankheit|enfermedad|doença)\b/i],
  ["others", /大家都|很多人都|多數人|多数人|[%％]|みんな|多くの人|모두가|대부분|\b(everyone|everybody|most people|thousands|millions)\b/i],
];

const cjkOf = (l: Locale | "*") => (l === "*" ? false : LOCALE_META[l].cjk);
// Korean writes with spaces between words: more characters for the same length of sentence
const LIMITS = { cjk: { title: 22, body: 90, cta: 20 }, ko: { title: 30, body: 130, cta: 26 }, latin: { title: 60, body: 260, cta: 50 } };

/** What is wrong with one language's words, if anything ([] = fit to show). */
export function nudgeOffenses(t: NudgeText, locale: Locale): string[] {
  const out: string[] = [];
  const all = `${t.title}\n${t.body}\n${t.cta}`;
  if (!t.title?.trim() || !t.body?.trim() || !t.cta?.trim()) out.push("empty");
  // the button names one price: the reading's ({price}), or the membership's ({month}) on a block that sells it
  if ((t.cta.match(/\{(price|month)\}/g) ?? []).length !== 1) out.push("cta needs {price} once");
  if (/\{price\}/.test(t.title) || /\{price\}/.test(t.body)) out.push("{price} outside the button");
  const unknown = all.replace(PLACEHOLDER, "").match(/\{[^}]*\}/);
  if (unknown) out.push(`unknown placeholder ${unknown[0]}`);
  if (/[0-9０-９]/.test(all.replace(PLACEHOLDER, ""))) out.push("digits (use {n} / {span})");
  const lim = locale === "ko" ? LIMITS.ko : cjkOf(locale) ? LIMITS.cjk : LIMITS.latin;
  const len = (s: string) => s.replace(PLACEHOLDER, "").trim().length;
  if (len(t.title) > lim.title) out.push(`title too long (${len(t.title)}>${lim.title})`);
  if (len(t.body) > lim.body) out.push(`body too long (${len(t.body)}>${lim.body})`);
  if (len(t.cta.replace(/\s*·\s*\{price\}\s*$/, "")) > lim.cta) out.push(`button too long`);
  if (len(t.body) < (cjkOf(locale) ? 12 : 30)) out.push("body too short");
  for (const [why, re] of BAD) { const m = all.replace(PLACEHOLDER, "").match(re); if (m) out.push(`${why}: ${m[0]}`); }
  if (!cjkOf(locale) && /[㐀-鿿가-힯぀-ヿ]/.test(all)) out.push("CJK in a Latin-script language");
  return out;
}

/** A style instruction a draft proposes: an instruction to the model, so it may never loosen the rules around it. */
export function styleOffenses(prompt: string): string[] {
  const out: string[] = [];
  const p = prompt.trim();
  if (p.length < 30 || p.length > 240) out.push("length");
  if (/\b(date|deadline|when exactly|price|pay|buy|purchase|guarantee|certain|fear|warn|urgent|count|how many times|hexagram name|advice|should|must do)\b/i.test(p)) out.push("touches what the line may never do");
  if (/[{}<>]/.test(p)) out.push("markup");
  return out;
}

/**
 * 10-03 去重: how alike two texts read, 0–1 — shared words (Latin) or shared character pairs (CJK) over all of them.
 * The first weekly review handed back the seeds with a phrase added (same title, same button); a version that is a
 * reworded copy teaches the sampler nothing and takes a place a new idea could have.
 */
export function textAlike(a: string, b: string): number {
  const units = (s: string): Set<string> => {
    const t = s.replace(PLACEHOLDER, " ").toLowerCase();
    if (/[㐀-鿿぀-ヿ가-힯]/.test(t)) {
      const c = t.replace(/[\s\p{P}\p{S}]/gu, "");
      const g = new Set<string>();
      for (let i = 0; i < c.length - 1; i++) g.add(c.slice(i, i + 2));
      return g;
    }
    return new Set(t.split(/[^\p{L}\p{N}']+/u).filter((w) => w.length > 1));
  };
  const A = units(a), B = units(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter / (A.size + B.size - inter);
}
const ALIKE_AT = 0.5;
const bare = (s: string) => s.replace(PLACEHOLDER, "").replace(/[\s\p{P}\p{S}]/gu, "").toLowerCase();

/** Is this block only a reworded copy of one already in the slot (any status)? The reason, or null. */
export function nearCopy(slot: Exclude<Slot, "style">, locale: Locale, t: NudgeText): string | null {
  for (const v of variants(slot)) {
    const o = v.texts[locale];
    if (!o) continue;
    if (bare(o.title) && bare(o.title) === bare(t.title)) return `copy: same title as ${v.id}`;
    const x = textAlike(`${o.title} ${o.body}`, `${t.title} ${t.body}`);
    if (x >= ALIKE_AT) return `copy: mostly the words of ${v.id} (${Math.round(x * 100)}%)`;
  }
  return null;
}

/**
 * 10-03 说法核对: the word guards cannot see a claim. The second weekly review wrote 「三次問下來，答案在變」 — shown to
 * everyone on a 3rd cast, false for whoever got the same answer three times. A light model reads each AI block as every
 * reader at its stage will see it, against the facts the block may use; a block it doubts (or cannot read) waits for a
 * yes instead of going live.
 */
const STAGE_EN: Record<Exclude<Slot, "style">, string> = { n1: "1st", n2: "2nd", n3: "3rd", n4: "4th or later" };
export function claimSystem(slot: Exclude<Slot, "style">, topic: string | null): string {
  return [
    `You check a short block an I Ching reading site shows right before the price, on a reader's ${STAGE_EN[slot]} cast about the same matter${topic ? ` (only on ${topic} questions)` : ""}.`,
    "The SAME words are shown to every reader at that stage, whatever they asked and whatever their casts said.",
    "Flag only a statement of FACT that would be false for some of those readers: what their casts said or how they compare (\"the answer is changing\", \"it keeps saying no\"), what will happen or what someone feels or will do (\"he will come back\"), or a promise of something the full reading does not give.",
    "What the full reading gives (true for everyone): it reads this cast together with their earlier casts on the matter and gives the call, timing windows with dates, what to do, what to avoid, two signs to watch, and follow-up questions under the reading; with it they can ask follow-ups instead of casting again. The free line gives only which way one cast leans.",
    "Do NOT flag: framing or opinion about what matters now (\"what counts is how the two casts compare\"), invitations, a plain description of the stage (\"your 2nd cast on this\"), or the QUESTIONS the reading takes up — \"whether he will reach out\", \"which days to watch\", \"what has held and what has shifted\" — the reading does take them up, whatever the answer turns out to be.",
    'Answer JSON only: {"ok":true} or {"ok":false,"why":"<the statement> — <why it may be false>"} (why in Simplified Chinese, short).',
  ].join("\n");
}
export const CLAIM_UNREAD = "说法核对没跑成";
export async function claimCheck(slot: Exclude<Slot, "style">, t: NudgeText, topic: string | null): Promise<string | null> {
  try {
    const raw = await chatJson([
      { role: "system", content: claimSystem(slot, topic) },
      { role: "user", content: JSON.stringify({ title: t.title, body: t.body, button: t.cta }) },
    ], { maxTokens: 200, temperature: 0, timeoutMs: 20_000, light: true });
    const j = JSON.parse(raw) as { ok?: unknown; why?: unknown };
    if (j.ok === true) return null;
    return `说法核对：${toHans(String(j.why ?? "可能不是对每个人都成立").trim().slice(0, 160))}`;
  } catch {
    return CLAIM_UNREAD;
  }
}

/**
 * The cron's hourly turn: any live AI block not read yet (written before the check, or when it could not run) is read
 * now; one it doubts goes back to waiting. Hand-written and seed blocks are the owner's and are left alone.
 */
export async function recheckLive(now = Date.now()): Promise<string[]> {
  const back: string[] = [];
  for (const slot of NUDGE_SLOTS as Exclude<Slot, "style">[]) {
    for (const v of variants(slot)) {
      // switched on by hand on the dashboard: the owner's call, not re-read
      if (v.source !== "ai" || v.status !== "active" || v.checked_at || v.status_why === "dashboard") continue;
      const t = v.texts["zh-hant"] ?? Object.values(v.texts).find(Boolean);
      if (!t) continue;
      const claim = await claimCheck(slot, t, v.segment?.replace(/^topic:/, "") ?? null);
      if (claim === CLAIM_UNREAD) continue; // try again next hour
      db().prepare("UPDATE nudge_variants SET checked_at = ? WHERE id = ?").run(now, v.id);
      // 10-17 全自动: a doubt retires it (nobody is waiting to say yes); in review mode it goes back to waiting
      if (claim) { if (aiMode() === "auto") setVariantStatus(v.id, "retired", `说法核对拦下 — ${claim}`, now); else setVariantStatus(v.id, "draft", `waiting for a yes — ${claim}`, now); back.push(v.id); }
    }
  }
  return back;
}

/** The same for a free-line style: an instruction already there in other words. */
export function nearCopyStyle(prompt: string): string | null {
  for (const v of variants("style")) {
    const o = v.texts["*"]?.body;
    if (!o) continue;
    const x = textAlike(o, prompt);
    if (x >= ALIKE_AT) return `copy: mostly the words of ${v.id} (${Math.round(x * 100)}%)`;
  }
  return null;
}

/* ---------------- who paid after seeing what ---------------- */

/** A person this variant was credited with: shown at `shownAt` (a browser), paid at `purchase.t`. */
export interface VariantPayer { bid: string; shownAt: number; purchase: PurchaseRec }
/** 10-03 按组挑版本: a version's results on one kind of question */
export interface TopicStats { shown: number; settled: number; paid: number }
export interface VariantStats {
  id: string; shown: number; pending: number; settled: number; paid: number; rate: number | null; pBest: number | null; payers: VariantPayer[];
  byTopic: Record<string, TopicStats>;
  /** 10-05 不顺卦话术: results on casts where the line last seen leaned against the reader (key "bad") */
  byLean: Record<string, TopicStats>;
}

export interface Exposure { id: number; person: string; bid: string; t: number; variant: string; slot: Slot; topic?: string | null; lean?: string | null }

function exposures(family: "nudge" | "style", since: number, person: ReturnType<typeof personResolver>): Exposure[] {
  const rows = db().prepare(
    family === "nudge"
      ? "SELECT id, bid, created_at AS t, nudge AS v, thread_n AS n, topic, nudge_lean AS lean FROM cast_log WHERE created_at >= ? AND nudge IS NOT NULL AND nudge_seen = 1"
      : "SELECT id, bid, created_at AS t, style AS v, thread_n AS n, topic, NULL AS lean FROM cast_log WHERE created_at >= ? AND style IS NOT NULL AND teaser IS NOT NULL",
  ).all(since) as { id: number; bid: string; t: number; v: string; n: number | null; topic: string | null; lean: string | null }[];
  return rows.map((r) => ({ id: r.id, person: person(r.bid, null)!, bid: r.bid, t: r.t, variant: r.v, slot: family === "style" ? "style" as Slot : (slotFor(r.n ?? 0) ?? "n4"), topic: r.topic ?? "other", lean: r.lean ?? null }));
}

/**
 * Last touch, with the purchase that did it: each purchase credits the latest exposure of that family the person saw in
 * the 72 hours before it. An exposure not credited settles as "no" after SETTLE_MS (24 hours, 10-06); until then it is
 * pending and counts neither way.
 */
export function creditDetails<P extends { t: number }>(exps: Exposure[] | Omit<Exposure, "bid">[], purchases: Map<string, P[]>, now: number): Map<number, { state: "paid" | "no" | "pending"; purchase?: P }> {
  const byPerson = new Map<string, (Exposure | Omit<Exposure, "bid">)[]>();
  for (const e of exps) byPerson.set(e.person, [...(byPerson.get(e.person) ?? []), e]);
  const out = new Map<number, { state: "paid" | "no" | "pending"; purchase?: P }>();
  for (const [p, list] of byPerson) {
    list.sort((a, b) => a.t - b.t);
    const credited = new Map<number, P>();
    for (const pur of purchases.get(p) ?? []) {
      let last: (Exposure | Omit<Exposure, "bid">) | null = null;
      for (const e of list) { if (e.t <= pur.t) last = e; else break; }
      if (last && pur.t - last.t <= REWARD_MS && !credited.has(last.id)) credited.set(last.id, pur);
    }
    for (const e of list) {
      const pur = credited.get(e.id);
      out.set(e.id, pur ? { state: "paid", purchase: pur } : { state: now - e.t >= SETTLE_MS ? "no" : "pending" });
    }
  }
  return out;
}

/** The same credit, as plain states (purchase times only). */
export function creditExposures(exps: Omit<Exposure, "bid">[], purchases: Map<string, number[]>, now: number): Map<number, "paid" | "no" | "pending"> {
  const wrapped = new Map([...purchases].map(([k, v]) => [k, v.map((t) => ({ t }))] as const));
  return new Map([...creditDetails(exps, wrapped, now)].map(([id, x]) => [id, x.state] as const));
}

const STATS = new Map<string, { at: number; v: Map<string, VariantStats> }>();
const STATS_TTL = 5 * 60_000;

/** Per variant: shown, settled (24 hours on, or paid), paid — and its chance of being the best live one in its slot. */
export function variantStats(slot: Slot, now = Date.now(), fresh = false): Map<string, VariantStats> {
  const hit = STATS.get(slot);
  if (hit && !fresh && now - hit.at < STATS_TTL) return hit.v;
  const since = now - STATS_DAYS * 86_400_000;
  const person = personResolver();
  const family = slot === "style" ? "style" : "nudge";
  const exps = exposures(family, since, person);
  const credit = creditDetails(exps, purchaseRecords(since, person), now);
  const out = new Map<string, VariantStats>();
  const blank = (id: string): VariantStats => ({ id, shown: 0, pending: 0, settled: 0, paid: 0, rate: null, pBest: null, payers: [], byTopic: {}, byLean: {} });
  for (const v of variants(slot)) out.set(v.id, blank(v.id));
  for (const e of exps) {
    if (e.slot !== slot) continue;
    const s = out.get(e.variant) ?? blank(e.variant);
    const tp = (s.byTopic[e.topic ?? "other"] ??= { shown: 0, settled: 0, paid: 0 });
    const ln = e.lean ? (s.byLean[e.lean] ??= { shown: 0, settled: 0, paid: 0 }) : null;
    s.shown += 1;
    tp.shown += 1;
    if (ln) ln.shown += 1;
    const c = credit.get(e.id);
    if (c?.state === "pending") s.pending += 1;
    else {
      s.settled += 1;
      tp.settled += 1;
      if (ln) ln.settled += 1;
      if (c?.state === "paid" && c.purchase) { s.paid += 1; tp.paid += 1; if (ln) ln.paid += 1; s.payers.push({ bid: e.bid, shownAt: e.t, purchase: c.purchase }); }
    }
    out.set(e.variant, s);
  }
  for (const s of out.values()) s.payers.sort((a, b) => b.purchase.t - a.purchase.t);
  for (const s of out.values()) s.rate = s.settled ? s.paid / s.settled : null;
  const live = variants(slot).filter((v) => v.status === "active").map((v) => out.get(v.id)!).filter(Boolean);
  // 10-06: the same posterior the sampler draws from — a version with little data of its own sits at the slot's rate
  const pool = poolOf(out.values());
  const pb = chanceBest(live.map((s) => basePosterior(s, pool)));
  live.forEach((s, i) => { s.pBest = pb[i] ?? null; });
  STATS.set(slot, { at: now, v: out });
  return out;
}

/* ---------------- sampling ---------------- */

function normal(rnd: () => number): number {
  let u = 0, v = 0;
  while (u === 0) u = rnd();
  while (v === 0) v = rnd();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
/** Marsaglia–Tsang. */
export function gammaSample(k: number, rnd: () => number = Math.random): number {
  if (k < 1) return gammaSample(1 + k, rnd) * Math.pow(rnd() || 1e-12, 1 / k);
  const d = k - 1 / 3, c = 1 / Math.sqrt(9 * d);
  for (;;) {
    let x: number, v: number;
    do { x = normal(rnd); v = 1 + c * x; } while (v <= 0);
    v = v * v * v;
    const u = rnd();
    if (u < 1 - 0.0331 * x * x * x * x) return d * v;
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}
export function betaSample(a: number, b: number, rnd: () => number = Math.random): number {
  const x = gammaSample(a, rnd), y = gammaSample(b, rnd);
  return x / (x + y);
}
/** Each arm's chance of having the highest rate (Monte Carlo over the Beta posteriors). */
export function chanceBest(arms: [number, number][], draws = 3000, rnd: () => number = Math.random): number[] {
  if (!arms.length) return [];
  if (arms.length === 1) return [1];
  const wins = arms.map(() => 0);
  for (let i = 0; i < draws; i++) {
    let best = -1, bi = 0;
    arms.forEach(([a, b], j) => { const x = betaSample(a, b, rnd); if (x > best) { best = x; bi = j; } });
    wins[bi]! += 1;
  }
  return wins.map((w) => w / draws);
}

/**
 * 10-06: a version with little data of its own starts at its slot's pooled rate, not at 50%. Beta(1, 1) sat a brand-new
 * version at 50% against incumbents at 5%, so it won nearly every draw until its own "not paid" results arrived; the
 * prior is now worth POOL_PRIOR showings at the slot's rate over all its versions (Laplace-smoothed), so a new one gets
 * about half the draws against an equal incumbent and less as it falls behind.
 */
const POOL_PRIOR = 20;
export interface Pool { paid: number; settled: number }
/** The slot's results over every version (the sampler's prior centre). */
export function poolOf(stats: Iterable<VariantStats>): Pool {
  let paid = 0, settled = 0;
  for (const s of stats) { paid += s.paid; settled += s.settled; }
  return { paid, settled };
}
/** A version's overall posterior: its results on top of the pooled prior (without a pool: the plain Beta(1+paid, 1+not)). */
export function basePosterior(s: VariantStats | undefined, pool?: Pool): [number, number] {
  const paid = s?.paid ?? 0, not = Math.max(0, (s?.settled ?? 0) - paid);
  if (!pool) return [1 + paid, 1 + not];
  const m = (1 + pool.paid) / (2 + pool.settled);
  return [paid + POOL_PRIOR * m, not + POOL_PRIOR * (1 - m)];
}
/**
 * The Beta posterior of a version on one kind of question (10-03 按组挑版本): its own results there, on top of a prior
 * worth SEGMENT_PRIOR showings at the version's overall rate — a kind with little data follows the overall numbers, a
 * kind with plenty follows its own.
 */
export function topicPosterior(s: VariantStats | undefined, topic: string | null | undefined, pool?: Pool): [number, number] {
  return cellPosterior(s, topic ? s?.byTopic[topic] : undefined, !!topic, pool);
}
/** 10-05: the same, on the casts where the line last seen leaned this way. */
export function leanPosterior(s: VariantStats | undefined, lean: string | null | undefined, pool?: Pool): [number, number] {
  return cellPosterior(s, lean ? s?.byLean[lean] : undefined, !!lean, pool);
}
function cellPosterior(s: VariantStats | undefined, cell: TopicStats | undefined, segmented: boolean, pool?: Pool): [number, number] {
  const [a, b] = basePosterior(s, pool);
  if (!segmented) return [a, b];
  const mean = a / (a + b);
  const t = cell ?? { shown: 0, settled: 0, paid: 0 };
  return [1 + t.paid + SEGMENT_PRIOR * mean, 1 + Math.max(0, t.settled - t.paid) + SEGMENT_PRIOR * (1 - mean)];
}
/** A version's posterior for one cast: on a cast after a line that leaned against the reader, its results on such casts; else by the kind of question. */
export function posteriorFor(s: VariantStats | undefined, ctx: { topic?: string | null; lean?: string | null }, pool?: Pool): [number, number] {
  return leanSegment(ctx.lean) ? leanPosterior(s, ctx.lean, pool) : topicPosterior(s, ctx.topic ?? null, pool);
}

/**
 * One variant for this slot and language: Thompson sampling over the live ones (or the first seed, with learning off).
 * With a topic, versions meant for another kind of question are left out, and each version is judged by its results on
 * this kind of question (topicPosterior). 10-05: with a lean the line last seen had, versions meant for that lean join
 * the draw, and on a "bad" lean every version is judged by its results after such lines (leanPosterior).
 */
export function pickVariant(
  slot: Slot, locale: Locale, now = Date.now(), rnd: () => number = Math.random,
  ctx: { topic?: string | null; lean?: string | null; exclude?: ReadonlySet<string>; personal?: boolean } = {},
): Variant | null {
  const key = slot === "style" ? "*" : locale;
  const seg = topicSegment(ctx.topic);
  const lseg = leanSegment(ctx.lean);
  // 10-04: the written-per-reader version speaks every language; it is left out with NUDGE_PERSONAL=off or when the caller says so
  const usable = (v: Variant) => v.status === "active" && (!v.segment || v.segment === seg || v.segment === lseg)
    && (isPersonal(v) ? slot !== "style" && personalOn() && ctx.personal !== false : !!v.texts[key]);
  const all = variants(slot).filter(usable);
  // 10-04: versions this person already saw (and did not buy after) are left out — while anything else is left to show
  const keep = ctx.exclude?.size ? all.filter((v) => isPersonal(v) || !ctx.exclude!.has(v.id)) : all;
  const live = keep.length ? keep : all;
  if (!live.length) return null;
  if (!learnOn()) return live.find((v) => v.source === "seed") ?? live.find((v) => !isPersonal(v)) ?? null;
  const stats = variantStats(slot, now);
  const pool = poolOf(stats.values());
  let best: Variant | null = null, bestX = -1;
  for (const v of live) {
    const [a, b] = posteriorFor(stats.get(v.id), ctx, pool);
    const x = betaSample(a, b, rnd);
    if (x > bestX) { bestX = x; best = v; }
  }
  return best;
}

/* ---------------- what the page gets ---------------- */

const SPAN: Record<Locale, (d: number) => string> = {
  "zh-hant": (d) => (d <= 1 ? "今天" : d === 2 ? "這兩天" : `這 ${d} 天`),
  zh: (d) => (d <= 1 ? "今天" : d === 2 ? "这两天" : `这 ${d} 天`),
  en: (d) => (d <= 1 ? "today" : d === 2 ? "in two days" : `in ${d} days`),
  ja: (d) => (d <= 1 ? "今日" : d === 2 ? "この2日で" : `この${d}日で`),
  ko: (d) => (d <= 1 ? "오늘" : d === 2 ? "이틀 사이" : `${d}일 사이`),
  fr: (d) => (d <= 1 ? "aujourd'hui" : d === 2 ? "en deux jours" : `en ${d} jours`),
  de: (d) => (d <= 1 ? "heute" : d === 2 ? "in zwei Tagen" : `in ${d} Tagen`),
  es: (d) => (d <= 1 ? "hoy" : d === 2 ? "en dos días" : `en ${d} días`),
  pt: (d) => (d <= 1 ? "hoje" : d === 2 ? "em dois dias" : `em ${d} dias`),
};

/** {n} {k} {span} {deep} filled; {price} {month} {pass} stay for the page, which knows the buyer's currency and first price. */
export function fillNudge(t: NudgeText, vars: { n: number; span: number }, locale: Locale): NudgeText {
  const f = (s: string) => {
    const out = s.replace(/\{n\}/g, String(vars.n)).replace(/\{k\}/g, String(Math.max(1, vars.n - 1))).replace(/\{span\}/g, SPAN[locale](vars.span)).replace(/\{deep\}/g, String(DEEP_PER_MONTH));
    // a sentence that opens with a Latin {span} ("today, …") starts with a capital
    return LOCALE_META[locale].cjk ? out : out.charAt(0).toUpperCase() + out.slice(1);
  };
  return { title: f(t.title), body: f(t.body), cta: f(t.cta) };
}

/** What the page shows: the words, and where the button goes (10-06: "member" = the membership page, else the full reading). */
export interface NudgeForPage { id: string; title: string; body: string; cta: string; goal: "deep" | "member" }

/** How long the page may wait for a block written for the reader before it gets a ready one instead. */
export const PERSONAL_BUDGET_MS = 7_000;
/** 11-06: the first cast's block is written alongside its free line — the page should not wait much past the line */
export const PERSONAL_BUDGET_N1_MS = 5_000;
/** 11-06: how long the written block waits for this cast's free line before it is written without it */
export const LINE_WAIT_MS = 9_000;
/** 11-06: the button on the 4th+ cast buys the 1 日通卡 when the 通卡 model is live (lib/subscription.ts tongkaLive) */
const passButton = (): boolean => process.env.TONGKA_MODEL === "off" ? false : process.env.TONGKA_MODEL === "on" ? true : featureState("tongka") !== "off";
const PASS_FACTS = "The button on this cast buys a one-day pass: for a full day, this matter read together in one full reading with follow-up questions under it, and every further cast in that day read in full too — other matters as well. For a reader who keeps coming back to one matter this is the strongest reason: say it in the body in one clause (e.g. 今天之內再問、追問都看得到完整解讀，不用一卦一卦付) and let the button name it (e.g. 今天一次問清楚). Never 'unlimited forever', never a second price.";
const NUDGE_INFLIGHT = new Map<number, Promise<NudgeForPage | null>>();

/**
 * The block for a thread cast (n ≥ 2), picked once per cast and remembered on its log row; null for the first cast.
 * 10-04: when the draw lands on the written-per-reader version, the block is written for this reader (personalBlock) —
 * if that fails its checks or takes longer than the budget, a ready version is shown instead and counted instead.
 * A second request for the same cast (a double effect, a refresh) gets the same block.
 */
/**
 * 11-06: `line` — this cast's free line as it is being written. The block written for the reader waits for it (up to
 * LINE_WAIT_MS) and builds on it; the page already waits after the line for its other parts, so this costs about nothing.
 */
export interface NudgeOpts { budgetMs?: number; line?: Promise<string | null> }
export function nudgeFor(info: ThreadInfo, locale: Locale, now = Date.now(), opts: NudgeOpts = {}): Promise<NudgeForPage | null> {
  const running = NUDGE_INFLIGHT.get(info.logId);
  if (running) return running;
  const p = nudgeForNow(info, locale, now, opts).finally(() => NUDGE_INFLIGHT.delete(info.logId));
  NUDGE_INFLIGHT.set(info.logId, p);
  return p;
}

/**
 * 10-12 第 4 卦起 10% 对照 (Neil: 「做 1–4」; 10-12 复查 B③): n4-member read 1.1% per showing against the 2.0% the 4th+
 * cast had before 10-06, but 5.0% per person — so it stays, and one browser in ten (by a hash of its id, the same answer
 * every time) sees the old full-reading block n4-merge instead, retired or not. Both sit in the n4 numbers on
 * /admin/nudges; the comparison is per person. NUDGE_N4_CONTROL=off ends it.
 */
export const N4_CONTROL_ID = "n4-merge";
export const N4_TEST_ARM = "n4-pass";
export const N4_CONTROL_SHARE = 0.1;
export function inN4Control(bid: string | null | undefined): boolean {
  if (!bid || (process.env.NUDGE_N4_CONTROL ?? "on") === "off") return false;
  const h = createHash("sha256").update(`n4ctl:${bid}`).digest();
  return h.readUInt16BE(0) / 65536 < N4_CONTROL_SHARE;
}

async function nudgeForNow(info: ThreadInfo, locale: Locale, now: number, opts: NudgeOpts): Promise<NudgeForPage | null> {
  const slot = slotFor(info.n);
  if (!slot) return null;
  const page = (v: Variant, t: NudgeText): NudgeForPage => ({ id: v.id, goal: variantGoal(v), ...fillNudge(t, { n: info.n, span: spanDays(info, now) }, locale) });
  // 11-06: written for this reader by default (a special-category matter gets ready words only)
  const byAi = inPersonalDefault(info.row.bid) && !info.row.sensitive;
  if (byAi) return personalFirst(info, slot, locale, now, opts, page);
  // 10-13 同一件事反复问 (lib/repeat-test.ts ①): while that test runs it decides the 4th+ block for everyone — half get the
  // reading of all the casts together (n4-merge), half the other arm; the 10% control above is paused. 11-05 进度表 141:
  // the other arm was the membership (n4-member, 1.2% against n4-merge's 1.7%) — now the 1 日通卡 (n4-pass)
  if (slot === "n4" && repeatTestOn()) {
    const c = variantById(inRepeatArm(info.row.bid) ? N4_CONTROL_ID : N4_TEST_ARM);
    if (c && c.texts[locale]) return page(c, c.texts[locale]!);
  }
  if (slot === "n4" && inN4Control(info.row.bid)) {
    const c = variantById(N4_CONTROL_ID);
    if (c && c.texts[locale]) return page(c, c.texts[locale]!);
  }
  // already picked for this cast: the same words again
  const row = logRow(info.logId) ?? info.row;
  const known = row.nudge ? variantById(row.nudge) : null;
  if (known && known.status !== "retired") {
    if (isPersonal(known)) { const saved = savedPersonal(row, locale); if (saved) return page(known, saved); }
    else if (known.texts[locale]) return page(known, known.texts[locale]!);
  }
  const seen = seenBefore(info, locale, now);
  // 10-05 不顺卦话术: the lean of the line this reader saw last on the matter decides whether the versions for a line that
  // leaned against them join the draw — and it is written on the row, so the learner can judge every version on such casts
  const lean = leanSeen(info);
  if (leanSegment(lean)) setLogNudgeLean(info.logId, lean);
  // a special-category matter gets ready words only: nothing of it is written into a block
  // 11-06: with the written block the default (personalShare > 0), the browsers left here are the control — ready words
  // only; with the share at 0 the written version is one arm of the draw again, as before
  const ctx = { topic: row.topic, lean, exclude: seen.ids, personal: !row.sensitive && personalShare() === 0 && slot !== "n1" };
  const v = pickVariant(slot, locale, now, Math.random, ctx);
  if (!v) return null;
  if (!isPersonal(v)) return page(v, v.texts[locale]!);
  const t = await Promise.race([
    personalBlock(info, slot, locale, seen.texts, now),
    new Promise<null>((r) => setTimeout(() => r(null), opts.budgetMs ?? PERSONAL_BUDGET_MS)),
  ]);
  if (t) return page(v, t);
  const alt = pickVariant(slot, locale, now, Math.random, { ...ctx, personal: false });
  return alt && alt.texts[locale] ? page(alt, alt.texts[locale]!) : null;
}

/**
 * 11-06: the block written for this reader — the cast's own if it was already written, else a new one; a ready version
 * (drawn as before, the written arm left out) when the writing fails its checks or is not back within the budget.
 */
async function personalFirst(
  info: ThreadInfo, slot: Exclude<Slot, "style">, locale: Locale, now: number, opts: NudgeOpts,
  page: (v: Variant, t: NudgeText) => NudgeForPage,
): Promise<NudgeForPage | null> {
  const row = logRow(info.logId) ?? info.row;
  const arm = variantById(`${slot}-personal`);
  const known = row.nudge ? variantById(row.nudge) : null;
  if (known && known.status !== "retired") {
    if (isPersonal(known)) { const saved = savedPersonal(row, locale); if (saved) return page(known, saved); }
    else if (known.texts[locale]) return page(known, known.texts[locale]!);
  }
  const seen = seenBefore(info, locale, now);
  const lean = leanSeen(info);
  if (leanSegment(lean)) setLogNudgeLean(info.logId, lean);
  if (arm && arm.status === "active") {
    const t = await Promise.race([
      personalBlock(info, slot, locale, seen.texts, now, opts.line),
      // the first cast's block arrives with its free line: a shorter wait there; waiting for the line adds its time
      new Promise<null>((r) => setTimeout(() => r(null), opts.budgetMs ?? (opts.line ? LINE_WAIT_MS : 0) + (slot === "n1" ? PERSONAL_BUDGET_N1_MS : PERSONAL_BUDGET_MS))),
    ]);
    if (t) return page(arm, t);
  }
  const alt = pickVariant(slot, locale, now, Math.random, { topic: row.topic, lean, exclude: seen.ids, personal: false });
  return alt && alt.texts[locale] ? page(alt, alt.texts[locale]!) : null;
}

/* ---------------- 10-04 按人写的引导 ---------------- */

/** The block written for this cast, if it was written in this language. */
export function savedPersonal(row: Pick<LogRow, "nudge_text">, locale: Locale): NudgeText | null {
  try {
    const j = row.nudge_text ? (JSON.parse(row.nudge_text) as Partial<NudgeText> & { locale?: string }) : null;
    return j && j.locale === locale && j.title && j.body && j.cta ? { title: j.title, body: j.body, cta: j.cta } : null;
  } catch {
    return null;
  }
}

/**
 * The blocks this person already saw (every browser of theirs, the last 30 days, not this cast): the ready versions
 * among them are left out of the next draw, and the words of all of them go to the writer as angles not to repeat.
 */
export function seenBefore(info: ThreadInfo, locale: Locale, now = Date.now()): { ids: Set<string>; texts: NudgeText[] } {
  const ids = new Set<string>();
  const texts: NudgeText[] = [];
  try {
    const bids = personBids(info.row.bid);
    const rows = db().prepare(
      `SELECT nudge, nudge_text FROM cast_log WHERE bid IN (${bids.map(() => "?").join(",")}) AND nudge_seen = 1 AND id <> ? AND created_at >= ? ORDER BY at DESC LIMIT 12`,
    ).all(...bids, info.logId, now - 30 * 86_400_000) as { nudge: string; nudge_text: string | null }[];
    for (const r of rows) {
      const v = variantById(r.nudge);
      if (!v) continue;
      if (isPersonal(v)) { const t = savedPersonal(r, locale); if (t && texts.length < 4) texts.push(t); continue; }
      ids.add(v.id);
      const t = v.texts[locale] ?? v.texts["zh-hant"];
      if (t && texts.length < 4 && !texts.some((x) => x.title === t.title)) texts.push(t);
    }
  } catch { /* nothing seen is the safe answer */ }
  return { ids, texts };
}

export function personalSystem(slot: Exclude<Slot, "style">, locale: Locale): string {
  const cjk = LOCALE_META[locale].cjk;
  // 11-06: the first cast — no earlier casts; the block takes up the open question in THEIR matter
  if (slot === "n1") return [
    "You write the short block an I Ching reading site shows right before the price, for ONE reader, on their FIRST cast about a matter: a title, one or two sentences, and the words on the button.",
    "You are given what they asked and the figure, and — when it was ready in time — this cast's free line (this_cast.free_line): the one sentence shown right above your block, which only says which way it leans.",
    "When you have the free line, build on it: take up the question it leaves open (if it says he cares but keeps it inside, the open question is whether he will show it, when, and what the reader can do). Never copy it, never contradict it, never add a verdict beyond it. Without it, write from their question alone.",
    "Write to THIS reader about THEIR matter: name it in a few of their own words (who / what), and name the open questions in it that the full reading answers for them — for a question about whether someone cares: whether they will make a move, which days to watch, what to do first; for a job or exam: which way it turns, when, what to prepare; for a choice: which way leans better, what to watch out for. Make the reader feel: that is exactly what I want to know.",
    "What the full reading gives (the only promises you may make): the call on this question, timing windows with dates, what to do, what to avoid, two signs to watch, and follow-up questions under the reading; when those dates come we write to ask how it went.",
    "HARD RULES:",
    "- Never predict, hint at or bend how it will turn out; never say what the full reading will conclude; never say what the other person feels, thinks or will do. Ask the questions, do not answer them.",
    "- Never copy, contradict or go beyond the free line; when it is not given, never guess it.",
    "- No figure names, line names or other chart vocabulary. Never quote their question in full.",
    "- Calm and kind, like a friend who reads charts. No urgency or scarcity, no discount (only the price shown), no guarantee or accuracy claim, no fear, misfortune or regret, no health words, no statistics or claims about other people.",
    "- No digits at all. {price} = the price, exactly once, on the button, at the end as ' · {price}'.",
    `- Lengths: ${cjk ? "title ≤ 18 characters, body 30–80 characters, button ≤ 16 characters before ' · {price}'" : "title ≤ 8 words, body 20–45 words, button ≤ 6 words before ' · {price}'"}.`,
    `- Language: ${LOCALE_META[locale].english}.${locale === "zh-hant" ? " Taiwan usage, Traditional characters only (深斷, 卦, 應期, 追問)." : ""}`,
    'Output JSON only: {"title":"…","body":"…","cta":"… · {price}"}',
  ].join("\n");
  return [
    `You write the short block an I Ching reading site shows right before the price, for ONE reader, on their ${STAGE_EN[slot]} cast about the same matter: a title, one or two sentences, and the words on the button.`,
    "You are given what this reader asked across their casts on this matter, the figure of each, the free line each showed (one sentence that only says which way that cast leans) and how it leaned, the casts the day's limit left without a free line, and the blocks they already saw.",
    "Write to THIS reader: name their matter in a few of their own words, and say why reading their casts together in the full reading answers what they keep coming back to — for example that their lines so far leaned the same way, or turned.",
    "A cast came without a free line ONLY where the facts say the day's limit was reached; this cast shows its free line right above your block unless the facts say otherwise — never say it has none.",
    "When this_cast.free_line is given (11-06), set it against the earlier lines: has the lean held or turned, and what question does it leave open now? Never copy it or go beyond it.",
    ...(slot === "n4" && passButton() ? [PASS_FACTS] : []),
    "What the full reading gives (the only promises you may make): it reads this cast together with their earlier casts on the matter and gives the call, timing windows with dates, what to do, what to avoid, two signs to watch, and follow-up questions under the reading; with it they can ask follow-ups instead of casting again.",
    "HARD RULES:",
    "- State only what the facts show for this reader. Never predict, hint at or bend how it will turn out; never say what the full reading will conclude; never say what the other person feels, thinks or will do.",
    "- No figure names, line names or other chart vocabulary. Never quote their question in full or quote a free line.",
    "- Calm and kind, like a friend who reads charts. Never shame them for asking again, never call them anxious, never mention how often they came, what they tapped, or that anything is kept.",
    "- No urgency or scarcity, no discount (only the price shown), no guarantee or accuracy claim, no fear, misfortune or regret, no health words, no statistics or claims about other people.",
    "- No digits at all. Use the placeholders: {n} = this cast's number on the matter, {span} = how long they have been asking, {price} = the price (exactly once, on the button, at the end as ' · {price}').",
    `- Lengths: ${cjk ? "title ≤ 18 characters, body 30–80 characters, button ≤ 16 characters before ' · {price}'" : "title ≤ 8 words, body 20–45 words, button ≤ 6 words before ' · {price}'"}.`,
    `- Language: ${LOCALE_META[locale].english}.${locale === "zh-hant" ? " Taiwan usage, Traditional characters only (深斷, 卦, 應期, 追問)." : ""}`,
    "- Take an angle different from the blocks they already saw.",
    'Output JSON only: {"title":"…","body":"…","cta":"… · {price}"}',
  ].join("\n");
}

export function personalClaimSystem(slot: Exclude<Slot, "style">): string {
  if (slot === "n1") return [
    "You check a short block an I Ching reading site will show to ONE reader right before the price, on their FIRST cast about a matter. FACTS: what they asked, and this cast's free line (which way it leans) when given — it is shown right above the block.",
    "Flag any statement that predicts or hints at how their matter will turn out beyond what the free line already says, or what the full reading will conclude; that contradicts the free line or invents one not given; that says what someone feels, thinks or will do beyond the free line; or that promises something the full reading does not give.",
    "What the full reading gives: the call on this question, timing windows with dates, what to do, what to avoid, two signs to watch, and follow-up questions under the reading; when those dates come the site writes to ask how it went.",
    "Fine: naming their matter in their own words, taking up the question the free line leaves open, framing and invitations, and the QUESTIONS the reading takes up (\"whether he will make a move\", \"which days to watch\", \"what to do first\").",
    'Answer JSON only: {"ok":true} or {"ok":false,"why":"<the statement> — <why it may be false> (Simplified Chinese, short)"}',
  ].join("\n");
  return [
    `You check a short block an I Ching reading site will show to ONE reader right before the price, on their ${STAGE_EN[slot]} cast about the same matter. FACTS: their casts so far — what they asked, the free line each showed and how it leaned, the casts with no free line.`,
    "Flag any statement that is false for this reader given the facts; that predicts or hints at how their matter will turn out, or what the full reading will conclude; that says what someone feels, thinks or will do; or that promises something the full reading does not give.",
    "What the full reading gives: it reads this cast together with their earlier casts on the matter and gives the call, timing windows with dates, what to do, what to avoid, two signs to watch, and follow-up questions under the reading; with it they can ask follow-ups instead of casting again. The free line gives only which way one cast leans.",
    "A cast came without a free line ONLY where the facts say the day's limit was reached; otherwise it showed one (this cast's is right above the block) — saying it had none is false.",
    ...(slot === "n4" && passButton() ? [PASS_FACTS] : []),
    "Fine: naming their matter in their own words, saying how their free lines leaned so far or that a cast came without one when the facts show it, framing and invitations, and the QUESTIONS the reading takes up (\"whether he will reach out\", \"which days to watch\").",
    'Answer JSON only: {"ok":true} or {"ok":false,"why":"<the statement> — <why it may be false> (Simplified Chinese, short)"}',
  ].join("\n");
}

const PERSONAL_INFLIGHT = new Map<number, Promise<NudgeText | null>>();
const PERSONAL_MS = 6_000;

/** Words of the reader's own the block may not repeat whole: a question, a figure's name. */
function quotesTooMuch(t: NudgeText, facts: PersonalFacts): string | null {
  const text = `${t.title} ${t.body} ${t.cta}`;
  // 11-06: built on the free line, never copying it (eight characters running is a copy)
  const fl = (facts.this_cast.free_line ?? "").replace(/[\s，。、！？,.!?：:；;「」"']/g, "");
  const flat = text.replace(/[\s，。、！？,.!?：:；;「」"']/g, "");
  for (let i = 0; i + 8 <= fl.length; i++) if (flat.includes(fl.slice(i, i + 8))) return "copies the free line";
  for (const c of [...facts.earlier_casts, facts.this_cast]) {
    if (c.question.length >= 10 && !c.question.startsWith("(") && text.includes(c.question.replace(/…$/, ""))) return "quotes the question";
    for (const name of c.figure.split(" → ")) if (name.trim().length >= 2 && text.includes(name.trim())) return `names the figure ${name.trim()}`;
  }
  return null;
}

/**
 * Write the block for this reader: their matter so far and the blocks they saw go to the model; what comes back goes
 * through the same guards as every version, a check that it does not quote them or name a figure, and a claim check
 * against their own facts. Kept on the cast's log row when it passes; null when anything fails (the caller shows a ready
 * version). One writing per cast at a time.
 */
export function personalBlock(info: ThreadInfo, slot: Exclude<Slot, "style">, locale: Locale, seen: NudgeText[] = [], now = Date.now(), line?: Promise<string | null>): Promise<NudgeText | null> {
  const running = PERSONAL_INFLIGHT.get(info.logId);
  if (running) return running;
  const p = (async (): Promise<NudgeText | null> => {
    // 11-06: this cast's free line, when it is ready in time — the block builds on it
    const lineText = line ? await Promise.race([line, new Promise<null>((r) => setTimeout(() => r(null), LINE_WAIT_MS))]).catch(() => null) : null;
    const facts = personalFacts(info, locale, now);
    if (lineText) facts.this_cast = { ...facts.this_cast, free_line: lineText.slice(0, 160), free_line_leaned: "shown right above this block (its lean not judged yet — read it from the words)" };
    const messages: { role: "system" | "user" | "assistant"; content: string }[] = [
      { role: "system", content: personalSystem(slot, locale) },
      { role: "user", content: JSON.stringify({ ...facts, blocks_already_seen: seen.map((x) => `${x.title} — ${x.body}`) }) },
    ];
    let t: NudgeText | null = null;
    // 11-06: one rewrite when the guards refuse it (most often a body a few characters too long), then give way
    for (let attempt = 0; attempt < 2 && !t; attempt++) {
      let c: NudgeText;
      let raw: string;
      try {
        raw = await chatJson(messages, { maxTokens: 360, temperature: attempt ? 0.4 : 0.7, timeoutMs: PERSONAL_MS });
        const j = JSON.parse(raw) as Partial<NudgeText>;
        c = { title: String(j.title ?? "").trim(), body: String(j.body ?? "").trim(), cta: String(j.cta ?? "").trim() };
      } catch (e) {
        recordOps("nudge_personal", `${info.logId} write failed: ${(e instanceof Error ? e.message : "?").slice(0, 80)}`);
        return null;
      }
      if (locale === "zh-hant") c = ensureHant(c as unknown as Record<string, string>).fixed as unknown as NudgeText;
      if (c.cta && !/\{price\}/.test(c.cta)) c.cta = `${c.cta} · {price}`;
      const why = [...nudgeOffenses(c, locale), ...[quotesTooMuch(c, facts)].filter((x): x is string => !!x)];
      if (!why.length) { t = c; break; }
      recordOps("nudge_personal", `${info.logId} guard${attempt ? " (2nd)" : ""}: ${why.join("/").slice(0, 120)}`);
      if (attempt) return null;
      messages.push({ role: "assistant", content: raw }, { role: "user", content: `REWRITE: ${why.join("; ")}. Keep the same idea, fix only that, same language. Output the JSON again.` });
    }
    if (!t) return null;
    let claim: string | null;
    try {
      const raw = await chatJson([
        { role: "system", content: personalClaimSystem(slot) },
        { role: "user", content: JSON.stringify({ facts, block: { title: t.title, body: t.body, button: t.cta } }) },
      ], { maxTokens: 200, temperature: 0, timeoutMs: 4_000, light: true });
      const j = JSON.parse(raw) as { ok?: unknown; why?: unknown };
      claim = j.ok === true ? null : `说法核对：${toHans(String(j.why ?? "可能不成立")).slice(0, 140)}`;
    } catch {
      claim = CLAIM_UNREAD;
    }
    if (claim) { recordOps("nudge_personal", `${info.logId} ${claim}`.slice(0, 200)); return null; }
    try { db().prepare("UPDATE cast_log SET nudge_text = ? WHERE id = ?").run(JSON.stringify({ locale, ...t }), info.logId); } catch { /* shown anyway */ }
    recordOps("nudge_personal", `${info.logId} ok ${slot}`);
    return t;
  })().finally(() => PERSONAL_INFLIGHT.delete(info.logId));
  PERSONAL_INFLIGHT.set(info.logId, p);
  return p;
}

/** For the dashboard: the latest blocks the written-per-reader version wrote (and showed) in a slot. */
export function recentPersonal(id: string, limit = 3): { at: number; locale: string; text: NudgeText; seen: boolean }[] {
  const rows = db().prepare("SELECT created_at AS at, nudge_text, nudge_seen FROM cast_log WHERE nudge = ? AND nudge_text IS NOT NULL ORDER BY created_at DESC LIMIT ?")
    .all(id, limit) as { at: number; nudge_text: string; nudge_seen: number | null }[];
  return rows.flatMap((r) => {
    try {
      const j = JSON.parse(r.nudge_text) as NudgeText & { locale: string };
      return [{ at: r.at, locale: j.locale, text: { title: j.title, body: j.body, cta: j.cta }, seen: r.nudge_seen === 1 }];
    } catch { return []; }
  });
}

/** The style the 2nd+ free line is written in (the model's instruction), remembered per cast like the block. */
export function styleFor(info: ThreadInfo, now = Date.now()): { id: string; prompt: string } | null {
  if (info.n < 2) return null;
  const known = info.row.style ? variantById(info.row.style) : null;
  const v = known && known.texts["*"] ? known : pickVariant("style", "zh-hant", now, Math.random, { topic: info.row.topic });
  const p = v?.texts["*"]?.body;
  return v && p ? { id: v.id, prompt: p } : null;
}

/* ---------------- drafting ---------------- */

const SLOT_WHEN: Record<Exclude<Slot, "style">, string> = {
  n1: "the reader's FIRST cast about this matter (11-05: the free line is shown again, right above this block)",
  n2: "the reader's SECOND cast about the same matter",
  n3: "the reader's THIRD cast about the same matter",
  n4: "the reader's FOURTH or later cast about the same matter (from the fourth cast of a day on one topic the free line is no longer given — only this block; since 10-06 the live block there offers the membership, and any draft for this stage waits for the owner's yes)",
};

export function draftSystem(slot: Exclude<Slot, "style">, locale: Locale, count: number): string {
  return [
    `You write the short block an I Ching reading site shows right before the price, on ${SLOT_WHEN[slot]}. It has a title, one or two sentences, and the words on the button.`,
    "TRUE FACTS you may use (nothing else):",
    "- The free line the reader just saw (if any) gives only which way this one cast leans.",
    "- The full reading (深斷 / full reading), for the price shown as {price}, reads THIS cast together with their earlier casts on the same matter, and gives: the call, timing windows with dates, what to do, what to avoid, two signs to watch, and follow-up questions under the reading.",
    "- With the full reading they can ask follow-ups instead of casting again.",
    "HARD RULES:",
    "- Calm and honest, like a friend who reads charts. Never shame them for asking again; never call them anxious.",
    "- No urgency or scarcity, no discount (only the price shown), no guarantee or accuracy claim, no fear, misfortune or regret, no health words, no statistics or claims about other people.",
    "- No digits at all. Use the placeholders: {n} = this cast's number on the matter, {span} = how long they have been asking (e.g. 今天 / 這 3 天), {price} = the price (exactly once, on the button, at the end as ' · {price}').",
    `- Lengths: ${LOCALE_META[locale].cjk ? "title ≤ 18 characters, body 30–80 characters, button ≤ 16 characters before ' · {price}'" : "title ≤ 8 words, body 20–45 words, button ≤ 6 words before ' · {price}'"}.`,
    `- Language: ${LOCALE_META[locale].english}.${locale === "zh-hant" ? " Taiwan usage, Traditional characters only (深斷, 卦, 應期, 追問)." : ""}`,
    `Write ${count} NEW variants. Learn from the numbers: keep what the winners do, try a clearly different angle from the losers, and do not copy any existing variant.`,
    "The numbers are also broken down by the KIND of question (career, relationship, money, health, study, decision, other): how many people at this stage paid, per kind, and each variant's results per kind. If one kind clearly behaves differently, a variant may be written for that kind only — add \"for_topic\": \"<kind>\" (and you may speak to it, e.g. a relationship question is about another person). Otherwise leave for_topic out.",
    "They are also broken down by whether the free line the reader last saw LEANED AGAINST them (\"after_bad_line\"): such readers tend to cast again hoping for a better answer. A variant may be written for them only — add \"for_lean\": \"bad\" — and may say that a chart leaning against them is not a closed door and that the full reading says where it is stuck and when it loosens; never promise the answer will turn out well.",
    'Output JSON only: {"variants":[{"title":"…","body":"…","cta":"… · {price}","for_topic":"(optional) one kind","for_lean":"(optional) bad","idea":"one short line: what is different and why it may work"}]}',
  ].join("\n");
}

function styleDraftSystem(count: number): string {
  return [
    "An I Ching site shows a reader ONE free sentence after each cast. On their 2nd+ cast about the same matter, the sentence ties this chart to the earlier ones in one of several STYLES, each an instruction to the writing model.",
    "The sentence's own rules never change: one sentence, no timing, no advice, no chart vocabulary, never bend this chart, never count their casts.",
    `Propose ${count} NEW style instructions (English, one clause each, 40–200 characters, starting with a verb like "say" or "name") that might make the sentence more useful to the reader — learning from the numbers below (how often readers who saw each style paid within 72 hours).`,
    'Output JSON only: {"styles":[{"label":"two to four words","prompt":"…","idea":"why"}]}',
  ].join("\n");
}

const SLOT_STAGE: Record<Exclude<Slot, "style">, StageKey> = { n1: "1", n2: "2", n3: "3", n4: "4+" };

/** What the drafting model is shown: each version's words and numbers, overall and per kind of question — never a person or a question. */
function payloadFor(slot: Slot, locale: Locale, now: number): unknown {
  const stats = variantStats(slot, now, true);
  const key = slot === "style" ? "*" : locale;
  const since = now - STATS_DAYS * 86_400_000;
  const topics = segmentTable(since, "topic");
  const stage = slot === "style" ? null : SLOT_STAGE[slot];
  return {
    ...(stage ? {
      people_at_this_stage_by_kind: topics.values.map((v) => ({ kind: v.key, reached: topics.byStage[stage][v.key]!.reached, paid: topics.byStage[stage][v.key]!.paid })).filter((x) => x.reached > 0),
    } : {}),
    results_72h: variants(slot).filter((v) => v.texts[key]).map((v) => {
      const s = stats.get(v.id);
      const sg = segmentOf(v.segment);
      return {
        id: v.id, status: v.status, ...(sg ? { only_for: sg.kind === "lean" ? "readers whose last free line leaned against them" : sg.value } : {}),
        ...(slot === "style" ? { label: v.texts["*"]!.title, prompt: v.texts["*"]!.body } : v.texts[key]),
        shown: s?.shown ?? 0, settled: s?.settled ?? 0, paid: s?.paid ?? 0,
        rate: s?.rate === null || s?.rate === undefined ? null : Math.round(s.rate * 1000) / 10,
        chance_best: s?.pBest === null || s?.pBest === undefined ? null : Math.round(s.pBest * 100) / 100,
        by_kind: Object.fromEntries(Object.entries(s?.byTopic ?? {}).map(([k, t]) => [k, { settled: t.settled, paid: t.paid }])),
        ...(s?.byLean.bad ? { after_bad_line: { settled: s.byLean.bad.settled, paid: s.byLean.bad.paid } } : {}),
      };
    }),
    // 10-04: the version written for each reader from their own casts — its numbers, so ready words are judged against it
    ...(slot !== "style" ? (() => {
      const p = variants(slot).find(isPersonal);
      const s = p ? stats.get(p.id) : undefined;
      return p ? { written_per_reader: { id: p.id, status: p.status, shown: s?.shown ?? 0, settled: s?.settled ?? 0, paid: s?.paid ?? 0, rate: s?.rate == null ? null : Math.round(s.rate * 1000) / 10 } } : {};
    })() : {}),
  };
}

const newId = (slot: Slot, now: number) => `ai-${slot}-${new Date(now).toISOString().slice(2, 10).replace(/-/g, "")}-${randomBytes(2).toString("hex")}`;

export interface DraftResult { created: { id: string; status: Variant["status"] }[]; rejected: { text: unknown; why: string[] }[]; error?: string }

/** Ask the model for new variants for one slot (in one language), check them, and file them. */
export async function draftVariants(slot: Slot, locale: Locale = "zh-hant", opts: { count?: number; by?: string; now?: number } = {}): Promise<DraftResult> {
  const now = opts.now ?? Date.now();
  const count = Math.max(1, Math.min(4, opts.count ?? 2));
  const out: DraftResult = { created: [], rejected: [] };
  try {
    const raw = await chatJson([
      { role: "system", content: slot === "style" ? styleDraftSystem(count) : draftSystem(slot, locale, count) },
      { role: "user", content: JSON.stringify(payloadFor(slot, locale, now)) },
    ], { maxTokens: 900, temperature: 0.8, timeoutMs: 45_000 });
    const j = JSON.parse(raw) as { variants?: { title?: string; body?: string; cta?: string; idea?: string; for_topic?: string; for_lean?: string }[]; styles?: { label?: string; prompt?: string; idea?: string }[] };
    const best = [...variantStats(slot, now).values()].filter((s) => s.pBest !== null).sort((a, b) => (b.pBest ?? 0) - (a.pBest ?? 0))[0]?.id ?? null;
    const liveAi = variants(slot).filter((v) => v.status === "active" && v.source === "ai").length;
    // 10-17 全自动: an AI seat free in the slot → the draft goes live once it passes; no seat (or review mode) → it waits
    let room = aiMode() === "auto" ? Math.max(0, aiMax() - liveAi) : 0;
    if (slot === "style") {
      for (const s of (j.styles ?? []).slice(0, count)) {
        const prompt = String(s.prompt ?? "").trim();
        const why = styleOffenses(prompt);
        const copied = why.length ? null : nearCopyStyle(prompt);
        if (copied) why.push(copied);
        if (why.length) { out.rejected.push({ text: s, why }); continue; }
        if (aiMode() === "auto" && room <= 0) { out.rejected.push({ text: s, why: ["slot full"] }); continue; }
        const id = newId(slot, now);
        // a style changes what the reader is told, not just the words around the price: in review mode a person says yes first
        const status: Variant["status"] = room > 0 ? "active" : "draft";
        if (status === "active") room -= 1;
        insertAiVariant(id, slot, status, { "*": T(String(s.label ?? "").slice(0, 20) || "新风格", prompt, "") }, best, String(s.idea ?? ""), now, null, status === "active" ? "auto: passed the guards, slot had a seat" : undefined);
        out.created.push({ id, status });
      }
    } else {
      for (const v of (j.variants ?? []).slice(0, count)) {
        let t: NudgeText = { title: String(v.title ?? "").trim(), body: String(v.body ?? "").trim(), cta: String(v.cta ?? "").trim() };
        if (locale === "zh-hant") t = ensureHant(t as unknown as Record<string, string>).fixed as unknown as NudgeText;
        if (!/\{price\}/.test(t.cta) && t.cta) t.cta = `${t.cta} · {price}`;
        const why = nudgeOffenses(t, locale);
        const copied = why.length ? null : nearCopy(slot, locale, t);
        if (copied) why.push(copied);
        if (why.length) { out.rejected.push({ text: v, why }); continue; }
        const id = newId(slot, now);
        // 10-05: a version may be meant for one kind of question, or for readers whose last line leaned against them
        const seg = leanSegment(v.for_lean) ?? topicSegment(v.for_topic);
        // what the words claim, read as every reader at this stage will see them: a doubt keeps it waiting for a yes
        // 10-17 全自动: no parking — no free seat, a doubt, or a check that did not run drops the draft (logged), it does not wait
        if (aiMode() === "auto" && room <= 0) { out.rejected.push({ text: v, why: ["slot full"] }); continue; }
        const claim = await claimCheck(slot, t, seg ? seg.replace(/^topic:/, "") : null);
        if (aiMode() === "auto" && claim) { out.rejected.push({ text: v, why: [`说法核对：${claim}`] }); continue; }
        const status: Variant["status"] = room > 0 && !claim ? "active" : "draft";
        if (status === "active") room -= 1;
        insertAiVariant(id, slot, status, { [locale]: t }, best, String(v.idea ?? ""), now, seg, claim ? `waiting for a yes — ${claim}` : undefined, claim !== CLAIM_UNREAD);
        out.created.push({ id, status });
      }
    }
  } catch (e) {
    out.error = (e instanceof Error ? e.message : "?").slice(0, 160);
  }
  STATS.clear();
  logRun("draft", `${slot}/${locale} by=${opts.by ?? "?"} created=${out.created.map((c) => `${c.id}:${c.status}`).join(",") || "0"} rejected=${out.rejected.length}${out.rejected.length ? ` (${out.rejected.map((r) => r.why[0] ?? "?").join(" | ").slice(0, 300)})` : ""}${out.error ? ` error=${out.error}` : ""}`, now);
  recordOps("nudge_draft", `${slot} ${out.created.length}/${out.rejected.length}${out.error ? " err" : ""}`);
  return out;
}

/** File an AI-written version (drafting or the weekly review): the reason in its notes, live or waiting as decided. */
export function insertAiVariant(id: string, slot: Slot, status: Variant["status"], texts: VariantTexts, parent: string | null, idea: string, now: number, segment: string | null = null, why?: string, checked = false): void {
  db().prepare("INSERT INTO nudge_variants (id, slot, status, source, texts_json, parent, notes, created_at, updated_at, status_why, segment, checked_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)")
    .run(id, slot, status, "ai", JSON.stringify(texts), parent, idea.slice(0, 400), now, now,
      why ?? (status === "active" ? "auto: passed the guards, slot had room" : aiMode() === "review" ? "review mode: waiting for a yes" : slot === "style" ? "a style waits for a yes" : "slot full: waiting"), segment,
      checked ? now : null);
}

/** Add a variant by hand (dashboard): the same guards, live at once; `segment` keeps it to one kind of question ("career") or to readers whose last line leaned against them ("lean:bad"). */
export function addVariant(slot: Exclude<Slot, "style">, locale: Locale, t: NudgeText, now = Date.now(), segment: string | null = null): { id?: string; why: string[] } {
  const fixed = locale === "zh-hant" ? (ensureHant(t as unknown as Record<string, string>).fixed as unknown as NudgeText) : t;
  const why = nudgeOffenses(fixed, locale);
  if (why.length) return { why };
  const id = `admin-${slot}-${new Date(now).toISOString().slice(2, 10).replace(/-/g, "")}-${randomBytes(2).toString("hex")}`;
  const seg = segment?.startsWith("lean:") ? leanSegment(segment.slice(5)) : topicSegment(segment);
  db().prepare("INSERT INTO nudge_variants (id, slot, status, source, texts_json, created_at, updated_at, status_why, segment) VALUES (?,?,?,?,?,?,?,?,?)")
    .run(id, slot, "active", "admin", JSON.stringify({ [locale]: fixed }), now, now, "added on the dashboard", seg);
  logRun("add", `${id} ${locale}`, now);
  STATS.clear();
  return { id, why: [] };
}

/**
 * Clear losers out: a live variant with 80+ settled showings and under a 2% chance of being the best — a slot always keeps
 * two. 10-17 全自动: the seeds join (the owner can switch one back on). 11-06: the written-per-reader version is the
 * default for most browsers and is compared with the control browsers on the dashboard — never retired here.
 */
export function retireLosers(now = Date.now()): string[] {
  const gone: string[] = [];
  for (const slot of ALL_SLOTS) {
    const stats = variantStats(slot, now, true);
    const pool = poolOf(stats.values());
    const live = variants(slot).filter((v) => v.status === "active");
    let left = live.length;
    for (const v of live) {
      const s = stats.get(v.id);
      if (left <= 2 || !s) continue;
      // 11-06: the written-per-reader block is the default now, measured against the control browsers — not retired here
      if (v.source === "personal") continue;
      // a version meant for one kind of question (or for a line that leaned against the reader) is judged on those casts
      // only, against what those casts are shown
      let settled = s.settled, paid = s.paid, p = s.pBest;
      const sg = segmentOf(v.segment);
      if (sg) {
        const arms = live.filter((x) => !x.segment || x.segment === v.segment);
        const ctx = sg.kind === "lean" ? { lean: sg.value } : { topic: sg.value };
        p = chanceBest(arms.map((x) => posteriorFor(stats.get(x.id), ctx, pool)))[arms.indexOf(v)] ?? null;
        const cell = sg.kind === "lean" ? s.byLean[sg.value] : s.byTopic[sg.value];
        settled = cell?.settled ?? 0;
        paid = cell?.paid ?? 0;
      }
      if (settled < RETIRE_MIN || p === null || p >= RETIRE_P) continue;
      setVariantStatus(v.id, "retired", `auto: ${paid}/${settled} paid${v.segment ? ` (${v.segment})` : ""}, chance best ${(p * 100).toFixed(1)}%`, now);
      gone.push(v.id);
      left -= 1;
    }
  }
  return gone;
}

/** The cron's share (api/fulfill/run): daily purge, hourly retirements, weekly drafts once there is something to learn from. */
export async function runNudgeLearning(now = Date.now()): Promise<string> {
  const notes: string[] = [];
  ensureSeeds(now);
  if ((lastRun("purge") ?? 0) < now - 86_400_000) {
    const n = purgeCastLog(now);
    const scrubbed = scrubNet(now); // 10-31 进度表 130: addresses older than 180 days go, city and device stay
    logRun("purge", `cast_log rows=${n} net_scrub=${scrubbed}`, now);
    notes.push(`purge=${n}`);
  }
  if ((lastRun("retire_check") ?? 0) < now - 3_600_000) {
    const gone = retireLosers(now);
    logRun("retire_check", gone.join(",") || "none", now);
    if (gone.length) notes.push(`retired=${gone.join(",")}`);
  }
  if ((lastRun("claim_check") ?? 0) < now - 3_600_000) {
    const back = await recheckLive(now);
    logRun("claim_check", back.join(",") || "none", now);
    if (back.length) notes.push(`claims=${back.join(",")}`);
  }
  if (aiOn() && (lastRun("draft_week") ?? 0) < now - 7 * 86_400_000 && (lastRun("draft_wait") ?? 0) < now - 86_400_000) {
    const min = Number(process.env.NUDGE_DRAFT_MIN ?? 40) || 40;
    // 10-17 全自动: only a slot with an AI seat free gets a draft (and only one per seat) — the 4th+ block is fixed
    const seatFree = (s: Slot) => aiMode() === "review" || variants(s).filter((v) => v.status === "active" && v.source === "ai").length < aiMax();
    const slots = aiMode() === "auto" ? DRAFT_SLOTS : ALL_SLOTS;
    const ready = slots.filter((s) => [...variantStats(s, now, true).values()].reduce((a, x) => a + x.settled, 0) >= min);
    const open = ready.filter(seatFree);
    if (!ready.length) {
      logRun("draft_wait", `no slot has ${min} settled showings yet`, now);
    } else {
      // two candidates a slot: the first that passes takes the seat, the other is dropped as "slot full"
      for (const s of open) await draftVariants(s, "zh-hant", { by: "cron", now });
      logRun("draft_week", `${open.join(",") || "none"}${ready.length > open.length ? ` full=${ready.filter((s) => !open.includes(s)).join(",")}` : ""}`, now);
      if (open.length) notes.push(`drafted=${open.join(",")}`);
    }
  }
  return notes.join(" ");
}

/** For the dashboard: every locale a variant speaks. */
export const localesOf = (v: Variant): string[] => (v.texts["*"] ? ["*"] : LOCALES.filter((l) => v.texts[l]));
