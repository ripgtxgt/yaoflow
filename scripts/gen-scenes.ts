/**
 * 场景页 (总方案 §6 复利 / §14 ⑭) — 按场景简报让模型出稿，写入
 * apps/web/src/data/scenes.<locale>.json；人工审过才上线，线上不调模型。
 *
 * 每页：这类事六爻怎么看（用神与看点）、常见走向（三四种）、一个示意卦例、三问三答、去起卦（预填问题）。
 * 红线：不写 accuracy % / predicts your future / 当たる / 必ず / 神準；不做医疗法律投资建议；
 * 术语可以出现但必须当场解释；口径是"盘是算出来的，解读只是把盘讲清楚"。
 *
 * 跑法（服务器；从 apps/web 目录跑，"@/" 别名才能解析）：
 *   cd ~/yaoflow/apps/web && KEY=$(grep '^DEEPSEEK_API_KEY=' .env.local | cut -d= -f2-) \
 *     && DEEPSEEK_API_KEY=$KEY npx -y tsx ../../scripts/gen-scenes.ts en [--only=slug] [--force]
 * 示意卦例的盘面事实由引擎算出（transitions.ts，日期无关），模型只能复述，不能编。
 * 已生成的 slug 跳过；--force 重生成。
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { changeHeadline, changeSentence, kindSentence, movingLabel, transition } from "../apps/web/src/lib/transitions";
import { RELATION_EN } from "../apps/web/src/lib/labels";

const locale = process.argv[2];
const only = process.argv.find((a) => a.startsWith("--only="))?.slice(7);
const force = process.argv.includes("--force");
const KEY = process.env.DEEPSEEK_API_KEY;
if (!KEY) throw new Error("DEEPSEEK_API_KEY missing");

export interface Scene {
  slug: string; topic: string;
  title: string; h1: string; meta: string;
  intro: string[];
  how: { lead: string; points: string[] };
  patterns: { name: string; text: string }[];
  example: { values: string; question: string; text: string };
  faq: { q: string; a: string }[];
  ask: string;
  hexagrams: number[];
}

interface Brief { slug: string; topic: string; angle: string; focal: string; example: string; chart: { a: number; b: number }; hexagrams: number[]; keywords: string }

/** The reading rules per matter, from the engine's own 用神 conventions — the model explains, never invents. */
const FOCAL = {
  job: "The Officer line (官鬼) stands for the position itself and the employer's pull; the Parents line (父母) for the contract, the offer letter, the paperwork; the Wealth line (妻财) for the pay. The world line (世) is the asker, the response line (应) is the company. Officer strong and feeding the world line: the job wants you. Officer void or month-broken: the position is not what it looks like. Wealth strong: the money is real. A Sibling line moving: competition or a pay cut.",
  love: "A woman asking about a man reads the Officer line (官鬼) as him; a man asking about a woman reads the Wealth line (妻财) as her. The response line (应) is the other person in general. Response feeding or combining with the world line: the other side leans in. Response overcoming the world line: pressure, not warmth. A six-combination hexagram (六合): things bind; six-clash (六冲): things scatter. A line changing into the same branch (伏吟): going in circles; into its clashing branch (反吟): back and forth.",
  moving: "The Parents line (父母) is the home, the paperwork, the visa; the world line (世) is the asker; the Officer line (官鬼) is obstruction and officialdom; the Descendants line (子孙) is ease and safe passage. World strong and moving: you can move. World void: not decided yet. Parents strong: the new place holds. Officer moving to overcome the world line: red tape or trouble on the way.",
  business: "The Wealth line (妻财) is profit; the Descendants line (子孙) is the source of profit and the customers; the Officer line (官鬼) is the venture's pressure, competition and regulation; the Sibling line (兄弟) is expense and partners who take. World strong with Wealth strong: the ground is there. Sibling holding the world line: money goes out. Six-clash: hard to last. A moving line advancing (进神): momentum builds.",
  deal: "The response line (应) is the counterparty; the Parents line (父母) is the contract; the Wealth line (妻财) is the money on the table. World and response combining: it closes. Response void: the other side is not real about it. World and response clashing: no meeting point. Parents void: the paper is not ready.",
  exam: "The Parents line (父母) is the grade, the paper, the certificate; the Officer line (官鬼) is the school or the post; the world line (世) is the asker's state. Parents strong and in season: the result is good. Parents void or broken: not this time. World strong: you are ready. Officer feeding the world line: the institution wants you.",
  timing: "Timing in a Liu Yao chart comes from the moving lines and the branches: a void line fills on its own day, a combined line opens on the clashing day, an advancing line lands when its branch arrives. The reading names a window; the follow-up email asks how it went when the window has passed.",
};

const BRIEFS: Record<string, Brief[]> = {
  en: [
    { slug: "job-change", topic: "career", angle: "a job offer on the table, or changing jobs: take it, wait, or stay", focal: FOCAL.job, example: "a manager weighing a rival firm's offer; chart: 地天泰 with line 5 moving to 水天需 — the offer is real, the timing says wait until the paperwork settles", chart: { a: 11, b: 5 }, hexagrams: [11, 5, 46, 35], keywords: "I Ching job offer, hexagram for career change, should I take the job" },
    { slug: "get-back-together", topic: "relationship", angle: "after a breakup: is there a way back, and does the other person want it", focal: FOCAL.love, example: "someone asking whether an ex will come back; chart: 泽山咸 with line 3 moving to 泽地萃 — feelings are mutual, but the other side moves only after you stop pushing", chart: { a: 31, b: 45 }, hexagrams: [31, 24, 38, 45], keywords: "I Ching getting back together, will my ex come back, hexagram for reconciliation" },
    { slug: "new-love", topic: "relationship", angle: "a new relationship or an unspoken interest: is it going anywhere", focal: FOCAL.love, example: "someone who has been on three dates; chart: 风泽中孚 still — both sincere, slow, nothing pushing yet", chart: { a: 61, b: 61 }, hexagrams: [61, 31, 32, 53], keywords: "I Ching new relationship, does he like me hexagram, i ching love reading" },
    { slug: "moving", topic: "decision", angle: "moving abroad, relocating, or changing cities", focal: FOCAL.moving, example: "a couple deciding on a move to another country; chart: 火地晋 with line 4 moving to 山地剥 — the move opens, the paperwork drags", chart: { a: 35, b: 23 }, hexagrams: [35, 56, 53, 39], keywords: "I Ching moving abroad, hexagram for relocation, should I move" },
    { slug: "starting-a-business", topic: "money", angle: "starting a business or going independent: now, later, or not", focal: FOCAL.business, example: "a designer thinking of leaving to freelance; chart: 水风井 with line 2 moving to 水山蹇 — the skill is there, the customers are not yet", chart: { a: 48, b: 39 }, hexagrams: [48, 42, 3, 50], keywords: "I Ching starting a business, hexagram for entrepreneurship, should I start my business" },
    { slug: "negotiation-deal", topic: "money", angle: "a negotiation, a contract, a sale: will it close, and on whose terms", focal: FOCAL.deal, example: "a founder mid-negotiation with an investor; chart: 天火同人 with line 6 moving to 泽火革 — agreement in principle, terms rewritten at the last step", chart: { a: 13, b: 49 }, hexagrams: [13, 49, 6, 14], keywords: "I Ching negotiation, will the deal close, hexagram for contract" },
    { slug: "exam-or-interview", topic: "study", angle: "an exam, a certification, or an interview: pass or not, and what to do before it", focal: FOCAL.exam, example: "a student a week before a licensing exam; chart: 山水蒙 with line 5 moving to 风水涣 — prepared enough, nerves are the risk", chart: { a: 4, b: 59 }, hexagrams: [4, 35, 46, 26], keywords: "I Ching exam, will I pass hexagram, interview i ching reading" },
    { slug: "waiting-for-news", topic: "decision", angle: "waiting to hear back — an application, a reply, a decision from someone else — and when", focal: FOCAL.timing, example: "someone waiting on a visa decision; chart: 水天需 with line 4 moving to 兑为泽 — the answer comes, but on the other side's clock", chart: { a: 5, b: 58 }, hexagrams: [5, 61, 25, 64], keywords: "I Ching when will I hear back, hexagram for waiting, timing i ching" },
  ],
  ja: [
    { slug: "job-change", topic: "career", angle: "転職すべきか、今の会社に残るべきか、内定を受けるべきか", focal: FOCAL.job, example: "同業他社からの誘いに迷う管理職；卦：地天泰の五爻動→水天需——話は本物、ただし書類が整うまで動かない方がよいという時期の読み", chart: { a: 11, b: 5 }, hexagrams: [11, 5, 46, 35], keywords: "転職 易占, 転職 六爻, 内定 受けるべきか 占い" },
    { slug: "get-back-together", topic: "relationship", angle: "別れた相手と復縁できるか、相手はどう思っているか", focal: FOCAL.love, example: "元恋人が戻ってくるかを問う人；卦：沢山咸の三爻動→沢地萃——気持ちは通じているが、こちらが押すのをやめてから相手が動く", chart: { a: 31, b: 45 }, hexagrams: [31, 24, 38, 45], keywords: "復縁 易占, 復縁 六爻 占い, 元彼 戻ってくる" },
    { slug: "new-love", topic: "relationship", angle: "片思い、始まったばかりの恋、相手の気持ち", focal: FOCAL.love, example: "三回デートした相手との今後を問う人；卦：風沢中孚の静卦——お互い誠実、ゆっくり、まだ押す力がない", chart: { a: 61, b: 61 }, hexagrams: [61, 31, 32, 53], keywords: "片思い 易占, 恋愛 六爻, 相手の気持ち 占い" },
    { slug: "moving", topic: "decision", angle: "海外移住、転居、引っ越しの是非と時期", focal: FOCAL.moving, example: "海外への移住を決めかねている夫婦；卦：火地晋の四爻動→山地剥——道は開くが、手続きが長引く", chart: { a: 35, b: 23 }, hexagrams: [35, 56, 53, 39], keywords: "移住 易占, 引っ越し 占い 六爻, 海外 転居" },
  ],
  "zh-hant": [
    { slug: "job-change", topic: "career", angle: "要不要換工作、接不接這個 offer、留還是走", focal: FOCAL.job, example: "一位主管在衡量對手公司的邀約；卦：地天泰五爻動→水天需——機會是真的，但要等文書落定再動", chart: { a: 11, b: 5 }, hexagrams: [11, 5, 46, 35], keywords: "換工作 卜卦, 六爻 事業, 該不該接 offer 占卜" },
    { slug: "get-back-together", topic: "relationship", angle: "分手後還能不能復合，對方心裡怎麼想", focal: FOCAL.love, example: "問前任會不會回頭的人；卦：澤山咸三爻動→澤地萃——感情是相通的，但對方要等你不再推之後才會動", chart: { a: 31, b: 45 }, hexagrams: [31, 24, 38, 45], keywords: "復合 卜卦, 六爻 感情 復合, 前任 會不會回頭" },
    { slug: "new-love", topic: "relationship", angle: "曖昧、剛開始的戀情、對方的心意", focal: FOCAL.love, example: "約會三次後問未來的人；卦：風澤中孚靜卦——雙方都誠懇，節奏慢，還沒有什麼在推", chart: { a: 61, b: 61 }, hexagrams: [61, 31, 32, 53], keywords: "曖昧 卜卦, 對方心意 六爻, 新戀情 占卜" },
    { slug: "moving", topic: "decision", angle: "移民、搬家、換城市的去留與時機", focal: FOCAL.moving, example: "一對夫妻在決定要不要移民；卦：火地晉四爻動→山地剝——路是開的，手續會拖", chart: { a: 35, b: 23 }, hexagrams: [35, 56, 53, 39], keywords: "移民 卜卦, 搬家 六爻, 換城市 占卜" },
  ],
};

const LANG: Record<string, string> = {
  en: "Natural, native English. Address the reader as you. Warm, direct, specific.",
  ja: "自然な日本語、です・ます調。読者は「あなた」。専門用語は漢字のまま使ってよいが、必ず日常の言葉で言い換えを添える。",
  "zh-hant": "自然的繁體中文，台灣／香港慣用語，全文不得出現簡體字。稱讀者為「你」。術語可用，但每次出現都要用白話說明。",
};

const briefs = BRIEFS[locale ?? ""];
if (!briefs) throw new Error(`usage: tsx scripts/gen-scenes.ts <${Object.keys(BRIEFS).join("|")}>`);
const OUT = new URL(`../apps/web/src/data/scenes.${locale}.json`, import.meta.url).pathname;
const out: Record<string, Scene> = existsSync(OUT) ? (JSON.parse(readFileSync(OUT, "utf8")) as Record<string, Scene>) : {};

const SYSTEM = `You write reference pages for YaoFlow, a Liu Yao (六爻) I Ching site where the chart is computed deterministically — najia, six relations, world/response lines, calendar voids and clashes — and the AI only explains the chart. Each page is about ONE kind of matter people bring to a cast. It teaches how that matter is read, honestly and specifically.

HARD RULES:
- Never say or imply accuracy percentages, "predicts your future", guaranteed outcomes, 当たる, 必ず, 神準, or that a cast decides anything. The positioning is: the chart is fixed and reproducible; the reading explains it; the person decides.
- No medical, legal, or investment prescriptions. Nothing that shames or frightens.
- Every technical term you use (官鬼, 妻财, 世爻, 应爻, 旬空, 六冲, 伏吟 …) is explained in plain words the first time it appears in a section. Prefer the human meaning over the term.
- Only use the reading rules given in the brief. Do not invent rules, do not map elements to industries or colours.
- The example case is illustrative — write it as a worked example, not as a testimonial. Do not claim it happened to a real person.
- No filler sentences. Concrete nouns. No markdown.

OUTPUT LANGUAGE: ${LANG[locale!]}
OUTPUT — strict JSON, exactly this shape, every value a plain string (or array/number where shown):
{
 "title": "search-facing page title, ≤ 60 characters, includes the natural search phrase",
 "h1": "the page heading, a real sentence or question people would type, ≤ 70 characters",
 "meta": "meta description, 120–160 characters",
 "intro": ["paragraph 1: the situation as people actually live it (2–3 sentences)", "paragraph 2: what a Liu Yao cast can and cannot do for it (2–3 sentences)"],
 "how": { "lead": "one sentence: what the chart looks at for this matter", "points": ["4–5 points, each one thing the chart weighs, each 1–2 sentences, terms explained"] },
 "patterns": [ { "name": "short name of a common tendency", "text": "2–3 sentences: what that pattern in the chart means for this matter" } ] (exactly 4),
 "example": { "values": "six digits bottom-up using 6/7/8/9 as given in the brief's chart (6 = old yin, 7 = young yang, 8 = young yin, 9 = old yang)", "question": "the example question as the person would phrase it", "text": "2 short paragraphs joined by \\n\\n: how the chart is read for this question and what it says, in plain words" },
 "faq": [ { "q": "a question people ask about casting for this matter", "a": "2–3 sentences" } ] (exactly 3),
 "ask": "a ready-to-use question the reader can cast with, ≤ 60 characters, in the output language"
}`;

/** The example chart's date-free facts, computed — the model may restate them and nothing else. */
function chartFacts(b: Brief): { values: string; text: string } {
  const t = transition(b.chart.a, b.chart.b);
  if (!t) throw new Error(`bad chart ${b.chart.a}->${b.chart.b}`);
  const lines = t.lines.slice().reverse().map((l) =>
    `line ${l.position}: ${l.yang ? "yang" : "yin"}, ${RELATION_EN[l.relation]} (${l.branch} ${l.phase})${l.isWorld ? " — WORLD line (the asker)" : l.isResponse ? " — RESPONSE line (the other side)" : ""}${l.changing ? " — MOVING" : ""}`);
  const changes = t.changes.map((c) => `${changeHeadline(c)}: ${changeSentence(c)}`);
  const still = t.a.number === t.b.number;
  const text = [
    `primary hexagram: ${t.a.number} ${t.a.en} (${t.a.fullZh})${still ? " — no line moving (a still chart)" : ` → becomes ${t.b.number} ${t.b.en} (${t.b.fullZh}), ${movingLabel(t)} moving`}`,
    `palace: ${t.palace.palace} (${t.palace.palacePhase}); world line = line ${t.palace.world}; response line = line ${t.palace.response}`,
    ...lines,
    ...(changes.length ? ["moving line relations:", ...changes] : []),
    t.shape.primary === "liuhe" ? "the primary hexagram is a six-combination figure (六合)" : t.shape.primary === "liuchong" ? "the primary hexagram is a six-clash figure (六冲)" : "",
  ].filter(Boolean).join("\n");
  void kindSentence;
  return { values: t.code, text };
}

async function gen(b: Brief): Promise<Scene> {
  const facts = chartFacts(b);
  const user = `MATTER: ${b.angle}
TOPIC KEY: ${b.topic}
SEARCH PHRASES TO SERVE (use naturally, never stuff): ${b.keywords}
READING RULES FOR THIS MATTER (the only rules you may use):
${b.focal}
EXAMPLE CASE TO WRITE UP: ${b.example}
CHART FACTS OF THE EXAMPLE (computed by the engine; the example text may state ONLY these — which line is which relation, which line is the world/response line, which line moves and what it turns into. Never call a line a relation it is not):
${facts.text}
RELATED HEXAGRAMS (King Wen numbers, you may name them): ${b.hexagrams.join(", ")}`;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch("https://api.deepseek.com/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEY}` },
        body: JSON.stringify({
          model: "deepseek-chat", temperature: 0.6, max_tokens: 4200, response_format: { type: "json_object" },
          messages: [{ role: "system", content: SYSTEM }, { role: "user", content: user }],
        }),
      });
      if (!res.ok) throw new Error(`http ${res.status}`);
      const data = (await res.json()) as { choices: { message: { content: string } }[] };
      const s = JSON.parse(data.choices[0]!.message.content) as Omit<Scene, "slug" | "topic" | "hexagrams">;
      const missing = [
        !s.title && "title", !s.h1 && "h1", !s.meta && "meta",
        !(Array.isArray(s.intro) && s.intro.length >= 2) && "intro",
        !(s.how?.lead && Array.isArray(s.how.points) && s.how.points.length >= 3) && "how",
        !(Array.isArray(s.patterns) && s.patterns.length >= 3) && "patterns",
        !(s.example?.question && s.example?.text) && "example",
        !(Array.isArray(s.faq) && s.faq.length >= 3) && "faq",
        !s.ask && "ask",
      ].filter(Boolean);
      if (missing.length) throw new Error(`shape check failed: ${missing.join(",")} (keys: ${Object.keys(s).join(",")})`);
      const all = JSON.stringify(s);
      // "no guarantee" is the honest sentence we want; "guaranteed to" is the claim we forbid
      const red = all.match(/\d\d\s*%|predict(s|ing|ed)? (your|the) future|\bguaranteed\b|\bguarantees\b(?!\s+nothing)|\bguarantee (?:that|of|you)\b|神準|必ず(?!しも)|(よく|絶対に?)当たる|百分之[百九]/i);
      if (red) throw new Error(`red-line phrase: ${red[0]} — …${all.slice(Math.max(0, red.index! - 60), red.index! + 40)}…`);
      if (locale === "zh-hant" && /[这么为说时会将来对给认让还应该开关业经过发现见问间们]/.test(all)) throw new Error("simplified character leaked");
      return { slug: b.slug, topic: b.topic, hexagrams: b.hexagrams, ...s, example: { ...s.example, values: facts.values }, patterns: s.patterns.slice(0, 4), faq: s.faq.slice(0, 3) };
    } catch (err) {
      console.error(`${b.slug} attempt ${attempt}: ${(err as Error).message}`);
      if (attempt === 3) throw err;
      await new Promise((r) => setTimeout(r, 1500 * attempt));
    }
  }
  throw new Error("unreachable");
}

async function main() {
  const todo = briefs.filter((b) => (!only || b.slug === only) && (force || !out[b.slug]));
  console.log(`[${locale}] todo: ${todo.map((b) => b.slug).join(", ") || "nothing"}`);
  const queue = [...todo];
  await Promise.all(Array.from({ length: 4 }, async () => {
    for (;;) {
      const b = queue.shift();
      if (!b) return;
      try {
        out[b.slug] = await gen(b);
        writeFileSync(OUT, JSON.stringify(out, null, 1), "utf8");
        console.log(`✓ [${locale}] ${b.slug}`);
      } catch (err) {
        console.error(`✗ [${locale}] ${b.slug}: ${(err as Error).message}`);
      }
    }
  }));
}

void main();
