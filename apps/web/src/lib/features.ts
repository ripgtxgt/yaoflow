import { db } from "./db";
import { ADMIN_COOKIE, isAdmin } from "./admin-auth";

/**
 * 10-15 功能开关 (Neil: 「我们有没有必要分测试环境和线上环境呢」→ chose the third way: 「嗯，先做第三种吧」).
 * No second environment: a big feature goes live behind a switch in state `preview` — on the real site, with the real
 * data, but only a browser signed in to /admin sees it (the yf_admin cookie, path /). Neil clicks through it on his phone;
 * then /admin/features turns it `on` for everyone (or `off`). The state lives in the database, so flipping it needs no
 * deploy and no restart; each process re-reads it within 15 seconds.
 *
 * Adding a feature: put it in FEATURES with `def: "preview"`, gate its page, its API routes and its entry links with
 * featureVisible / canSee, and leave it out of the sitemap and the crons until it is `on` (featureOn).
 */
export type FeatureState = "preview" | "on" | "off";
export const FEATURES: { name: string; label: string; def: FeatureState; where: string }[] = [
  { name: "today-qian", label: "今日一籤（每日抽籤、日曆、籤卡）", def: "on", where: "/zh-hant/today-qian · 首頁、解籤頁、籤頁、事頁、帳號頁的入口 · 07:30 早信與籤卡到期信" },
  { name: "jiaobei", label: "線上擲筊＋線上求籤（进度表 67）", def: "preview", where: "/zh-hant/jiaobei · /zh-hant/qiuqian（简体 /zh/…）· 开放后：解籤页、今日一籤页、籤页的入口与 sitemap" },
  { name: "tarot", label: "線上塔羅（进度表 68）", def: "preview", where: "/zh-hant/tarot 抽牌 · /zh-hant/tarot/<牌> 78 张牌义页 · /zh-hant/tarot/r/<token> 结果与付费解读（简体 /zh/…）· 开放后：sitemap、回访信、解籤与擲筊页的入口" },
  { name: "huangli", label: "黃曆（进度表 69）", def: "preview", where: "/zh-hant/huangli 今日 · /huangli/<日期> · /huangli/<年-月> · /huangli/terms/<詞>（简体 /zh/…）" },
  { name: "zeri", label: "擇日（进度表 70）", def: "preview", where: "/zh-hant/zeri · /zeri/<事項>" },
  { name: "yunshi", label: "每日運勢・生肖（进度表 73）", def: "preview", where: "/zh-hant/yunshi · /yunshi/<生肖>" },
  { name: "ziwei", label: "紫微斗數排盤（进度表 71）", def: "preview", where: "/zh-hant/ziwei" },
  { name: "bazi", label: "八字排盤（进度表 72）", def: "preview", where: "/zh-hant/bazi" },
  { name: "bazi-paid", label: "八字付費報告：深度報告（通卡／會員）＋流年報告（單買）；正緣畫像 10-26 起改單賣，見 zhengyuan", def: "preview", where: "POST /api/bazi/report（會員）· POST /api/bazi/report/checkout（流年，單買）· /zh-hant/bazi/r/<token> 報告頁（简体 /zh/…）· 入口在八字排盤頁" },
  { name: "ziwei-paid", label: "紫微付費報告：深度報告（會員）＋紫微年書（單買）", def: "preview", where: "POST /api/ziwei/report（會員）· POST /api/ziwei/report/checkout（年書，單買）· /zh-hant/ziwei/r/<token> 報告頁（简体 /zh/…）· 入口在紫微命盤頁" },
  { name: "astro", label: "星盤・本命盤（进度表 74）", def: "preview", where: "/zh-hant/xingpan" },
  { name: "astro-paid", label: "星盤付費報告：深度報告（會員）＋星盤年報（單買）", def: "preview", where: "POST /api/astro/report（會員）· POST /api/astro/report/checkout（年報，單買）· /zh-hant/xingpan/r/<token> 報告頁（简体 /zh/…）· 入口在星盤頁" },
  { name: "hepan", label: "合盤（八字・紫微・星盤）：免費概覽＋合盤報告（單買，會員也付）", def: "preview", where: "/zh-hant/hepan 免費概覽 · POST /api/hepan/checkout（單買）· /zh-hant/hepan/r/<token> 報告頁（简体 /zh/…）· 入口在八字、紫微、星盤排盤頁" },
  // 10-29 进度表 122–126 (Neil: 「做进度表 122 到 126」): the free pages open at once, the paid ones in preview first
  { name: "name", label: "姓名學免費查詢＋每字一頁（进度表 122）", def: "on", where: "/zh-hant/name 查詢 · /zh-hant/name/zi/<字> 字頁（简体 /zh/…）" },
  { name: "name-paid", label: "姓名學付費：寶寶取名參考、改名參考（單買，會員 8 折）（Neil 10-29 開放）", def: "on", where: "/zh-hant/name#buy 查詢頁下方「請我們幫你想名字」· POST /api/name/checkout · /zh-hant/name/r/<token> 報告頁" },
  { name: "dream", label: "解夢 200 個常見的夢（进度表 124）", def: "on", where: "/zh-hant/dream · /zh-hant/dream/<夢>（简体 /zh/…）" },
  { name: "taisui", label: "犯太歲查詢＋安太歲指引（进度表 125 第一期）", def: "on", where: "/zh-hant/taisui · /zh-hant/taisui/<生肖> · 年書加「太歲」一章" },
  { name: "fun", label: "娛樂小品：前世今生、渣男鑑定（通卡／會員）、運勢 K 線（會員）（进度表 126）（Neil 10-29：不上線，關閉；程式留著）", def: "off", where: "/zh-hant/fun · /zh-hant/fun/past-life 前世今生 · /zh-hant/fun/together 渣男鑑定 · /zh-hant/fun/kline 運勢 K 線（简体 /zh/…）" },
  // 10-29 进度表 127 (Neil: 「这个可以例外」免登录): the one asking page that needs no account
  { name: "xunwu", label: "尋物「東西不見了？」：擲三顆骰子看方向和先找的地方，免登入（进度表 127；Neil 10-29 開放）", def: "on", where: "/zh-hant/xunwu（简体 /zh/xunwu）· 结果卡「用六爻細看」进起卦（要登入）· 入口：服务页「每天」、首页「不想起卦？也可以」、擲筊页、求籤页、解梦物品页、找东西的六爻解读页 · sitemap · 全站回访小卡" },
  // 11-05 进度表 136–139 本命卦 (Neil 11-05：「做进度表 134–139」；138/139 先做好、開關關著，等小測上線滿一個月看數據)
  { name: "bmg", label: "本命卦小測：12 題或四字母＋2 題，不登入、不要生辰；結果頁、分享卡、帶著本命卦問一卦（进度表 136）", def: "on", where: "/zh-hant/bmg · /zh-hant/bmg/r/<token> · /api/bmg/card?k= · 「我的」本命卦 · 問事解讀加「以你的本命卦來說」" },
  { name: "bmg-pair", label: "合卦：兩人各做本命卦，並排看六爻哪幾層相合／相衝（进度表 138；Neil 11-05：「直接开吧」）", def: "on", where: "自己的結果頁「邀他也做一次」→ /zh-hant/bmg?inv=<token> → 對方的結果頁多一節「你們倆的本命卦」" },
  { name: "bmg-pages", label: "本命卦內容頁：16 個四字母頁＋64 卦人格頁，進 sitemap（进度表 139；Neil 11-05：「直接开吧」）", def: "on", where: "/zh-hant/bmg/type/<INTJ> · /zh-hant/bmg/gua/<1-64>" },
  { name: "zhengyuan", label: "正緣畫像單賣（像合盤、年書：單買，會員 8 折，通卡不含）", def: "on", where: "/zh-hant/zhengyuan 產品頁（免費先看 TA 的樣子一句）· POST /api/zhengyuan/checkout · 報告頁沿用 /zh-hant/bazi/r/<token> · 八字排盤頁的正緣卡改連到產品頁" },
  { name: "nianshu", label: "三合一年書（八字＋紫微＋星盤，一年一買，會員也付；三個排盤頁不再賣年報）", def: "preview", where: "/zh-hant/nianshu 產品頁 · POST /api/nianshu/checkout · /zh-hant/nianshu/r/<token> 年書頁（简体 /zh/…）" },
  { name: "tongka", label: "通卡（1 日／7 天／30 天買斷，期內全站不限次）＋會員權益重整（进度表 75）", def: "preview", where: "起卦頁付費區、塔羅／解籤／報告的付費入口、/account#membership；預覽中只有後台瀏覽器看到通卡面板，其他人照舊單買" },
  { name: "checkout-v2", label: "統一結帳入口 POST /api/checkout/v2（进度表 57；舊接口照舊，同一套處理）", def: "preview", where: "POST /api/checkout/v2 {product} · 全部服務頁 /services 的按鈕（58）；預覽中只有後台瀏覽器打得到，其他人照舊走各產品自己的結帳接口" },
  { name: "services", label: "全部服務頁＋首頁主推可配置（进度表 58）", def: "preview", where: "/zh-hant/services（九語）· 首頁、解籤頁、深斷頁底部「也可以試試」的主推" },
  // 11-27 运营 bot（Sakura：「我需要用 grokbot 新建另外一个 bot 去做自动运营」→「可以的」）：后台页本来就只有管理员能进；开关管 bot 的入口
  { name: "ops-bot", label: "社媒运营 bot：Grok Bot 写稿进待审、发已批稿、回帖登记（11-27）", def: "preview", where: "/admin/bot 待审与派任务 · POST /api/bot/mcp（Bearer BOT_MCP_TOKEN）· 关掉＝bot 的入口 404" },
  { name: "recover-offer", label: "挽回信改版（离开 5 分钟后一封、1 小时内 7 折）", def: "on", where: "勾了「沒付完時寄信提醒我」的深断、升级、会员、通卡结账 · /offer/<token> · 预览中只寄给我们自己的邮箱，旧的四封序列照常寄给客人；开放后旧序列停止" },
];
export const isFeature = (x: unknown): x is string => typeof x === "string" && FEATURES.some((f) => f.name === x);

type Cache = { at: number; states: Map<string, FeatureState> };
const G = globalThis as unknown as { __yfFeatures?: Cache };
const TTL = 15_000;

function ensure(): void {
  db().exec("CREATE TABLE IF NOT EXISTS features (name TEXT PRIMARY KEY, state TEXT NOT NULL, updated_at INTEGER NOT NULL)");
}

function load(now = Date.now()): Map<string, FeatureState> {
  const c = G.__yfFeatures;
  if (c && now - c.at < TTL) return c.states;
  const states = new Map<string, FeatureState>();
  try {
    ensure();
    for (const r of db().prepare("SELECT name, state FROM features").all() as { name: string; state: string }[]) {
      if (r.state === "preview" || r.state === "on" || r.state === "off") states.set(r.name, r.state);
    }
  } catch { /* no database (build time): defaults */ }
  G.__yfFeatures = { at: now, states };
  return states;
}

export function featureState(name: string): FeatureState {
  return load().get(name) ?? FEATURES.find((f) => f.name === name)?.def ?? "off";
}
/** Open to everyone — what the sitemap, the crons and the letters ask. */
export const featureOn = (name: string): boolean => featureState(name) === "on";

/** Visible to this request: on → everyone; preview → only a browser signed in to the admin; off → no one. */
export async function featureVisible(name: string, adminCookie: string | undefined): Promise<boolean> {
  const s = featureState(name);
  if (s === "on") return true;
  if (s === "off") return false;
  return isAdmin(adminCookie);
}

/** The same for a server component (reads the request cookies). */
export async function canSee(name: string): Promise<boolean> {
  const { cookies } = await import("next/headers");
  return featureVisible(name, (await cookies()).get(ADMIN_COOKIE)?.value);
}

export function setFeature(name: string, state: FeatureState, now = Date.now()): void {
  ensure();
  db().prepare("INSERT INTO features (name, state, updated_at) VALUES (?,?,?) ON CONFLICT(name) DO UPDATE SET state = excluded.state, updated_at = excluded.updated_at").run(name, state, now);
  G.__yfFeatures = undefined;
}

export function featureRows(): { name: string; label: string; where: string; state: FeatureState; def: FeatureState; updatedAt: number | null }[] {
  ensure();
  const rows = new Map((db().prepare("SELECT name, state, updated_at FROM features").all() as { name: string; state: FeatureState; updated_at: number }[]).map((r) => [r.name, r]));
  return FEATURES.map((f) => ({ name: f.name, label: f.label, where: f.where, def: f.def, state: rows.get(f.name)?.state ?? f.def, updatedAt: rows.get(f.name)?.updated_at ?? null }));
}
