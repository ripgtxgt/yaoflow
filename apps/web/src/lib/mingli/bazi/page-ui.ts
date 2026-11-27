import { loc } from "@/lib/mingli/calendar/content";
import type { HlLocale } from "@/lib/mingli/calendar/day";
import GEN from "@/data/l10n/bazi.json";
import { fmt, isForeign, type Foreign, type Generated } from "@/lib/l10n/core";
import { localize } from "@/lib/l10n/server";
import { ZY_UI } from "@/lib/mingli/zhengyuan-ui";
import { BAZI_NAMES } from "./names";

/** 10-18 进度表 72: words on the 八字 chart page, in the reader's script */
const UI: Record<string, string> = {
  noProfile: "還沒有生辰資料。", toForm: "先填生辰 →", bad: "這份生辰資料有問題。", solar: "國曆", lunar: "農曆", leap: "閏月",
  tsOn: "真太陽時 {t}（點一下關掉）", tsOff: "真太陽時：關（點一下打開）", ziNext: "子時：23:00 換日", ziSame: "子時：晚子時不換日", lichun: "年柱以立春換年",
  dst: "出生那段時間當地實施夏令時間，已換回平常的時間（扣掉夏令的一小時）。",
  near: "出生時間接近時辰交界，可以切換看看另一個時辰的盤：", alt: "正在看另一個時辰的盤。", back: "回到原本的時間",
  branchNames: "子時,丑時,寅時,卯時,辰時,巳時,午時,未時,申時,酉時,戌時,亥時",
  dm: "日主", threePillars: "沒有出生時辰，排的是三柱（年、月、日）。", strengthLine: "日主{dm}，{lv}",
  basis: "強弱怎麼看", deLing: "得令（月令幫不幫日主）", deDi: "得地（地支裡的支持）", deShi: "得勢（天干裡的支持）", yes: "有", no: "沒有", more: "較多", less: "較少",
  dayun: "大運", qiyun: "出生後 {y} 年 {m} 個月 {d} 天起運", noonNote: "（沒有時辰，以當天中午估算）", liunian: "流年", liuyue: "流月",
  jiaoyun: "{t}（{at}）", siling: "人元司令 {s}", shensha: "神煞", xiaoyun: "小運", relWhole: "原局整柱", tab_info: "基本信息", tab_pro: "專業細盤", i_zodiac: "生肖", i_lunar: "農曆", i_solar: "國曆", i_ts: "真太陽時", i_place: "出生地區", i_siling: "人元司令分野", silingV: "{s}用事", i_term: "出生節氣", termV: "出生於{a}後{ad}天{ah}小時，{b}前{bd}天{bh}小時", i_con: "星座", i_xiu: "星宿", i_fetal: "胎元", i_breath: "胎息", i_own: "命宮", i_body: "身宮", i_gua: "命卦", guaV: "{g}卦（{e}）", east: "東四命", west: "西四命", yinW: "陰", yangW: "陽", male: "男", female: "女", extra: "胎元 {f} · 命宮 {o} · 身宮 {b}", age: "{a}歲", date: "日期", mainStar: "主星", stem: "天干", branch: "地支", hidden: "藏干",
  terrain: "星運", self: "自坐", kong: "空亡", nayin: "納音", dmMale: "元男", dmFemale: "元女", relStem: "原局天干", relBranch: "原局地支",
  relFortune: "{y} 年歲運", none: "無", lunarLine: "農曆 {l}", qian: "乾造", kun: "坤造",
 gejuHead: "格局", gejuShown: "月令{b}，{s}透出天干", gejuHidden: "月令{b}，{s}藏在地支裡沒有透出",
  geju_正官: "做事講規矩、重名聲，適合在組織裡一步一步往上走。", geju_七杀: "有魄力、扛得住壓力，越有挑戰越能發揮。",
  geju_正财: "務實、重安穩，錢和時間都算得清楚。", geju_偏财: "眼光活、人緣廣，機會常常從人脈裡來。",
  geju_食神: "溫和有才，懂得享受生活，也擅長把喜歡的事做成作品。", geju_伤官: "聰明、表達力強，不愛照舊規矩，適合靠專業和創意立足。",
  geju_正印: "重學習、有涵養，身邊常有願意照顧你的人。", geju_偏印: "想法獨到，對冷門或專門的領域特別有感覺。",
  geju_比肩: "靠自己起家，獨立、肯做，不太依賴別人。", geju_劫财: "意志強、行動快，遇到事會先頂上去。",
  energyHead: "五行能量", tenHead: "十神分布", grp_印: "印星", grp_比劫: "比劫", grp_食伤: "食傷", grp_财: "財星", grp_官杀: "官殺",
  supportHead: "身強身弱", help: "助身", drain: "耗身", helpNote: "助身＝印星、比劫和日主自己；耗身＝食傷、財星、官殺。",
  "lv_偏強": "日主力量足，根基穩，適合把力氣往外用：做事、輸出、承擔。", "lv_稍強": "日主有底氣，能扛事，留意別什麼都自己來。",
  "lv_中和": "幫你和耗你的力量差不多，節奏比較平衡。", "lv_稍弱": "日主需要一點支持，借力、找同伴會比較省力。",
  "lv_偏弱": "外在的牽動多，先照顧好自己的狀態，再往外衝。",
  xijiHead: "喜用方向", xijiNone: "五行分布比較平均，沒有特別需要補的方向。", jiLine: "已經偏多、可以少用的：{e}",
  el_木: "綠色、青色 · 東方 · 3、8", el_火: "紅色、紫色 · 南方 · 2、7", el_土: "黃色、咖啡色 · 中央 · 5、0", el_金: "白色、金色 · 西方 · 4、9", el_水: "黑色、藍色 · 北方 · 1、6",
  ssHead: "盤裡的神煞", ss_noble: "貴人相助", ss_talent: "聰明才華", ss_charm: "人緣桃花", ss_wealth: "財祿衣食", ss_move: "走動擔當",
  relHead: "四柱關係", insightHead: "看懂這張盤",
  askHead: "你可能想問",
  repHead: "完整報告", repDeepTag: "通卡／會員", repYearTag: "單次購買", repDeep: "深度八字報告",
  repDeepLine: "本命九章：格局與五行、性格的兩面、天賦與事業、財富、感情、人際家庭、身心節奏、喜用的日常用法、行動指南；會員另有「一生大運」「現在這步運與今年」兩章，每月按當下的流月重寫。",
  repLove: "正緣畫像", repLoveTag: "單買・會員 8 折", repLoveBuy: "看正緣畫像", repLoveTa: "想看的 TA", repLoveOther: "異性", repLoveSame: "同性", repLoveLine: "從配偶星和夫妻宮，畫出容易和你走在一起的那類人：氣質、相處節奏、可能在哪裡遇見。",
  repYear: "{y} {gz}年 流年報告", repYearLine: "今年的年書：全年總判、三個關鍵月、十二個月逐月宜忌、六大領域、貴人與合作、季度行動清單，可附上你最想問的一件事。", repNextLine: "明年提前看：全年總判、三個關鍵月、十二個月逐月宜忌、六大領域、貴人與合作、季度行動清單，可附上你最想問的一件事。",
  repAsk: "今年最想問的一件事（選填）", repAskHint: "例如：今年適合換工作嗎？（200 字以內，會寫成報告的最後一章）",
  repOpen: "打開報告", repMember: "加入會員就能看", repTongka: "通卡或會員都能看", repRewrite: "會員：按這個月的流月重寫一份", repRewriteNext: "下次可重寫：國曆 {d}", repTongkaLead: "一張通卡，期內本命報告和全站付費解讀都能看；大運與今年兩章會員可看。", repLogin: "登入後查看", repBuy: "購買 {p}", repWriting: "正在打開…", repGoing: "前往付款…", repTest: "測試帳號：免費打開",
  repError: "暫時沒辦法打開，請稍後再試。", cardLead: "把命盤做成一張圖，分享給朋友（只有八個字，不含名字和生日）", cardText: "我的八字長這樣，你的呢？",
  asks: "我適合做什麼樣的工作？~jump~geju|我該多用哪些顏色、方位？~jump~xiji|這步大運的重點是什麼？~jump~decade|今年這段感情會怎樣？~cast~今年這段感情會怎樣？|明年工作會有變動嗎？~cast~明年工作會有變動嗎？|這筆錢的事會順嗎？~cast~這筆錢的事接下來會怎樣？",
  rizhu: "日柱 {p}", love: "感情", work: "做事", watch: "留意", dmHead: "日主{dm}", strengthHead: "強弱：{lv}", favHead: "用神傾向：{e}",
  decadeHead: "現在的大運：{gz}（{t}）", yearHead: "{y} 年流年：{gz}（{t}）",
  matter: "最近最在意的是感情、工作，還是錢？心裡有一件具體的事，起一卦看它的走向和日子。", topics: "感情,工作,錢,其他",
  topicQ: "這段感情接下來會怎樣？,工作接下來會怎樣？,這筆錢的事接下來會怎樣？,",
  allRizhu: "看六十日柱 →", yunshi: "看今天的生肖運勢 →", other: "換一份生辰／排別人的",
  // 10-30 进度表 128 ④: only the pages in the other languages use these (the Chinese table prints 年柱… from the chart itself)
  p_year: "年柱", p_month: "月柱", p_day: "日柱", p_hour: "時柱",
  ageNote: "歲數照傳統的算法：出生就算一歲，每過一個農曆新年加一歲。",
  legend: "縮寫",
  jiaoyunF: "逢{a}、{b}年，{t}後第{d}天交大運",
};

/** 10-30 进度表 128 ④: the words of the 八字 pages outside the chart (product page, chart page, the sixty 日柱) */
const PAGE = {
  metaTitle: "八字排盤｜免費八字命盤、四柱、大運流年",
  metaDesc: "輸入生辰，排出四柱、藏干、十神、納音、大運與流年，看懂日主、格局和五行。不知道時辰也能排三柱。登入就能免費排盤；白話解讀和深度報告用通卡或會員。",
  title: "八字排盤",
  lead: "填生辰，排一張你的八字。不知道出生時辰也可以排（三柱）。",
  fitYes: ["自己的個性底色、做事的節奏", "這幾年大運的重心", "今年流年在意什麼"],
  fitNo: ["一件具體的事會不會成、什麼時候有動靜——起一卦問那件事比較合適", "健康診斷、投資與法律"],
  how: ["填出生日期、出生地；不知道時辰也可以排三柱", "排出四柱、藏干、十神、納音、大運與流年", "開通卡或會員，讀這張盤的白話解讀"],
  free: ["四柱、藏干、十神、納音、大運流年的完整盤面（登入就能排）"],
  paid: ["本命報告（九章）：通卡或會員都能看；大運與今年兩章會員可看，每月按當下的流月重寫；買了就排好到期回來問你的日子", "這張盤的白話解讀：日柱、日主強弱、喜忌、大運與今年", "問這張盤：對著自己的盤直接提問，通卡或會員都能問", "正緣畫像", "三合一年書：八字、紫微、星盤合看一整年"],
  boundary: "命盤描述的是傾向，不決定結果；不談健康診斷、投資與法律。",
  introLink: "看六十日柱 →",
  chartTitle: "我的八字命盤",
  preview: "預覽中：只有登入後台的瀏覽器看得到。",
  libIndex: "六十日柱",
  libMetaTitle: "六十日柱｜八字日柱白話說明",
  libDesc: "甲子到癸亥六十個日柱，每個日柱的個性底色、感情、做事與可以留意的地方，白話說明。",
  tPillar: "{p}日柱", tPillarMeta: "{p}日柱｜{t}",
  love: "感情", work: "做事", watch: "可以留意", cta: "排一張自己的八字 →", note: "日柱描述的是傾向，不決定結果。",
};

/** 10-30 进度表 128 ④: the deep report's and the 正緣畫像's own page and letter outside Chinese (Chinese pages keep REPORT_UI) */
const REPORT = {
  metaTitle: "你的八字報告", back: "八字排盤", revisitBtn: "設定回訪",
  kindLabel: { deep: "八字深度報告", love: "正緣畫像" },
  kindSub: { deep: "十一章，從格局到行動", love: "你會被哪一種人吸引、和哪一種人走得長" },
  title: "日主{dm} · {g}", titleNoGeju: "日主{dm}",
  writing: "報告正在寫，一章一章出來，寫好的會先出現在這裡。大約一兩分鐘，頁面會自己更新。",
  writingChapter: "這一章正在寫……", failedChapter: "這一章這次沒寫成，我們會補上，寫好會寄信通知你。",
  pillarsHead: "四柱",
  unpaidHead: "這份報告還沒付款", unpaidBody: "付款完成後，報告會直接寫在這一頁，也會寄到你的信箱。",
  chapters: {
    geju: "格局與五行", xingge: "性格的兩面", tianfu: "天賦與事業方向", caifu: "財富模式", ganqing: "感情與相處", renji: "人際與家庭",
    shenxin: "身心節奏", dayun: "一生大運，一步一步看", dangqian: "現在這步大運與今年", xiyong: "喜用五行的日常用法", xingdong: "行動指南",
  },
  decadeHead: "{gz} · {t} · {a}–{b} 歲 · {y1}–{y2}",
  love: {
    intro: "TA 的樣子", tips: "相處時可以留意的", self: "給你自己的一句", basis: "依據", note: "畫的是一種氣質類型，不是某一個具體的人。",
    alt: "正緣畫像", drawing: "畫像正在畫，稍等一下就會出現", caption: "依你命盤裡的配偶星與夫妻宮畫出的氣質類型，不是某一個真實的人。",
    sections: { qiyun: "氣韻", titai: "體態與氣質", dise: "底色", shentai: "神態", xiangchu: "相處的節奏", yuanfen: "緣分氣息", xiangyu: "相遇的場景" },
  },
  /** the chart reasons shown above each part of the portrait */
  chip: {
    star: "配偶星：{t}（{e}）", noStar: "配偶星沒有出現，看夫妻宮 {b}（{e}）", stemAt: "透在{p}", hiddenAt: "藏在{p}", strength: "濃淡：{s}",
    inPalace: "坐在夫妻宮", palace: "夫妻宮 {b}（{e}）", palaceNone: "夫妻宮沒有刑沖合會", sits: "日支坐{t}", noFlower: "沒有桃花、紅鸞",
    starAt: "配偶星在{p}", dir: "日支 {b} · 偏{d}",
  },
  mail: {
    subject: { deep: "你的八字深度報告寫好了", love: "你的正緣畫像寫好了" },
    body: { deep: "十一章的八字深度報告已經寫好了，之後也能隨時從這封信回去看。", love: "你的正緣畫像已經寫好了，之後也能隨時從這封信回去看。" },
    button: "打開我的報告", foot: "有問題直接回覆這封信。",
  },
  /** 10-30 进度表 128 ④-5: the 年書's 八字篇 (one year, eight chapters) outside Chinese — the Chinese page keeps REPORT_UI */
  book: {
    kindLabel: "八字流年篇", kindSub: "一整年：總判、關鍵月、逐月宜忌、六大領域、貴人與季度行動",
    title: "{y} {gz} · {t}",
    verdict: "年度總判", keyword: "今年的關鍵字",
    tenLine: "流年十神", role: "流年五行", decade: "與大運", natal: "與四柱", noRel: "沒有特別的合沖",
    curve: "每月的能量起伏",
    keyMonths: "三個關鍵月份", keySmooth: "最順手的月", keySlow: "最需要放慢的月", keyPivot: "最重要的一個月",
    months: "十二個月逐月",
    monthsNote: "八字的月份按節氣劃分：每個月從一個節氣開始，一年從立春（2 月 4 日前後）開始。以下日期都是國曆。",
    from: "{d}起",
    yi: "宜", ji: "不宜",
    focus: { work: "事業", money: "財運", love: "感情", rest: "作息" },
    levelWord: { 1: "放慢", 2: "收著走", 3: "平穩", 4: "順手", 5: "有勢" },
    areas: "六大領域", area: { career: "事業", wealth: "財運", love: "感情", rhythm: "健康作息", people: "人際貴人", home: "家宅出行" },
    single: "單身", paired: "有伴",
    allies: "貴人與合作", noble: "貴人生肖", easy: "好合作的生肖", colour: "今年多用的顏色", direction: "方位", number: "數字",
    alliesNote: "顏色、方位和數字是日常小習慣的參考，用得自在就好。",
    guards: "需要守的時段", quarters: "季度行動清單", quarter: { 1: "第一季", 2: "第二季", 3: "第三季", 4: "第四季" },
    /** a month's mark: its branch against a natal branch — {r} the relation (combination, clash…), {p} day branch / month branch */
    flagRel: "與你的{p}{r}",
    flag: { 旬空: "旬空（落在日柱的空亡）", 合日干: "合你的日主", 伏吟流年: "與流年同一組干支", 伏吟大运: "與大運同一組干支" },
    /** what each natal pillar stands for in a year reading (report-facts.ts PALACE) */
    palace: { 0: "長輩與外部大環境", 1: "工作環境與同事", 2: "配偶宮與居所", 3: "子女、晚輩與長期計劃" },
    colours: { 绿色: "綠色", 青色: "青色", 红色: "紅色", 紫色: "紫色", 黄色: "黃色", 咖啡色: "咖啡色", 白色: "白色", 金色: "金色", 黑色: "黑色", 蓝色: "藍色" },
    dirs: { 东方: "東方", 南方: "南方", 中央: "中央", 西方: "西方", 北方: "北方" },
  },
};

/** 10-30 进度表 128 ④: the 正緣畫像 product page (ZY_UI) and its title and description */
const ZY = {
  ...ZY_UI,
  metaTitle: "正緣畫像：從八字看容易和你走在一起的那類人",
  metaDesc: "從八字的配偶星和夫妻宮，畫出容易和你走在一起的那類人：TA 的樣子和氣質、相處的節奏、可能在哪裡、哪個方向遇見。先免費看一句，完整畫像單買，會員 8 折。",
};

export const BAZI_HANT = { ui: UI, page: PAGE, report: REPORT, zy: ZY };
type Widen<T> = T extends string ? string : T extends readonly (infer U)[] ? Widen<U>[] : { [K in keyof T]: Widen<T[K]> };
export type BaziPage = Widen<typeof PAGE>;
export type BaziReportText = Widen<typeof REPORT>;
export type ZyText = Widen<typeof ZY>;
const tree = (l: string) => localize(BAZI_HANT as unknown as { ui: Record<string, string>; page: BaziPage; report: BaziReportText; zy: ZyText }, GEN as unknown as Generated, l);

/**
 * 10-30: templates with no Chinese in them are copied as written by the translator, so each language's own forms are
 * set here — the hour of a branch for the 「接近時辰交界」 buttons (Zi hour (Rat), 子の刻, 자시).
 */
function branchHours(l: Foreign): string {
  const n = BAZI_NAMES[l];
  return n.branches.map((b, i) => (l === "ja" || l === "ko" ? fmt(n.hour, { b }) : `${fmt(n.hour, { b })} (${n.animals[i]})`)).join(",");
}

/** 10-22: a 國曆 date is 公历 on the 简体 page (the header said 国历), as on every other 简体 page. 10-30: and the seven other languages */
export const baziUi = (l: HlLocale | string): Record<string, string> => {
  if (isForeign(l)) return { ...tree(l).ui, branchNames: branchHours(l) };
  return Object.fromEntries(Object.entries(UI).map(([k, v]) => [k, l === "zh" ? loc(v, l as HlLocale).replace(/国历/g, "公历") : loc(v, l as HlLocale)]));
};
/** the page words (server pages) — 简体 converted, the others generated */
export const baziPage = (l: string): BaziPage => (isForeign(l) ? tree(l).page : (Object.fromEntries(Object.entries(PAGE).map(([k, v]) => [k, Array.isArray(v) ? v.map((x) => loc(x, l as HlLocale)) : loc(v, l as HlLocale)])) as BaziPage));
/** the report page's and letter's words outside Chinese */
export const baziReportText = (l: string): BaziReportText => tree(l).report;
/** the 正緣畫像 product page's words in any language */
export const zyText = (l: string): ZyText => (isForeign(l) ? tree(l).zy : (Object.fromEntries(Object.entries(ZY).map(([k, v]) => [k, loc(v, l as HlLocale)])) as ZyText));
