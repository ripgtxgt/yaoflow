/**
 * 解读质量回归集 — 固定卦例走真实生成管线，自动检查今天磨出来的每一条纪律。
 *
 *   cd ~/yaoflow/apps/web && DEEPSEEK_API_KEY=… npx -y tsx ../../scripts/eval-readings.ts [--only=关键词]
 *
 * 每个卦例检查：
 *   scale     应期粒度与问题尺度匹配（当下→时辰；数日→近日；周→带日期；大事/择时→月级阶段，不钉日）
 *   dates     应期里出现的日期必须来自候选窗口（不许编日期）
 *   lazy      没有"农历X月""一两个月后"式偷懒
 *   filler    没有空话（保持沟通/顺其自然/相信自己/综上所述）
 *   changes   有动爻时 basis 必须引用算好的动变关系
 *   jargon    非 basis 字段无术语（管线已强制；这里复核）
 *   length    zh 字段 40–220 字
 *   script    输出是读者的文字系统；zh-hant 不得混入简体（09-09 水風井整段简体）
 *   polarity  静卦：断语倾向必须与 static_read.lean 一致，且同盘重生成一次倾向不反转（09-09 水風井一次有望一次難成）
 *   joint     同题合参：两盘 + 公开题目，全字段无术语、无空话、无日期、无"一定/100%"、称呼对（你 / 对方）、不引用私人问法
 * 任一硬失败 → 退出码 1。改提示词后必跑。
 */
import { generateReading } from "../apps/web/src/lib/generate";
import {
  DEEP_KEYS, ONE_KEYS, buildUserPayload, dateTalkOffense, followupSystem, jargonOffense, pick, resolveServerChart, resolveTiming, staticRead, timingOffense,
  type Bi, type DeepReading, type Reading, type ReadingInput,
} from "../apps/web/src/lib/reading";
import { hansRatio, HANS_LEAK_THRESHOLD, toHans } from "../apps/web/src/lib/hant";
import type { Locale } from "../apps/web/src/lib/locales";
import { chatText } from "../apps/web/src/lib/llm";
import { readsAsCantonese } from "../apps/web/src/lib/question-lang";
import { absoluteDates } from "../apps/web/src/lib/revisit";
import { generateJointFrom, JOINT_KEYS } from "../apps/web/src/lib/joint";
import type { LineValue } from "@yaoflow/engine";

interface Case { label: string; input: ReadingInput; locale?: Locale }

const now = Date.now();
const mk = (label: string, question: string, values: LineValue[], extra: Partial<ReadingInput> = {}, locale: Locale = "zh"): Case =>
  ({ label, input: { question, values, castAtMs: now, tzOffsetMinutes: 480, ...extra }, locale });

const CASES: Case[] = [
  mk("当下·午觉", "我现在能睡一个质量很好的午觉吗", [7, 8, 9, 8, 6, 7]),
  mk("当下·今晚饭局", "今晚的饭局去不去合适", [8, 7, 7, 8, 8, 9]),
  mk("数日·明天面试", "明天下午的面试能过吗", [9, 7, 8, 8, 7, 7]),
  mk("周·回款", "客户欠的那笔款什么时候能收回来", [8, 8, 6, 7, 7, 9]),
  mk("周·跳槽", "我该不该接受这个跳槽的 offer", [7, 8, 9, 8, 7, 8]),
  mk("周·复合", "和前任还有可能复合吗", [7, 6, 8, 8, 9, 8], { tzOffsetMinutes: -240 }),
  // 静卦 · 繁體：无动爻的盘最容易摇摆，也是简体泄漏出过事的那一例（水風井 877878）
  mk("靜卦·繁體·復合", "我們還有可能復合嗎", [8, 7, 7, 8, 7, 8], {}, "zh-hant"),
  mk("大事·出国", "我妹夫准备出国去发展，这个事情能不能成？会不会顺利？", [7, 9, 8, 7, 8, 8]),
  mk("大事·买房", "今年能买到合适的房子吗", [8, 6, 7, 7, 8, 8]),
  mk("择时·推广", "我的算卦产品大概要在什么时候去做推广呢？", [8, 8, 7, 6, 7, 7]),
  mk("覆盖·复合但声明今天", "和前任还有可能复合吗", [7, 6, 8, 8, 9, 8], { scaleHint: "now" }),
  mk("英文·本周 offer", "Will I get the job offer this week?", [7, 8, 7, 9, 8, 7], {}, "en"),
  // 六种新语言各一例：问题用该语言写，关键词规则要认得出 scale/topic，输出必须是该语言的文字
  mk("日本語·転職", "今の会社を辞めて転職すべきでしょうか", [7, 8, 9, 8, 7, 8], { tzOffsetMinutes: 540 }, "ja"),
  mk("한국어·내일 면접", "내일 면접 잘 볼 수 있을까요", [9, 7, 8, 8, 7, 7], { tzOffsetMinutes: 540 }, "ko"),
  mk("Français·ex", "Est-ce qu'on peut se remettre ensemble, mon ex et moi ?", [7, 6, 8, 8, 9, 8], { tzOffsetMinutes: 120 }, "fr"),
  mk("Deutsch·Auswandern", "Soll ich nächstes Jahr nach Kanada auswandern?", [7, 9, 8, 7, 8, 8], { tzOffsetMinutes: 120 }, "de"),
  mk("Español·cobro", "¿Cuándo me pagará el cliente lo que me debe?", [8, 8, 6, 7, 7, 9], { tzOffsetMinutes: -180 }, "es"),
  mk("Português·hoje", "Consigo fechar a venda hoje à tarde?", [7, 8, 9, 8, 6, 7], { tzOffsetMinutes: -180 }, "pt"),
  // 09-18：粵語提問 → 粵語解讀（register 由 checkout 判定，這裡直接給）；輸出要有 唔/佢/嘅/咁/咗
  mk("粵語·佢會唔會返嚟", "佢會唔會返嚟搵我？我哋仲有冇機會", [7, 6, 8, 8, 9, 8], { register: "yue" }, "zh-hant"),
  // 09-18：同一件事再起一卦，帶上一卦的斷語——新解讀第一段要提到上次
  mk("延續·前任再問", "他这几天会主动联系我吗", [8, 7, 7, 8, 7, 8], { prior: { question: "和前任还有可能复合吗", at: now - 3 * 3_600_000, hex: "水雷屯", call: "还有机会再连上，但不会回到从前那样。对方现在是人在、心还没到位的状态。" } }),
];

/** The reading must be written in the reader's script — a Chinese sentence in a French reading is a hard failure. */
function checkScript(all: string, loc: Locale): Verdict {
  const cjk = /[\u4e00-\u9fff]/, kana = /[\u3040-\u30ff]/, hangul = /[\uac00-\ud7af]/;
  if (loc === "ja") return kana.test(all) && !hangul.test(all) ? pass() : fail("日文输出缺少假名或混入韩文");
  if (loc === "ko") return hangul.test(all) && !kana.test(all) ? pass() : fail("韩文输出缺少谚文或混入假名");
  if (loc === "zh-hant") {
    if (!cjk.test(all)) return fail("中文输出没有汉字");
    const r = hansRatio(all);
    return r > HANS_LEAK_THRESHOLD ? fail(`繁體输出混入简体（OpenCC 需改写 ${(r * 100).toFixed(0)}% 的汉字）`) : pass();
  }
  if (loc === "zh") return cjk.test(all) ? pass() : fail("中文输出没有汉字");
  const m = all.match(cjk);
  return m ? fail(`混入汉字：${all.slice(Math.max(0, m.index! - 8), m.index! + 8)}`) : pass();
}
const CHINESE = (loc: Locale) => loc === "zh" || loc === "zh-hant";

const KIND_WORDS: Record<string, RegExp> = {
  huitou_sheng: /回头生/, huitou_ke: /回头克/, xie: /泄/, ke_chu: /克出|耗/, jin: /进神/, tui: /退神/,
  bihe: /比和/, fuyin: /伏吟/, fanyin: /反吟/, he: /化合|相合/, mu: /入墓|墓/, kong: /旬空|空/, po: /月破|破/,
};
const FILLER = /保持沟通|顺其自然|相信自己|综上所述/;
/** 卦名典故与文言压缩——普通读者读不懂的两类句子（09-15 内测反馈） */
const LORE = /履虎尾|鸿雁|鴻雁|磐石|栋桡|棟橈|井绳|井繩|灭顶|滅頂|之象|明夷之后|明夷之後|大过之木|大過之木|龙战|龍戰|潜龙|潛龍|飞龙|飛龍/;
const BOOKISH = /此局|吉中带阻|吉中帶阻|偏阻后通|偏阻後通|事在收口|先散后聚|先散後聚|栋桡|棟橈|休囚|旺相|得令|失令/;
const LAZY = /农历|一两个月|九、十月|九月十月|一段时间后/;

type Verdict = { ok: boolean; note?: string };
const pass = (): Verdict => ({ ok: true });
const fail = (note: string): Verdict => ({ ok: false, note });

function checkScale(scale: string, timing: string, today: Date): Verdict {
  const dates = absoluteDates(timing, today);
  const daysAway = dates.map((d) => Math.round((d.getTime() - today.getTime()) / 86_400_000));
  // month phases come in digits ("10月到12月", "11月下旬") and in words ("今年年底到明年一二月", "下半年") — both count
  const monthPhase = /\d{1,2}\s*月\s*\d{1,2}\s*日?\s*(?:至|到|[-–—~])\s*\d{1,2}\s*月|[\d一二三四五六七八九十]{1,3}\s*月(?:上旬|中旬|下旬|初|底|末)|年底|年末|年初|开春|上半年|下半年|(?:今年|明年|至|到)\s*[一二三四五六七八九十]{1,3}月|这一个月|这个月|整月/.test(timing);
  switch (scale) {
    case "now": {
      const todayIdx = timing.search(/今天|今晚|现在|点|时之间|小时|马上|立刻|明天/);
      if (todayIdx === -1) return fail("当下问题未按今天的时段作答");
      // a later date may follow as a fallback, but today's answer must come first
      const firstFar = timing.search(/\d{1,2}\s*月\s*\d{1,2}\s*[日号]/);
      if (firstFar !== -1 && firstFar < todayIdx && daysAway.some((d) => d >= 2)) return fail("当下问题以远日期开头");
      return pass();
    }
    case "day":
      if (daysAway.length && daysAway.every((d) => d > 10)) return fail("数日问题只给了十天开外的日期");
      return pass();
    case "long":
    case "choose":
      if (!monthPhase) return fail("大事/择时未给月级阶段");
      return pass();
    default: // weeks / open
      if (dates.length === 0 && !/天后|周内|两周|三周|一个月内/.test(timing)) return fail("未给具体日期或天数");
      return pass();
  }
}

function checkDates(timing: string, plan: ReturnType<typeof resolveTiming>, today: Date): Verdict {
  // only explicit M月D日 dates are held to the candidates; 上旬/中旬/月底 are phases, not claims
  const explicit = timing.replace(/\d{1,2}\s*月\s*(?:上旬|中旬|下旬|初|中|底|末)/g, "");
  const dates = absoluteDates(explicit, today);
  if (dates.length === 0) return pass();
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const shift = (d: Date, n: number) => iso(new Date(d.getTime() + n * 86_400_000));
  const windows = plan.candidates.flatMap((c) => c.windows.map((w) => ({ s: w.start, e: w.end })));
  const bad: string[] = [];
  for (const d of dates) {
    const away = Math.round((d.getTime() - today.getTime()) / 86_400_000);
    if (Math.abs(away) <= 1) continue; // today / tomorrow are always sayable
    const lo = shift(d, 1), hi = shift(d, -1); // ±1 day tolerance
    const hit = windows.some((w) => w.s <= lo && w.e >= hi);
    if (!hit) bad.push(iso(d));
  }
  return bad.length ? fail(`编造日期：${bad.join(", ")}`) : pass();
}

function checkChanges(basis: string, kinds: string[][]): Verdict {
  if (kinds.length === 0) return pass();
  const cited = kinds.some((ks) => ks.some((k) => KIND_WORDS[k]?.test(basis)));
  return cited ? pass() : fail("basis 未引用算好的动变关系");
}

/** Tendency of a Chinese verdict: negatives first (不成/難成 contain 成), then positives. */
function polarityOf(verdict: string): "pos" | "neg" | "unknown" {
  // "成不成 / 能不能 / 会不会" are questions, not negations — drop them before looking for 不成
  const v = toHans(verdict).replace(/(成|能|会|可|行)不\1/g, "");
  const NEG = /不成|难成|不宜|无望|成不了|不会|难以|不能|不可|落空|无缘|无果|没戏|无法/;
  const POS = /可成|有望|能成|会成|可以|有可能|还有可能|有机会|有戏|能够|顺/;
  // a Chinese verdict fronts the call ("還有可能，但不會是回到從前") — judge the head clause first,
  // the qualifiers after 但/，carry conditions, not the tendency
  const head = v.split(/[，,。；;！!？?]|但/)[0] ?? v;
  if (NEG.test(head)) return "neg";
  if (POS.test(head)) return "pos";
  if (NEG.test(v)) return "neg";
  if (POS.test(v)) return "pos";
  return "unknown";
}

/** 静卦: the verdict must not contradict the computed lean, and a second generation must not flip it. */
async function checkPolarity(c: Case, chart: ReturnType<typeof resolveServerChart>, verdict: string, loc: Locale): Promise<Verdict> {
  if (chart.cast.changingPositions.length > 0 || !CHINESE(loc)) return pass();
  const plan = resolveTiming({ ...c.input, question: toHans(c.input.question) }, chart);
  const lean = staticRead(chart, plan)!.lean;
  const p1 = polarityOf(verdict);
  if (lean === "favorable" && p1 === "neg") return fail(`lean=favorable 但断语偏否：${verdict.slice(0, 40)}`);
  if (lean === "unfavorable" && p1 === "pos") return fail(`lean=unfavorable 但断语偏可：${verdict.slice(0, 40)}`);
  const again = (await generateReading("deep", c.input, false, loc)) as DeepReading;
  const v2 = pick(again.verdict as Bi, loc);
  const p2 = polarityOf(v2);
  if (p1 !== "unknown" && p2 !== "unknown" && p1 !== p2) return fail(`同盘重生成极性反转：「${verdict.slice(0, 30)}」→「${v2.slice(0, 30)}」`);
  return pass();
}

async function runCase(c: Case) {
  const chart = resolveServerChart(c.input);
  // mirror generate.ts: the keyword rules read the question in Simplified (zh-hant cases would otherwise get another focal line)
  const plan = resolveTiming({ ...c.input, question: toHans(c.input.question) }, chart);
  const today = new Date(plan.today + "T12:00:00");
  const t0 = Date.now();
  let r: DeepReading;
  try {
    r = (await generateReading("deep", c.input, false, c.locale ?? "zh")) as DeepReading;
  } catch (e) {
    const note = `生成失败：${e instanceof Error ? e.message : String(e)}`;
    const checks: Record<string, Verdict> = { generation: fail(note) };
    const empty = Object.fromEntries(DEEP_KEYS.map((k) => [k, { zh: "", en: "" }])) as unknown as DeepReading;
    return { c, plan, r: empty, secs: ((Date.now() - t0) / 1000).toFixed(0), checks, chart };
  }
  const secs = ((Date.now() - t0) / 1000).toFixed(0);
  const loc: Locale = c.locale ?? "zh";
  const rawOf = Object.fromEntries(DEEP_KEYS.map((k) => [k, pick(r[k] as Bi, loc)])) as Record<string, string>;
  const timing = rawOf.timing!;
  const all = Object.values(rawOf).join(" ");
  const zhChecks = CHINESE(loc); // scale/date/动变 word checks are written for Chinese output
  const polarity = await checkPolarity(c, chart, rawOf.verdict!, loc);
  const checks: Record<string, Verdict> = {
    script: checkScript(all, loc),
    polarity,
    // 09-18：粵語提問要出粵語（除 basis 外的正文至少兩種強標記）
    ...(c.input.register === "yue" ? { yue: readsAsCantonese(Object.entries(rawOf).filter(([k]) => k !== "basis").map(([, v]) => v).join(" ")) ? pass() : fail("唔係粵語") } : {}),
    // 09-18：帶上一卦時，第一段要接上上次（提到 上次/之前/先前 之類）
    ...(c.input.prior ? { prior: /上次|之前|先前|上一卦|前一卦|昨天|早些|那时|那時|变了|變了|没变|沒變|仍然|还是|還是/.test(rawOf.verdict!) ? pass() : fail("斷語沒接上上次") } : {}),
    scale: zhChecks ? checkScale(plan.question_scale, timing, today) : pass(),
    dates: zhChecks ? checkDates(timing, plan, today) : pass(),
    lazy: LAZY.test(timing) ? fail(`偷懒措辞：${timing.match(LAZY)![0]}`) : pass(),
    filler: FILLER.test(all) ? fail(`空话：${all.match(FILLER)![0]}`) : pass(),
    changes: zhChecks ? checkChanges(rawOf.basis!, chart.changes.map((x) => x.kinds)) : pass(),
    jargon: (() => { const o = jargonOffense(rawOf, ["basis"], loc); return o ? fail(`术语泄漏 ${o}`) : pass(); })(),
    // 应期一窗口 + 至多一先兆，不带干支（09-15 可读性）
    timing: (() => { const o = timingOffense(rawOf, loc); return o ? fail(`应期 ${o}`) : pass(); })(),
    // 大势/结语不得靠卦名典故（履虎尾、鸿雁、栋桡、井绳…）；口吻不得文言压缩（此局、吉中带阻…）（09-15）
    plain: (() => { const m = `${rawOf.tendency} ${rawOf.closing} ${rawOf.strategy} ${rawOf.caution}`.match(LORE) ?? `${rawOf.verdict} ${rawOf.tendency} ${rawOf.timing} ${rawOf.strategy} ${rawOf.caution} ${rawOf.next_step} ${rawOf.closing}`.match(BOOKISH); return m ? fail(`不够白话：${m[0]}`) : pass(); })(),
    length: (() => {
      // verdict/tendency/timing/closing are one-breath fields; basis/strategy/caution carry the weight
      const min: Record<string, number> = { verdict: 8, tendency: 8, timing: 8, closing: 8, next_step: 12, basis: 60, strategy: 16, caution: 16, signals: 20 };
      // basis is folded away at the end since 09-15 and may run longer; every other field is one breath
      const cap = (k: string) => (loc === "zh" || loc === "zh-hant" ? (k === "basis" ? 360 : 200) : loc === "ja" || loc === "ko" ? (k === "basis" ? 520 : 320) : k === "basis" ? 1800 : 1000);
      const bad = DEEP_KEYS.filter((k) => { const n = rawOf[k]!.trim().length; return n < (min[k] ?? 8) || n > cap(k); }).map((k) => `${k}(${rawOf[k]!.trim().length})`);
      return bad.length ? fail(`字数越界：${bad.join(",")}`) : pass();
    })(),
  };
  return { c, plan, r, secs, checks, chart };
}

/* ---------- 一念签 (reflective tier): no jargon anywhere, plain movement, honest dates ---------- */
const ONE_CASES: Case[] = [
  mk("一念签·当下午觉", "我现在能睡一个质量很好的午觉吗", [7, 8, 9, 8, 6, 7]),
  mk("一念签·跳槽", "我该不该接受这个跳槽的 offer", [7, 8, 9, 8, 7, 8]),
  mk("一念签·出国", "我妹夫准备出国去发展，这个事情能不能成？", [7, 9, 8, 7, 8, 8]),
];

async function runOne(c: Case) {
  const chart = resolveServerChart(c.input);
  // mirror generate.ts: the keyword rules read the question in Simplified (zh-hant cases would otherwise get another focal line)
  const plan = resolveTiming({ ...c.input, question: toHans(c.input.question) }, chart);
  const today = new Date(plan.today + "T12:00:00");
  const t0 = Date.now();
  let r: Reading;
  try {
    r = (await generateReading("one", c.input, false, c.locale ?? "zh")) as Reading;
  } catch (e) {
    return { label: c.label, secs: "-", checks: { generation: fail(`生成失败：${e instanceof Error ? e.message : String(e)}`) } as Record<string, Verdict>, sample: "" };
  }
  const secs = ((Date.now() - t0) / 1000).toFixed(0);
  const loc: Locale = c.locale ?? "zh";
  const rawOne = Object.fromEntries(ONE_KEYS.map((k) => [k, pick(r[k] as Bi, loc)])) as Record<string, string>;
  const all = Object.values(rawOne).join(" ");
  // 09-17: the light tier is the mirror — no dates, no hours, no "within N days", no steps
  const checks: Record<string, Verdict> = {
    jargon: (() => { const o = jargonOffense(rawOne, [], loc); return o ? fail(`术语泄漏 ${o}`) : pass(); })(),
    filler: FILLER.test(all) ? fail(`空话：${all.match(FILLER)![0]}`) : pass(),
    lazy: LAZY.test(rawOne.direction!) ? fail(`偷懒措辞：${rawOne.direction!.match(LAZY)![0]}`) : pass(),
    noDates: (() => {
      const o = dateTalkOffense(rawOne, ONE_KEYS);
      if (o) return fail(`轻解读给了时间：${o}`);
      const abs = absoluteDates(all, today);
      return abs.length ? fail(`轻解读出现日期 ${abs.length} 个`) : pass();
    })(),
    plain: (() => { const m = all.match(LORE) ?? all.match(BOOKISH); return m ? fail(`不够白话：${m[0]}`) : pass(); })(),
    noSteps: /(这周|這周|本周|七天内|七天內|这几天先|這幾天先|先去|马上去|馬上去|今天就|明天就)/.test(all) ? fail(`轻解读给了做法：${all.match(/(这周|這周|本周|七天内|七天內|这几天先|這幾天先|先去|马上去|馬上去|今天就|明天就)/)![0]}`) : pass(),
    shape: (() => {
      const extra = Object.keys(r).filter((k) => !(ONE_KEYS as string[]).includes(k));
      return extra.length ? fail(`多出字段：${extra.join(",")}`) : pass();
    })(),
    length: (() => {
      const bad = ONE_KEYS.filter((k) => { const n = rawOne[k]!.trim().length; return n < 16 || n > 120; });
      const total = all.replace(/\s/g, "").length;
      return bad.length ? fail(`字数越界：${bad.join(",")}`) : total > 520 ? fail(`总字数 ${total} 超过 520`) : pass();
    })(),
  };
  return { label: c.label, secs, checks, sample: rawOne.direction! };
}

/* ---------- 追问: plain answers that gloss any term; a new matter gets sent to a new cast ---------- */
const FOLLOWUPS: { label: string; base: Case; message: string; expectNewCast: boolean }[] = [
  { label: "追问·何时去谈", base: CASES[4]!, message: "那我应该什么时候去跟老板谈？", expectNewCast: false },
  { label: "追问·换了件事", base: CASES[4]!, message: "另外我妈最近身体不好，她会好起来吗？", expectNewCast: true },
];

const TERM_RE = /(旬空|空亡|月破|日冲|用神|世爻|应爻|回头克|回头生|化泄|进神|退神|伏吟|反吟|六冲|六合|妻财|官鬼|父母爻|兄弟爻|子孙爻)/g;
const NEW_CAST_RE = /一事一卦|另起一卦|新的卦|起一卦|再起一卦|新起一卦|重新起卦|new cast|cast again|its own cast/i;

async function runFollowup(f: (typeof FOLLOWUPS)[number]) {
  const chart = resolveServerChart(f.base.input);
  const timing = resolveTiming(f.base.input, chart);
  const t0 = Date.now();
  let reply: string;
  try {
    reply = await chatText([
      { role: "system", content: followupSystem("deep", "zh") },
      { role: "user", content: `CAST CONTEXT (facts, do not recalculate):\n${buildUserPayload(f.base.input.question, chart, timing)}` },
      { role: "assistant", content: "（已了解此卦，请提问。）" },
      { role: "user", content: f.message },
    ], { maxTokens: 900, temperature: 0.7 });
  } catch (e) {
    return { label: f.label, secs: "-", checks: { generation: fail(`生成失败：${e instanceof Error ? e.message : String(e)}`) } as Record<string, Verdict>, sample: "" };
  }
  const secs = ((Date.now() - t0) / 1000).toFixed(0);
  // every technical term must be glossed within a few characters (——, （, ：, 即, 也就是)
  const unglossed: string[] = [];
  for (const m of reply.matchAll(TERM_RE)) {
    const after = reply.slice(m.index! + m[0].length, m.index! + m[0].length + 14);
    if (!/[——（(：:，,]|即|也就是|就是|说明|意味/.test(after)) unglossed.push(m[0]);
  }
  const checks: Record<string, Verdict> = {
    answered: reply.trim().length >= 40 ? pass() : fail("回答过短"),
    length: reply.trim().length <= 320 ? pass() : fail(`回答过长 ${reply.trim().length} 字`),
    filler: FILLER.test(reply) ? fail(`空话：${reply.match(FILLER)![0]}`) : pass(),
    glossed: unglossed.length ? fail(`术语未随释：${[...new Set(unglossed)].join("、")}`) : pass(),
    newCast: f.expectNewCast === NEW_CAST_RE.test(reply) ? pass() : fail(f.expectNewCast ? "换了件事却没劝另起一卦" : "本卦追问却被劝另起一卦"),
    markdown: /^#|\*\*|```/.test(reply) ? fail("含 markdown") : pass(),
  };
  return { label: f.label, secs, checks, sample: reply.slice(0, 120) };
}

/* ---------- 同题合参 (09-10): two charts on one matter, written for one side ---------- */
const JOINT_CASES: { label: string; framing: string; topic: string; you: LineValue[]; other: LineValue[]; locale: Locale }[] = [
  // 一致：两盘都在动、都有回头之意（火天大有→离为火 / 山风蛊→山水蒙，09-10 线上第一对）
  { label: "合参·复合·一致", framing: "我们还能和好如初吗", topic: "relationship", you: [7, 9, 7, 7, 8, 7], other: [8, 7, 9, 8, 8, 7], locale: "zh" },
  // 分歧：一静一动，问合作（英文）
  { label: "joint·partnership·split", framing: "Should we build this company together", topic: "career", you: [8, 7, 7, 8, 7, 8], other: [9, 8, 8, 6, 7, 7], locale: "en" },
];
const CERTAIN = /一定|肯定|百分之百|100 ?%|definitely|certainly|guaranteed|絶対|반드시|sûrement|bestimmt|seguro que|com certeza/i;
const DATEISH = /\d{1,2}\s*月\s*\d{1,2}\s*日|\d{4}-\d{2}-\d{2}|\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}\b/;

async function runJoint(j: (typeof JOINT_CASES)[number]) {
  const you = resolveServerChart({ question: j.framing, values: j.you, castAtMs: now, tzOffsetMinutes: 480 });
  const other = resolveServerChart({ question: j.framing, values: j.other, castAtMs: now, tzOffsetMinutes: 480 });
  const t0 = Date.now();
  let r: Record<string, string>;
  try {
    r = (await generateJointFrom(you, other, j.framing, j.topic, j.locale)) as unknown as Record<string, string>;
  } catch (e) {
    return { label: j.label, secs: "-", checks: { generation: fail(`生成失败：${e instanceof Error ? e.message : String(e)}`) } as Record<string, Verdict>, sample: "" };
  }
  const secs = ((Date.now() - t0) / 1000).toFixed(0);
  const all = Object.values(r).join(" ");
  const zhish = j.locale === "zh" || j.locale === "zh-hant";
  const checks: Record<string, Verdict> = {
    jargon: (() => { const o = jargonOffense(r, [], j.locale); return o ? fail(`术语泄漏 ${o}`) : pass(); })(),
    filler: FILLER.test(all) ? fail(`空话：${all.match(FILLER)![0]}`) : pass(),
    certain: CERTAIN.test(all) ? fail(`绝对化：${all.match(CERTAIN)![0]}`) : pass(),
    nodates: DATEISH.test(all) ? fail(`合参里出现了日期：${all.match(DATEISH)![0]}`) : pass(),
    address: (zhish ? /你/.test(r.you!) && /对方|對方/.test(r.other!) : /\byou\b/i.test(r.you!) && /other side|\bthey\b|\bthem\b|\btheir\b/i.test(r.other!)) ? pass() : fail("称呼不对（你 / 对方）"),
    script: checkScript(all, j.locale),
    length: (() => {
      const bad = JOINT_KEYS.filter((k) => { const n = r[k]!.trim().length; return n < (zhish ? 15 : 30) || n > (zhish ? 260 : 700); });
      return bad.length ? fail(`字数越界：${bad.join(",")}`) : pass();
    })(),
  };
  return { label: j.label, secs, checks, sample: r.verdict! };
}

async function main() {
  const only = process.argv.find((a) => a.startsWith("--only="))?.slice(7);
  const cases = only ? CASES.filter((c) => c.label.includes(only)) : CASES;
  const CONC = 4;
  const results: Awaited<ReturnType<typeof runCase>>[] = [];
  const queue = [...cases];
  await Promise.all(Array.from({ length: CONC }, async () => {
    for (;;) { const c = queue.shift(); if (!c) return; results.push(await runCase(c)); }
  }));
  results.sort((a, b) => cases.indexOf(a.c) - cases.indexOf(b.c));

  let hard = 0;
  for (const x of results) {
    const line = Object.entries(x.checks).map(([k, v]) => `${v.ok ? "✓" : "✗"}${k}`).join(" ");
    const fails = Object.values(x.checks).filter((v) => !v.ok);
    hard += fails.length;
    const primary = `${x.chart.cast.primary.fullZh}${x.chart.cast.changed ? "→" + x.chart.cast.changed.fullZh : ""}`;
    console.log(`\n[${x.c.label}] ${primary} · scale=${x.plan.question_scale} · ${x.secs}s\n  ${line}`);
    console.log(`  timing: ${pick(x.r.timing as Bi, x.c.locale ?? "zh")}`);
    for (const f of fails) console.log(`  ! ${f.note}`);
  }
  // 一念签 + 追问
  // --only=合参 / --only=joint runs just the joint cases
  // --only=一念签 runs just the light-tier cases (09-17: the tier was cut back to a mirror)
  const extra = only ? (/合参|joint/i.test(only) ? await Promise.all(JOINT_CASES.map(runJoint)) : /一念|light|one/i.test(only) ? await Promise.all(ONE_CASES.map(runOne)) : []) : [
    ...(await Promise.all(ONE_CASES.map(runOne))),
    ...(await Promise.all(FOLLOWUPS.map(runFollowup))),
    ...(await Promise.all(JOINT_CASES.map(runJoint))),
  ];
  for (const x of extra) {
    const line = Object.entries(x.checks).map(([k, v]) => `${v.ok ? "✓" : "✗"}${k}`).join(" ");
    const fails = Object.values(x.checks).filter((v) => !v.ok);
    hard += fails.length;
    console.log(`\n[${x.label}] · ${x.secs}s\n  ${line}`);
    console.log(`  sample: ${x.sample}`);
    for (const f of fails) console.log(`  ! ${f.note}`);
  }

  console.log(`\n${results.length + extra.length} 卦例 · ${hard === 0 ? "全部通过" : `${hard} 项失败`}`);
  process.exit(hard === 0 ? 0 : 1);
}

void main();
