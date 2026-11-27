/**
 * 10-22 进度表 86 承接地圖 (设计稿《新首頁與產品結構》第 3 節): what each result page points to next — one main card and up to
 * two smaller ones, each with the sentence that says why (「卦說可以，挑哪天動手？」). The rules, from the design:
 *   - only a product that answers the OTHER half of the question; 問事 tools never send a reader to another 問事 tool for
 *     the same matter (no 六爻 → 塔羅, no 塔羅 → 求籤), except to 六爻 for the days;
 *   - 命盤 products are offered only when the reader already has a birth profile (zero typing), else left out;
 *   - an answer the reader still owes us (a revisit due) comes before any of this (components/CrossCards).
 * 合盤 and 年書 are not in the design's table; they follow its 看自己 rows (六爻 first, 擇日 next).
 * Written in 繁體; 简体 pages convert. Chinese pages only — elsewhere the 「也可以試試」 strip stays.
 */
export type CrossSource = "reading" | "reading_love" | "jieqian" | "tarot" | "bazi" | "ziwei" | "astro" | "hepan" | "nianshu" | "daily" | "zeri"
  // 10-29 进度表 122–125 (Neil: 「要做好产品之间的互相引导和配合」): the new pages get their own rows
  | "name" | "name_report" | "dream" | "taisui" | "zeri_wedding" | "zeri_move" | "zeri_opening"
  // 10-29 进度表 127 尋物 (Neil: 「直接上线吧，然后要做好产品线之间的相互关联」): the 尋物 page, and a 六爻 reading of a lost thing
  | "xunwu" | "reading_lost"
  // 11-05 进度表 136 本命卦
  | "bmg";
export interface CrossPick {
  /** a service id (lib/services.ts) */
  id: string;
  /** the sentence on the card */
  line: string;
  /** shown only when the reader has a birth profile on this device or account */
  needsProfile?: boolean;
  /** 10-29: a page inside the service rather than its front page (擇日 → 結婚好日子) */
  path?: string;
}

export const CROSS_MAP: Record<CrossSource, { main: CrossPick; more: CrossPick[] }> = {
  reading: {
    main: { id: "zeri", line: "卦說可以，挑哪天動手？" },
    more: [
      { id: "bazi", line: "這件事成不成看卦，你適不適合做看命。", needsProfile: true },
      { id: "yunshi", line: "今天適合做什麼，每天看一眼。" },
    ],
  },
  // 10-26 (Neil: 「把沒做的都做了」): a 六爻 reading of a love question (77 % of casts) points at 正緣畫像 first
  reading_love: {
    main: { id: "zhengyuan", line: "這段感情怎麼走看卦；容易和你走在一起的是哪一類人，看正緣畫像。" },
    more: [
      { id: "zeri", line: "卦說可以，挑哪天動手？" },
      { id: "bazi", line: "這件事成不成看卦，你適不適合做看命。", needsProfile: true },
    ],
  },
  jieqian: {
    main: { id: "cast", line: "籤給方向，卦給日子。" },
    more: [
      { id: "jiaobei", line: "擲一次，確認這個方向。" },
      { id: "today-qian", line: "每天一支，附日曆。" },
    ],
  },
  tarot: {
    main: { id: "cast", line: "牌不推日子；想知道哪幾天，起一卦。" },
    more: [
      { id: "zeri", line: "要挑一天動手，看擇日。" },
      { id: "hepan", line: "兩個人合不合，看合盤。", needsProfile: true },
    ],
  },
  bazi: {
    main: { id: "cast", line: "命盤看底子，一件事看卦。" },
    // 10-26 正緣畫像 sold on its own; 10-29 姓名學 (it reads a name against these same 喜用) takes the 擇日 card's place
    more: [{ id: "zhengyuan", line: "容易和你走在一起的是哪一類人，看正緣畫像。" }, { id: "name", line: "名字和你的喜用合不合，查一下姓名學。" }],
  },
  ziwei: {
    main: { id: "cast", line: "命盤看底子，一件事看卦。" },
    more: [{ id: "zeri", line: "這個月要辦的事，挑個好日子。" }],
  },
  astro: {
    main: { id: "bazi", line: "東西方各看一次底子。" },
    more: [{ id: "cast", line: "一件事接下來怎麼走，起一卦。" }],
  },
  hepan: {
    main: { id: "cast", line: "兩個人的底子看合盤；這件事接下來怎麼走，起一卦。" },
    more: [{ id: "zeri", path: "/zeri/wedding", line: "要一起辦婚事，看接下來三個月的結婚好日子。" }],
  },
  nianshu: {
    main: { id: "cast", line: "一整年看年書；眼前這件事，起一卦。" },
    more: [{ id: "taisui", line: "2027 犯不犯太歲，依習俗怎麼安太歲。" }, { id: "zeri", line: "年書標的月份裡要辦事，挑個好日子。" }],
  },
  daily: {
    main: { id: "cast", line: "今天心裡有一件事？起一卦。" },
    more: [{ id: "taisui", line: "2027 哪些生肖犯太歲，依習俗怎麼安。" }, { id: "zeri", line: "這件事挑哪天動手。" }],
  },
  zeri: {
    main: { id: "cast", line: "挑了日子，看這件事成不成。" },
    more: [{ id: "huangli", line: "看那天的宜忌、沖煞。" }],
  },
  // 10-29 进度表 122: 姓名學 — the 喜用 come from the 八字; the free query page and the paid report
  name: {
    main: { id: "bazi", line: "名字對照的喜用從八字來：排一次八字，看日主、強弱和喜用。" },
    more: [{ id: "cast", line: "心裡有件事放不下？起一卦，看接下來怎麼走。" }, { id: "zeri", line: "要辦的事（搬家、開市、結婚），挑個好日子。" }],
  },
  name_report: {
    main: { id: "bazi", line: "這份生辰的八字命盤：日主、喜用、大運都在這裡。" },
    more: [{ id: "zeri", line: "要辦的事（搬家、開市、結婚），挑個好日子。" }, { id: "cast", line: "心裡有件事放不下？起一卦，看接下來怎麼走。" }],
  },
  // 10-29 进度表 124: 解夢 — the page itself asks for the cast (skipMain there); then the everyday pages
  dream: {
    main: { id: "cast", line: "夢裡放不下的那件事，起一卦，看接下來哪幾天有動靜。" },
    more: [{ id: "today-qian", line: "每天一支籤，附日曆。" }, { id: "yunshi", line: "今天適合做什麼，每天看一眼。" }],
  },
  // 10-29 进度表 125: 犯太歲 — the year in full is the 年書 (it has a 太歲 chapter)
  taisui: {
    main: { id: "nianshu", line: "2027 一整年怎麼走，看年書：書裡有「太歲」一章，標出關鍵月份。" },
    more: [{ id: "yunshi", line: "每天的生肖運勢，看一眼。" }, { id: "zeri", line: "安太歲之外，要辦的事挑個好日子。" }],
  },
  // 10-29 进度表 123: 擇日 by use
  zeri_wedding: {
    main: { id: "hepan", line: "兩個人的底子和相處，看合盤。" },
    more: [{ id: "cast", line: "婚事接下來怎麼走，起一卦看。" }, { id: "huangli", line: "看那天的宜忌、沖煞。" }],
  },
  zeri_move: {
    main: { id: "cast", line: "搬過去之後順不順，起一卦看。" },
    more: [{ id: "huangli", line: "看那天的宜忌、沖煞。" }, { id: "nianshu", line: "新的一年怎麼走，看年書。" }],
  },
  zeri_opening: {
    main: { id: "cast", line: "開了之後生意怎麼走，起一卦看。" },
    more: [{ id: "nianshu", line: "一整年的起伏和關鍵月份，看年書。" }, { id: "huangli", line: "看那天的宜忌、沖煞。" }],
  },
  // 10-29 进度表 127: the dice give a direction; the cast gives the days and whether it was moved
  xunwu: {
    main: { id: "cast", line: "還想知道找不找得回、大概哪幾天、有沒有被移動？起一卦細看。" },
    more: [{ id: "today-qian", line: "每天一支籤，附日曆。" }, { id: "huangli", line: "看今天的宜忌、沖煞。" }],
  },
  // 11-05 进度表 136: knowing your own hexagram, the next step is a matter asked with it in view; the charts go deeper
  bmg: {
    main: { id: "cast", line: "你最近最放不下的是哪件事？帶著你的本命卦問一卦。" },
    more: [{ id: "bazi", line: "想從出生時間看自己，排一張八字。", needsProfile: true }, { id: "yunshi", line: "今天適合做什麼，每天看一眼。" }],
  },
  // a 六爻 reading of a lost thing: the other half is where to look and what to do now — the free 尋物 card has both
  reading_lost: {
    main: { id: "xunwu", line: "卦看找不找得回、哪幾天；往哪個方向、先找哪一類地方，擲三顆骰子免費看，證件、卡片、手機的掛失和定位步驟也在上面。" },
    more: [{ id: "today-qian", line: "每天一支籤，附日曆。" }, { id: "yunshi", line: "今天適合做什麼，每天看一眼。" }],
  },
};

/** the picks for a source, minus the page's own product (a 黃曆 page does not point at 黃曆) */
export function crossFor(source: CrossSource, exclude: string[] = []): { main: CrossPick | null; more: CrossPick[] } {
  const m = CROSS_MAP[source];
  const main = exclude.includes(m.main.id) ? null : m.main;
  const more = m.more.filter((p) => !exclude.includes(p.id) && !(p.id === main?.id && (p.path ?? "") === (main?.path ?? "")));
  // when the main card is the page's own product, the first of the rest steps up
  if (!main && more.length) return { main: more[0]!, more: more.slice(1) };
  return { main, more };
}
