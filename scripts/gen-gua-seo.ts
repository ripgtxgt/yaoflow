/**
 * 一次性生成 64 卦 SEO 页的白话讲解内容（中英双语），写入
 * apps/web/src/data/gua-seo.json 后入库为静态数据 — 线上不再调模型。
 *
 * 跑法（服务器，密钥在 apps/web/.env.local）：
 *   cd ~/yaoflow && set -a && . apps/web/.env.local && set +a \
 *     && npx -y tsx scripts/gen-gua-seo.ts
 *
 * 可断点续跑：已生成的卦直接跳过。
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { allHexagrams, textsFor } from "../packages/engine/src/index";

const OUT = new URL("../apps/web/src/data/gua-seo.json", import.meta.url).pathname;
const KEY = process.env.DEEPSEEK_API_KEY;
if (!KEY) throw new Error("DEEPSEEK_API_KEY missing (source apps/web/.env.local first)");

interface SeoSide {
  summary: string;
  lines: string[];
  extra?: string;
  career: string;
  love: string;
  money: string;
  meta: string;
}
interface SeoEntry { n: number; zh: SeoSide; en: SeoSide }

const out: Record<string, SeoEntry> = existsSync(OUT)
  ? (JSON.parse(readFileSync(OUT, "utf8")) as Record<string, SeoEntry>)
  : {};

const SYSTEM = `你是 YaoFlow 的内容作者，为《周易》六十四卦逐卦撰写面向普通读者的双语讲解页。
铁律：
- 说人话。禁止术语堆砌，禁止装神弄鬼的口吻，禁止"必定大吉/大凶"式绝对宣判。
- 定位是文化解读与自我反思参考，不是算命宣传。给的是倾向判断和行动建议。
- 白话要贴住所给的卦辞爻辞原文来讲，不要脱离原文自由发挥。
- 中文自然流畅；英文是地道的 plain modern English（不是中文直译腔）。
只输出一个 JSON 对象，结构：
{"zh":{"summary":"这一卦整体在说什么，120-180字","lines":["初爻白话40-70字",...共6条，自下而上],"extra":"仅当原文有用九/用六时给白话，否则省略此字段","career":"事业上问到这一卦的倾向与建议，60-90字","love":"感情上…60-90字","money":"财运上…60-90字","meta":"70字以内的一句话页面摘要，含卦名"},
"en":{"summary":"100-150 words","lines":["line 1 in plain English, 25-45 words",...6],"extra":"only if the original has an extra line","career":"...","love":"...","money":"...","meta":"one sentence <=155 chars, includes the hexagram name"}}`;

async function genOne(n: number): Promise<SeoEntry> {
  const hexes = allHexagrams();
  const h = hexes.find((x) => x.number === n)!;
  const t = textsFor(n);
  const zhLines = t.zh.lines.map((l) => `${l.label}：${l.hans}`).join("\n");
  const user = `第${n}卦 ${h.fullZh}（${h.zh}，${h.pinyin}，英文名 ${h.en}）
卦辞：${t.zh.judgmentHans}
爻辞（自下而上）：
${zhLines}
${t.zh.extra ? `${t.zh.extra.label}：${t.zh.extra.hans}` : ""}
English judgment: ${t.en.judgment}
English lines (bottom-up):
${t.en.lines.map((l, i) => `${i + 1}. ${l}`).join("\n")}
${t.en.extra ? `Extra: ${t.en.extra}` : ""}`;

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch("https://api.deepseek.com/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEY}` },
        body: JSON.stringify({
          model: "deepseek-chat",
          temperature: 0.7,
          max_tokens: 4000,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: SYSTEM },
            { role: "user", content: user },
          ],
        }),
      });
      if (!res.ok) throw new Error(`http ${res.status}`);
      const data = (await res.json()) as { choices: { message: { content: string } }[] };
      const body = JSON.parse(data.choices[0]!.message.content) as { zh: SeoSide; en: SeoSide };
      for (const side of [body.zh, body.en]) {
        if (!side?.summary || !Array.isArray(side.lines) || side.lines.length !== 6
          || !side.career || !side.love || !side.money || !side.meta) {
          throw new Error("shape check failed");
        }
      }
      // 有用九/用六的卦（1、2）必须带 extra
      if ((n === 1 || n === 2) && (!body.zh.extra || !body.en.extra)) throw new Error("missing extra");
      return { n, zh: body.zh, en: body.en };
    } catch (e) {
      console.error(`hex ${n} attempt ${attempt}: ${(e as Error).message}`);
      if (attempt === 3) throw e;
      await new Promise((r) => setTimeout(r, 2000 * attempt));
    }
  }
  throw new Error("unreachable");
}

async function main() {
  const todo = Array.from({ length: 64 }, (_, i) => i + 1).filter((n) => !out[String(n)]);
  console.log(`todo: ${todo.length} hexagrams`);
  const CONC = 6;
  let done = 64 - todo.length;
  const queue = [...todo];
  async function worker() {
    for (;;) {
      const n = queue.shift();
      if (n === undefined) return;
      const entry = await genOne(n);
      out[String(n)] = entry;
      writeFileSync(OUT, JSON.stringify(out, null, 1), "utf8");
      done++;
      console.log(`✓ ${n} (${done}/64)`);
    }
  }
  await Promise.all(Array.from({ length: CONC }, worker));
  console.log("all done →", OUT);
}

void main();
