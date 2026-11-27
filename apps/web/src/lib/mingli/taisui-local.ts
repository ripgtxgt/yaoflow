import { yakudoshi, samjae, nextSamjae } from "./nianshu/local-custom";

/**
 * 10-30 进度表 128 ⑤ (Neil 10-29: 換成當地的玩法) — the 犯太歲 page's place in two other markets: Japanese readers look up
 * 厄年 (by 数え年 and gender, as shrines and temples list them), Korean readers 삼재 (by the 띠, in its three-year turn).
 * Written directly in the two languages (fixed text, no model); a custom and a reference, never a forecast, never a
 * ritual to buy. The arithmetic is the 年書's own (nianshu/local-custom.ts).
 */
const BRANCHES = "子丑寅卯辰巳午未申酉戌亥";
const yearBranch = (y: number) => BRANCHES[((y - 4) % 12 + 12) % 12]!;
const reiwa = (y: number) => y - 2018;

/* ------------------------------------------------------------------ 厄年 */

export type YakuRow = { age: number; born: number; kind: "前厄" | "本厄" | "後厄"; big: boolean };
/** the year's 厄年 by gender: every 数え年 that is 前厄・本厄・後厄, with the birth year */
export function yakuTable(year: number): Record<"male" | "female", YakuRow[]> {
  const out: Record<"male" | "female", YakuRow[]> = { male: [], female: [] };
  for (const g of ["male", "female"] as const) {
    for (let age = 1; age <= 100; age++) {
      const y = yakudoshi(age, g);
      if (!y) continue;
      out[g].push({ age, born: year - age + 1, kind: y.kind === "maeyaku" ? "前厄" : y.kind === "honyaku" ? "本厄" : "後厄", big: y.big });
    }
  }
  return out;
}
/** for the lookup: each birth year → the line for a man and a woman */
export function yakuLookup(year: number, from = 1930, to = year): Record<number, { male: string; female: string }> {
  const out: Record<number, { male: string; female: string }> = {};
  for (let b = from; b <= to; b++) {
    const age = year - b + 1;
    const line = (g: "male" | "female") => {
      const y = yakudoshi(age, g);
      if (!y) return `${year}年は数え年${age}歳。厄年にはあたりません。`;
      const kind = y.kind === "maeyaku" ? "前厄" : y.kind === "honyaku" ? "本厄" : "後厄";
      return `${year}年は数え年${age}歳。${y.honAge}歳の${kind}にあたります${y.big ? "（大厄の年回り）" : ""}。`;
    };
    out[b] = { male: line("male"), female: line("female") };
  }
  return out;
}

export const JA = {
  metaTitle: (y: number) => `${y}年（令和${reiwa(y)}年）厄年早見表｜男性・女性の前厄・本厄・後厄と厄払いの時期`,
  metaDesc: (y: number) => `${y}年（令和${reiwa(y)}年）の厄年を男女別に一覧にしました。生まれ年から数え年で調べられます。前厄・本厄・後厄の意味、大厄、厄払い（厄除け）の時期や初穂料の目安も。`,
  title: (y: number) => `${y}年の厄年早見表`,
  lead: (y: number) => `${y}年（令和${reiwa(y)}年）の厄年を、男女別にまとめました。厄年は数え年で数えます。生まれた年を1歳とし、元日を迎えるごとに1歳ずつ加える数え方で、${y}年の数え年は「${y} − 生まれ年 ＋ 1」です。`,
  male: "男性", female: "女性",
  big: "大厄",
  colKind: "", colAge: "数え年", colBorn: "生まれ年",
  bornIn: (b: number) => `${b}年生まれ`,
  ageOf: (a: number) => `${a}歳`,
  lookupHead: "生まれ年で調べる",
  lookupYear: "生まれ年",
  lookupGender: "性別",
  lookupNote: "神社やお寺によって数え方や対象の年が少し異なることがあります。気になるときはお参りする先に確かめてください。",
  sections: [
    { h: "厄年とは", p: "厄年は、人生の節目にあたる年を慎重に過ごそうという日本の習わしです。本厄の前の年を前厄、後の年を後厄として、三年続けて気をつける考え方が広く知られています。一般に男性は25歳・42歳・61歳、女性は19歳・33歳・37歳が本厄とされ、男性の42歳と女性の33歳は特に「大厄」と呼ばれます。女性の61歳を厄年に数える神社やお寺もあります。" },
    { h: "厄払い（厄除け）の時期", p: "元日から節分（2月3日ごろ）までに受ける人が多いですが、時期に決まりはなく、誕生日や都合のよい日に受ける人もいます。神社では「厄祓い」、お寺では「厄除け」と呼ぶことが多く、どちらに行ってもかまいません。" },
    { h: "初穂料（お礼）の目安", p: "神社やお寺によって異なりますが、5,000円から10,000円ほどが一般的です。金額は受付で案内されることが多いので、事前に確かめておくと安心です。のし袋の表書きは、神社なら「御初穂料」「御玉串料」、お寺なら「御祈祷料」などとします。" },
    { h: "厄年の過ごし方", p: "厄年は「悪いことが起こる年」と決まっているわけではありません。昔から、体や生活の変わり目にあたる年として、無理をせず、健康診断を受ける、大きな決断は確かめてから、といった心がけで過ごすものとされてきました。気持ちの区切りとして厄払いを受けるのもよいですし、受けなくてもかまいません。" },
  ],
  faq: [
    { q: "早生まれの人は数え年をどう数えますか？", a: "数え年は誕生日に関係なく、生まれた年を1歳として元日ごとに1歳を加えます。1月や2月生まれでも、生まれ年で数えるのが一般的です。ただし、旧暦や節分を区切りにする神社やお寺もあるので、気になる場合は確かめてください。" },
    { q: "前厄と後厄も厄払いを受けるべきですか？", a: "受けるかどうかは自由です。本厄だけ受ける人もいれば、前厄から三年続けて受ける人もいます。気になる年に、気持ちの区切りとして受けるのが一般的です。" },
    { q: "厄年に結婚や引っ越しをしてもいいですか？", a: "厄年だから避けなければならないという決まりはありません。むしろ人生の節目と重なることも多い年です。気になるなら、厄払いを受けてから、あるいは日取りを選んで進める人もいます。" },
  ],
  bookLead: "この一年、自分にとってどの月が動きやすく、どの月をゆっくり進めたいかを見たいときは：",
  bookBtn: (y: number) => `${y}年の年運レポートを見る →`,
  castLink: "気になることが一つあるなら、卦を立てて流れと時期を見る →",
  boundary: "神社やお寺の一般的な案内と習わしをもとにまとめた参考情報です。地域や寺社によって数え方や考え方が異なります。何かが起こると決まっているものではありません。",
};

/* ------------------------------------------------------------------ 삼재 */

const GROUPS: { who: string; years: string }[] = [{ who: "申子辰", years: "寅卯辰" }, { who: "亥卯未", years: "巳午未" }, { who: "寅午戌", years: "申酉戌" }, { who: "巳酉丑", years: "亥子丑" }];
const KO_ANIMAL: Record<string, string> = { 子: "쥐", 丑: "소", 寅: "호랑이", 卯: "토끼", 辰: "용", 巳: "뱀", 午: "말", 未: "양", 申: "원숭이", 酉: "닭", 戌: "개", 亥: "돼지" };
const STEP = ["들삼재", "눌삼재", "날삼재"] as const;

/** the four 띠 groups and their 삼재 years around `year` (the turn in progress, or the next one) */
export function samjaeTable(year: number): { animals: string[]; from: number; to: number; now: string | null }[] {
  return GROUPS.map((g) => {
    const b = g.who[0]!;
    const s = samjae(b, yearBranch(year));
    const start = s ? year - s.step : nextSamjae(b, year)!;
    return { animals: [...g.who].map((x) => KO_ANIMAL[x]!), from: start, to: start + 2, now: s ? STEP[s.step] : null };
  });
}
/** the birth years of one 띠 (by year), a few around now */
export const bornYears = (branch: string, to: number): number[] => {
  const out: number[] = [];
  for (let y = to; y >= 1930; y--) if (yearBranch(y) === branch) out.push(y);
  return out.reverse();
};
/** for the lookup: each birth year → the line */
export function samjaeLookup(year: number, from = 1930, to = year): Record<number, string> {
  const out: Record<number, string> = {};
  for (let b = from; b <= to; b++) {
    const br = yearBranch(b), animal = KO_ANIMAL[br]!;
    const s = samjae(br, yearBranch(year));
    if (s) out[b] = `${b}년생은 ${animal}띠입니다. ${year}년은 ${animal}띠의 ${STEP[s.step]}에 해당합니다.`;
    else { const n = nextSamjae(br, year)!; out[b] = `${b}년생은 ${animal}띠입니다. ${year}년은 삼재가 아니며, 다음 삼재는 ${n}년부터 ${n + 2}년까지입니다.`; }
  }
  return out;
}
export const koAnimalOf = (branch: string) => KO_ANIMAL[branch]!;
const hanGz = (y: number) => `${"甲乙丙丁戊己庚辛壬癸"[((y - 4) % 10 + 10) % 10]}${yearBranch(y)}`;
const koGz = (y: number) => `${"갑을병정무기경신임계"[((y - 4) % 10 + 10) % 10]}${"자축인묘진사오미신유술해"[((y - 4) % 12 + 12) % 12]}`;
export const yearBranchOf = yearBranch;

export const KO = {
  metaTitle: (y: number) => `${y}년 삼재띠 조회｜들삼재·눌삼재·날삼재와 삼재 풍습`,
  metaDesc: (y: number) => `${y}년 삼재에 해당하는 띠와 들삼재·눌삼재·날삼재, 띠별 다음 삼재 시기를 한눈에 정리했습니다. 태어난 해로 내 띠의 삼재를 확인해 보세요.`,
  title: (y: number) => `${y}년 삼재띠`,
  lead: (y: number) => `${y}년은 ${koGz(y)}년(${hanGz(y)}年)입니다. 삼재는 띠를 기준으로 9년마다 3년씩 돌아온다고 여겨 온 풍습으로, 첫해를 들삼재, 둘째 해를 눌삼재, 셋째 해를 날삼재라고 부릅니다.`,
  nowHead: (y: number) => `${y}년 삼재에 해당하는 띠`,
  nowLine: (animals: string[], step: string) => `${animals.join("띠, ")}띠 — ${step}`,
  tableHead: "띠별 삼재 시기",
  tableRow: (animals: string[], from: number, to: number) => `${animals.join("·")}띠: ${from}년~${to}년`,
  nowTag: (step: string) => `올해 ${step}`,
  bornHead: "띠별 태어난 해",
  lookupHead: "태어난 해로 확인하기",
  lookupYear: "태어난 해",
  lookupNote: "띠는 보통 음력 설이나 입춘을 기준으로 바뀝니다. 1월이나 2월 초에 태어났다면 앞 해의 띠일 수 있습니다.",
  sections: [
    { h: "삼재란", p: "삼재(三災)는 띠를 기준으로 9년마다 돌아오는 3년을 조심해서 지내라는 뜻으로 전해 온 풍습입니다. 신자진(원숭이·쥐·용)띠는 인묘진년, 해묘미(돼지·토끼·양)띠는 사오미년, 인오술(호랑이·말·개)띠는 신유술년, 사유축(뱀·닭·소)띠는 해자축년이 삼재에 해당합니다." },
    { h: "들삼재·눌삼재·날삼재", p: "삼재가 들어오는 첫해를 들삼재, 머무는 둘째 해를 눌삼재, 나가는 셋째 해를 날삼재라고 부릅니다. 예로부터 들삼재를 가장 조심하라고 했다는 말도 있지만, 지역과 집안에 따라 생각이 다릅니다." },
    { h: "삼재 풍습", p: "정초에 절에서 삼재풀이 기도를 올리거나, 머리 셋 달린 매 그림을 붙여 두는 풍습이 전해 옵니다. 어디까지나 마음을 다잡는 풍습이며, 무언가를 꼭 해야 하는 것은 아닙니다." },
    { h: "삼재를 보내는 마음가짐", p: "삼재라고 해서 나쁜 일이 정해져 있는 것은 아닙니다. 큰일은 서두르기보다 한 번 더 확인하고, 몸과 마음을 살피며 차분하게 지내라는 뜻으로 받아들이면 충분합니다." },
  ],
  faq: [
    { q: "삼재는 언제부터 언제까지인가요?", a: "보통 음력 설이나 입춘을 기준으로 해가 바뀝니다. 예를 들어 해묘미띠의 삼재는 사년(뱀의 해)부터 미년(양의 해)까지 3년입니다." },
    { q: "삼재에 결혼이나 이사를 해도 되나요?", a: "삼재라서 반드시 피해야 한다는 규칙은 없습니다. 풍습을 신경 쓰는 집안이라면 날을 잘 골라서 진행하는 경우가 많습니다." },
    { q: "복삼재도 있나요?", a: "삼재가 오히려 좋은 기회가 되는 경우를 복삼재라고 부르는 말도 전해 옵니다. 삼재를 무조건 나쁘게만 보지 않았다는 뜻입니다." },
  ],
  bookLead: "이 한 해 동안 어느 달이 잘 풀리고 어느 달을 천천히 가면 좋을지 보고 싶다면:",
  bookBtn: (y: number) => `${y}년 연간 운세 책 보기 →`,
  castLink: "마음에 걸리는 일이 하나 있다면, 괘를 뽑아 흐름과 시기를 보세요 →",
  boundary: "전해 오는 풍습을 바탕으로 정리한 참고 정보입니다. 지역과 집안마다 보는 방법이 다르며, 어떤 일이 정해져 있다는 뜻은 아닙니다.",
};
