import { loc } from "@/lib/mingli/calendar/content";
import type { HlLocale } from "@/lib/mingli/calendar/day";
import GEN from "@/data/l10n/ziwei.json";
import { fmt, isForeign, type Foreign, type Generated } from "@/lib/l10n/core";
import { localize } from "@/lib/l10n/server";
import { BAZI_NAMES } from "@/lib/mingli/bazi/names";
import { GEJU } from "./geju";

/** 10-18 进度表 71: words on the 紫微 chart page, in the reader's script */
const UI: Record<string, string> = {
  noProfile: "還沒有生辰資料。", toForm: "先填生辰 →", bad: "這份生辰資料有問題。", solar: "國曆", lunar: "農曆",
  needTime: "紫微命盤需要出生時辰。可以先選一個最可能的時辰看看：", toBazi: "或改看八字三柱 →",
  branchNames: "子時,丑時,寅時,卯時,辰時,巳時,午時,未時,申時,酉時,戌時,亥時", timeGuess: "時辰未確認",
  tsOn: "真太陽時 {t}（點一下關掉）", tsOff: "真太陽時：關（點一下打開）", ziNext: "子時：23:00 換日", ziSame: "子時：晚子時不換日",
  basisLine: "正月初一換年 · 閏月前後半月 · 全書四化", dst: "出生那段時間當地實施夏令時間，已換回標準時間。",
  near: "出生時間接近時辰交界，可以切換看看另一個時辰的盤：", alt: "正在看另一個時辰的盤。", back: "回到原本的時間",
  natal: "本命", decadal: "大限", yearly: "流年", monthly: "流月", age: " 歲", lunarMonth: "農曆{m}月",
  bodyMark: "身", soulAt: "命宮在{b}", bodyAt: "身宮在{b}", soulStar: "命主", bodyStar: "身主", tap: "點任一宮，看這一宮的星曜和說明。",
  dec: "大限", emptyPalace: "這一宮沒有主星，借對宮的主星來看。", strength: "順的時候", watch: "留意",
  soulHead: "命宮", bodyHead: "身宮：{p}", mutHead: "生年四化", mutIn: "化{m}在{p}", yearHead: "{y} 年的重心", allPalaces: "其他各宮",
  matter: "最近最在意的是感情、工作，還是錢？心裡有一件具體的事，起一卦看它的走向和日子。", topics: "感情,工作,錢,其他",
  topicQ: "這段感情接下來會怎樣？,工作接下來會怎樣？,這筆錢的事接下來會怎樣？,", allStars: "看十四主星 →", other: "換一份生辰／排別人的",

  // 10-19 看懂這張盤: summary card, 大限／流年, 格局, 宮干四化, 時辰對照, 你可能想問, 命盤卡
  insightHead: "看懂這張盤",
  s_soul: "命宮", s_body: "身宮", s_five: "五行局", s_lords: "命主／身主", s_mut: "生年四化", s_dec: "這步大限", s_year: "今年流年",
  soulLine: "{b}宮，主星{s}。", soulEmpty: "{b}宮沒有主星，借對宮的{s}來看。", starLine: "{s}：{t}",
  bodyLine: "落在{p}（{s}）：後天的重心多放在{t}。", bodySame: "和命宮在同一宮：想做的和實際做出來的比較一致。",
  fiveLine: "{f}：第一步大限從 {n} 歲開始，之後每十年換一步。",
  lordsLine: "命主{a}、身主{b}：命主看天生的底色，身主看後天做事的習慣。",
  mutLine: "{s}在{p}：{t}這一塊{u}。",
  decLine: "現在 {a}–{b} 歲，走在本命{p}這一步（{s}）：這十年的心力多放在{t}。", decChild: "第一步大限還沒開始（{n} 歲起）。",
  yearLine: "{y}（{gz}年）流年命宮在本命{p}（{s}）：今年的重心偏向{t}。",
  bright_廟: "特質發揮得完整", bright_旺: "特質發揮得完整", bright_得: "特質表現中等", bright_利: "特質表現中等", bright_平: "特質表現平穩", bright_不: "特質比較收斂，要靠歷練帶出來", bright_陷: "特質比較收斂，要靠歷練帶出來",
  star_紫微: "有主見，習慣把事情抓在自己手上，也在意格局", star_天機: "腦筋動得快，愛想、愛規劃，也容易想太多", star_太陽: "熱心外向，願意付出，喜歡被看見",
  star_武曲: "務實果斷，重視成果與數字，說話直接", star_天同: "隨和重感受，喜歡舒服自在的節奏", star_廉貞: "有原則也有個性，對人對事愛憎分明",
  star_天府: "穩重，善於守成與管理資源", star_太陰: "細膩內斂，重視安全感和家的感覺", star_貪狼: "興趣廣、人緣活，對新鮮事物有熱情",
  star_巨門: "觀察入微，善於分析與表達，也容易多疑", star_天相: "講道理、重公平，適合協調與輔佐", star_天梁: "有長輩氣質，愛照顧人，也喜歡給意見",
  star_七殺: "獨立果決，喜歡衝刺，不怕從頭開始", star_破軍: "敢變敢拆，喜歡開新局，不愛照舊",
  topic_命宮: "自己的個性與做事方式", topic_兄弟: "手足、平輩和合作夥伴", topic_夫妻: "感情與伴侶", topic_子女: "孩子、晚輩和自己的作品",
  topic_財帛: "賺錢與用錢的方式", topic_疾厄: "身體與作息", topic_遷移: "外出、換環境和在外的表現", topic_交友: "朋友、同事與人脈",
  topic_官祿: "工作與事業", topic_田宅: "家、住所和不動產", topic_福德: "興趣、心情與精神生活", topic_父母: "長輩、上司與文書",
  mut_祿: "比較順手、容易有收穫", mut_權: "想掌握、肯用力", mut_科: "重名聲與條理，容易被看見", mut_忌: "最放不下、最常反覆琢磨",

  gjHead: "格局", gjSt_成: "條件齊全", gjSt_半成: "部分成立", gjSt_破: "成立，但打了折扣", gjWhy: "依據", gjMissing: "還差的條件", gjBreaks: "打折扣的地方",
  gjSrc: "出處", gjMore: "另外還有 {n} 個格局，完整報告裡細看。", gjNone: "這張盤沒有符合常見格局的組合；直接看各宮的星曜更實在。",
  f_in: "{s}在{p}（{b}）", f_same: "{s}同在{p}（{b}）", f_flank: "{s}一左一右夾著{p}", f_trine: "{s}從財帛、官祿兩宮照向{p}",
  f_sanfang: "{s}都在{p}的三方四正", f_opp: "{s}在對宮{p}（{b}）", f_empty: "{p}（{b}）沒有主星", f_bright: "{s}亮度{x}", f_mut: "{s}化{x}", f_stem: "生年天干{x}",
  f_dim: "{s}亮度{x}，不在廟旺", f_needMut: "{s}沒有化祿、化權或化科", f_stemNot: "生年天干是{x}，不是甲、丁、己", f_notSame: "{s}在對宮，不是同宮",
  f_branchNot: "命宮在{b}，在{x}更完整", f_ji: "{s}化忌在{p}", f_jiCore: "{s}化忌（在{p}）", f_jiSf: "{s}化忌，在三方的{p}", f_sha: "{s}在{p}",
  f_jia: "{s}夾著{p}", f_shaMany: "三方四正共有 {x} 顆煞星",
  "gjp_zifu-tonggong": "兩顆帝星同坐命宮，主見和穩重兼有，做事想要有規模，也想守得住。",
  "gjp_zifu-chaoyuan": "紫微、天府從財帛、官祿兩頭照過來，做事有後援，習慣把資源和位置一起經營。",
  "gjp_fuxiang-chaoyuan": "天府、天相從財帛、官祿照過來，重秩序與信用，適合在制度裡一步步往上走。",
  "gjp_jiyue-tongliang": "四顆偏文的星會在一起，擅長規劃、照顧和協調，適合有制度、有流程的環境。",
  gjp_shapolang: "三顆動星會在一起，喜歡變化與開創，人生的節奏起落比較明顯。",
  "gjp_riyue-bingming": "太陽、太陰都亮，外向和細膩兩面都有，做事有光度也有耐性。",
  "gjp_rizhao-leimen": "太陽在卯，像早晨的太陽，熱心肯做，願意走到前面。",
  "gjp_yuelang-tianmen": "太陰在亥最亮，心思細、有定力，重視安全感和長遠的累積。",
  "gjp_mingzhu-chuhai": "命宮沒有主星，由卯的太陽和亥的太陰照進來，越往外走越容易被看見。",
  "gjp_riyue-jiaming": "太陽、太陰在兩旁，像被兩盞燈照著，身邊容易有願意拉一把的人。",
  "gjp_shizhong-yinyu": "巨門在子午，能力像包在石頭裡的玉，越磨越顯，適合靠專業和口才慢慢做出名聲。",
  "gjp_yingxing-rumiao": "破軍在子午入廟，敢破敢立，適合開新局、做改革。",
  "gjp_qisha-chaodou": "七殺對著紫微，衝勁有方向，適合自己帶隊、扛責任。",
  "gjp_jixiang-liming": "紫微在午最亮，有帶頭的氣質，習慣站在主位做決定。",
  "gjp_junchen-qinghui": "紫微有左輔、右弼相助，身邊容易有幫手，適合帶團隊。",
  "gjp_wutan-tongxing": "武曲、貪狼同宮，重實際也有企圖心，常見先蓄積、後起步的節奏。",
  gjp_huotan: "貪狼遇火星，行動快、爆發力強，機會來時動作也快。",
  gjp_lingtan: "貪狼遇鈴星，衝勁強、耐得住壓力，常在變動裡找到機會。",
  "gjp_changqu-jiaming": "文昌、文曲在兩旁，文筆、表達和學習力常是加分項。",
  "gjp_zuoyou-jiaming": "左輔、右弼在兩旁，做事容易有人幫忙、補位。",
  "gjp_kuiyue-jiaming": "天魁、天鉞在兩旁，關鍵時常遇到願意提點的人。",
  "gjp_zuogui-xianggui": "天魁、天鉞一坐一對，在家在外都容易遇到肯幫忙的長輩。",
  "gjp_luma-jiaochi": "祿和馬碰在一起，收入跟著走動來，越往外跑機會越多。",
  "gjp_shuanglu-chaoyuan": "祿存和化祿都照到命宮，賺錢與資源的線索不只一條。",
  "gjp_sanqi-jiahui": "化祿、化權、化科都會到命宮，能力、資源和名聲三方面都有著力點。",
  "gjp_yangliang-changlu": "太陽、天梁、文昌和祿會在一起，讀書、考試和專業資格是長處。",
  "gjp_wengui-wenhua": "文昌、文曲同坐命宮，文采好、學得快，適合文字、教學、設計類的路。",
  "gjp_rili-zhongtian": "太陽在午最亮，熱情外放，喜歡被看見，也願意照顧人。",
  "gjp_yuesheng-canghai": "天同、太陰在子，溫和細膩，重感受，生活品味好。",
  "gjp_shouxing-rumiao": "天梁在午入廟，有擔當、愛照顧人，常被當成可以商量的人。",
  "gjp_shanyin-chaogang": "天機、天梁同宮，善於分析與出主意，適合顧問、企劃、教學。",
  "gjp_juri-tonggong": "巨門遇太陽，口才和說服力有光，適合靠說、靠教、靠溝通的工作。",
  "gjp_jiju-tonglin": "天機、巨門同宮，腦筋快、口才好，擅長研究和分析。",
  "gjp_xiongsu-chaoyuan": "廉貞在寅申入廟，有原則、有魄力，做事認真有規矩。",
  "gjp_jiangxing-dedi": "武曲在辰戌入廟，果斷務實，執行力強，適合管錢、管事。",

  flyHead: "宮干{g}的四化", flyTo: "→ {p}", flySelf: "自化", flyNote: "自化：這一宮的宮干化動了本宮自己的星。", selfMark: "自",

  cmpBtn: "對照前後時辰", cmpHide: "收起時辰對照", cmpLead: "出生時間如果不確定，看看前後一個時辰，命宮和主星怎麼變：",
  cmpHour: "時辰", cmpSoul: "命宮", cmpStars: "主星", cmpBody: "身宮", cmpFive: "五行局", cmpNow: "目前", cmpOpen: "看這張",
  cmpEmpty: "（借{s}）", cmpSame: "三個時辰的命宮主星一樣，差別在其他宮。", cmpDiff: "前後時辰的命宮主星不一樣，先別急著定盤。",

  askHead: "你可能想問",
  asks: "我是個什麼樣的人？~jump~zw-sum|我的命盤有什麼格局？~jump~zw-geju|這十年的重點是什麼？~jump~zw-now|今年感情會怎樣？~cast~今年這段感情會怎樣？|明年工作會有變動嗎？~cast~明年工作會有變動嗎？|這筆錢的事會順嗎？~cast~這筆錢的事接下來會怎樣？",
  // 10-20 紫微②③ 付費報告 (ZiweiReports)
  repHead: "完整報告", repDeepTag: "通卡／會員", repYearTag: "單次購買", repDeep: "紫微深度報告",
  repDeepLine: "本命十章：總覽與格局、命宮與三方四正、身宮、生年四化、事業、財帛、感情、人際、身心作息、與八字的交叉；會員另有「已走過的大限回顧」「現在與下一步大限」兩章，每月按當下的流月重寫。",
  repYear: "{y} {gz}年 紫微年書", repYearLine: "今年的紫微年書：流年命宮與四化、三個關鍵月、十二個農曆月逐月宜忌（每月標國曆日期）、六大領域、貴人與合作、季度行動清單，可附上你最想問的一件事。",
  repNextLine: "明年提前看：流年命宮與四化、三個關鍵月、十二個農曆月逐月宜忌（每月標國曆日期）、六大領域、貴人與合作、季度行動清單，可附上你最想問的一件事。",
  repAsk: "今年最想問的一件事（選填）", repAskHint: "例如：今年適合換工作嗎？（200 字以內，會寫成年書的最後一章）",
  repOpen: "打開報告", repMember: "加入會員就能看", repTongka: "通卡或會員都能看", repRewrite: "會員：按這個月的流月重寫一份", repRewriteNext: "下次可重寫：國曆 {d}", repTongkaLead: "一張通卡，期內本命報告和全站付費解讀都能看；大限兩章會員可看。", repLogin: "登入後查看", repBuy: "購買 {p}", repWriting: "正在打開…", repGoing: "前往付款…", repTest: "測試帳號：免費打開",
  repError: "暫時沒辦法打開，請稍後再試。", repNeedTime: "紫微報告需要確定的出生時辰，先在上面選定時辰再試。",
  cardLead: "把命盤做成一張圖，分享給朋友（只有命宮主星和格局，不含名字和生日）", cardText: "我的紫微命盤長這樣，你的呢？",
};
// 格局 names and where each is written (the book and chapter only — the verses stay in geju.ts)
for (const g of GEJU) { UI[`gjn_${g.id}`] = g.name; UI[`gjs_${g.id}`] = g.source.split("：")[0]!; }
export const ZIWEI_UI_SOURCE: Readonly<Record<string, string>> = UI;

/** 10-30 进度表 128 ④: words only the pages in the other languages print (the Chinese board shows the chart's own characters) */
const UI_FOREIGN: Record<string, string> = {
  legendBright: "亮度", legendMut: "四化", lunarLine: "農曆 {l}", hourLine: "{h}",
  centerPillars: "八字", noMain: "沒有主星", borrowFrom: "借對宮：{s}",
};

/** 10-30 进度表 128 ④: the words of the 紫微 pages outside the chart (product page, chart page, the fourteen stars) */
const PAGE = {
  metaTitle: "紫微斗數排盤｜免費紫微命盤、大限流年",
  metaDesc: "輸入生辰，排出十二宮紫微命盤：主星亮度、四化、大限、流年、流月。登入就能免費排盤；每一宮的白話解讀和深度報告用通卡或會員。",
  title: "紫微斗數排盤",
  lead: "填生辰，排一張你的紫微命盤。",
  fitYes: ["自己的個性", "這幾年的重心（大限）", "今年、這個月的力氣在哪（流年、流月）"],
  fitNo: ["一件具體的事會不會成、什麼時候有動靜——起一卦問那件事比較合適", "健康診斷、投資與法律"],
  how: ["填出生日期、時辰與出生地", "排出十二宮、主星輔星與四化，大限、流年、流月可以切換", "開通卡或會員，讀每一宮的白話"],
  free: ["十二宮與四化的完整命盤，大限、流年、流月切換（登入就能排）"],
  paid: ["本命報告（十章）：通卡或會員都能看；大限兩章會員可看，每月按當下的流月重寫；買了就排好這個流月過完回來問你", "這張盤的白話解讀：每一宮在說什麼", "問這張盤：對著自己的盤直接提問，通卡或會員都能問", "三合一年書：八字、紫微、星盤合看一整年"],
  boundary: "命盤描述的是傾向，不決定結果；不談健康診斷、投資與法律。",
  starsLink: "看十四主星 →",
  chartTitle: "我的紫微命盤",
  preview: "預覽中：只有登入後台的瀏覽器看得到。",
  starsIndex: "十四主星",
  starsMetaTitle: "紫微斗數十四主星｜白話說明",
  starsDesc: "紫微、天機、太陽、武曲、天同、廉貞、天府、太陰、貪狼、巨門、天相、天梁、七殺、破軍，十四主星的個性與在十二宮的樣子。",
  starTitle: "{s}星", starMetaTitle: "{s}星｜紫微斗數主星白話說明",
  pairTitle: "{s}在{p}", pairMetaTitle: "{s}在{p}｜{t}",
  personality: "個性", love: "感情", work: "做事", inPalaces: "{s}在十二宮",
  strength: "順的時候", watch: "可以留意",
  cta: "排一張自己的紫微命盤 →", note: "命盤描述的是傾向，不決定結果。",
};

/** 10-30 进度表 128 ④: the deep report's own page and letter outside Chinese (Chinese pages keep ZW_REPORT_UI) */
const REPORT = {
  metaTitle: "你的紫微報告", back: "紫微命盤", revisitBtn: "設定回訪",
  kindLabel: "紫微深度報告", kindSub: "十二章，從格局、各宮到大限，最後和八字對讀",
  writing: "報告正在寫，一章一章出來，寫好的會先出現在這裡。大約一兩分鐘，頁面會自己更新。",
  writingChapter: "這一章正在寫……", failedChapter: "這一章這次沒寫成，我們會補上，寫好會寄信通知你。",
  head: "命盤", headSoul: "命宮", headBody: "身宮", headFive: "五行局", headLords: "命主／身主",
  gejuNone: "這張盤沒有符合常見格局的組合，各宮的星曜更值得細看。",
  decadeNow: "現在", decadeNext: "下一步", ages: "{a}–{b} 歲",
  borrowed: "沒有主星，借對宮的{s}",
  crossHead: "兩套命盤，各看一面", crossAgree: { 同: "方向一致", 異: "各有側重", 平: "都平穩" },
  crossNone: "這張盤沒有八字資料可以對讀。",
  crossArea: { 自我: "自我", 事業: "事業", 財: "財", 感情: "感情", 才華表達: "才華表達", 人際: "人際" },
  crossLine: "紫微：{z} · 八字：{b}", crossDm: "日主{dm}，{s}", crossShare: "{g}約 {n}%", crossSpouse: "配偶星（{g}）約 {n}%", crossNoMain: "沒有主星", crossEven: "平穩",
  dmLine: "日主{dm} · {s}",
  unpaidHead: "這份報告還沒付款", unpaidBody: "付款完成後，報告會直接寫在這一頁，也會寄到你的信箱。",
  chapters: {
    zonglan: "總覽與格局", minggong: "命宮與三方四正", shengong: "身宮", sihua: "生年四化", shiye: "事業（官祿）", caibo: "財帛",
    ganqing: "感情（夫妻）", renji: "人際（交友與兄弟）", shenxin: "身心作息（疾厄）", guoqu: "已走過的大限回顧", xianzai: "現在與下一步大限", bazi: "與八字的交叉",
  },
  mail: {
    subject: "你的紫微深度報告寫好了",
    body: "十二章的紫微深度報告已經寫好了，之後也能隨時從這封信回去看。",
    button: "打開我的報告", foot: "有問題直接回覆這封信。",
  },
  /** 10-30 进度表 128 ④-5: the 年書's 紫微篇 (one lunar year, eight chapters) outside Chinese — the Chinese page keeps ZW_REPORT_UI */
  book: {
    kindLabel: "紫微年書篇", kindSub: "一整年：總判、關鍵月、逐月宜忌、六大領域、貴人與季度行動",
    span: "從農曆新年（{a}）起，到農曆十二月底（{b}）止 · 虛歲 {age}",
    ageNote: "虛歲：出生就算一歲，每過一個農曆新年加一歲。",
    verdict: "年度總判", keyword: "今年的關鍵字",
    yearPalace: "流年命宮", yearMut: "流年四化", decade: "與大限", overlap: "疊在一起的", small: "小限",
    decadeAges: "{p} · {a}–{b} 歲",
    rel: { 同宮: "與大限命宮同宮", 對宮: "在大限命宮的對宮", 三合: "與大限命宮三合", 其他: "與大限命宮各走各的" },
    overlapLine: "流年{m1}（{s1}）與大限{m2}（{s2}）同在{p}",
    curve: "每月的能量起伏",
    keyMonths: "三個關鍵月份", keySmooth: "最順手的月", keySlow: "最需要放慢的月", keyPivot: "最重要的一個月",
    months: "十二個月逐月",
    monthsNote: "紫微的流月按農曆月份走。每個月都標了農曆月份和對應的國曆日期；遇到閏月，依排盤慣例前半月併入上個月、後半月併入下個月。",
    lunarMonth: "農曆{m}月", leapFirst: "含閏{m}月上半月", leapSecond: "含閏{m}月下半月",
    monthPalace: "流月命宮在{p}：{s}",
    yi: "宜", ji: "不宜",
    focus: { work: "事業", money: "財運", love: "感情", rest: "作息" },
    levelWord: { 1: "放慢", 2: "收著走", 3: "平穩", 4: "順手", 5: "有勢" },
    areas: "六大領域", area: { career: "事業", wealth: "財運", love: "感情", rhythm: "健康作息", people: "人際貴人", home: "家宅出行" },
    single: "單身", paired: "有伴",
    allies: "貴人與合作", alliesYear: "今年的魁鉞", alliesNatal: "本命的魁鉞", alliesHelpers: "左輔右弼", alliesFriends: "交友宮",
    yearly: "流年{s}", monthly: "流月{s}",
    guards: "需要守的時段", quarters: "季度行動清單", quarter: { 1: "第一季", 2: "第二季", 3: "第三季", 4: "第四季" },
    /** the marks of a 流月 (report-facts.ts monthCurveZ) */
    flag: {
      祿到流月命宮: "化祿到流月命宮", 忌入流月命宮: "化忌入流月命宮", 忌沖流月命宮: "化忌沖流月命宮", 雙忌: "月忌與年忌同宮",
      疊流年命宮: "落在流年命宮", 疊大限命宮: "落在大限命宮", 魁鉞: "魁鉞到", 祿存: "祿存到", 昌曲: "昌曲到", 月馬: "月馬到", 羊陀: "羊陀到", 空劫: "空劫在",
    },
    flagLu: "化祿到{p}", flagJi: "化忌到{p}",
    /** the reasons of a 流月's level */
    tag: {
      mut: "這個月的{m}（{s}）入{p}", opp: "沖流月命宮", same: "月忌與年忌同在{p}", natal: "流月命宮有本命的{s}{m}",
      kuiyue: "月魁鉞在流月命宮", lucun: "月祿存在流月命宮", yangtuo: "{s}在流月命宮", kongjie: "流月命宮有空劫", steady: "平穩",
    },
  },
};

export const ZIWEI_HANT = { ui: { ...UI, ...UI_FOREIGN }, page: PAGE, report: REPORT };
type Widen<T> = T extends string ? string : T extends readonly (infer U)[] ? Widen<U>[] : { [K in keyof T]: Widen<T[K]> };
export type ZiweiPage = Widen<typeof PAGE>;
export type ZiweiReportText = Widen<typeof REPORT>;
const tree = (l: string) => localize(ZIWEI_HANT as unknown as { ui: Record<string, string>; page: ZiweiPage; report: ZiweiReportText }, GEN as unknown as Generated, l);

/**
 * 10-30: templates with no Chinese in them are copied as written by the translator, so each language's own forms are
 * set here — the hour of a branch for the 「選一個時辰」 buttons (Zi hour (Rat), 子の刻, 자시).
 */
function branchHours(l: Foreign): string {
  const n = BAZI_NAMES[l];
  return n.branches.map((b, i) => (l === "ja" || l === "ko" ? fmt(n.hour, { b }) : `${fmt(n.hour, { b })} (${n.animals[i]})`)).join(",");
}

/** 10-22: a 國曆 date is 公历 on the 简体 page, as on every other 简体 page. 10-30: and the seven other languages */
export const ziweiUi = (l: HlLocale | string): Record<string, string> => {
  if (isForeign(l)) return { ...tree(l).ui, branchNames: branchHours(l) };
  return Object.fromEntries(Object.entries(UI).map(([k, v]) => [k, l === "zh" ? loc(v, l as HlLocale).replace(/国历/g, "公历") : loc(v, l as HlLocale)]));
};
/** the page words (server pages) — 简体 converted, the others generated */
export const ziweiPage = (l: string): ZiweiPage => (isForeign(l) ? tree(l).page : (Object.fromEntries(Object.entries(PAGE).map(([k, v]) => [k, Array.isArray(v) ? v.map((x) => loc(x, l as HlLocale)) : loc(v, l as HlLocale)])) as ZiweiPage));
/** the report page's and letter's words outside Chinese */
export const ziweiReportText = (l: string): ZiweiReportText => tree(l).report;
