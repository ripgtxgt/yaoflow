import { charInfo } from "./chars";
import { fiveGrids, numElement, type Grid } from "./analyze";

/**
 * 10-30 进度表 128 ⑥ (Neil 10-29: 姓名學→日本姓名判斷、韓國성명학；欧美不做) — the name pages for Japanese and Korean
 * readers, by the rules their own books use, with the same line the Chinese page keeps (Neil 10-29: 只講字義、讀音、筆劃和
 * 八字喜用): the numbers and their 五行, never the 81-number 吉凶 tables.
 *  · 日本の姓名判断: 五格（天格・人格・地格・外格・総格）, 熊崎式 counting — 旧字体の画数 (our 康熙筆劃: 氵 = 水 4, 艹 = 艸 6 …),
 *    霊数 1 for a one-character surname or given name; ひらがな・カタカナ by the usual kana stroke table (濁点 +2, 半濁点 +1).
 *    新字体 kanji are counted as their 旧字体 (沢 → 澤), from the table below.
 *  · 한국 성명학: 수리 4격 (원격·형격·이격·정격) from the 한자's 원획 (our 康熙筆劃), 획수 음양 (odd 양, even 음), and 발음오행
 *    from each syllable's 초성 (훈민정음 해례본: ㄱㅋ 木, ㄴㄷㄹㅌ 火, ㅇㅎ 土, ㅅㅈㅊ 金, ㅁㅂㅍ 水).
 */

/* ------------------------------------------------------------------ かなの画数 */
const KANA: Record<string, number> = {};
const put = (chars: string, counts: number[]) => [...chars].forEach((c, i) => { KANA[c] = counts[i]!; });
put("あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわゐゑをん",
  [3, 2, 2, 3, 4, 3, 4, 1, 3, 2, 3, 1, 3, 3, 3, 4, 3, 1, 2, 2, 5, 3, 4, 4, 1, 4, 2, 4, 1, 5, 4, 3, 4, 2, 3, 3, 3, 3, 3, 2, 2, 3, 2, 3, 3, 5, 4, 2]);
put("アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヰヱヲン",
  [2, 2, 3, 3, 3, 2, 3, 2, 3, 2, 3, 3, 2, 2, 2, 3, 3, 3, 3, 2, 2, 2, 2, 4, 1, 2, 2, 1, 1, 4, 2, 3, 2, 2, 3, 2, 2, 3, 2, 2, 2, 1, 3, 2, 4, 3, 3, 2]);
put("ぁぃぅぇぉっゃゅょゎァィゥェォッャュョヮ", [3, 2, 2, 3, 4, 1, 3, 3, 3, 3, 2, 2, 3, 3, 3, 3, 2, 2, 3, 2]);
KANA["ー"] = 1; KANA["ゝ"] = 1; KANA["ヽ"] = 1;
const DAKU = "がぎぐげござじずぜぞだぢづでどばびぶべぼガギグゲゴザジズゼゾダヂヅデドバビブベボヴ";
const HANDAKU = "ぱぴぷぺぽパピプペポ";
const BASE: Record<string, string> = {};
[..."がぎぐげござじずぜぞだぢづでどばびぶべぼ"].forEach((c, i) => { BASE[c] = "かきくけこさしすせそたちつてとはひふへほ"[i]!; });
[..."ガギグゲゴザジズゼゾダヂヅデドバビブベボ"].forEach((c, i) => { BASE[c] = "カキクケコサシスセソタチツテトハヒフヘホ"[i]!; });
[..."ぱぴぷぺぽ"].forEach((c, i) => { BASE[c] = "はひふへほ"[i]!; });
[..."パピプペポ"].forEach((c, i) => { BASE[c] = "ハヒフヘホ"[i]!; });
BASE["ヴ"] = "ウ";
export function kanaStrokes(c: string): number | null {
  if (KANA[c] != null) return KANA[c]!;
  if (DAKU.includes(c)) return (KANA[BASE[c]!] ?? 0) + 2;
  if (HANDAKU.includes(c)) return (KANA[BASE[c]!] ?? 0) + 1;
  return null;
}

/* ------------------------------------------------------------------ 新字体 → 旧字体（名前によく使う字） */
const SHIN_KYU: Record<string, string> = Object.fromEntries([
  "沢澤", "斉齊", "斎齋", "恵惠", "広廣", "栄榮", "浜濱", "桜櫻", "竜龍", "滝瀧", "辺邊", "邉邊", "髙高", "﨑崎", "嶋島", "徳德", "真眞", "実實", "学學",
  "国國", "円圓", "万萬", "与與", "条條", "来來", "亜亞", "悪惡", "圧壓", "囲圍", "医醫", "営營", "衛衞", "駅驛", "円圓", "塩鹽", "応應", "欧歐",
  "穏穩", "仮假", "価價", "画畫", "会會", "絵繪", "拡擴", "覚覺", "楽樂", "勧勸", "巻卷", "寛寬", "歓歡", "観觀", "関關", "気氣", "帰歸", "亀龜",
  "戯戲", "旧舊", "拠據", "挙擧", "峡峽", "狭狹", "暁曉", "区區", "駆驅", "勲勳", "径徑", "茎莖", "経經", "継繼", "軽輕", "芸藝", "鶏鷄", "倹儉",
  "剣劍", "険險", "圏圈", "検檢", "献獻", "権權", "顕顯", "験驗", "厳嚴", "広廣", "効效", "恒恆", "鉱鑛", "号號", "済濟", "砕碎", "剤劑", "雑雜",
  "参參", "桟棧", "蚕蠶", "惨慘", "賛贊", "残殘", "糸絲", "歯齒", "児兒", "辞辭", "湿濕", "写寫", "釈釋", "寿壽", "収收", "従從", "渋澁", "獣獸",
  "縦縱", "粛肅", "処處", "叙敍", "将將", "称稱", "渉涉", "焼燒", "証證", "奨奬", "乗乘", "浄淨", "剰剩", "状狀", "畳疊", "譲讓", "醸釀", "嘱囑",
  "触觸", "寝寢", "慎愼", "尽盡", "図圖", "粋粹", "酔醉", "穂穗", "随隨", "髄髓", "枢樞", "数數", "瀬瀨", "声聲", "静靜", "窃竊", "摂攝", "専專",
  "浅淺", "戦戰", "践踐", "銭錢", "潜潛", "繊纖", "禅禪", "双雙", "壮壯", "争爭", "荘莊", "捜搜", "挿插", "巣巢", "装裝", "総總", "騒騷", "増增",
  "蔵藏", "臓臟", "属屬", "続續", "堕墮", "対對", "体體", "帯帶", "滞滯", "台臺", "単單", "胆膽", "団團", "弾彈", "断斷", "遅遲", "痴癡", "昼晝",
  "虫蟲", "鋳鑄", "庁廳", "聴聽", "鎮鎭", "逓遞", "鉄鐵", "点點", "転轉", "伝傳", "灯燈", "当當", "党黨", "盗盜", "稲稻", "闘鬪", "独獨", "読讀",
  "届屆", "弐貳", "悩惱", "脳腦", "覇霸", "廃廢", "売賣", "麦麥", "発發", "髪髮", "抜拔", "蛮蠻", "秘祕", "浜濱", "瓶甁", "払拂", "仏佛", "併倂",
  "並竝", "変變", "弁辯", "歩步", "宝寶", "豊豐", "褒襃", "翻飜", "毎每", "満滿", "黙默", "訳譯", "薬藥", "予豫", "余餘", "揺搖", "様樣", "謡謠",
  "来來", "頼賴", "乱亂", "覧覽", "竜龍", "隆隆", "両兩", "猟獵", "緑綠", "塁壘", "涙淚", "励勵", "礼禮", "霊靈", "齢齡", "恋戀", "炉爐", "労勞",
  "郎郞", "楼樓", "録錄", "湾灣", "晃晃", "郷鄕", "響響", "器器", "類類", "黒黑", "穀穀", "祥祥", "神神", "福福", "祐祐", "禎禎", "都都", "朗朗",
  "隣鄰", "芦蘆", "蛍螢", "桧檜", "槙槇", "篭籠", "穣穰", "壌壤", "嬢孃", "譲讓", "鴎鷗", "曽曾", "尭堯", "槇槇", "凛凜", "渓溪", "弥彌", "遥遙",
].map((p) => [...p] as [string, string]).filter(([a, b]) => a !== b));
export const kyuji = (c: string) => SHIN_KYU[c] ?? c;

export type JaChar = { c: string; kyu: string | null; strokes: number | null; kana: boolean };
/** one character: its 画数 as 姓名判断 counts it (旧字体; kana by the table); null when we do not have it */
export function jaChar(c: string): JaChar {
  const k = kanaStrokes(c);
  if (k != null) return { c, kyu: null, strokes: k, kana: true };
  const ky = kyuji(c);
  const info = charInfo(ky) ?? charInfo(c);
  return { c, kyu: ky !== c ? ky : null, strokes: info?.k ?? null, kana: false };
}

export interface JaReading { sur: JaChar[]; giv: JaChar[]; missing: string[]; grid: Grid | null; el: Record<keyof Grid, string> | null }
export function jaName(surname: string, given: string): JaReading {
  // 々 repeats the character before it, and is counted as that character
  const chars = (s: string) => { const a = [...s.replace(/\s+/g, "")]; return a.map((c, i) => (c === "々" && i > 0 ? { ...jaChar(a[i - 1]!), c } : jaChar(c))); };
  const sur = chars(surname), giv = chars(given);
  const missing = [...sur, ...giv].filter((x) => x.strokes == null).map((x) => x.c);
  if (missing.length || !sur.length || !giv.length) return { sur, giv, missing, grid: null, el: null };
  const grid = fiveGrids(sur.map((x) => x.strokes!), giv.map((x) => x.strokes!));
  const el = { tian: numElement(grid.tian), ren: numElement(grid.ren), di: numElement(grid.di), wai: numElement(grid.wai), zong: numElement(grid.zong) };
  return { sur, giv, missing, grid, el };
}

/* ------------------------------------------------------------------ 한국 성명학 */

const CHO = ["ㄱ", "ㄲ", "ㄴ", "ㄷ", "ㄸ", "ㄹ", "ㅁ", "ㅂ", "ㅃ", "ㅅ", "ㅆ", "ㅇ", "ㅈ", "ㅉ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ"];
const CHO_EL: Record<string, string> = { ㄱ: "木", ㄲ: "木", ㅋ: "木", ㄴ: "火", ㄷ: "火", ㄸ: "火", ㄹ: "火", ㅌ: "火", ㅇ: "土", ㅎ: "土", ㅅ: "金", ㅆ: "金", ㅈ: "金", ㅉ: "金", ㅊ: "金", ㅁ: "水", ㅂ: "水", ㅃ: "水", ㅍ: "水" };
export const choseong = (syl: string): string | null => {
  const code = syl.charCodeAt(0) - 0xac00;
  if (code < 0 || code > 11171) return null;
  return CHO[Math.floor(code / 588)] ?? null;
};
export const soundElement = (syl: string): string | null => { const c = choseong(syl); return c ? CHO_EL[c] ?? null : null; };

export interface KoGrid { won: number; hyeong: number; i: number; jeong: number }
/** 수리 4격: 원격 = 이름 획수 합, 형격 = 성 + 이름 첫 글자, 이격 = 성 + 이름 끝 글자 (외자 이름이면 성), 정격 = 전체 */
export function koGrid(sur: number[], giv: number[]): KoGrid {
  const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
  const s = sum(sur);
  return { won: sum(giv), hyeong: s + giv[0]!, i: giv.length > 1 ? s + giv[giv.length - 1]! : s, jeong: s + sum(giv) };
}
export interface KoReading {
  hangul: { syl: string; cho: string | null; el: string | null }[];
  hanja: { c: string; strokes: number | null }[] | null;
  missing: string[];
  grid: KoGrid | null;
  gridEl: Record<keyof KoGrid, string> | null;
  /** 획수 음양: 양 for odd, 음 for even, per character */
  yinyang: ("양" | "음")[] | null;
}
export function koName(surname: string, given: string, surHanja: string, givHanja: string): KoReading {
  const hs = [...(surname + given).replace(/\s+/g, "")];
  const hangul = hs.map((syl) => ({ syl, cho: choseong(syl), el: soundElement(syl) }));
  const sh = [...surHanja.replace(/\s+/g, "")], gh = [...givHanja.replace(/\s+/g, "")];
  if (!sh.length || !gh.length) return { hangul, hanja: null, missing: [], grid: null, gridEl: null, yinyang: null };
  const hanja = [...sh, ...gh].map((c) => ({ c, strokes: charInfo(c)?.k ?? null }));
  const missing = hanja.filter((x) => x.strokes == null).map((x) => x.c);
  if (missing.length) return { hangul, hanja, missing, grid: null, gridEl: null, yinyang: null };
  const grid = koGrid(sh.map((c) => charInfo(c)!.k), gh.map((c) => charInfo(c)!.k));
  const gridEl = { won: numElement(grid.won), hyeong: numElement(grid.hyeong), i: numElement(grid.i), jeong: numElement(grid.jeong) };
  return { hangul, hanja, missing, grid, gridEl, yinyang: hanja.map((x) => (x.strokes! % 2 ? "양" : "음")) };
}

export { relation } from "./rel";
