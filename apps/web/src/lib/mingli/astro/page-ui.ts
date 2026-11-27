import { loc } from "@/lib/mingli/calendar/content";
import type { HlLocale } from "@/lib/mingli/calendar/day";
import GEN from "@/data/l10n/astro.json";
import { isForeign, type Foreign, type Generated } from "@/lib/l10n/core";
import { localize } from "@/lib/l10n/server";
import { SIGNS } from "./chart";
import { INSIGHT_UI } from "./insight-text";
import { ASTRO_NAMES } from "./names";

/** 10-18 进度表 74: words on the 星盤 chart page, in the reader's script */
const UI: Record<string, string> = {
  noProfile: "還沒有生辰資料。", toForm: "先填生辰 →", bad: "這份生辰資料有問題。",
  houseSys: "宮位制", placidus: "Placidus", whole: "整宮制", tropical: "熱帶黃道", highLat: "（出生地緯度很高，改用整宮制）",
  wheel: "本命星盤", sun: "太陽", moon: "月亮", rising: "上升", zuo: "座", moonSplit: "{a}座或{b}座（出生時間會決定是哪一個）", noRising: "需要出生時間",
  tables: "行星、宮位與相位", near: "（接近交界）", houseN: "第{n}宮", retro: "逆行", node: "北交點", nodeMean: "（平均）", nodeTrue: "（真實）",
  planetNames: "太陽,月亮,水星,金星,火星,木星,土星,天王星,海王星,冥王星", aspectNames: "合,六合,刑,拱,沖",
  love: "感情", work: "做事", watch: "留意", others: "其他行星", aspectsHead: "最緊的相位", nodeHead: "北交點在{s}座",
  matter: "最想看感情還是工作？心裡有一件具體的事，起一卦看它的走向和日子。", topics: "感情,工作,其他",
  topicQ: "這段感情接下來會怎樣？,工作接下來會怎樣？,", other: "換一份生辰／排別人的",
  // 10-20 星盤②③ 付費報告 (AstroReports)
  repHead: "完整報告", repDeepTag: "通卡／會員", repYearTag: "單次購買", repDeep: "星盤深度報告",
  repDeepLine: "十章：盤的重心、太陽、月亮、上升與命主星、思考與表達、感情與相處、事業與方向、金錢與資源、人生功課、全部主要相位。沒有出生時間時不寫上升與宮位。會員另有「這個月的行運」，每月按當下天象更新。",
  repYear: "{y} 年 星盤年報", repYearLine: "今年的星盤年報：太陽回歸盤、三個關鍵月、十二個月逐月宜忌、木星土星走到哪、外行星、日月食與水逆、六大領域、季度行動清單，日期都是國曆，可附上你最想問的一件事。",
  repNextLine: "明年提前看：太陽回歸盤、三個關鍵月、十二個月逐月宜忌、木星土星走到哪、外行星、日月食與水逆、六大領域、季度行動清單，日期都是國曆，可附上你最想問的一件事。",
  repAsk: "今年最想問的一件事（選填）", repAskHint: "例如：今年適合換工作嗎？（200 字以內，會寫成年報的最後一章）",
  repOpen: "打開報告", repMember: "加入會員就能看", repTongka: "通卡或會員都能看", repRewrite: "會員：按這個月的流月重寫一份", repRewriteNext: "下次可重寫：國曆 {d}", repTongkaLead: "一張通卡，期內深度報告和全站付費解讀都能看；「這個月的行運」會員可看。", repLogin: "登入後查看", repBuy: "購買 {p}", repWriting: "正在打開…", repGoing: "前往付款…", repTest: "測試帳號：免費打開",
  repError: "暫時沒辦法打開，請稍後再試。",
  ...INSIGHT_UI, // 10-19 看懂這張盤 (insight-text.ts)
  // 10-30 进度表 128 ④: how pieces join in this language (Chinese runs them together: 太陽牡羊、上升獅子、太陽合月亮（2.1°）)
  fPS: "{p}{s}", fRising: "{r}{s}", fAspName: "{a}{n}{b}", fAsp: "{a}{n}{b}（{o}°）", fAspText: "{a}（{ak}）和{b}（{bk}）{t}",
  colon: "：", gap: "　", slash: "／", listSep: "、",
};

/** 10-30 进度表 128 ④: the words of the 星盤 pages outside the chart (product page, chart page, the library) */
const PAGE = {
  metaTitle: "星盤查詢｜免費本命盤、上升星座、月亮星座",
  metaDesc: "輸入出生日期、時間和地點，畫出你的本命星盤：太陽、月亮、上升星座，十大行星落在哪個星座和宮位、彼此的相位。登入就能免費排盤；白話解讀和深度報告用通卡或會員。",
  title: "星盤",
  lead: "填出生日期、時間和地點，畫一張你的本命星盤。上升星座需要比較確定的出生時間和地點。",
  fitYes: ["自己的個性", "感情與做事的樣子", "心裡在意什麼"],
  fitNo: ["一件具體的事會不會成、什麼時候有動靜——起一卦問那件事比較合適", "健康診斷、投資與法律"],
  how: ["填出生日期、時間與出生地", "畫出太陽、月亮、上升與各行星的落座落宮", "開通卡或會員，讀每一顆星的白話"],
  free: ["本命星盤：行星的星座、宮位與相位（登入就能排）"],
  paid: ["深度報告（十章）：通卡或會員都能看；會員另有「這個月的行運」，每月按當下天象更新；買了就排好到期回來問你的日子", "這張盤的白話解讀：每一顆星在說什麼", "問這張盤：對著自己的盤直接提問，通卡或會員都能問", "合盤：兩個人的盤一起看", "三合一年書：八字、紫微、星盤合看一整年"],
  boundary: "星盤描述的是傾向，不決定結果；不談健康診斷、投資與法律。",
  introLink: "看行星在各星座的意思 →",
  chartTitle: "我的本命星盤",
  preview: "預覽中：只有登入後台的瀏覽器看得到。",
  libIndex: "行星在各星座與宮位",
  libIndexDesc: "十大行星落在十二星座與十二宮的白話說明。",
  libSuffix: "{t}｜星盤白話說明",
  tPS: "{p}{s}", tPH: "{p}在第{h}宮", tRising: "上升{s}", houseShort: "{n}宮", risingHead: "上升星座",
  love: "感情", work: "做事", watch: "可以留意", cta: "畫一張自己的星盤 →", note: "星盤描述的是傾向，不決定結果。",
};
/** 10-30 进度表 128 ④: the deep report's own page and letter outside Chinese (the Chinese pages keep AS_REPORT_UI) */
const REPORT = {
  metaTitle: "你的星盤報告", back: "我的星盤", kindLabel: "星盤深度報告",
  kindSub: "十章：盤的重心、日月與上升、思考、感情、事業、金錢、人生功課，到全部主要相位",
  writing: "報告正在寫，一章一章出來，寫好的會先出現在這裡。大約一兩分鐘，頁面會自己更新。",
  writingChapter: "這一章正在寫……", failedChapter: "這一章這次沒寫成，我們會補上，寫好會寄信通知你。",
  head: "星盤", headSun: "太陽", headMoon: "月亮", headAsc: "上升", headDom: "主導行星",
  noTime: "沒有出生時間：上升、天頂和宮位都不看，月亮只寫到星座。",
  unpaidHead: "這份報告還沒付款", unpaidBody: "付款完成後，報告會直接寫在這一頁，也會寄到你的信箱。", revisitBtn: "設定回訪",
  title: "太陽{s}・月亮{m}", titleAsc: "太陽{s}・月亮{m}・上升{a}",
  chapters: {
    zhongxin: "盤的重心", taiyang: "太陽：想走的方向", yueliang: "月亮：讓你安心的方式", shangsheng: "上升與命主星",
    shuixing: "思考與表達（水星）", ganqing: "感情與相處（金星、火星、第5／7宮）", ganqingNoTime: "感情與相處（金星、火星）",
    shiye: "事業與方向（天頂、第10／6／2宮）", shiyeNoTime: "事業與方向", jinqian: "金錢與資源（第2／8宮）", jinqianNoTime: "金錢與資源",
    gongke: "人生功課（土星、南北交點）", xiangwei: "全部主要相位",
  },
  aspectGroups: { 合相: "合相", 和諧: "和諧（六合、拱）", 張力: "張力（刑、沖）" },
  genNote: "世代相位",
  el: { 火: "火", 土: "土", 風: "風", 水: "水" }, md: { 基本: "基本", 固定: "固定", 變動: "變動" },
  dignity: { 入廟: "入廟", 旺: "旺", 陷: "陷", 弱: "弱" },
  patterns: { 大三角: "大三角", T三角: "T三角", 大十字: "大十字", 風箏: "風箏", 上帝之指: "上帝之指", 星群星座: "星群", 星群宮位: "星群" },
  chip: {
    elMore: "{e}象偏多", elLess: "{e}象偏少", mdMore: "{m}偏多", dom: "主導 {p}", ruler: "命主星 {p}", pattern: "{k}（{ps}）",
    planet: "{p} {s} {d}°", house: "第{n}宮", retro: "逆行", asc: "上升 {s} {d}°", rulerAt: "命主星 {p} {s}", mc: "天頂 {s}",
    north: "北交點 {s}", south: "南交點 {s}", aspect: "{a}{n}{b} {o}°", moonOr: "{a}或{b}", sep: "、",
  },
  mail: { subject: "你的星盤深度報告寫好了", title: "星盤深度報告", body: "十章的星盤深度報告已經寫好了，之後也能隨時從這封信回去看。", button: "打開我的報告", foot: "有問題直接回覆這封信。" },
  // 「這個月的行運」 (lib/mingli/astro/month-sky.ts monthSkyLinesIn): the same fixed lines as the Chinese page, as templates
  sky: {
    title: "這個月的行運", label: "{m} · 每月按當下天象更新", asc: "上升點",
    head: "{p}{a}{pt}（{d} 前後最明顯）：",
    pt: { 太陽: "本命太陽", 月亮: "本命月亮", 金星: "本命金星", 上升: "本命上升點" },
    area: { 太陽: "你想做的事與方向", 月亮: "情緒與生活節奏", 金星: "感情與財物", 上升: "給人的印象與日常作息" },
    jupSoft: "{area}比較容易遇到機會和幫忙，適合主動開口、往外多走一步。",
    jupHard: "{area}容易想做得太多、答應得太快，量力而行。",
    satSoft: "{area}適合把基礎打穩、做長一點的安排，這時花的功夫留得住。",
    satHard: "{area}會覺得事情慢、責任重；放慢腳步、把要做的拆小，比硬推好。",
    marsSoft: "{area}行動力足，適合動手處理拖了一陣子的事。",
    marsHard: "{area}容易急、容易起摩擦，說話和做決定前多停一下。",
    retroMercury: "水星逆行（{from}–{to}）：溝通、文件、交通容易出小差錯；簽約、寄送、買電子產品前多核對一次，適合回頭整理舊事。",
    retroVenus: "金星逆行（{from}–{to}）：感情和花錢容易回頭看，舊人舊事可能再出現；大筆的消費可以緩一緩。",
    retroMars: "火星逆行（{from}–{to}）：行動容易卡住或要重來；適合修正計畫，不急著硬推新的大事。",
    quiet: "這個月木星、土星、火星都沒有和你本命盤上的這幾點（{pts}）形成緊密的相位，水星、金星、火星也都順行：是比較平穩的一個月，照自己的步調走就好。",
  },
  /** 10-30 进度表 128 ④-5: the 年書's 星盤篇 (one calendar year, nine chapters) outside Chinese — the Chinese page keeps AS_REPORT_UI */
  book: {
    kindLabel: "星盤年報篇", kindSub: "一整年：太陽回歸盤、三個關鍵月、十二個月逐月、木星土星、外行星、日月食與逆行、六大領域、季度行動",
    datesNote: "這一篇從 1 月 1 日到 12 月 31 日，文中所有日期都是國曆，依出生地的當地日期。",
    verdict: "年度總判", keyword: "今年的關鍵字",
    srHead: "太陽回歸盤", srAsc: "回歸上升", srAscIn: "落在本命第{n}宮", srSun: "回歸太陽", srMoon: "回歸月亮", srAngular: "角宮行星",
    srNone: "太陽回歸盤要有出生時間才排得出來。",
    curve: "每月的能量起伏",
    keyMonths: "三個關鍵月份", keySmooth: "最順手的月", keySlow: "最需要放慢的月", keyPivot: "最重要的一個月",
    months: "十二個月逐月",
    yi: "宜", ji: "不宜",
    focus: { work: "事業", money: "財運", love: "感情", rest: "作息" },
    levelWord: { 1: "放慢", 2: "收著走", 3: "平穩", 4: "順手", 5: "有勢" },
    js: "木星與土星這一年", jsFrom: "年初", jsTo: "年底", jsRetro: "逆行 {a}–{b}", enter: "{d} 進入{x}", back: "{d} 退回{x}",
    skyEnter: "{p}進入{x}", skyBack: "{p}退回{x}",
    outer: "外行星的長期功課", outerNone: "今年外行星沒有和你的太陽、月亮、上升、天頂成正相位。",
    ecl: "日月食與逆行提醒", eclHead: "日月食", retroHead: "逆行期",
    areas: "六大領域", area: { career: "事業", wealth: "財運", love: "感情", rhythm: "健康作息", people: "人際貴人", home: "家宅出行" },
    single: "單身", paired: "有伴",
    quarters: "季度行動清單", quarter: { 1: "第一季", 2: "第二季", 3: "第三季", 4: "第四季" },
    /** a point of the birth chart a transit or an eclipse touches: 「本命太陽」 */
    natal: "本命{p}",
    exactMark: "正相位", rxStart: "{p}開始逆行（{s}）", rxEnd: "{p}恢復順行", touch: "觸及{x}",
    retroTag: "{p}逆行", steady: "平穩",
    /** the marks of a month (report-facts.ts monthCurveA) */
    flag: {
      木星助力: "木星助力", 土星壓力: "土星壓力", 土星支撐: "土星支撐", 火星衝勁: "火星衝勁", 火星助推: "火星助推",
      水逆: "水星逆行", 金星逆行: "金星逆行", 火星逆行: "火星逆行", 日食: "日食", 月食: "月食", 食點觸及本命: "食點觸及本命盤",
      外行星正相位: "外行星正相位", 木星回歸: "木星回歸", 土星回歸: "土星回歸", 木星換座: "木星換星座", 土星換座: "土星換星座",
      木星換宮: "木星換宮", 土星換宮: "土星換宮", 外行星換座: "外行星換星座",
    },
    eclipse: { 日全食: "日全食", 日環食: "日環食", 日偏食: "日偏食", 月全食: "月全食", 月偏食: "月偏食", 半影月食: "半影月食" },
  },
};
export const ASTRO_HANT = { ui: UI, page: PAGE, report: REPORT };
/**
 * 10-30: the templates with no Chinese in them are never translated (the generator copies them as written), so each
 * language's own joins are set here: 「太陽牡羊」 is "Sun in Aries", „Sonne im Zeichen Widder", 「太陽牡羊座」.
 */
const JOIN: Record<Foreign, { ui: Record<string, string>; page: { tPS: string }; aspect: string }> = {
  en: { ui: { fPS: "{p} in {s}", fRising: "{s} {r}", fAspName: "{a} {n} {b}" }, page: { tPS: "{p} in {s}" }, aspect: "{a} {n} {b} {o}°" },
  fr: { ui: { fPS: "{p} en {s}", fRising: "{r} {s}", fAspName: "{a} {n} {b}" }, page: { tPS: "{p} en {s}" }, aspect: "{a} {n} {b} {o}°" },
  de: { ui: { fPS: "{p} im Zeichen {s}", fRising: "{r} {s}", fAspName: "{a} {n} {b}" }, page: { tPS: "{p} im Zeichen {s}" }, aspect: "{a} {n} {b} {o}°" },
  es: { ui: { fPS: "{p} en {s}", fRising: "{r} en {s}", fAspName: "{a} {n} {b}" }, page: { tPS: "{p} en {s}" }, aspect: "{a} {n} {b} {o}°" },
  pt: { ui: { fPS: "{p} em {s}", fRising: "{r} em {s}", fAspName: "{a} {n} {b}" }, page: { tPS: "{p} em {s}" }, aspect: "{a} {n} {b} {o}°" },
  ja: { ui: { fPS: "{p}{s}", fRising: "{r}{s}", fAspName: "{a}と{b}の{n}" }, page: { tPS: "{p}{s}" }, aspect: "{a}と{b}の{n} {o}°" },
  ko: { ui: { fPS: "{p} {s}", fRising: "{r} {s}", fAspName: "{a}-{b} {n}" }, page: { tPS: "{p} {s}" }, aspect: "{a}-{b} {n} {o}°" },
};
export type AstroReportText = Widen<typeof REPORT>;
/** the deep report's words outside Chinese */
export const astroReportText = (l: string): AstroReportText => {
  const r = tree(l).report as unknown as AstroReportText;
  return isForeign(l) ? { ...r, chip: { ...r.chip, aspect: JOIN[l].aspect } } : r;
};
type Widen<T> = T extends string ? string : T extends readonly (infer U)[] ? Widen<U>[] : { [K in keyof T]: Widen<T[K]> };
export type AstroPage = Widen<typeof PAGE>;
const tree = (l: string) => localize(ASTRO_HANT as unknown as { ui: Record<string, string>; page: AstroPage; report: unknown }, GEN as unknown as Generated, l);
/** the page words (server pages) — 简体 converted, the others generated */
export const astroPage = (l: string): AstroPage => (isForeign(l) ? { ...tree(l).page, ...JOIN[l].page } : (Object.fromEntries(Object.entries(PAGE).map(([k, v]) => [k, Array.isArray(v) ? v.map((x) => loc(x, l as HlLocale)) : loc(v, l as HlLocale)])) as AstroPage));
/** 10-22: a 國曆 date is 公历 on the 简体 page, as on every other 简体 page */
export const astroUi = (l: HlLocale | string): Record<string, string> => {
  if (isForeign(l)) {
    // the standard names win over a translation; a sign needs no 座 outside Chinese (Japanese names carry it already)
    const n = ASTRO_NAMES[l];
    return { ...tree(l).ui, ...JOIN[l].ui, planetNames: n.planets.join(","), aspectNames: n.aspects.join(","), zuo: "" };
  }
  return Object.fromEntries(Object.entries(UI).map(([k, v]) => [k, l === "zh" ? loc(v, l as HlLocale).replace(/国历/g, "公历") : loc(v, l as HlLocale)]));
};
export const signNames = (l: HlLocale | string): string[] => (isForeign(l) ? ASTRO_NAMES[l].signs : SIGNS.map((s) => loc(s, l as HlLocale)));
export const planetName = (p: string, l: string): string => (isForeign(l) ? ASTRO_NAMES[l].planets[["太陽", "月亮", "水星", "金星", "火星", "木星", "土星", "天王星", "海王星", "冥王星"].indexOf(p)] ?? p : loc(p, l as HlLocale));
export const signName = (s: string, l: string): string => (isForeign(l) ? ASTRO_NAMES[l].signs[(SIGNS as readonly string[]).indexOf(s)] ?? s : loc(s, l as HlLocale));
