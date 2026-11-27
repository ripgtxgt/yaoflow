import { BAZI_NAMES, branchIndex } from "@/lib/mingli/bazi/names";

/**
 * 10-30 进度表 128 ④-5 (Neil 10-29: 換成當地的玩法) — the 年書's chapter on the year's folk custom, by market. The Chinese
 * pages keep 太歲 (lib/mingli/taisui.ts); a Japanese reader gets 厄年 (by 数え年 and gender, as shrines and temples list
 * them), a Korean reader 삼재 (by the 띠 — the year branch — in its three-year turn); other languages have no such
 * custom and no chapter. Fixed text, written in the two languages directly; a custom and a reference, never a forecast,
 * never a ritual to buy.
 */

/* ------------------------------------------------------------------ 厄年 (Japanese) */

/** 本厄 by 数え年 (the most common list: men 25 · 42 · 61, women 19 · 33 · 37 · 61; 大厄 men 42, women 33) */
const HONYAKU: Record<"male" | "female", number[]> = { male: [25, 42, 61], female: [19, 33, 37, 61] };
const TAIYAKU: Record<"male" | "female", number> = { male: 42, female: 33 };
export interface Yaku { kind: "maeyaku" | "honyaku" | "atoyaku"; honAge: number; big: boolean }
/** where 数え年 `age` falls among the 厄年, or null */
export function yakudoshi(age: number, gender: "male" | "female"): Yaku | null {
  for (const h of HONYAKU[gender]) {
    const big = h === TAIYAKU[gender];
    if (age === h - 1) return { kind: "maeyaku", honAge: h, big };
    if (age === h) return { kind: "honyaku", honAge: h, big };
    if (age === h + 1) return { kind: "atoyaku", honAge: h, big };
  }
  return null;
}
const YAKU_WORD: Record<Yaku["kind"], string> = { maeyaku: "前厄", honyaku: "本厄", atoyaku: "後厄" };

/** the Japanese chapter: title and paragraphs */
export function yakuChapter(year: number, kazoe: number, gender: "male" | "female"): { title: string; paras: string[]; note: string } {
  const y = yakudoshi(kazoe, gender);
  const who = gender === "male" ? "男性" : "女性";
  const first = y
    ? `${year}年、あなたは数え年${kazoe}歳。${who}の${y.honAge}歳を本厄とする厄年の「${YAKU_WORD[y.kind]}」にあたります。${y.big ? `${who}の${y.honAge}歳は「大厄」とされ、昔からとりわけ大切に過ごす年とされてきました。` : ""}`
    : `${year}年、あなたは数え年${kazoe}歳。厄年（前厄・本厄・後厄）にはあたりません。`;
  return {
    title: "厄年",
    paras: [
      first,
      "厄年は、人生の節目にあたる年を慎重に過ごそうという日本の習わしです。本厄の前後一年を前厄・後厄として、三年続けて気をつける考え方が広く知られています。神社やお寺で厄払い（厄除け）を受ける人も多く、時期は元日から節分のころまでが一般的です。年齢の数え方や対象の年は、神社やお寺によって少し異なることがあります。",
    ],
    note: "これは習わしとしての参考です。この一年のリズムは、上の四季の流れと月ごとの読みで詳しく見ています。",
  };
}

/* ------------------------------------------------------------------ 삼재 (Korean) */

/** the three 삼재 years of each 띠 group: 申子辰 → 寅卯辰, 亥卯未 → 巳午未, 寅午戌 → 申酉戌, 巳酉丑 → 亥子丑 */
const SAMJAE: [string, string][] = [["申子辰", "寅卯辰"], ["亥卯未", "巳午未"], ["寅午戌", "申酉戌"], ["巳酉丑", "亥子丑"]];
export interface Samjae { step: 0 | 1 | 2; years: string }
/** where a year (its branch) falls in the 삼재 of someone born in a year of `birthBranch`, or null */
export function samjae(birthBranch: string, yearBranch: string): Samjae | null {
  const g = SAMJAE.find(([who]) => who.includes(birthBranch));
  if (!g) return null;
  const i = g[1].indexOf(yearBranch);
  return i >= 0 ? { step: i as 0 | 1 | 2, years: g[1] } : null;
}
/** the next year (from `year`, inclusive) whose branch begins this 띠's 삼재 */
export function nextSamjae(birthBranch: string, year: number): number | null {
  const g = SAMJAE.find(([who]) => who.includes(birthBranch));
  if (!g) return null;
  const start = g[1][0]!;
  for (let y = year; y < year + 12; y++) if ("申酉戌亥子丑寅卯辰巳午未"[y % 12] === start) return y;
  return null;
}
const STEP_WORD = ["들삼재", "눌삼재", "날삼재"] as const;

/** the Korean chapter: title and paragraphs (`birthBranch` = the year pillar's branch, by 입춘) */
export function samjaeChapter(year: number, birthBranch: string, yearBranch: string): { title: string; paras: string[]; note: string } {
  const animal = BAZI_NAMES.ko.animals[branchIndex(birthBranch)] ?? "";
  const s = samjae(birthBranch, yearBranch);
  const next = s ? null : nextSamjae(birthBranch, year);
  const first = s
    ? `${year}년은 ${animal}띠에게 삼재 가운데 ${STEP_WORD[s.step]}에 해당하는 해입니다. ${s.step === 0 ? "삼재가 시작되는 첫해입니다." : s.step === 1 ? "삼재의 가운데 해입니다." : "삼재가 마무리되는 마지막 해입니다."}`
    : `${year}년은 ${animal}띠에게 삼재에 해당하지 않는 해입니다.${next ? ` ${animal}띠의 다음 삼재는 ${next}년부터 ${next + 2}년까지입니다.` : ""}`;
  return {
    title: "삼재",
    paras: [
      first,
      "삼재는 띠를 기준으로 9년마다 3년씩 돌아온다고 여겨 온 풍습입니다. 첫해를 들삼재, 둘째 해를 눌삼재, 셋째 해를 날삼재라고 부르며, 예로부터 이 시기에는 큰일을 서두르기보다 몸과 마음을 살피며 차분하게 지내라는 뜻으로 받아들여 왔습니다. 해가 바뀌는 기준은 음력 설이나 입춘으로 보는 경우가 많습니다.",
    ],
    note: "이는 풍습으로서의 참고입니다. 이 한 해의 흐름은 위의 계절별 흐름과 달별 풀이에서 자세히 다룹니다.",
  };
}

/* ------------------------------------------------------------------ by market */

/** the chapter for a page language, or null (no such custom outside Chinese, Japanese and Korean) */
export function localCustom(l: string, i: { year: number; kazoe: number | null; gender: "male" | "female"; birthBranch: string; yearBranch: string }): { title: string; paras: string[]; note: string } | null {
  if (l === "ja" && i.kazoe && i.kazoe > 0) return yakuChapter(i.year, i.kazoe, i.gender);
  if (l === "ko" && i.birthBranch && i.yearBranch) return samjaeChapter(i.year, i.birthBranch, i.yearBranch);
  return null;
}
/** the product page's line for that chapter, or null */
export function localCustomLine(l: string): string | null {
  if (l === "ja") return "厄年：この一年が数え年で厄年（前厄・本厄・後厄）にあたるかどうかと、その習わし";
  if (l === "ko") return "삼재: 이 한 해가 내 띠의 삼재(들삼재·눌삼재·날삼재)에 해당하는지와 그 풍습";
  return null;
}
