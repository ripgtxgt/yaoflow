import { BRANCH_PHASE, clashes, combines, generates, najiaFor, relationTo, type ChartLine, type FullChart, type Phase, type Relation } from "@yaoflow/engine";
import { isLostThing } from "./lost-words";

/**
 * 10-29 进度表 127 尋物 — the 六爻「尋物」question type: a question about a lost THING (never a person, never a pet — 寵物版
 * comes later) is read with its own 用神 and the classical signals for lost things, computed here so the reading only
 * has to explain them.
 *
 *   用神 by what was lost: 證件、文書、衣物、包包、車 → 父母; 錢包、現金、卡片、首飾、鑰匙、手機與 3C → 妻財 (3C is not in
 *   the old books; we treat it as 器物 = 妻財, and the 尋物 page says so). 《卜筮正宗》「要識其中之得失，須詳卦上之妻財」;
 *   「倘失舟車衣服，不宜妻位交重」 puts 舟車衣服 under 父母.
 *   The signals are 《卜筮正宗》卷十四〈失脫〉(黃金策) line by line — checked against the book (books/王維德《卜筮正宗》.pdf).
 *   《增刪卜易》 has no chapter on lost things (its table of contents was checked), so 卜筮正宗 is the text.
 *   Not used: the lines about catching a thief (形貌、方位、捕盜) — we never point at a person.
 */
export type LostFocal = "parent" | "wealth";

const WEALTH_RE = /鑰匙|钥匙|錢包|钱包|錢|钱|現金|现金|銀行卡|银行卡|信用卡|提款卡|卡片|首飾|首饰|戒指|項鍊|项链|耳環|耳环|手鍊|手链|手鐲|手镯|手錶|手表|黃金|黄金|金飾|金饰|玉|手機|手机|電腦|电脑|平板|耳機|耳机|相機|相机|3C/i;
const PARENT_RE = /證|证|護照|护照|駕照|驾照|文件|文書|文书|合約|合约|合同|書|书|票|單據|单据|衣|外套|褲|裤|帽|鞋|包|袋|行李|圍巾|围巾|車|车/;

/** 10-29 进度表 128: the same two lists in the seven other languages (the 尋物 page's question arrives in the reader's language) */
const WEALTH_FOREIGN = /\b(wallet|purse|keys?|phone|iphone|laptop|tablet|cards?|cash|money|ring|necklace|earrings?|bracelet|watch|jewel(?:le)?ry|gold|camera|headphones|earbuds|airpods)\b|財布|鍵|スマホ|スマートフォン|携帯|パソコン|カード|アクセサリー|現金|お金|指輪|ネックレス|ピアス|時計|アクセサリー|지갑|열쇠|휴대폰|핸드폰|노트북|카드|장신구|현금|돈|반지|목걸이|귀걸이|팔찌|시계|\b(portefeuille|cl[ée]s?|t[ée]l[ée]phone|portable|carte|argent|bague|collier|montre|bijou)|\b(Portemonnaie|Geldbeutel|Schlüssel|Handy|Laptop|Karte|Geld|Ring|Kette|Uhr|Schmuck)|\b(cartera|billetera|llaves?|tel[ée]fono|celular|m[óo]vil|tarjeta|dinero|anillo|collar|reloj|joya)|\b(carteira|chaves?|celular|telefone|cart[ãa]o|dinheiro|anel|colar|rel[óo]gio|joia)/i;
const PARENT_FOREIGN = /\b(passport|ID|license|licence|documents?|papers|contract|ticket|clothes|clothing|jacket|coat|bag|backpack|luggage|scarf|car)\b|書類|証明書|パスポート|免許証|マイナンバー|衣類|服|コート|バッグ|カバン|鞄|車|서류|증명서|여권|신분증|면허증|옷|코트|가방|차|\b(papiers|passeport|permis|document|v[êe]tement|veste|manteau|sac|voiture)|\b(Ausweis|Pass|Führerschein|Dokument|Kleidung|Jacke|Mantel|Tasche|Rucksack|Auto)|\b(documento|pasaporte|licencia|ropa|chaqueta|abrigo|bolso|mochila|coche|carro)|\b(documento|passaporte|RG|CNH|roupa|jaqueta|casaco|bolsa|mochila|carro)/i;

/** Is this a lost-thing question, and which line is the thing? (both scripts, Cantonese too, and the seven other languages) */
export function lostItemOf(question: string): { focal: LostFocal } | null {
  // the question must name a thing — 「工作丟了」「機會不見了」 are not lost things (lib/lost-words.ts)
  if (!isLostThing(question)) return null;
  const q = question.slice(0, 300);
  if (WEALTH_RE.test(q) || WEALTH_FOREIGN.test(q)) return { focal: "wealth" };
  if (PARENT_RE.test(q) || PARENT_FOREIGN.test(q)) return { focal: "parent" };
  return { focal: "wealth" };
}

/** 「五路四門，六乃棟樑閣上；初井二灶，三為閨閫房中」 */
const LINE_PLACE: Record<number, string> = {
  1: "初爻为井：井边、水边、低处", 2: "二爻为灶：灶间、厨房", 3: "三爻为闺阃房中：卧房、房间里",
  4: "四爻为门：门口、门边、玄关", 5: "五爻为路：路上、走道、通道", 6: "六爻为栋梁阁上：高处，梁上、阁楼、柜顶",
};
/** 「水失於池，木乃柴薪之內；土埋在地，金為磚石之間」 (火 has no line) */
const PHASE_PLACE: Partial<Record<Phase, string>> = {
  water: "水失于池：水边、有水的地方", wood: "木乃柴薪之内：木头、柴草、植物堆里", earth: "土埋在地：地上、底下、被土或杂物埋住", metal: "金为砖石之间：砖石、水泥、金属堆之间",
};
const REL_ZH: Record<Relation, string> = { parent: "父母", sibling: "兄弟", child: "子孙", wealth: "妻财", officer: "官鬼" };

export interface LostSignal { rule_zh: string; means_zh: string }
export interface LostFacts {
  focal: LostFocal; focal_zh: string; why_zh: string;
  /** the line read as the thing: present in the chart, or hidden (伏神) under the line at its place */
  line: { pos: number; ganzhi: string; phase: string; hidden: boolean; under?: { pos: number; ganzhi: string; relation_zh: string } } | null;
  home_or_outside: "inner" | "outer" | null;
  moved: boolean | null;
  place_hints: string[];
  signals: LostSignal[];
}

const sig = (rule_zh: string, means_zh: string): LostSignal => ({ rule_zh, means_zh });

/** 用神 among the chart's lines: 动者 > 临世应者 > 旺者 > 位低者 — the order lib/timing.ts picks the focal line in */
function pickPresent(lines: ChartLine[]): ChartLine | null {
  const rank = { wang: 4, xiang: 3, xiu: 2, qiu: 1, si: 0 } as const;
  return [...lines].sort((a, b) => Number(b.changing) - Number(a.changing) || Number(b.isWorld || b.isResponse) - Number(a.isWorld || a.isResponse)
    || rank[b.strength] - rank[a.strength] || a.position - b.position)[0] ?? null;
}

/** The computed reading of a lost-thing chart (null for any other question). */
export function lostItemFacts(question: string, chart: FullChart): LostFacts | null {
  const kind = lostItemOf(question);
  if (!kind) return null;
  const want: Relation = kind.focal;
  const day = chart.calendar.day.branch, month = chart.calendar.month.branch;
  const world = chart.lines.find((l) => l.isWorld)!;
  const signals: LostSignal[] = [];
  const place_hints: string[] = [];
  const present = pickPresent(chart.lines.filter((l) => l.relation === want));
  let line: LostFacts["line"] = null;
  let inner: boolean | null = null;
  let moved: boolean | null = null;

  if (present) {
    const ch = chart.changes.find((c) => c.position === present.position);
    line = { pos: present.position, ganzhi: present.stem + present.branch, phase: present.phase, hidden: false };
    inner = present.position <= 3;
    const darkMove = !present.changing && present.dayClash; // 静爻逢日冲 = 暗动
    moved = present.changing || darkMove;
    const dayPhase = BRANCH_PHASE[day];
    const strong = present.strength === "wang" || present.strength === "xiang" || dayPhase === present.phase || generates(dayPhase, present.phase as Phase);
    if (present.isVoid || ch?.kinds.includes("kong")) signals.push(sig("自空化空，皆当置而不问", "用神旬空或化空：一时难找，先放一放，等出空的日子再找"));
    else if (strong && !present.monthClash) signals.push(sig("日旺月旺，总未散而可寻", "用神得日月生扶：东西还在、没有散失，可以找"));
    if (present.monthClash) signals.push(sig("用神月破", "这个月里不容易找到，过了这个月再看"));
    if (present.changing && ch?.kinds.includes("mu")) signals.push(sig("动入墓中，财深藏而不见", "用神动而化墓：藏得很深，一时看不到"));
    if (!present.changing && present.isWorld) signals.push(sig("静临世上，物尚在而何妨", "用神安静临世：东西还在，多半就在身边"));
    if (present.dayCombine) signals.push(sig("日辰合住，定然器掩遮藏", "用神被日辰合住：被别的东西盖住、压住或收在容器里"));
    signals.push(present.changing ? sig("用神发动", "东西被移动过，或还跟着人、车在移动")
      : darkMove ? sig("静爻逢日冲为暗动", "东西被人挪动过，不在原来放的位置")
      : sig("用神安静", "多半还在原处附近，没被移走"));
  } else {
    // 「卦若無官，理當論伏」— the same for the thing: not in the chart, look at it hidden under the pure palace hexagram's line
    const pal = chart.palace.palace, pp = chart.palace.palacePhase;
    const fu = najiaFor(pal, pal).filter((n) => relationTo(pp, n.phase) === want).sort((a, b) => a.position - b.position)[0];
    if (fu) {
      const fly = chart.lines[fu.position - 1]!;
      line = { pos: fu.position, ganzhi: fu.stem + fu.branch, phase: fu.phase, hidden: true, under: { pos: fly.position, ganzhi: fly.stem + fly.branch, relation_zh: REL_ZH[fly.relation] } };
      inner = fu.position <= 3;
      const clashed = clashes(fu.branch, day) || clashes(fu.branch, month);
      moved = clashed;
      signals.push(sig("用神不上卦，伏于" + REL_ZH[fly.relation] + "爻之下", "要找的东西没有直接出现：被别的东西压着、收着"));
      if (chart.calendar.voidBranches.includes(fu.branch)) signals.push(sig("自空化空，皆当置而不问", "伏神旬空：一时难找，先放一放，等出空的日子再找"));
      if (clashed) signals.push(sig("财伏逢冲，必是人移物动", "伏神逢冲：被人挪动过，不在原来放的位置"));
      if (fly.relation === "child") signals.push(sig("若伏子孙，当在僧房道院", "伏在子孙之下：可能在寺庙、宫观这类地方"));
      if (fly.relation === "parent") signals.push(sig("如伏父母，必遗衣笈书箱", "伏在父母之下：在衣箱、衣柜、书箱、包袋里"));
      if (fly.isResponse && combines(fu.branch, world.branch)) signals.push(sig("财伏应下世合，则假贷于人", "伏在应爻之下又与世爻相合：可能借给别人了"));
    }
  }
  if (inner !== null) {
    signals.push(inner
      ? sig("内卦本宫，搜索家庭可见；在内则家中失脱", "用神在内卦：多半还在家里或身边近处")
      : sig("他宫外卦，追来邻里能知；在外则他处遗亡", "用神在外卦：多半落在外面，去过的地方、问身边的人"));
  }
  const sibMoving = want === "wealth" && chart.lines.some((l) => l.relation === "sibling" && l.changing);
  if (sibMoving) signals.push(sig("兄动劫财，若卜起赃无处觅", "兄弟发动：被人拿走的可能大，追回不容易——先报警、停卡"));
  if (chart.lines.some((l) => l.relation === "officer" && l.changing)) signals.push(sig("鬼兴出现，定为贼窃人偷", "官鬼发动：有被偷的可能——贵重的先报警，不要自己去找人对质"));
  if (chart.lines.some((l) => l.relation === "officer" && l.isVoid) && world.changing) signals.push(sig("鬼在空中世动，则自家所失", "官鬼旬空而世爻发动：多半是自己弄丢的，不是被偷"));
  if (want === "parent" && chart.lines.some((l) => l.relation === "wealth" && l.changing)) signals.push(sig("倘失舟车衣服，不宜妻位交重", "失的是衣物车船一类，妻财发动来克：难找回"));
  if (line) {
    place_hints.push(LINE_PLACE[line.pos]!);
    const pp = PHASE_PLACE[line.phase as Phase];
    if (pp) place_hints.push(pp);
  }
  return {
    focal: kind.focal, focal_zh: kind.focal === "wealth" ? "妻财" : "父母",
    why_zh: kind.focal === "wealth" ? "钱包、现金、卡片、首饰、钥匙、手机和 3C 这类器物看妻财（3C 古书没有，按器物归妻财）" : "证件、文书、衣物、包包、车船看父母",
    line, home_or_outside: inner === null ? null : inner ? "inner" : "outer", moved, place_hints, signals,
  };
}

/** what the deep reading is told about this question type (reading.ts deepSystem, only when lostItemOf matched) */
export const LOST_ITEM_NOTE = `LOST ITEM (尋物) — the question asks whether a lost THING comes back and where it is. The payload's \`lost_item\` block is ALREADY computed from 《卜筮正宗·失脱》: the focal line (用神: 妻财 for wallets, money, cards, jewellery, keys, phones and devices — devices are not in the old books, we count them as 器物; 父母 for documents, ID, papers, clothes, bags and vehicles), or, when it is not in the chart, the hidden one (伏神) under the line at its place; whether it sits inside (内卦, at home or close by) or outside; whether it has moved; the kinds of place the line position and its phase point to; and every classical signal that applies, each with its line of text.
- Answer these five in plain words, each in its own field: whether it is likely to turn up (verdict, odds); at home / close by or outside (tendency or other_side); whether it has been moved (other_side); roughly which days (timing — from the candidates, as always); which kind of place to look first (strategy — the first place hint, then the second).
- The \`signals\` are binding. Cite the matching classical lines in basis (with a plain gloss); never add a rule that is not in the list, never re-derive one.
- This is the ONE exception to hard rule 8: the \`place_hints\` (line position, five phases — as the classical text gives them) MAY be given as where to look, as kinds of places in today's words (厨房、门口、高处的柜顶、有水的地方). Never as compass directions, colors or numbers.
- A theft signal (官鬼发动, 兄弟发动): say plainly it may have been taken and the practical step is to report it / block the cards; never point at any person.
- Never promise it will be found, never say it is gone for good. next_step is one concrete search or recovery action for THIS thing (where to look first, whom to ask, what to report or block).`;
