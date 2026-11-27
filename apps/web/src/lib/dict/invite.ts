/**
 * 09-29 推荐入口 (Neil: 「要让所有用户都能看到并愿意用起来」). One card, the
 * same everywhere: bring a friend in, get a full reading, no ceiling.
 * Words follow the site: 深断 / full reading / 本格鑑定 / 심층 풀이 / lecture approfondie / Tiefendeutung / lectura completa / leitura completa.
 */
export const INVITE_T = {
  zh: { chip: "带朋友来 · 得一份深断", title: "带朋友来，一人一份深断", body: "朋友从你的链接进来，读完他自己的第一份深断，你就得一份深断，没有上限。朋友问了什么，我们不会告诉任何人。", gift: "送朋友一卦", share: "分享这一卦", stats: "你已带来 {n} 位朋友，得到 {m} 份深断", mine: "看我的推荐", readFirst: "先读完一份深断，就能送朋友一卦。" },
  "zh-hant": { chip: "帶朋友來 · 得一份深斷", title: "帶朋友來，一人一份深斷", body: "朋友從你的連結進來，讀完他自己的第一份深斷，你就得一份深斷，沒有上限。朋友問了什麼，我們不會告訴任何人。", gift: "送朋友一卦", share: "分享這一卦", stats: "你已帶來 {n} 位朋友，得到 {m} 份深斷", mine: "看我的推薦", readFirst: "先讀完一份深斷，就能送朋友一卦。" },
  en: { chip: "Bring a friend · get a reading", title: "Bring a friend, get a full reading", body: "When a friend comes in through your link and reads their own first full reading, you get a full reading too — no limit. What they ask stays private.", gift: "Give a friend a reading", share: "Share this cast", stats: "You've brought {n} friends and received {m} full readings", mine: "My referrals", readFirst: "Once you have a full reading, you can give a friend one." },
  ja: { chip: "友だちを招く · 本格鑑定1回", title: "友だちを招くと、本格鑑定を1回", body: "友だちがあなたのリンクから来て、自分の最初の本格鑑定を読み終えたら、あなたにも本格鑑定を1回。上限はありません。友だちが何を問ったかは誰にも伝えません。", gift: "友だちに一卦を贈る", share: "この卦をシェア", stats: "これまで {n} 人を招き、本格鑑定を {m} 回受け取りました", mine: "わたしの紹介", readFirst: "本格鑑定を一度受けると、友だちに一卦贈れます。" },
  ko: { chip: "친구 데려오기 · 심층 풀이 1회", title: "친구를 데려오면 심층 풀이 1회", body: "친구가 당신의 링크로 들어와 자기 첫 심층 풀이를 다 읽으면, 당신도 심층 풀이 1회를 받아요. 횟수 제한은 없어요. 친구가 무엇을 물었는지는 누구에게도 알리지 않아요.", gift: "친구에게 한 괘 선물하기", share: "이 괘 공유하기", stats: "지금까지 친구 {n}명을 데려와 심층 풀이 {m}회를 받았어요", mine: "내 추천", readFirst: "심층 풀이를 한 번 받으면 친구에게 한 괘를 선물할 수 있어요." },
  fr: { chip: "Amenez un proche · une lecture", title: "Amenez un proche, recevez une lecture", body: "Quand un proche arrive par votre lien et lit sa première lecture approfondie, vous en recevez une aussi — sans limite. Ce qu'il demande reste privé.", gift: "Offrir un tirage à un proche", share: "Partager ce tirage", stats: "Vous avez amené {n} proches et reçu {m} lectures approfondies", mine: "Mes parrainages", readFirst: "Après une lecture approfondie, vous pourrez en offrir une." },
  de: { chip: "Jemanden mitbringen · eine Deutung", title: "Bring jemanden mit, bekomm eine Tiefendeutung", body: "Kommt jemand über deinen Link und liest die eigene erste Tiefendeutung, bekommst du auch eine — ohne Obergrenze. Was gefragt wurde, bleibt privat.", gift: "Einen Wurf verschenken", share: "Diesen Wurf teilen", stats: "Du hast {n} Personen mitgebracht und {m} Tiefendeutungen bekommen", mine: "Meine Empfehlungen", readFirst: "Nach einer Tiefendeutung kannst du eine verschenken." },
  es: { chip: "Trae a alguien · una lectura", title: "Trae a alguien y recibe una lectura", body: "Cuando alguien llega por tu enlace y lee su primera lectura completa, tú también recibes una, sin límite. Lo que pregunte es privado.", gift: "Regalar una tirada", share: "Compartir esta tirada", stats: "Has traído a {n} personas y recibido {m} lecturas completas", mine: "Mis recomendaciones", readFirst: "Con una lectura completa ya puedes regalar una." },
  pt: { chip: "Traga alguém · uma leitura", title: "Traga alguém e ganhe uma leitura", body: "Quando alguém chega pelo seu link e lê a própria primeira leitura completa, você ganha uma também — sem limite. O que a pessoa perguntar é privado.", gift: "Presentear uma tiragem", share: "Compartilhar esta tiragem", stats: "Você trouxe {n} pessoas e ganhou {m} leituras completas", mine: "Minhas indicações", readFirst: "Depois de uma leitura completa, você pode presentear uma." },
} as const;

export type InviteKey = keyof (typeof INVITE_T)["zh"];
export function it(locale: string, key: InviteKey, vars: Record<string, string | number> = {}): string {
  const table = (INVITE_T as Record<string, Record<InviteKey, string>>)[locale] ?? INVITE_T.en;
  return table[key].replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? `{${k}}`));
}
