import { allQian, qianTag, templePoems } from "./qian";
import { QIAN_SET, QIAN_SETS, TEMPLES, qianSet } from "./qian-meta";

/**
 * 10-13 拍照认籤 (Neil: 「别人家会有一个上传图片的功能，就是把求的签上传到网站上面」→「都做吧」).
 *
 * A reader photographs the slip; a vision model only TRANSCRIBES it (it is never asked which lot it is — it would guess
 * from memory and be wrong across our 12 sets), and the text is matched here against the poems we hold, every set and
 * every temple wording of the 六十甲子籤. The photo is read and dropped — never written anywhere.
 */

const VARIANTS: Record<string, string> = {
  台: "臺", 着: "著", 来: "來", 万: "萬", 与: "與", 为: "為", 爲: "為", 无: "無", 旧: "舊", 当: "當", 恶: "惡",
  国: "國", 门: "門", 时: "時", 见: "見", 长: "長", 东: "東", 马: "馬", 风: "風", 云: "雲", 龙: "龍", 鸟: "鳥", 鱼: "魚",
  个: "個", 么: "麼", 迟: "遲", 进: "進", 还: "還", 边: "邊", 过: "過", 远: "遠", 运: "運", 难: "難", 实: "實",
  欢: "歡", 内: "內", 并: "並", 后: "後", 里: "裡", 裏: "裡", 尽: "盡", 灵: "靈", 卢: "盧", 杀: "殺",
  竜: "龍", 気: "氣", 図: "圖", 帰: "歸", 栄: "榮", 円: "圓", 斉: "齊", 争: "爭", 弁: "辨", 処: "處", 険: "險", 晩: "晚",
  労: "勞", 発: "發", 様: "樣", 鉄: "鐵", 辺: "邊", 涙: "淚", 戸: "戶", 黒: "黑", 経: "經", 楽: "樂", 実: "實", 浅: "淺",
};

/** CJK only, one written form per character — what the slip says, not how it was typeset or photographed. */
export function normaliseSlip(s: string): string {
  let out = "";
  for (const ch of s) {
    if (!/\p{Script=Han}/u.test(ch)) continue;
    out += VARIANTS[ch] ?? ch;
  }
  return out;
}

const bigrams = (s: string): string[] => { const b: string[] = []; for (let i = 0; i + 1 < s.length; i++) b.push(s.slice(i, i + 2)); return b; };

interface Candidate { set: string; num: number; temple: string | null; grams: string[] }
let INDEX: Candidate[] | null = null;
function index(): Candidate[] {
  if (INDEX) return INDEX;
  const list: Candidate[] = [];
  for (const st of QIAN_SETS) for (const e of allQian(st.id)) {
    const text = normaliseSlip(e.poem.join(""));
    if (text.length >= 3) list.push({ set: st.id, num: e.num, temple: null, grams: [...new Set(bigrams(text))] }); // 月老聖籤: one classical sentence, 3–8 characters
  }
  for (const [temple, lots] of Object.entries(templePoems())) for (const [n, lines] of Object.entries(lots)) {
    const text = normaliseSlip(lines.join(""));
    if (text.length >= 3) list.push({ set: QIAN_SET, num: Number(n), temple, grams: [...new Set(bigrams(text))] });
  }
  INDEX = list;
  return list;
}

/** score: share of the poem's character pairs found; hits: how many — a long poem found mostly beats a short one found whole */
export interface SlipMatch { set: string; num: number; temple: string | null; score: number; hits: number }

/**
 * The lots whose poem the transcription contains: share of the poem's character pairs found in the text (a photo
 * often holds the poem plus headers and explanations, so the poem is scored, not the photo). Best first; one entry
 * per set+number (the best of its temple wordings).
 */
export function matchSlip(text: string, limit = 3): SlipMatch[] {
  const have = new Set(bigrams(normaliseSlip(text)));
  if (have.size < 6) return [];
  const best = new Map<string, SlipMatch>();
  for (const c of index()) {
    let hit = 0;
    for (const g of c.grams) if (have.has(g)) hit++;
    // a short poem (月老聖籤's one sentence) counts only when (nearly) all of it is there — a few pairs prove nothing
    const n = c.grams.length;
    const score = n < 8 && hit < (n >= 6 ? n - 2 : n === 5 ? 4 : n) ? 0 : hit / n; // one unreadable character costs two pairs
    const k = `${c.set}:${c.num}`;
    const prev = best.get(k);
    if (!prev || score > prev.score) best.set(k, { set: c.set, num: c.num, temple: c.temple, score: Math.round(score * 1000) / 1000, hits: score ? hit : 0 });
  }
  // 「利有攸往」 is a whole 月老 lot and one line of 天后宮第 8 籤: among the plausible ones, the poem that accounts for
  // more of the photo comes first
  return [...best.values()].sort((a, b) => Number(b.score >= MAYBE) - Number(a.score >= MAYBE) || b.hits - a.hits || b.score - a.score).slice(0, limit);
}

/** What we tell the reader: one lot we are sure of, a short list to choose from, or nothing. */
export type SlipVerdict =
  | { kind: "one"; match: SlipMatch }
  | { kind: "some"; matches: SlipMatch[] }
  | { kind: "none" };

export const SURE = 0.55;   // over half the poem's pairs are in the photo
export const MAYBE = 0.3;

export function verdict(matches: SlipMatch[], printedNum: number | null): SlipVerdict {
  const top = matches[0];
  if (!top || top.score < MAYBE) return { kind: "none" };
  const second = matches[1];
  // the same poem in two sets (or two near-identical lots): let the reader say which — the printed number decides when it can
  const close = matches.filter((m) => m.score >= MAYBE && m.hits >= top.hits * 0.85 && top.score - m.score < 0.12);
  if (close.length > 1) {
    const byNum = printedNum ? close.filter((m) => m.num === printedNum) : [];
    if (byNum.length === 1 && byNum[0]!.score >= SURE) return { kind: "one", match: byNum[0]! };
    return { kind: "some", matches: close.slice(0, 3) };
  }
  if (top.score >= SURE || (printedNum === top.num && top.score >= MAYBE)) return { kind: "one", match: top };
  return { kind: "some", matches: [top, ...(second && second.score >= MAYBE ? [second] : [])] };
}

/**
 * The temple, only from the name printed on the slip — never from the wording: several temples print the same
 * wording (臺灣省城隍廟 and 北港朝天宮 share most of theirs), so the wording alone would name the wrong one.
 */
export function templeFromPrint(printed: string, set: string): string | null {
  const p = normaliseSlip(printed);
  if (p.length < 2) return null;
  const t = TEMPLES.find((x) => x.set === set && !x.id.endsWith("-other") && (normaliseSlip(x.name).includes(p) || p.includes(normaliseSlip(x.name).slice(-3))));
  return t?.id ?? null;
}

/**
 * 10-14: the poem did not match, but the slip printed both its number and a temple we know — that pair names the lot
 * (a temple's own printing often differs from the wording we hold). Only when exactly one set fits.
 */
export function lotFromPrint(printed: string, num: number | null, text = ""): SlipMatch | null {
  if (!num) return null;
  const named = setFromPrint(text);
  if (named && allQian(named).some((e) => e.num === num)) return { set: named, num, temple: null, score: 0, hits: 0 };
  const p = normaliseSlip(printed);
  if (p.length < 2) return null;
  const hits = TEMPLES.filter((x) => !x.id.endsWith("-other") && (normaliseSlip(x.name).includes(p) || p.includes(normaliseSlip(x.name).slice(-3))))
    .filter((x) => allQian(x.set).some((e) => e.num === num));
  const sets = [...new Set(hits.map((x) => x.set))];
  if (sets.length !== 1) return null;
  return { set: sets[0]!, num, temple: hits[0]!.id, score: 0, hits: 0 };
}

/** A matched lot as the page shows it. */
export function describeMatch(m: SlipMatch): { set: string; setName: string; num: number; title: string; tag: string; temple: string | null; templeName: string | null } {
  const e = allQian(m.set).find((x) => x.num === m.num)!;
  return {
    set: m.set, setName: qianSet(m.set).name, num: m.num, title: e.title, tag: qianTag(e),
    temple: m.temple, templeName: m.temple ? TEMPLES.find((t) => t.id === m.temple)?.name ?? null : null,
  };
}

/* ---------------- the transcription ---------------- */

export const VISION_PROMPT = [
  "這是一張廟裡求到的籤詩（籤紙）的照片。籤紙可能是橫放、倒放或歪的，先把它轉正再讀。照原樣抄字，不要解釋、不要補字、不要猜。",
  "籤詩是直書：一句一直行，每行由上往下讀，行與行由右往左；常見兩行一組排成左右兩欄，先讀右欄（上句、下句），再讀左欄。不要橫著一個字一個字跨行拼。",
  "只抄三樣，其他的解說、表格、小字、廣告一律不要抄：",
  "①籤號那一行，照籤上印的整行抄（例如「六十甲子第五十三籤 壬申」「第二十三籤」）；②籤詩本身——字最大、最粗的那幾句（通常四句，每句五或七字）；③籤上印的廟名。",
  "看不清楚的字用「□」代替。照片裡如果不是籤詩，就說不是。",
  '只輸出 JSON：{"is_slip": true 或 false, "number_line": "籤號那一行", "number": 籤號的阿拉伯數字或 null, "temple": "廟名，沒有就空字串", "poem": ["第一句","第二句","第三句","第四句"]}',
].join("\n");

export interface SlipReading { isSlip: boolean; number: number | null; temple: string; text: string; model?: string }

const CN_DIGIT: Record<string, number> = { 〇: 0, 零: 0, 一: 1, 二: 2, 兩: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
// 10-28: 烘爐地 prints the 大寫 numerals (第柒號、第貳拾壹號)
const BIG: Record<string, string> = { 壹: "一", 貳: "二", 參: "三", 叁: "三", 肆: "四", 伍: "五", 陸: "六", 柒: "七", 捌: "八", 玖: "九", 拾: "十", 佰: "百" };
/** 「二十三」「一百」「廿三」「柒」 → number (the model is asked for digits, but slips print these) */
export function chineseNumber(s: string): number | null {
  const t = s.replace(/廿/g, "二十").replace(/卅/g, "三十").replace(/[壹貳參叁肆伍陸柒捌玖拾佰]/g, (c) => BIG[c]!);
  if (/^\d{1,3}$/.test(t)) return Number(t);
  if (!/^[〇零一二兩三四五六七八九十百]+$/.test(t)) return null;
  let total = 0, cur = 0;
  for (const ch of t) {
    if (ch === "百") { total += (cur || 1) * 100; cur = 0; }
    else if (ch === "十") { total += (cur || 1) * 10; cur = 0; }
    else cur = CN_DIGIT[ch] ?? 0;
  }
  return total + cur || null;
}

/** 「第五十三籤」「第 23 首」 as printed; the last word before it may be a set name (六十甲子第五十三籤). */
export function printedNumber(text: string): number | null {
  const t = text.match(/第\s*([〇零一二兩三四五六七八九十百廿卅壹貳參叁肆伍陸柒捌玖拾佰\d]{1,6})\s*[籤签首號号]/);
  if (!t) return null;
  const n = chineseNumber(t[1]!);
  return n !== null && n >= 1 && n <= 100 ? n : null;
}

/** The set a slip names in print, when it does so unambiguously (「六十甲子第五十三籤」 — the header may still say 觀音靈籤). */
export function setFromPrint(text: string): string | null {
  const t = normaliseSlip(text);
  if (/六十甲子第/.test(t)) return QIAN_SET;
  return null;
}

/**
 * 10-28: the set a printed temple name points at, when the temples of exactly one set carry that name — 樂成宮 prints its
 * own 月老靈籤, 烘爐地 its own numbering of the 金錢卦; without this the photo of a 樂成宮 slip offered the 月老聖籤 lot that
 * shares a few words, and a 烘爐地 slip would be split between two sets with the same poem.
 */
export function setFromTemple(printed: string): string | null {
  const p = normaliseSlip(printed);
  if (p.length < 3) return null;
  const r = [...p].reverse().join(""); // a model reading the header's columns backwards gives 「地府烘區和中宮德福山南」
  const hit = (name: string) => [name.slice(0, 4), name.slice(-4)].some((k) => p.includes(k) || r.includes(k));
  const sets = new Set(TEMPLES.filter((x) => x.id !== "other" && !x.id.endsWith("-other") && hit(normaliseSlip(x.name))).map((x) => x.set));
  return sets.size === 1 ? [...sets][0]! : null;
}

export function parseSlipReading(raw: string): SlipReading | null {
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const j = JSON.parse(m[0]) as Record<string, unknown>;
    let num: number | null = typeof j.number === "number" ? j.number : typeof j.number === "string" ? chineseNumber(j.number.replace(/[第籤签首號号\s]/g, "")) : null;
    const poem = Array.isArray(j.poem) ? (j.poem as unknown[]).filter((x): x is string => typeof x === "string").join("\n") : "";
    // 10-14: only the number line and the poem are asked for now — a model copying every small print ran to 1,200 tokens
    // and 40 seconds; the poem alone is what the match needs
    const text = [typeof j.number_line === "string" ? j.number_line : "", poem, typeof j.text === "string" ? j.text : ""].filter(Boolean).join("\n");
    // 10-14: what the slip prints (「六十甲子第五十三籤」) beats the model's own number — on a real slip it said 61 for 53
    const printed = printedNumber(text);
    if (printed !== null) num = printed;
    if (num !== null && (!Number.isInteger(num) || num < 1 || num > 100)) num = null;
    return { isSlip: j.is_slip !== false, number: num, temple: typeof j.temple === "string" ? j.temple.slice(0, 40) : "", text: text.slice(0, 2000) };
  } catch { return null; }
}

/**
 * 10-14 (Neil, on /admin/qian: 5 real photos, 1 recognised — 「这个很有问题啊」): the 32B model took 9, 25 and 45+ seconds
 * on three test slips (the last one timed out — the reader saw 「讀取失敗」), while Qwen3-VL-30B-A3B read all three
 * correctly in 3–4 seconds. The fast one goes first; the 32B is the second try when it gives nothing.
 */
export const VISION_MODELS = (): { model: string; ms: number }[] => [
  { model: process.env.QIAN_VISION_MODEL ?? "Qwen/Qwen3-VL-30B-A3B-Instruct", ms: 18_000 },
  { model: process.env.QIAN_VISION_FALLBACK ?? "Qwen/Qwen3-VL-32B-Instruct", ms: 33_000 },
];

/** One try's outcome: what was read, what it matched, and the verdict (with the printed temple / set / number rescue). */
export interface PhotoTry { reading: SlipReading; found: SlipMatch[]; verdict: SlipVerdict; rot: number }
export function judgeReading(reading: SlipReading, rot = 0): PhotoTry {
  let found = matchSlip(reading.text, 5);
  // 10-28: the slip names its temple → among the plausible lots, keep that temple's set (the same poem sits in two sets)
  const named = setFromPrint(reading.text) ?? setFromTemple(`${reading.temple} ${reading.text.split("\n")[0] ?? ""}`);
  if (named && found.some((m) => m.set === named && m.score >= MAYBE)) found = found.filter((m) => m.set === named);
  let v = verdict(found, reading.number);
  // 10-28: the model read the columns across (「有家國／福財財治／亦求漸人」 for 國治人安泰／家財漸漸興…): the pairs are gone
  // but the characters are there — within the set the slip names, the lot whose characters are (nearly) all present
  if (v.kind === "none" && named) { const byChars = lotByCharacters(reading.text, named); if (byChars) { v = { kind: "one", match: byChars }; found = [byChars, ...found]; } }
  if (v.kind === "none") { const byPrint = lotFromPrint(reading.temple, reading.number, reading.text); if (byPrint) v = { kind: "one", match: byPrint }; }
  return { reading, found, verdict: v, rot };
}
/** share of a poem's distinct characters found in the text, one set only; a clear winner (≥ 3/4 found, next one well behind) */
export function lotByCharacters(text: string, set: string): SlipMatch | null {
  const have = new Set(normaliseSlip(text));
  if (have.size < 8) return null;
  const scored = allQian(set).map((e) => {
    const chars = [...new Set(normaliseSlip(e.poem.join("")))];
    const hit = chars.filter((c) => have.has(c)).length;
    return { num: e.num, score: hit / chars.length, hits: hit };
  }).sort((a, b) => b.score - a.score);
  const [best, next] = scored;
  if (!best || best.score < 0.75 || (next && next.score > best.score - 0.2)) return null;
  return { set, num: best.num, temple: null, score: Math.round(best.score * 1000) / 1000, hits: best.hits };
}

const RANK: Record<SlipVerdict["kind"], number> = { one: 2, some: 1, none: 0 };
/** The better of two tries: a sure lot first, then the stronger poem match. */
export function betterTry(a: PhotoTry | null, b: PhotoTry | null): PhotoTry | null {
  if (!a) return b; if (!b) return a;
  const ra = RANK[a.verdict.kind] + (a.reading.isSlip ? 0 : -5), rb = RANK[b.verdict.kind] + (b.reading.isSlip ? 0 : -5);
  if (ra !== rb) return ra > rb ? a : b;
  return (b.found[0]?.score ?? 0) > (a.found[0]?.score ?? 0) ? b : a;
}

/**
 * 10-14 (Neil, on the first kept photo: 「这个照片为什么会认不出来呢？你是不是应该调整一下模型？」): the slip lay sideways in
 * the photo. Read as it was, every model scrambled the columns (best poem match 0.26); turned upright, Qwen3-VL-32B and
 * GLM-4.5V both read the whole poem (match 1.0). So the photo as it is and turned a quarter each way are read together.
 */
export async function readSlipPhoto(dataUrl: string): Promise<{ best: PhotoTry | null; tries: number; model: string | null }> {
  const [fast, strong] = VISION_MODELS();
  // all at once: the fast model on the photo as it is, the 32B on it turned both ways — the first sure answer wins, so a
  // well-taken photo comes back in seconds and a sideways one does not wait for a first try to fail (10-14: 51 s → ~30 s)
  const turns = await rotations(dataUrl);
  const jobs: Promise<PhotoTry | null>[] = [
    transcribeWith(dataUrl, fast!.model, fast!.ms).then((r) => (r ? judgeReading({ ...r, model: fast!.model }, 0) : null)),
    ...turns.map(({ rot, url }) => transcribeWith(url, strong!.model, strong!.ms).then((r) => (r ? judgeReading({ ...r, model: strong!.model }, rot) : null))),
  ];
  const best = await new Promise<PhotoTry | null>((done) => {
    let left = jobs.length, acc: PhotoTry | null = null;
    for (const j of jobs) j.catch(() => null).then((t) => {
      acc = betterTry(acc, t);
      if (t?.verdict.kind === "one" && t.reading.isSlip) return done(t);
      if (--left === 0) done(acc);
    });
  });
  // nothing at all came back from the photo as it is: one more try with the 32B on it
  if (!best) {
    const r = await transcribeWith(dataUrl, strong!.model, Math.min(strong!.ms, 15_000));
    const t = r ? judgeReading({ ...r, model: strong!.model }, 0) : null;
    return { best: t, tries: jobs.length + 1, model: t?.reading.model ?? null };
  }
  return { best, tries: jobs.length, model: best.reading.model ?? null };
}

/** The photo turned a quarter clockwise and a quarter anticlockwise (JPEG data URLs); none when the image cannot be read. */
async function rotations(dataUrl: string): Promise<{ rot: number; url: string }[]> {
  const m = dataUrl.match(/^data:image\/(?:jpeg|png|webp);base64,(.+)$/);
  if (!m) return [];
  try {
    const sharp = (await import("sharp")).default;
    const buf = Buffer.from(m[1]!, "base64");
    return await Promise.all([90, 270].map(async (rot) => ({ rot, url: `data:image/jpeg;base64,${(await sharp(buf).rotate(rot).jpeg({ quality: 85 }).toBuffer()).toString("base64")}` })));
  } catch { return []; }
}

/** Read the photo with the first model, the second when the first gives nothing; which one answered comes back too. */
export async function transcribeSlip(dataUrl: string): Promise<SlipReading | null> {
  for (const { model, ms } of VISION_MODELS()) {
    const r = await transcribeWith(dataUrl, model, ms);
    if (r) return { ...r, model };
  }
  return null;
}

/** One model, one try. Null when no key is configured, the model fails or it runs past `ms`. */
async function transcribeWith(dataUrl: string, model: string, ms: number): Promise<SlipReading | null> {
  const key = process.env.SILICONFLOW_API_KEY;
  if (!key) return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch("https://api.siliconflow.cn/v1/chat/completions", {
      method: "POST", signal: ctrl.signal,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model, temperature: 0, max_tokens: 400,
        messages: [{ role: "user", content: [{ type: "image_url", image_url: { url: dataUrl } }, { type: "text", text: VISION_PROMPT }] }],
      }),
    });
    if (!r.ok) return null;
    const j = (await r.json()) as { choices?: { message?: { content?: string } }[] };
    return parseSlipReading(j.choices?.[0]?.message?.content ?? "");
  } catch { return null; } finally { clearTimeout(timer); }
}
