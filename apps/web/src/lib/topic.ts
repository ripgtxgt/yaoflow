/**
 * Lightweight topic classification of a question.
 * Used for merchandising segments ("everyone who asks about career"), for the
 * 一事一占 topic cap, and for choosing the focal line (用神). Keyword-based: no
 * extra AI call, no cost, and the same function runs in the browser (chip) and
 * on the server (stored topic).
 *
 * 09-23 (Neil: 「三分之一的起卦主题没被识别出来……识别率要95%以上」): 189 of 501
 * real questions fell through to "other". Reading them, almost none were
 * uncategorisable — they were relationship questions that never say 感情:
 * 「他今天會不會想到我」「宋生而家會唔會諗起我」「我們還有以後嗎」. The old
 * rules were one keyword list per topic, first match wins; this version
 * scores every topic and takes the strongest:
 *
 *   - keywords: 1 point per distinct hit (all scripts, Cantonese included);
 *   - two sentence shapes that only relationship questions have — someone
 *     else (他 / 她 / 佢 / 對方 / a name) doing something *to me*, and 我們 /
 *     我跟X asking where "we" go — score 2, so 「他工作很忙會不會聯繫我」 is
 *     about him and me, not about work;
 *   - ties go to the older order (career, relationship, money, health, study,
 *     decision); 「要不要 / 應該」 alone only decides when nothing else spoke.
 *
 * Coverage is checked against the real questions (scripts/topic-eval.ts, run
 * on the server — the questions never leave it); the synthetic cases in
 * test/topic.test.ts pin each rule without copying anyone's words.
 */

import type { Locale } from "./locales";
import { TOPIC_KW } from "./keywords";

export type Topic = "career" | "relationship" | "money" | "health" | "study" | "decision" | "other";

/** Display names for the topic chips on the cast page and the admin views. */
export const TOPIC_NAMES: Record<Topic, Record<Locale, string>> = {
  career:       { zh: "事业", "zh-hant": "事業", en: "Work", ja: "仕事", ko: "일·직장", fr: "Travail", de: "Beruf", es: "Trabajo", pt: "Trabalho" },
  relationship: { zh: "感情", "zh-hant": "感情", en: "Relationship", ja: "恋愛・関係", ko: "관계", fr: "Relation", de: "Beziehung", es: "Relación", pt: "Relação" },
  money:        { zh: "财运", "zh-hant": "財運", en: "Money", ja: "お金", ko: "돈", fr: "Argent", de: "Geld", es: "Dinero", pt: "Dinheiro" },
  health:       { zh: "健康", "zh-hant": "健康", en: "Health", ja: "健康", ko: "건강", fr: "Santé", de: "Gesundheit", es: "Salud", pt: "Saúde" },
  study:        { zh: "学业", "zh-hant": "學業", en: "Study", ja: "学業", ko: "학업", fr: "Études", de: "Studium", es: "Estudios", pt: "Estudos" },
  decision:     { zh: "抉择", "zh-hant": "抉擇", en: "A decision", ja: "決断", ko: "결정", fr: "Une décision", de: "Eine Entscheidung", es: "Una decisión", pt: "Uma decisão" },
  other:        { zh: "其他", "zh-hant": "其他", en: "Other", ja: "その他", ko: "기타", fr: "Autre", de: "Sonstiges", es: "Otro", pt: "Outro" },
};

const ORDER: Exclude<Topic, "other">[] = ["career", "relationship", "money", "health", "study", "decision"];

// zh patterns carry both scripts (and Cantonese), so the chip on the cast page reads 繁體 without OpenCC
const KW: Record<Exclude<Topic, "other">, { zh: RegExp; en: RegExp }> = {
  career: {
    zh: /工作|职业|職業|事业|事業|跳槽|离职|離職|辞职|辭職|老板|老闆|上司|同事|升职|升職|加薪|面试|面試|简历|簡歷|履历|履歷|创业|創業|公司|项目|專案|項目|合伙|合夥|生意|客户|客戶|裁员|裁員|offer|产品|產品|推广|推廣|营销|營銷|品牌|运营|運營|获客|獲客|上线|上線|发布|釋出|發布|门店|門店|店铺|店鋪|业绩|業績|销售|銷售|职位|職位|岗位|崗位|入职|入職|职缺|職缺|调动|調動|调回|調回|转调|轉調|调职|調職|总部|總部|单位|單位|主管|上下属|上下屬|下属|下屬|出差|外派|转工|轉工|返工|份工|搵工|找工|求职|求職|市道|行业|行業|同行|考核|绩效|績效|转正|轉正|试用期|試用期|甲方|乙方|合同|合約|签约|簽約|订单|訂單|领导|領導|猎头|獵頭|市况|市況|助理|工作机会|工作機會/i,
    en: /\bjob|career|\bwork\b|boss|manager|colleague|promotion|raise|interview|resume|startup|business|company|partner|client|layoff|quit|offer|product|launch|marketing|brand|campaign|store\b|relocat|transfer|office|headquarter|contract/i,
  },
  relationship: {
    zh: /感情|爱情|愛情|喜欢|喜歡|暗恋|暗戀|表白|恋爱|戀愛|分手|复合|復合|结婚|結婚|离婚|離婚|婚姻|老公|老婆|男友|女友|对象|對象|相亲|相親|暧昧|曖昧|出轨|出軌|外遇|小三|家人|父母|爸爸|妈妈|媽媽|父亲|父親|母亲|母親|女儿|女兒|儿子|兒子|孩子|小孩|子女|朋友|闺蜜|閨蜜|前任|前男友|前女友|前夫|前妻|旧爱|舊愛|旧人|舊人|挽回|桃花|正缘|正緣|良缘|良緣|姻缘|姻緣|缘分|緣分|缘份|緣份|另一半|伴侣|伴侶|情侣|情侶|男朋友|女朋友|男生|女生|男人|女人|异性|異性|爱我|愛我|爱他|愛他|爱她|愛她|爱上|愛上|心动|心動|脱单|脫單|约会|約會|拍拖|交往|追求|追我|封锁|封鎖|在一起|情感|冷淡|断联|斷聯|复联|復聯|破冰|僵局|和好|已读|已讀|回我|讯息|訊息|信息|消息|联系|聯繫|联络|聯絡|见面|見面|想我|想起|想念|思念|挂住|掛住|挂念|掛念|在乎|放下|放低|身边|身邊|加回|好友|床伴|玩伴|亲密|親密|先生|太太|宋生|渣|劈腿|吃醋|重新开始|重新開始|从前|從前|以后|以後|关系|關係|感觉|感覺|心里|心裡|内心|內心|真心|定位|界线|界線|主动|主動|避开|避開|回头|回頭|放弃|放棄|动心|心意|感受|聊天|聊开|聊開|吵架|沟通|溝通|谈谈|談談|认识|認識|邀约|邀約|辜负|辜負|认真发展|認真發展|对的人|對的人|真命|接触|接觸|新的人|冷掉|冷了|头像|頭像|意图|意圖|情降|过夜|過夜|之间|之間|分开|分開|怀抱|懷抱|跟他|跟她|和他|和她|与他|與他|与她|與她|同佢|找他|找她|爱(?!好)|愛(?!好)|撩|交友|慾望|欲望|这个人|這個人|那个人|那個人|遇到.{0,8}人/i,
    en: /\blove|relationship|dating|\bdate\b|crush|breakup|break up|get back together|ex\b|\bex-|my ex|marry|marriage|divorce|husband|wife|boyfriend|girlfriend|family|friend|affair|romance|reconcil|unblock|soulmate|\bhim\b|\bher\b|\bhe\b|\bshe\b|likes me|miss me|text me|contact me|dynamic/i,
  },
  money: {
    zh: /钱|錢|财|財|收入|投资|投資|理财|理財|股票|股|基金|房子|房产|房產|有房|买房|買房|卖房|賣房|租房|房租|贷款|貸款|债|債|亏|虧|赚|賺|价格|價格|涨|漲|跌|币|幣|资金|資金|筹措|籌措|筹钱|籌錢|借钱|借錢|还款|還款|欠款|工资|工資|薪水|奖金|獎金|彩票|中奖|中獎|买|買|换新|換新|诈骗|詐騙|被骗|被騙|赔偿|賠償|退款|保险|保險/i,
    en: /\bmoney|financ|invest|stock|fund|crypto|house|property|mortgage|debt|loan|profit|price|salary|buy\b|scam|refund|insurance/i,
  },
  health: {
    zh: /身体|身體|健康|生病|病|医院|醫院|医生|醫生|手术|手術|检查|檢查|疼|痛|失眠|睡眠|焦虑|焦慮|抑郁|抑鬱|情绪|情緒|心情|压力|壓力|治疗|治療|怀孕|懷孕|备孕|備孕|身孕|胎|生育|月经|月經|体重|體重|减肥|減肥|内耗|內耗|吃药|吃藥|康复|康復|复发|復發|睡觉|睡覺|午觉|午覺|累/i,
    en: /\bhealth|sick|illness|hospital|surgery|pain|sleep|anxiety|depress|stress|therapy|treatment|pregnan|nap\b|mood/i,
  },
  study: {
    zh: /学习|學習|考试|考試|考研|考公|读书|讀書|学校|學校|专业|專業|留学|留學|申请|申請|论文|論文|学位|學位|培训|培訓|课|課|英语|英語|英文|学会|學會|入读|入讀|小学|小學|中学|中學|大学|大學|幼儿园|幼兒園|幼稚园|幼稚園|老师|老師|成绩|成績|补习|補習|考上|录取|錄取|升学|升學|毕业|畢業|证书|證書|考证|考證|作业|作業|上学|上學/i,
    en: /\bstudy|exam|school|university|college|major|degree|thesis|abroad|application|course|class\b|learn english/i,
  },
  decision: {
    zh: /要不要|该不该|該不該|应不应该|應不應該|应唔应该|應唔應該|应该|應該|选哪|選哪|哪一|哪个|哪個|如何选|如何選|决定|決定|犹豫|猶豫|纠结|糾結|搬|去还是留|去還是留|值不值|怎么办|怎麼辦|该怎么|該怎麼|怎么做|怎麼做|點樣|点样|如何|还是|還是|选择|選擇|是否要|好不好|适合|適合|时机|時機|要.{1,8}吗|要.{1,8}嗎/i,
    en: /\bshould i|which one|choose|decide|decision|whether|move to|stay or|worth it|what should|how (do|can|should) i\b/i,
  },
};

/**
 * Someone else doing something to me, or "we" and where we go — relationship
 * questions that never name the relationship. Worth 2: it outweighs a stray
 * 「工作」 or 「壓力」 in the same sentence.
 */
const OTHER_TO_ME = /(他|她|佢|對方|对方|那個人|那个人|這個人|这个人|那個男|那个男|那個女|那个女|某某|心中那個人|[A-Z][a-z]+|[一-鿿]{1,3}(男|女|生|哥|姐|弟|妹))[^。！？?!]{0,14}(我|我們|我们)/;
const WE_TWO = /(我們|我们|我倆|我俩|兩個人|两个人|彼此|我(跟|和|與|与|同)(他|她|佢|[一-鿿A-Za-z]{1,4}))[^。！？?!]{0,16}(關係|关系|以後|以后|未來|未来|還會|还会|還有|还有|見面|见面|聯絡|联络|聯繫|联系|發展|发展|走向|會不會|会不会|能不能|有沒有|有没有|可不可以|重新|繼續|继续|狀態|状态|機會|机会|緣|缘|在一起|怎麼樣|怎么样|會怎|会怎|現在|现在|這樣|这样|之間|之间)/;
/** A person's inner state — 在不在乎我, 心裡還有我, 對我的感覺. */
const THEIR_HEART = /(他|她|佢|對方|对方|[一-鿿]{1,3}(男|女|生))[^。！？?!]{0,8}(心裡|心里|內心|内心|心中|感覺|感觉|看法|想法|態度|态度|印象|打算|意圖|意图|在乎|愛|爱|想念|喜歡|喜欢|想怎|意圖|意图|動機|动机)/;

/** Words that settle the matter on their own: a partner named, a job being moved, an operation. Worth 2. */
const STRONG: Partial<Record<Exclude<Topic, "other">, RegExp>> = {
  relationship: /老公|老婆|男友|女友|男朋友|女朋友|前任|前男友|前女友|前夫|前妻|伴侣|伴侶|另一半|太太|boyfriend|girlfriend|husband|wife|\bmy ex\b/i,
  health: /手术|手術|住院|开刀|開刀|癌|肿瘤|腫瘤|病情|确诊|確診|怀孕|懷孕|化疗|化療|surgery|pregnan|cancer/i,
  career: /猎头|獵頭|入职|入職|工作机会|工作機會|职缺|職缺|面试|面試|offer|岗位|崗位|升职|升職|跳槽|离职|離職|辞职|辭職|调动|調動|转调|轉調|助理|interview|promotion/i,
};
/** X 跟我 / X 和我 — the other side of 「我跟X」. */
const THEM_AND_ME = /[\u4e00-\u9fffA-Za-z]{1,4}(跟|和|與|与|同)我[^。！？?!]{0,12}(還|还|會|会|能|有|之間|之间|關係|关系|以後|以后|未來|未来)/;
/** Will they come back / reach out / still love — said without a 我. */
const WILL_THEY = /(他|她|佢|對方|对方)[^。！？?!]{0,6}(還會|还会|會不會|会不会|會|会|能不能|有沒有|有没有)[^。！？?!]{0,4}(回來|回来|回頭|回头|出現|出现|聯|联|找|愛|爱|想|在乎|主動|主动)/;

/** Every topic's score for a question; exported for the eval script and the tests. */
export function topicScores(question: string): Record<Exclude<Topic, "other">, number> {
  const q = question.trim();
  const out = { career: 0, relationship: 0, money: 0, health: 0, study: 0, decision: 0 };
  if (!q) return out;
  for (const t of ORDER) {
    const hits = new Set<string>();
    for (const re of [KW[t].zh, KW[t].en, TOPIC_KW[t]]) {
      const g = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
      for (const m of q.matchAll(g)) hits.add(m[0].toLowerCase());
    }
    out[t] = hits.size;
    if (STRONG[t]?.test(q)) out[t] += 2;
  }
  if (OTHER_TO_ME.test(q) || WE_TWO.test(q) || THEIR_HEART.test(q) || THEM_AND_ME.test(q) || WILL_THEY.test(q)) out.relationship += 2;
  return out;
}

export function classifyTopic(question: string): Topic {
  const s = topicScores(question);
  // 「要不要 / 應該」 is how a question is asked, not what it is about: it decides only when nothing else spoke
  let best: Topic = "other";
  let top = 0;
  for (const t of ORDER) {
    if (t === "decision") continue;
    if (s[t] > top) { best = t; top = s[t]; }
  }
  if (top === 0 && s.decision > 0) return "decision";
  return best;
}
