/**
 * 为 64 卦 SEO 页生成某一语言的讲解内容，写入
 * apps/web/src/data/gua-seo.<locale>.json，入库为静态数据 — 线上不调模型。
 *
 * 以已审定的中英内容（gua-seo.json）为底稿，让模型"用目标语言重写"而不是
 * 自由发挥：既保住口径（说人话、不绝对宣判），又拿到地道的目标语言。
 * 同时产出该语言对经文本身的译文（卦辞 + 六爻 + 用九/用六），
 * 日文给书き下し文，韩文给한글 풀이，欧洲语言给忠实白话译文；
 * 欧洲语言另给该语言通行译本里的卦名（卫礼贤体系）。
 *
 * 跑法（服务器，密钥在 apps/web/.env.local）：
 *   cd ~/yaoflow && KEY=$(grep '^DEEPSEEK_API_KEY=' apps/web/.env.local | cut -d= -f2-) \
 *     && DEEPSEEK_API_KEY=$KEY npx -y tsx scripts/gen-gua-seo-l10n.ts ja
 *
 * 可断点续跑：已生成的卦直接跳过。
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { allHexagrams, textsFor } from "../packages/engine/src/index";

const locale = process.argv[2];
const LANG: Record<string, { name: string; rules: string; nameField: boolean }> = {
  ja: {
    name: "日本語",
    nameField: false,
    rules: `- 文体はです・ます調。易の用語（卦辞・爻辞・用九・用六）は漢字のまま使ってよい。
- judgment と originals は経文の「書き下し文」（現代仮名遣いの読み下し、例：「元いに亨る。貞しきに利ろし。」）。訳注は付けない。
- 卦名は出力しない（サイト側で漢字名を表示する）。`,
  },
  ko: {
    name: "한국어",
    nameField: false,
    rules: `- 문체는 합니다체. 괘사·효사·용구·용육 같은 용어는 한글로 씁니다(필요하면 괄호 안에 한자).
- judgment 와 originals 는 경문의 한글 풀이(원문에 충실한 현대 한국어 번역, 주석 없이).
- 괘 이름은 출력하지 않습니다(사이트가 한글 괘명을 표시합니다).`,
  },
  fr: {
    name: "français",
    nameField: true,
    rules: `- Tutoiement, ton chaleureux et direct, français naturel (pas de calque de l'anglais).
- "name" : le nom du hexagramme tel que le donne la tradition de traduction française (lignée Wilhelm/Perrot : Le Créateur, Le Réceptif, La Difficulté initiale…).
- judgment et originals : traduction fidèle et sobre du texte classique (Jugement, six traits), sans commentaire.`,
  },
  de: {
    name: "Deutsch",
    nameField: true,
    rules: `- Du-Form, warm und direkt, natürliches Deutsch (keine Übersetzung aus dem Englischen).
- "name": der Hexagrammname der deutschen Übersetzungstradition (Richard Wilhelm: Das Schöpferische, Das Empfangende, Die Anfangsschwierigkeit …).
- judgment und originals: treue, nüchterne Übersetzung des klassischen Textes (Urteil, sechs Linien), ohne Kommentar.`,
  },
  es: {
    name: "español",
    nameField: true,
    rules: `- Tuteo, tono cálido y directo, español natural (no calcado del inglés).
- "name": el nombre del hexagrama según la tradición de traducción al español (línea Wilhelm/Vogelmann: Lo Creativo, Lo Receptivo, La Dificultad Inicial…).
- judgment y originals: traducción fiel y sobria del texto clásico (Dictamen, seis líneas), sin comentario.`,
  },
  pt: {
    name: "português",
    nameField: true,
    rules: `- Tratamento por "você", tom caloroso e direto, português natural e neutro entre Brasil e Portugal.
- "name": o nome do hexagrama na tradição de tradução em português (linha Wilhelm: O Criativo, O Receptivo, A Dificuldade Inicial…).
- judgment e originals: tradução fiel e sóbria do texto clássico (Julgamento, seis linhas), sem comentário.`,
  },
};
const spec = locale ? LANG[locale] : undefined;
if (!locale || !spec) throw new Error(`usage: tsx scripts/gen-gua-seo-l10n.ts <${Object.keys(LANG).join("|")}>`);

const SRC = new URL("../apps/web/src/data/gua-seo.json", import.meta.url).pathname;
const OUT = new URL(`../apps/web/src/data/gua-seo.${locale}.json`, import.meta.url).pathname;
const KEY = process.env.DEEPSEEK_API_KEY;
if (!KEY) throw new Error("DEEPSEEK_API_KEY missing");

interface SeoSide {
  summary: string; lines: string[]; extra?: string;
  career: string; love: string; money: string; meta: string;
}
interface L10nSide extends SeoSide {
  name?: string;
  judgment: string;
  originals: string[];
  extraOriginal?: string;
}
const src = JSON.parse(readFileSync(SRC, "utf8")) as Record<string, { n: number; zh: SeoSide; en: SeoSide }>;
const out: Record<string, L10nSide> = existsSync(OUT)
  ? (JSON.parse(readFileSync(OUT, "utf8")) as Record<string, L10nSide>)
  : {};

const SYSTEM = `你是 YaoFlow 的内容作者，为《周易》六十四卦的讲解页产出「${spec.name}」版本。
你会拿到：该卦的经文原文（中文 + 英文译文），以及已审定的中文与英文讲解稿。
任务：用地道的${spec.name}重写这份讲解——保持内容、口径与篇幅，不是逐字翻译，也不要自由发挥新观点。
铁律：
- 说人话。禁止术语堆砌，禁止装神弄鬼的口吻，禁止"必定大吉/大凶"式绝对宣判。
- 定位是文化解读与自我反思参考，不是算命宣传。给的是倾向判断和行动建议。
- 讲解要贴住经文原文；六条 lines 自下而上，与六条 originals 一一对应。
- 只用${spec.name}书写（专有名词与经文用语除外），数字用阿拉伯数字。
${spec.rules}
只输出一个 JSON 对象：
{${spec.nameField ? '"name":"该语言通行译本中的卦名",' : ""}"judgment":"卦辞译文","originals":["初爻爻辞译文",...共6条],"extraOriginal":"仅当原文有用九/用六时给译文，否则省略此字段",
"summary":"这一卦整体在说什么（对应中英稿的 summary，篇幅相当）","lines":["初爻白话讲解",...共6条],"extra":"仅当原文有用九/用六时给白话，否则省略",
"career":"事业上问到这一卦的倾向与建议","love":"感情上…","money":"财运上…","meta":"一句话页面摘要，含卦名，不超过 155 个字符"}`;

async function genOne(n: number): Promise<L10nSide> {
  const h = allHexagrams().find((x) => x.number === n)!;
  const t = textsFor(n);
  const e = src[String(n)]!;
  const user = `第${n}卦 ${h.fullZh}（${h.zh}，${h.pinyin}，英文名 ${h.en}）
卦辞：${t.zh.judgmentHant}
爻辞（自下而上）：
${t.zh.lines.map((l) => `${l.label}：${l.hant}`).join("\n")}
${t.zh.extra ? `${t.zh.extra.label}：${t.zh.extra.hant}` : ""}
English judgment: ${t.en.judgment}
English lines (bottom-up):
${t.en.lines.map((l, i) => `${i + 1}. ${l}`).join("\n")}
${t.en.extra ? `Extra: ${t.en.extra}` : ""}

=== 已审定中文讲解 ===
${JSON.stringify(e.zh, null, 1)}

=== 已审定英文讲解 ===
${JSON.stringify(e.en, null, 1)}`;

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch("https://api.deepseek.com/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEY}` },
        body: JSON.stringify({
          model: "deepseek-chat",
          temperature: 0.6,
          max_tokens: 4500,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: SYSTEM },
            { role: "user", content: user },
          ],
        }),
      });
      if (!res.ok) throw new Error(`http ${res.status}`);
      const data = (await res.json()) as { choices: { message: { content: string } }[] };
      const b = JSON.parse(data.choices[0]!.message.content) as L10nSide;
      if (!b.summary || !Array.isArray(b.lines) || b.lines.length !== 6
        || !Array.isArray(b.originals) || b.originals.length !== 6 || !b.judgment
        || !b.career || !b.love || !b.money || !b.meta) {
        throw new Error("shape check failed");
      }
      if (spec.nameField && !b.name) throw new Error("missing name");
      if ((n === 1 || n === 2) && (!b.extra || !b.extraOriginal)) throw new Error("missing extra");
      // Latin languages run long; cut at the last sentence end that keeps it a meta description
      let meta = b.meta.trim();
      if (meta.length > 175) {
        const cut = meta.slice(0, 175).search(/[.!?。！？][^.!?。！？]*$/);
        if (cut > 60) meta = meta.slice(0, cut + 1);
      }
      if (meta.length > 200) throw new Error(`meta too long (${meta.length})`);
      const side: L10nSide = {
        ...(spec.nameField ? { name: b.name!.trim() } : {}),
        judgment: b.judgment.trim(),
        originals: b.originals.map((s) => String(s).trim()),
        ...(b.extraOriginal ? { extraOriginal: b.extraOriginal.trim() } : {}),
        summary: b.summary.trim(),
        lines: b.lines.map((s) => String(s).trim()),
        ...(b.extra ? { extra: b.extra.trim() } : {}),
        career: b.career.trim(),
        love: b.love.trim(),
        money: b.money.trim(),
        meta,
      };
      return side;
    } catch (err) {
      console.error(`hex ${n} attempt ${attempt}: ${(err as Error).message}`);
      if (attempt === 3) throw err;
      await new Promise((r) => setTimeout(r, 2000 * attempt));
    }
  }
  throw new Error("unreachable");
}

async function main() {
  const todo = Array.from({ length: 64 }, (_, i) => i + 1).filter((n) => !out[String(n)]);
  console.log(`[${locale}] todo: ${todo.length} hexagrams`);
  const CONC = 6;
  let done = 64 - todo.length;
  const queue = [...todo];
  const failed: number[] = [];
  async function worker() {
    for (;;) {
      const n = queue.shift();
      if (n === undefined) return;
      try {
        out[String(n)] = await genOne(n);
      } catch (err) {
        failed.push(n);
        console.error(`✗ [${locale}] ${n}: ${(err as Error).message}`);
        continue;
      }
      writeFileSync(OUT, JSON.stringify(out, null, 1), "utf8");
      done++;
      console.log(`✓ [${locale}] ${n} (${done}/64)`);
    }
  }
  await Promise.all(Array.from({ length: CONC }, worker));
  if (failed.length) { console.error(`failed: ${failed.join(", ")} — rerun to fill`); process.exit(1); }
  console.log("all done →", OUT);
}

void main();
