import { featureState } from "./features";
import { isAdmin } from "./admin-auth";
import { toHans } from "./hant";
import { CATALOG, type CatalogId } from "./catalog";
import { LOCALES, type Locale } from "./locales";
import { CURRENCIES, type Currency } from "./money";
import { nianshuSale } from "./mingli/nianshu/sale";
import SITE from "../data/l10n/site.json";
import { getPath, isForeign, textKey, type Generated } from "./l10n/core";

/**
 * 10-22 进度表 58 — every service the site offers, one list: the free doors (擲筊求籤、黃曆、擇日、每日運勢、排盤) and
 * the paid ones (the catalog rows), each with its page, its switch, the languages it exists in, a label and one line.
 * The 全部服務 page (/[locale]/services) is this list; the 「也可以試試」 strips (lib/promo.ts) pick from it.
 * Chinese-only services are written in 繁體 and converted for 简体 pages; the three that exist in every language carry
 * all nine. Server only (featureState reaches the database).
 */
export type ServiceGroup = "ask" | "self" | "daily" | "plan";
export interface Service {
  id: string;
  group: ServiceGroup;
  /** the page (locale-less) */
  path: string;
  /** the switch it lives behind; none = always */
  feature?: string;
  /** every language, or the two Chinese pages only */
  /** 10-30 进度表 128 ⑤: or a list, for a custom only some markets keep (犯太歲 → 厄年／삼재) */
  locales: "all" | "zh" | readonly Locale[];
  /** short name and one line; `zh-hant` is the source for 简体 */
  label: Partial<Record<Locale, string>> & { "zh-hant": string };
  line: Partial<Record<Locale, string>> & { "zh-hant": string };
  /** the catalog rows priced on the card (first one is the headline) */
  prices?: CatalogId[];
  /** the line under the price: who already has it */
  priceNote?: Partial<Record<Locale, string>> & { "zh-hant": string };
  free?: boolean;
}

const all9 = (zh: string, hant: string, en: string, ja: string, ko: string, fr: string, de: string, es: string, pt: string): Record<Locale, string> =>
  ({ zh, "zh-hant": hant, en, ja, ko, fr, de, es, pt });

export const SERVICES: Service[] = [
  // ---- 問事: something on your mind
  {
    id: "cast", group: "ask", path: "/cast", locales: "all",
    label: all9("六爻问事", "六爻問事", "Ask the Yijing", "易経に問う", "주역에 묻기", "Consulter le Yi Jing", "Das Yijing befragen", "Consultar el Yijing", "Consultar o Yijing"),
    line: all9("写一件事，起一卦；看走向、看日子，深断含追问。", "寫一件事，起一卦；看走向、看日子，深斷含追問。", "Write down one matter and cast; the reading says how it leans and when, with follow-up questions.", "一つの悩みを書いて卦を立てる。流れと時期、追加の質問つき。", "한 가지 일을 적고 괘를 뽑습니다. 흐름과 시기, 추가 질문까지.", "Écrivez une question, tirez l'hexagramme : la tendance, le moment, avec des questions de suivi.", "Eine Frage aufschreiben, das Hexagramm werfen: Tendenz, Zeitpunkt, mit Nachfragen.", "Escribe un asunto y lanza el hexagrama: la tendencia, el momento, con preguntas de seguimiento.", "Escreva uma questão e lance o hexagrama: a tendência, o momento, com perguntas de acompanhamento."),
    prices: ["pass_1", "pass_7", "pass_30"],
    priceNote: all9("通卡期内不限次；会员已含", "通卡期內不限次；會員已含", "Unlimited while a pass runs; included for members", "パス期間中は回数無制限。メンバーは含まれます", "패스 기간 동안 무제한. 멤버는 포함", "Illimité pendant un pass ; inclus pour les membres", "Unbegrenzt, solange ein Pass läuft; für Mitglieder inklusive", "Ilimitado mientras dure un pase; incluido para miembros", "Ilimitado enquanto um passe durar; incluído para membros"),
  },
  {
    id: "tarot", group: "ask", path: "/tarot", feature: "tarot", locales: "all", // 10-30 进度表 128 ②: 九语
    label: { "zh-hant": "線上塔羅" }, line: { "zh-hant": "抽牌免費、每張牌的意思免費看；把這幾張牌放在你這件事上讀，到期回來問結果。" },
    prices: ["tarot"], priceNote: { "zh-hant": "通卡／會員已含" },
  },
  {
    // 10-30 进度表 128 ⑤ (Neil 10-29): 日文 = 淺草寺のおみくじ, the others = the Guanyin oracle (lib/qian-foreign.ts)
    id: "jieqian", group: "ask", path: "/jieqian", locales: "all",
    label: { "zh-hant": "解籤", ja: "おみくじ（浅草寺）", ko: "관음 영첨", en: "Temple lots", fr: "Bâtonnets du temple", de: "Tempel-Orakelstäbchen", es: "Varillas del templo", pt: "Varetas do templo" },
    line: { "zh-hant": "在廟裡求了籤？輸入籤號或拍一張籤詩，看白話；再把這支籤放在你這件事上。",
      ja: "浅草寺の観音籤（おみくじ）百番。オンラインで引く、または引いた番号を入れて、籤の漢詩とその意味を。", ko: "관음 영첨 100첨. 온라인으로 뽑거나, 절에서 뽑은 번호를 넣어 첨시와 그 뜻을 봅니다.",
      en: "The Guanyin oracle's hundred lots: draw one online, or enter the number you drew at a temple, and read the poem and what it says.", fr: "Les cent bâtonnets de l’oracle de Guanyin : tirez-en un en ligne ou saisissez le numéro tiré au temple, puis lisez le poème et ce qu’il dit.", de: "Die hundert Stäbchen des Guanyin-Orakels: online ziehen oder die im Tempel gezogene Nummer eingeben und das Gedicht und seine Bedeutung lesen.", es: "Las cien varillas del oráculo de Guanyin: saca una en línea o escribe el número que sacaste en el templo, y lee el poema y lo que dice.", pt: "As cem varetas do oráculo de Guanyin: tire uma online ou digite o número tirado no templo e leia o poema e o que ele diz." },
    prices: ["qian_personal"], priceNote: { "zh-hant": "通卡／會員已含", ja: "読み解き：パスまたはメンバーシップ", ko: "풀이: 패스 또는 멤버십", en: "Reading: Pass or membership", fr: "Lecture : pass ou abonnement", de: "Deutung: Pass oder Mitgliedschaft", es: "Lectura: pase o membresía", pt: "Leitura: passe ou assinatura" },
  },
  {
    id: "jiaobei", group: "ask", path: "/jiaobei", feature: "jiaobei", locales: "all", // 10-30 进度表 128 ⑤: 九语 free: true,
    label: { "zh-hant": "線上擲筊、求籤" }, line: { "zh-hant": "一件事擲一次；或照廟裡的順序請示、抽籤、確認籤號。免費，不用註冊。" },
  },
  // ---- 看自己: the charts
  // 11-05 进度表 136 本命卦: 繁中 first (日文、英文 when 推广 delivers the words); no birth data, no sign-in
  {
    id: "bmg", group: "self", path: "/bmg", feature: "bmg", locales: ["zh-hant"], free: true,
    label: { "zh-hant": "本命卦小測" }, line: { "zh-hant": "12 題，約 2 分鐘，不用生辰：你做事、心裡有事、看事情、和人相處的習慣，是六十四卦裡的哪一卦。" },
  },
  {
    id: "bazi", group: "self", path: "/bazi", feature: "bazi", locales: "all", // 10-30 进度表 128 ④: 九语
    label: { "zh-hant": "八字" }, line: { "zh-hant": "登入就能排盤；白話解讀、深度報告、問這張盤要通卡或會員；正緣畫像單買。" },
    priceNote: { "zh-hant": "本命報告：通卡／會員；大運流年：會員" },
  },
  {
    id: "ziwei", group: "self", path: "/ziwei", feature: "ziwei", locales: "all", // 10-30 进度表 128 ④: 九语
    label: { "zh-hant": "紫微斗數" }, line: { "zh-hant": "登入就能排十二宮、星曜、四化；白話解讀、深度報告、問這張盤要通卡或會員。" },
    priceNote: { "zh-hant": "本命報告：通卡／會員；大限流年：會員" },
  },
  {
    id: "xingpan", group: "self", path: "/xingpan", feature: "astro", locales: "all", // 10-30 进度表 128 ④: 九语
    label: { "zh-hant": "星盤" }, line: { "zh-hant": "登入就能排本命盤；白話解讀、深度報告、問這張盤要通卡或會員。" },
    priceNote: { "zh-hant": "本命報告：通卡／會員；這個月的行運：會員" },
  },
  {
    id: "zhengyuan", group: "self", path: "/zhengyuan", feature: "zhengyuan", locales: "all", // 10-30 进度表 128 ④: 九语
    label: { "zh-hant": "正緣畫像" }, line: { "zh-hant": "從八字畫出容易和你走在一起的那類人：樣子、相處、在哪裡遇見。先免費看一句。" },
    prices: ["zhengyuan"], priceNote: { "zh-hant": "會員 8 折" },
  },
  {
    id: "hepan", group: "self", path: "/hepan", feature: "hepan", locales: "all", // 10-30 进度表 128 ④: 九语
    label: { "zh-hant": "合盤" }, line: { "zh-hant": "兩個人怎麼相處：八字、紫微、星盤一起看。概覽免費；可以請 TA 自己填生辰。" },
    prices: ["hepan"], priceNote: { "zh-hant": "會員 8 折" },
  },
  {
    id: "nianshu", group: "self", path: "/nianshu", feature: "nianshu", locales: "all", // 10-30 进度表 128 ④-5: 九语
    // the name the 年書 pages use in each language (data/l10n/nianshu.json ui.head; catalog label)
    label: all9("三合一年书", "三合一年書", "Year Book", "年運レポート", "연간 운세 책", "Livre de l'année", "Jahresbuch", "Libro del año", "Livro do ano"),
    line: { "zh-hant": "八字、紫微、星盤三套合看一年：總覽、四季、各領域，標出關鍵的月份。" },
    prices: ["nianshu"],
    priceNote: all9("会员 8 折；国历 11/1–1/31 早鸟价", "會員 8 折；國曆 11/1–1/31 早鳥價", "20% off for members; early-bird price Nov 1 – Jan 31",
      "メンバーは2割引、11月1日〜1月31日は早期割引価格", "멤버 20% 할인, 11월 1일~1월 31일 얼리버드 가격", "−20 % pour les membres ; tarif réduit du 1er novembre au 31 janvier",
      "20 % Rabatt für Mitglieder; Frühbucherpreis vom 1. November bis 31. Januar", "20 % de descuento para miembros; precio anticipado del 1 de noviembre al 31 de enero",
      "20% de desconto para membros; preço antecipado de 1º de novembro a 31 de janeiro"),
  },
  // ---- 每天: a reason to open the site
  {
    id: "today-qian", group: "daily", path: "/today-qian", feature: "today-qian", locales: "all",
    label: { "zh-hant": "今日一籤", ja: "今日のおみくじ", ko: "오늘의 첨", en: "Today's lot", fr: "Le bâtonnet du jour", de: "Stäbchen des Tages", es: "La varilla de hoy", pt: "A vareta de hoje" },
    line: { "zh-hant": "每天一支籤，看今天怎麼看；會員看全文。", ja: "毎日、浅草寺のおみくじを一本。今日の籤詩と大まかな向き。", ko: "매일 관음 영첨 한 첨. 오늘의 첨시와 큰 방향.",
      en: "One lot a day from the Guanyin oracle: today's poem and the direction it points.", fr: "Un bâtonnet par jour de l’oracle de Guanyin : le poème du jour et la direction qu’il indique.", de: "Jeden Tag ein Stäbchen aus dem Guanyin-Orakel: das Gedicht des Tages und die Richtung, die es zeigt.", es: "Una varilla al día del oráculo de Guanyin: el poema de hoy y la dirección que señala.", pt: "Uma vareta por dia do oráculo de Guanyin: o poema de hoje e a direção que ele aponta." },
    priceNote: { "zh-hant": "全文：會員", ja: "読み解き：パスまたはメンバーシップ", ko: "풀이: 패스 또는 멤버십", en: "Reading: Pass or membership", fr: "Lecture : pass ou abonnement", de: "Deutung: Pass oder Mitgliedschaft", es: "Lectura: pase o membresía", pt: "Leitura: passe ou assinatura" },
  },
  // 10-29 进度表 122–125: 姓名學 (self), 解夢 / 犯太歲 (daily); 126 娛樂小品 is not offered (Neil 10-29: 去掉)
  // 10-30 进度表 128 ⑥ (Neil 10-29): 日本姓名判断、韓國성명학; not in the Western languages
  { id: "name", group: "self", path: "/name", feature: "name", locales: ["zh-hant", "zh", "ja", "ko"], free: true,
    label: { "zh-hant": "姓名學", ja: "姓名判断", ko: "성명학 이름 풀이" },
    line: { "zh-hant": "查名字的字義、讀音、康熙筆劃與五格；加上生辰，對照八字喜用。", ja: "名前の画数（旧字体）で天格・人格・地格・外格・総格と五行、三才の並びを。かなの名前にも対応。", ko: "한글 이름의 발음오행과, 한자가 있으면 원획 획수로 본 수리 4격과 음양을." },
    priceNote: { "zh-hant": "寶寶取名／改名參考：單買，會員 8 折", ja: "無料", ko: "무료" } },
  // 10-29 进度表 127: no account needed (the one exception) — the 「用六爻細看」 behind it does need one
  // 10-29 进度表 128: in all nine languages (the steps by the reader's country, lib/xunwu-markets.ts)
  { id: "xunwu", group: "daily", path: "/xunwu", feature: "xunwu", locales: "all", free: true, label: { "zh-hant": "東西不見了？" }, line: { "zh-hant": "點三下、擲三顆骰子，看先往哪個方向、哪一類地方找，附掛失、停卡、定位的步驟。不用登入。" } },
  { id: "dream", group: "daily", path: "/dream", feature: "dream", locales: "all", free: true, label: { "zh-hant": "解夢" }, line: { "zh-hant": "兩百種常見的夢：老說法怎麼講、白話怎麼看。夢裡放不下的事，可以起一卦問。" } }, // 10-30 进度表 128 ③: 九语
  // 10-30 进度表 128 ⑤ (Neil 10-29: 換成當地的玩法): Japanese readers get 厄年, Korean readers 삼재; no such page elsewhere
  { id: "taisui", group: "daily", path: "/taisui", feature: "taisui", locales: ["zh-hant", "zh", "ja", "ko"], free: true,
    label: { "zh-hant": "犯太歲查詢", ja: "厄年早見表", ko: "삼재띠 조회" },
    line: { "zh-hant": "2027 年哪些生肖犯太歲，依習俗安太歲怎麼安。", ja: "2027年の厄年（前厄・本厄・後厄）を男女別に。生まれ年で調べられ、厄払いの時期と習わしも。", ko: "2027년 삼재띠와 들삼재·눌삼재·날삼재. 태어난 해로 내 띠의 삼재를 확인하고 풍습도 함께 봅니다." } },
  // 10-30 进度表 128 ⑤: 黃曆 → 今日の暦（六曜・選日）for Japanese readers, 음력·일진·손 없는 날 for Korean readers
  { id: "huangli", group: "daily", path: "/huangli", feature: "huangli", locales: "all", free: true,
    label: { "zh-hant": "黃曆", ja: "今日の暦", ko: "음력·손 없는 날", en: "Chinese almanac", fr: "Almanach chinois", de: "Chinesischer Almanach", es: "Almanaque chino", pt: "Almanaque chinês" },
    line: { "zh-hant": "今日宜忌、沖煞、節氣，每一天都有一頁。", ja: "今日の六曜（大安・仏滅…）と一粒万倍日・天赦日などの吉日、旧暦、二十四節気。", ko: "오늘의 음력 날짜와 일진, 절기, 손 없는 날. 달마다 손 없는 날 달력도.",
      en: "Today in the traditional Chinese almanac: what suits the day, what to put off, the clashing animal.", fr: "Aujourd’hui dans l’almanach chinois traditionnel : ce qui convient, ce qu’il vaut mieux remettre, l’animal en conflit.", de: "Heute im traditionellen chinesischen Almanach: was passt, was man verschiebt, welches Tierzeichen kollidiert.", es: "Hoy en el almanaque chino tradicional: qué conviene, qué dejar para otro día y con qué animal choca.", pt: "Hoje no almanaque chinês tradicional: o que convém, o que deixar para outro dia e com qual animal o dia se choca." },
    priceNote: { "zh-hant": "「今天對你」：會員", ja: "無料", ko: "무료", en: "Free", fr: "Gratuit", de: "Kostenlos", es: "Gratis", pt: "Grátis" } },
  // 10-30 进度表 128 ⑤: 擇日 → 吉日カレンダー (ja), 이사 날짜 손 없는 날 (ko)
  { id: "zeri", group: "daily", path: "/zeri", feature: "zeri", locales: "all", free: true,
    label: { "zh-hant": "擇日", ja: "吉日カレンダー", ko: "이사 날짜", en: "Pick a date", fr: "Choisir une date", de: "Einen Termin wählen", es: "Elegir una fecha", pt: "Escolher uma data" },
    line: { "zh-hant": "搬家、開市、結婚、出行……挑一件事，看哪幾天合適。", ja: "入籍・結婚、引っ越し、開業によい日を、これから3か月分。", ko: "앞으로 3개월의 손 없는 날을 주말과 함께. 이사·개업 날짜 고르기.",
      en: "A wedding, a move, opening a business: the days in the coming three months the Chinese almanac marks suitable.", fr: "Un mariage, un déménagement, une ouverture : les jours des trois prochains mois que l’almanach chinois juge favorables.", de: "Hochzeit, Umzug, Geschäftseröffnung: die Tage der nächsten drei Monate, die der chinesische Almanach als passend nennt.", es: "Una boda, una mudanza, abrir un negocio: los días de los próximos tres meses que el almanaque chino marca como adecuados.", pt: "Casamento, mudança, abrir um negócio: os dias dos próximos três meses que o almanaque chinês marca como adequados." },
    priceNote: { "zh-hant": "看一整年、按你的八字再篩：會員", ja: "無料", ko: "무료", en: "Free", fr: "Gratuit", de: "Kostenlos", es: "Gratis", pt: "Grátis" } },
  { id: "yunshi", group: "daily", path: "/yunshi", feature: "yunshi", locales: "all" /* 10-30 进度表 128 ⑤ */, free: true,
    label: all9("每日运势", "每日運勢", "Daily horoscope", "今日の運勢", "오늘의 띠별 운세", "Horoscope du jour", "Tageshoroskop", "Horóscopo diario", "Horóscopo do dia"),
    line: all9("十二生肖，今天各自的节奏与可做的事。", "十二生肖，今天各自的節奏與可做的事。", "Your sun sign and your Chinese zodiac animal: today's rhythm and what suits the day.", "12星座と干支で見る、今日のリズムと過ごし方。", "열두 띠별로 오늘의 흐름과 하면 좋은 일을 봅니다.", "Votre signe et votre animal du zodiaque chinois : le rythme du jour et ce qui lui convient.", "Dein Sternzeichen und dein chinesisches Tierzeichen: der Rhythmus des Tages und was zu ihm passt.", "Tu signo solar y tu animal del zodiaco chino: el ritmo de hoy y lo que le conviene.", "Seu signo solar e seu animal do zodíaco chinês: o ritmo de hoje e o que combina com o dia."),
    priceNote: all9("按你八字算的「你的今天」：会员", "按你八字算的「你的今天」：會員", "Free, every day", "毎日無料", "매일 무료", "Gratuit, chaque jour", "Kostenlos, jeden Tag", "Gratis, cada día", "Grátis, todos os dias") },
  // ---- 方案: membership and passes
  {
    id: "member", group: "plan", path: "/account", locales: "all",
    label: all9("会员", "會員", "Membership", "メンバーシップ", "멤버십", "Abonnement", "Mitgliedschaft", "Membresía", "Assinatura"),
    line: all9("全站付费解读不限次，加上跟着时间走的：大运流年、每天按你八字算的今天、今日一签全文、每天一封信、每月流月信、报告月更、年书合盘 8 折；自动续费，随时可取消。", "全站付費解讀不限次，加上跟著時間走的：大運流年、每天按你八字算的今天、今日一籤全文、每天一封信、每月流月信、報告月更、年書合盤 8 折；自動續訂，隨時可取消。", "Every paid reading on the site, plus a daily letter, a monthly outlook, report rewrites and 20% off the big one-offs; renews monthly, cancel any time.", "サイト内の有料鑑定すべてに加え、毎日の手紙、毎月の運勢、レポートの更新、大型商品 20% 引き。月額自動更新、いつでも解約可。", "사이트의 모든 유료 풀이에 매일 편지, 매월 운세, 리포트 갱신, 대형 상품 20% 할인까지. 월 자동 갱신, 언제든 해지.", "Toutes les lectures payantes, plus une lettre quotidienne, un horizon mensuel, des rapports réécrits et 20 % sur les grands formats ; renouvellement mensuel, résiliable à tout moment.", "Jede bezahlte Deutung, dazu ein täglicher Brief, ein Monatsausblick, neu geschriebene Berichte und 20 % auf die großen Einmalkäufe; monatlich, jederzeit kündbar.", "Todas las lecturas de pago, más una carta diaria, una mirada mensual, informes reescritos y 20 % en los grandes; se renueva cada mes, cancela cuando quieras.", "Todas as leituras pagas, mais uma carta diária, um panorama mensal, relatórios reescritos e 20% nos grandes; renova mensalmente, cancele quando quiser."),
    prices: ["month"],
  },
  {
    id: "tongka", group: "plan", path: "/cast", feature: "tongka", locales: "all",
    label: all9("通卡", "通卡", "Passes", "パス", "패스", "Pass", "Pass", "Pases", "Passes"),
    line: all9("1 日、7 天、30 天，一次付清、不续费；期内问事与本命报告不限次。", "1 日、7 天、30 天，一次付清、不續訂；期內問事與本命報告不限次。", "1 day, 7 days or 30 days, paid once, never renewed; every paid reading on the site while it runs.", "1 日・7 日・30 日。一回払い、更新なし。期間中は有料鑑定すべてが使えます。", "1일·7일·30일. 한 번 결제, 갱신 없음. 기간 동안 모든 유료 풀이 이용.", "1 jour, 7 jours ou 30 jours, payé une fois, sans renouvellement ; toutes les lectures payantes pendant la durée.", "1 Tag, 7 Tage oder 30 Tage, einmal bezahlt, keine Verlängerung; jede bezahlte Deutung, solange er läuft.", "1 día, 7 días o 30 días, un solo pago, sin renovación; todas las lecturas de pago mientras dure.", "1 dia, 7 dias ou 30 dias, pago uma vez, sem renovação; todas as leituras pagas enquanto durar."),
    prices: ["pass_1", "pass_7", "pass_30"],
  },
];

export const GROUP_LABEL: Record<ServiceGroup, Record<Locale, string>> = {
  ask: all9("问事", "問事", "Something on your mind", "問いかける", "묻기", "Une question", "Eine Frage", "Una pregunta", "Uma pergunta"),
  self: all9("看自己", "看自己", "Your chart", "自分を知る", "나를 보기", "Votre thème", "Dein Horoskop", "Tu carta", "Seu mapa"),
  daily: all9("每天", "每天", "Every day", "毎日", "매일", "Chaque jour", "Jeden Tag", "Cada día", "Todo dia"),
  plan: all9("会员与通卡", "會員與通卡", "Membership and passes", "メンバーシップとパス", "멤버십과 패스", "Abonnement et pass", "Mitgliedschaft und Pässe", "Membresía y pases", "Assinatura e passes"),
};

/** one line under a door's name — the home page's intent cards and the doors' own pages (/services/self, /services/daily);
 *  看自己 and 每天 exist only on the Chinese pages */
export const GROUP_LINE: Record<"ask" | "self" | "daily", Record<"zh" | "zh-hant", string>> = {
  ask: { "zh-hant": "六爻、塔羅、解籤、擲筊——一件事，問到清楚。", zh: "六爻、塔罗、解签、掷筊——一件事，问到清楚。" },
  self: { "zh-hant": "八字、紫微、星盤排盤免費；深度報告、合盤、年書。", zh: "八字、紫微、星盘排盘免费；深度报告、合盘、年书。" },
  daily: { "zh-hant": "今日一籤、黃曆、擇日、每日運勢，每天看一眼。", zh: "今日一签、黄历、择日、每日运势，每天看一眼。" },
};

/** a service's words in this locale: its own when it has them, 简体 from 繁體, and for the seven other languages the
 *  generated translation (data/l10n/site.json, 10-29 进度表 128), then English */
export function serviceText(s: Service, locale: Locale): { label: string; line: string; priceNote: string | null } {
  const gen = (field: string): string | null => {
    if (!isForeign(locale)) return null;
    const v = getPath((SITE as unknown as Generated)[locale], `services.${s.id}.${field}`) ?? getPath((SITE as unknown as Generated).en, `services.${s.id}.${field}`);
    return typeof v === "string" && v ? v : null;
  };
  const pick = (m: Partial<Record<Locale, string>> & { "zh-hant": string }, field: string) =>
    m[locale] ?? (locale === "zh" ? toHans(m["zh-hant"]) : gen(field) ?? m.en ?? m["zh-hant"]);
  return { label: pick(s.label, "label"), line: pick(s.line, "line"), priceNote: s.priceNote ? pick(s.priceNote, "priceNote") : null };
}

/** a site-wide sentence from data/l10n/site.json in a foreign language (null on Chinese pages, or when it is missing) */
export function siteLine(locale: Locale, path: string): string | null {
  if (!isForeign(locale)) return null;
  const v = getPath((SITE as unknown as Generated)[locale], path) ?? getPath((SITE as unknown as Generated).en, path);
  return typeof v === "string" && v ? v : null;
}
/** a cross card's sentence in this language (the map is written in 繁體 and keyed by its own text) */
export function crossLine(line: string, locale: Locale): string {
  if (locale === "zh-hant") return line;
  if (locale === "zh") return toHans(line);
  return siteLine(locale, `cross.${textKey(line)}`) ?? line;
}

/** 10-29 进度表 128: the languages a service is open in — every one, or the two Chinese pages */
export function serviceLocales(id: string): readonly Locale[] {
  const s = SERVICES.find((x) => x.id === id);
  if (s && Array.isArray(s.locales)) return LOCALES.filter((l) => (s.locales as readonly Locale[]).includes(l));
  return !s || s.locales === "all" ? LOCALES : (["zh-hant", "zh"] as const);
}
export const serviceOpenIn = (id: string, locale: Locale): boolean => serviceLocales(id).includes(locale);

/** the services this request may see, in this locale: the switch on for everyone, or preview for an admin browser */
export async function servicesFor(locale: Locale, adminCookie: string | undefined): Promise<Service[]> {
  const admin = await isAdmin(adminCookie).catch(() => false);
  return SERVICES.filter((s) => {
    if (s.locales === "zh" && locale !== "zh" && locale !== "zh-hant") return false;
    if (Array.isArray(s.locales) && !s.locales.includes(locale)) return false;
    if (!s.feature) return true;
    const st = featureState(s.feature);
    return st === "on" || (st === "preview" && admin);
  });
}

/** the price table the page hands its client part: every priced row in every currency (the headline variants) */
export type PriceTable = Record<string, Record<Currency, number>>;
export function priceTable(now = Date.now()): PriceTable {
  const sale = nianshuSale(now);
  const rows: [string, CatalogId, Parameters<NonNullable<(typeof CATALOG)[CatalogId]["price"]>>[1]][] = [
    ["pass_1", "pass_1", { first: true }], ["pass_1:full", "pass_1", {}], ["pass_7", "pass_7", {}], ["pass_30", "pass_30", {}],
    ["tarot", "tarot", {}], ["qian_personal", "qian_personal", {}], ["qian_card", "qian_card", {}],
    // 10-22 进度表 92: the membership is written 「首月 X，之後 Y」 — the first month of a new member costs more
    ["month:first", "month", { first: true }],
    ["hepan", "hepan", {}], ["hepan:member", "hepan", { member: true }], ["zhengyuan", "zhengyuan", {}], ["zhengyuan:member", "zhengyuan", { member: true }],
    ["name_baby", "name_baby", {}], ["name_baby:member", "name_baby", { member: true }],
    ["nianshu", "nianshu", { early: sale.early }], ["nianshu:member", "nianshu", { early: sale.early, member: true }], ["nianshu:regular", "nianshu", {}],
    ["month", "month", {}], ["year", "year", {}],
  ];
  const out: PriceTable = {};
  for (const [k, id, o] of rows) out[k] = Object.fromEntries(CURRENCIES.map((c) => [c, CATALOG[id].price!(c, o)])) as Record<Currency, number>;
  return out;
}

export const SERVICE_IDS = SERVICES.map((s) => s.id);
export const serviceById = (id: string): Service | null => SERVICES.find((s) => s.id === id) ?? null;
export { LOCALES };
