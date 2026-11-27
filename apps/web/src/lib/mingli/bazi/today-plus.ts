import { branchRels } from "./report-facts";
import { myToday, type MyChart, type MyToday, type Rel } from "./today";

/**
 * 10-26 (Neil: 每日信「全部做吧」) — seven more things the member's own 八字 says about today, by fixed rules (no model call):
 *   1. 宜／忌 — from the day's 十神 for their 日主, plus the day's 地支 against their 日支 (合 adds a 宜, 沖／刑／害 a 忌)
 *   2. 顏色・方位・數字 — from their first 喜用 element (the chart page's 喜用 table) — everyday habits, never something to buy
 *   3. 比較順的時段 — the two daytime 時辰 whose 地支 六合 or 三合 their 日支, or are of a 喜用 element; never one that 沖 it
 *   4. 桃花日 — today's 地支 is the 桃花 of their 年支 or 日支 (申子辰→酉, 寅午戌→卯, 巳酉丑→午, 亥卯未→子)
 *   5. 你們倆 — with a 生辰檔案 marked 伴侶: today's 地支 against both 日支
 *   6. 七天 — the next seven days' levels (the same rule as 「你的今天」), the best and the slowest named
 *   7. 沖日預告 — the first of the next three days whose 地支 沖 their 日支
 * Every line is a tendency and what to do with it — never a verdict. Traditional; Simplified pages convert.
 */
export interface DayPlus {
  yi: string[]; ji: string[];
  habits: string | null;
  hours: string | null;
  peach: string | null;
  pair: string | null;
  week: { ymd: string; md: string; level: number; word: string }[];
  weekLine: string | null;
  clashAhead: string | null;
}

const TEN_YI: Record<string, [string[], string[]]> = {
  比肩: [["自己動手做完一件事", "和朋友一起做事"], ["替人擔保"]],
  劫財: [["運動流汗", "和同輩聚一聚"], ["借錢給人", "衝動消費"]],
  食神: [["表達想法", "創作", "吃頓好的"], ["熬夜"]],
  傷官: [["寫東西", "提新點子"], ["和上司爭論"]],
  正財: [["整理帳目", "談價錢", "做實事"], ["冒險投入"]],
  偏財: [["認識新朋友", "出門走走"], ["衝動購物"]],
  正官: [["處理正式的事", "遞交文件", "守約"], ["遲到失約"]],
  七殺: [["專心做一件事", "運動"], ["同時開太多頭"]],
  正印: [["學習", "請教前輩", "休息"], ["硬撐"]],
  偏印: [["獨處", "研究", "整理"], ["應酬太多"]],
};
const REL_YI: Partial<Record<Rel, string>> = { 合: "約見、談合作" };
const REL_JI: Partial<Record<Rel, string>> = { 冲: "搬家、簽約、做大決定", 刑: "和人爭執", 害: "只聽一面之詞" };

const HABIT: Record<string, { colours: string; direction: string; numbers: string }> = {
  木: { colours: "綠色、青色", direction: "東邊", numbers: "3、8" },
  火: { colours: "紅色、紫色", direction: "南邊", numbers: "2、7" },
  土: { colours: "黃色、咖啡色", direction: "離家近的地方", numbers: "5、0" },
  金: { colours: "白色、金色", direction: "西邊", numbers: "4、9" },
  水: { colours: "黑色、藍色", direction: "北邊", numbers: "1、6" },
};

const BRANCHES = "子丑寅卯辰巳午未申酉戌亥";
const BR_EL: Record<string, string> = { 寅: "木", 卯: "木", 巳: "火", 午: "火", 辰: "土", 戌: "土", 丑: "土", 未: "土", 申: "金", 酉: "金", 亥: "水", 子: "水" };
const SANHE = ["申子辰", "亥卯未", "寅午戌", "巳酉丑"];
/** the 時辰 a waking day has: 卯 (5–7) to 亥 (21–23) */
const HOUR_LABEL: Record<string, string> = {
  卯: "早上 5–7 點", 辰: "早上 7–9 點", 巳: "上午 9–11 點", 午: "中午 11–1 點", 未: "下午 1–3 點", 申: "下午 3–5 點",
  酉: "傍晚 5–7 點", 戌: "晚上 7–9 點", 亥: "晚上 9–11 點",
};
const PEACH: Record<string, string> = { 申: "酉", 子: "酉", 辰: "酉", 寅: "卯", 午: "卯", 戌: "卯", 巳: "午", 酉: "午", 丑: "午", 亥: "子", 卯: "子", 未: "子" };
const WEEKDAY = ["週日", "週一", "週二", "週三", "週四", "週五", "週六"];
const SHORT: Record<number, string> = { 5: "順", 4: "偏順", 3: "平穩", 2: "放慢", 1: "最慢" };

export function addDays(ymd: string, n: number): string {
  const [y, m, d] = ymd.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}
const md = (ymd: string) => `${Number(ymd.slice(5, 7))}/${Number(ymd.slice(8, 10))}`;
const weekday = (ymd: string) => WEEKDAY[new Date(`${ymd}T00:00:00Z`).getUTCDay()]!;

/** 1. 宜／忌 */
export function yiJi(t: Pick<MyToday, "ten" | "rels">): { yi: string[]; ji: string[] } {
  const [y, j] = TEN_YI[t.ten] ?? [["照自己的步調"], []];
  const yi = [...y], ji = [...j];
  for (const r of t.rels) { if (REL_YI[r]) yi.unshift(REL_YI[r]!); if (REL_JI[r]) ji.unshift(REL_JI[r]!); }
  return { yi: [...new Set(yi)].slice(0, 3), ji: [...new Set(ji)].slice(0, 3) };
}

/** 3. the two best waking 時辰 for this 日支 */
export function goodHours(c: Pick<MyChart, "dayBranch" | "favour" | "avoid">): string[] {
  const scored = Object.keys(HOUR_LABEL).map((b) => {
    const rels = branchRels(b, c.dayBranch) as Rel[];
    if (rels.includes("冲")) return { b, s: -9 };
    let s = 0;
    if (rels.includes("合")) s += 2;
    if (b !== c.dayBranch && SANHE.some((g) => g.includes(b) && g.includes(c.dayBranch))) s += 1.5;
    if (c.favour.includes(BR_EL[b]!)) s += 1; else if (c.avoid.includes(BR_EL[b]!)) s -= 1;
    if (rels.includes("刑") || rels.includes("害")) s -= 1;
    return { b, s };
  }).filter((x) => x.s >= 1.5).sort((a, z) => z.s - a.s).slice(0, 2);
  return scored.sort((a, z) => BRANCHES.indexOf(a.b) - BRANCHES.indexOf(z.b)).map((x) => `${HOUR_LABEL[x.b]}（${x.b}時）`);
}

/** 4. is today's 地支 the 桃花 of their 年支 or 日支? */
export function isPeachDay(c: Pick<MyChart, "dayBranch" | "yearBranch">, dayGz: string): boolean {
  const b = dayGz[1]!;
  return PEACH[c.dayBranch] === b || (!!c.yearBranch && PEACH[c.yearBranch] === b);
}

/** 5. 你們倆: today's 地支 against both 日支 */
export function pairLine(mine: Pick<MyChart, "dayBranch">, theirs: Pick<MyChart, "dayBranch">, dayGz: string): string {
  const b = dayGz[1]!;
  const a = branchRels(b, mine.dayBranch) as Rel[], t = branchRels(b, theirs.dayBranch) as Rel[];
  const inner = branchRels(mine.dayBranch, theirs.dayBranch) as Rel[];
  if (a.includes("冲") || t.includes("冲")) return "今天你們之中有一個人容易心浮氣躁：說話放軟一點，重要的事改天再談。";
  if (a.includes("合") && t.includes("合")) return "今天兩個人都比較順：適合好好聊、一起安排接下來的事。";
  if (a.includes("合") || t.includes("合")) return "今天有一方比較容易打開心：想說的話，今天說比較聽得進去。";
  if (a.includes("刑") || t.includes("刑") || a.includes("害") || t.includes("害")) return "今天小事容易卡住：多確認一次對方的意思，別急著下結論。";
  if (inner.includes("合")) return "今天平平的，你們本來就合得來：一起做點日常的小事就好。";
  return "今天平平的：照你們平常的節奏，留一點時間給對方。";
}

/** all seven, for a member's chart and today (Taipei date) */
export function dayPlus(c: MyChart, ymd: string, partner: MyChart | null = null): DayPlus | null {
  const t = myToday(c, ymd);
  if (!t) return null;
  const { yi, ji } = yiJi(t);
  const h = c.favour[0] ? HABIT[c.favour[0]] : null;
  const habits = h ? `今天可以多穿一點${h.colours}；出門可以往${h.direction}走走；數字 ${h.numbers}。` : null;
  const hrs = goodHours(c);
  const hours = hrs.length ? `今天比較順的時段：${hrs.join("、")}。適合談事、約人、處理要緊的事。` : null;
  const peach = isPeachDay(c, t.dayGz) ? "今天落在你的桃花上：適合約人、表達心意，想說的話可以說出口。" : null;
  const pair = partner ? pairLine(c, partner, t.dayGz) : null;
  const week: DayPlus["week"] = [];
  for (let i = 0; i < 7; i++) {
    const d = addDays(ymd, i), x = i === 0 ? t : myToday(c, d);
    // a day whose 地支 沖 their 日支 says so (the 沖日預告 names the same day), whatever its level
    if (x) week.push({ ymd: d, md: `${md(d)} ${weekday(d)}`, level: x.rels.includes("冲") ? Math.min(x.level, 2) : x.level, word: x.rels.includes("冲") ? "逢沖" : SHORT[x.level]! });
  }
  let weekLine: string | null = null;
  if (week.length === 7) {
    const best = week.reduce((a, z) => (z.level > a.level ? z : a)), low = week.reduce((a, z) => (z.level < a.level ? z : a));
    weekLine = best.level === low.level ? "這七天都差不多，照平常的步調。" : `這七天最順的是 ${best.md}，最該放慢的是 ${low.md}。要挑日子辦事，可以先看擇日。`;
  }
  let clashAhead: string | null = null;
  for (let i = 1; i <= 3; i++) {
    const d = addDays(ymd, i), x = myToday(c, d);
    if (x?.rels.includes("冲")) {
      const when = i === 1 ? "明天" : i === 2 ? "後天" : "大後天";
      clashAhead = `${when}（${md(d)}）的日支沖你的日支：搬家、簽約這類事可以避開那天。`;
      break;
    }
  }
  return { yi, ji, habits, hours, peach, pair, week, weekLine, clashAhead };
}
