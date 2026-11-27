import { TONGKA_DAYS, type TongkaDays } from "./money";

/**
 * 10-22 通卡 — the words and the shape, client-safe (no db, no Stripe). Prices live in lib/money.ts (TONGKA_PRICES),
 * the rows in lib/pass.ts (a `pass_…` membership row with pass_days), the rules in 进度表 75.
 *
 * Only the renewing monthly plan is called 會員; the 1 日 / 7 天 / 30 天 buy-once cards are 通卡. A 通卡 holder gets every
 * paid reading on the site inside the window (deep readings, follow-ups, tarot, lot readings, the chart reports' natal
 * chapters); a member gets that plus the things that only continuity can give (进度表 92: the 運勢 chapters, 你的今天,
 * 今日一籤全文, daily letter, monthly 流月 letter, report rewrites, 8 折 on 年書／合盤). Daily fair-use caps (lib/caps.ts)
 * apply to both and are not advertised. The member line reads 「首月 {f}，之後 {p}」 (a new member's first month).
 */
export { TONGKA_DAYS, type TongkaDays };
export const isTongkaDays = (x: unknown): x is TongkaDays => x === 1 || x === 7 || x === 30;

export interface TongkaCopy {
  /** panel */
  title: string; lead: string;
  name: Record<TongkaDays, string>; line: Record<TongkaDays, string>;
  first: string; firstTag: string;
  member: string; memberLine: string; memberPer: string;
  fine: string; buy: string; going: string;
  /** state */
  active: string; activeMember: string; endsAt: string; capHit: string; loginToUse: string;
  /** 10-24 (Neil: 「会员是会员，通卡是通卡」): the account page's label over a running pass (a member's is 「會員生效中」) */
  activePass: string;
  /** 10-24 (#2915: 14 tries at a membership from WeChat / QQ Mail with only Alipay): a subscription cannot be paid with
   *  Alipay (Stripe) — said to a mainland reader before the membership button, and on its reminder; the passes can */
  memberCardOnly: string;
  /** 10-23 进度表 96 ④: the note under a deep-reading button when the viewer already has it — a pass (ends {date}) or a member; no 「本月 N 次」 */
  includedPass: string; includedMember: string;
  /** 10-23 进度表 101: a light reading's way to its full reading is a 1-day pass (no single full reading is sold) —
   *  the button, the first-pass line ({p} first price, {full} the regular one) and what the day brings besides */
  upgradeBtn: string; upgradeFirst: string; upgradeNote: string;
  /** while the page does not yet know the reader: the panel's frame, no prices */
  loading: string;
  /** Stripe line item */
  product: Record<TongkaDays, string>;
}

export const TONGKA_T: Record<string, TongkaCopy> = {
  "zh-hant": {
    title: "打開完整解讀", lead: "一張通卡，期內全站的付費解讀都能看：深斷與追問、塔羅、解籤、八字紫微星盤的本命報告。",
    name: { 1: "1 日通卡", 7: "7 天通卡", 30: "30 天通卡" },
    line: { 1: "今天想問的都問清楚", 7: "這一週的事，問到清楚為止", 30: "一個月，到期就停" },
    first: "首次 {p}", firstTag: "第一張 1 日通卡",
    member: "會員 首月 {f}，之後 {p}/月", memberLine: "大運流年、每天按你八字算的今天、今日一籤全文、每天一封信、年書合盤 8 折；自動續訂，隨時可取消", memberPer: "/月",
    fine: "通卡一次付清，不自動續訂；期內不限次，有合理使用上限。",
    buy: "{name} {p}", going: "前往付款…",
    active: "{name} · {date} 到期", activeMember: "會員 · 已包含", activePass: "通卡生效中",
    memberCardOnly: "會員是自動續訂，只能用銀行卡（Visa、萬事達、銀聯）付，不能用支付寶；用支付寶的話，買通卡就好。", endsAt: "到期", capHit: "今天先到這裡，明天再來。",
    loginToUse: "這個信箱已有帳號，用信箱登入後就能用通卡。",
    includedPass: "通卡期內不限次 · 到 {date}", includedMember: "會員不限次",
    upgradeBtn: "用 1 日通卡看這一卦的深斷", upgradeFirst: "首張 {p}（之後 {full}）", upgradeNote: "24 小時內其他事也不限次", loading: "價格載入中…",
    product: { 1: "YaoFlow 1 日通卡（數位內容，不續訂）", 7: "YaoFlow 7 天通卡（數位內容，不續訂）", 30: "YaoFlow 30 天通卡（數位內容，不續訂）" },
  },
  zh: {
    title: "打开完整解读", lead: "一张通卡，期内全站的付费解读都能看：深断与追问、塔罗、解签、八字紫微星盘的本命报告。",
    name: { 1: "1 日通卡", 7: "7 天通卡", 30: "30 天通卡" },
    line: { 1: "今天想问的都问清楚", 7: "这一周的事，问到清楚为止", 30: "一个月，到期就停" },
    first: "首次 {p}", firstTag: "第一张 1 日通卡",
    member: "会员 首月 {f}，之后 {p}/月", memberLine: "大运流年、每天按你八字算的今天、今日一签全文、每天一封信、年书合盘 8 折；自动续费，随时可取消", memberPer: "/月",
    fine: "通卡一次付清，不自动续费；期内不限次，有合理使用上限。",
    buy: "{name} {p}", going: "前往付款…",
    active: "{name} · {date} 到期", activeMember: "会员 · 已包含", activePass: "通卡有效",
    memberCardOnly: "会员是自动续费，只能用银行卡（Visa、万事达、银联）付，不能用支付宝；用支付宝的话，买通卡就好。", endsAt: "到期", capHit: "今天先到这里，明天再来。",
    loginToUse: "这个邮箱已有账号，用邮箱登录后就能用通卡。",
    includedPass: "通卡期内不限次 · 到 {date}", includedMember: "会员不限次",
    upgradeBtn: "用 1 日通卡看这一卦的深断", upgradeFirst: "首张 {p}（之后 {full}）", upgradeNote: "24 小时内其他事也不限次", loading: "价格加载中…",
    product: { 1: "YaoFlow 1 日通卡（数字内容，不续费）", 7: "YaoFlow 7 天通卡（数字内容，不续费）", 30: "YaoFlow 30 天通卡（数字内容，不续费）" },
  },
  en: {
    title: "Open the full reading", lead: "One pass covers every paid reading on the site while it runs: full readings and follow-ups, tarot, lot readings, the chart reports.",
    name: { 1: "1-day pass", 7: "7-day pass", 30: "30-day pass" },
    line: { 1: "Ask everything on your mind today", 7: "This week's matter, until it is clear", 30: "A month, then it simply ends" },
    first: "First time {p}", firstTag: "your first 1-day pass",
    member: "Member {f} the first month, then {p}/month", memberLine: "A daily letter, a monthly outlook, 20% off the year book and pair reading; renews monthly, cancel any time", memberPer: "/month",
    fine: "A pass is paid once and never renews; unlimited use while it runs, within fair use.",
    buy: "{name} {p}", going: "Going to payment…",
    active: "{name} · ends {date}", activeMember: "Member · included", activePass: "Pass active",
    memberCardOnly: "Membership renews automatically, so it takes a card (Visa, Mastercard, UnionPay) — not Alipay. To pay with Alipay, get a pass.", endsAt: "ends", capHit: "That is enough for today — come back tomorrow.",
    loginToUse: "This address already has an account; sign in by email to use the pass.",
    includedPass: "Unlimited while your pass runs · until {date}", includedMember: "Unlimited for members",
    upgradeBtn: "See this cast's full reading with a 1-day pass", upgradeFirst: "First pass {p} (then {full})", upgradeNote: "For 24 hours, anything else you ask is included too", loading: "Loading prices…",
    product: { 1: "YaoFlow 1-day pass (digital content, no renewal)", 7: "YaoFlow 7-day pass (digital content, no renewal)", 30: "YaoFlow 30-day pass (digital content, no renewal)" },
  },
  ja: {
    title: "読み解きの全文を開く", lead: "パス1枚で、期間中はサイトの有料の読み解きがすべて見られます：本格読解と追加質問、タロット、おみくじ、命盤レポート。",
    name: { 1: "1日パス", 7: "7日パス", 30: "30日パス" },
    line: { 1: "今日気になることを全部", 7: "今週のことを、腑に落ちるまで", 30: "ひと月、期限が来たら終了" },
    first: "初回 {p}", firstTag: "最初の1日パス",
    member: "メンバー 初月 {f}、以降 {p}/月", memberLine: "毎日のお便り、毎月の運気、年運書とペア鑑定が2割引；毎月更新、いつでも解約", memberPer: "/月",
    fine: "パスは一度払い切り、自動更新なし。期間中は回数制限なし（適正利用の範囲で）。",
    buy: "{name} {p}", going: "お支払いへ…",
    active: "{name} · {date} まで", activeMember: "メンバー · 含まれています", activePass: "パス有効",
    memberCardOnly: "メンバーシップは自動更新のため、カード（Visa、Mastercard、銀聯）でのお支払いのみで、Alipayは使えません。Alipayで払う場合はパスをお選びください。", endsAt: "期限", capHit: "今日はここまで。また明日。",
    loginToUse: "このアドレスにはアカウントがあります。メールでログインするとパスが使えます。",
    includedPass: "パス期間中は回数制限なし · {date} まで", includedMember: "メンバーは回数制限なし",
    upgradeBtn: "1日パスでこの卦の本格読解を見る", upgradeFirst: "初回 {p}（以降 {full}）", upgradeNote: "24時間はほかの相談も回数制限なし", loading: "価格を読み込み中…",
    product: { 1: "YaoFlow 1日パス（デジタルコンテンツ・更新なし）", 7: "YaoFlow 7日パス（デジタルコンテンツ・更新なし）", 30: "YaoFlow 30日パス（デジタルコンテンツ・更新なし）" },
  },
  ko: {
    title: "전체 풀이 열기", lead: "패스 한 장으로 기간 내 사이트의 모든 유료 풀이를 볼 수 있어요: 심층 풀이와 추가 질문, 타로, 제비 풀이, 명반 리포트.",
    name: { 1: "1일 패스", 7: "7일 패스", 30: "30일 패스" },
    line: { 1: "오늘 궁금한 건 다 물어보기", 7: "이번 주의 일, 분명해질 때까지", 30: "한 달, 끝나면 그대로 종료" },
    first: "첫 구매 {p}", firstTag: "첫 1일 패스",
    member: "멤버 첫 달 {f}, 이후 {p}/월", memberLine: "매일 편지, 매월 운세, 연간서·궁합 20% 할인; 매월 갱신, 언제든 해지", memberPer: "/월",
    fine: "패스는 한 번 결제, 자동 갱신 없음. 기간 내 무제한(합리적 사용 범위).",
    buy: "{name} {p}", going: "결제로 이동…",
    active: "{name} · {date} 종료", activeMember: "멤버 · 포함", activePass: "패스 이용 중",
    memberCardOnly: "멤버십은 자동 갱신이라 카드(Visa, Mastercard, 은련)로만 결제할 수 있고 알리페이는 안 돼요. 알리페이로 결제하려면 패스를 고르세요.", endsAt: "종료", capHit: "오늘은 여기까지. 내일 다시 오세요.",
    loginToUse: "이 주소에는 이미 계정이 있어요. 이메일로 로그인하면 패스를 쓸 수 있어요.",
    includedPass: "패스 기간 내 무제한 · {date}까지", includedMember: "멤버는 무제한",
    upgradeBtn: "1일 패스로 이 괘의 심층 풀이 보기", upgradeFirst: "첫 패스 {p} (이후 {full})", upgradeNote: "24시간 동안 다른 질문도 무제한", loading: "가격을 불러오는 중…",
    product: { 1: "YaoFlow 1일 패스 (디지털 콘텐츠, 갱신 없음)", 7: "YaoFlow 7일 패스 (디지털 콘텐츠, 갱신 없음)", 30: "YaoFlow 30일 패스 (디지털 콘텐츠, 갱신 없음)" },
  },
  fr: {
    title: "Ouvrir la lecture complète", lead: "Un pass couvre toutes les lectures payantes du site pendant sa durée : lectures complètes et questions de suite, tarot, tirages, rapports de thème.",
    name: { 1: "Pass 1 jour", 7: "Pass 7 jours", 30: "Pass 30 jours" },
    line: { 1: "Tout ce qui vous occupe aujourd'hui", 7: "L'affaire de la semaine, jusqu'à y voir clair", 30: "Un mois, puis cela s'arrête" },
    first: "Première fois {p}", firstTag: "votre premier pass 1 jour",
    member: "Membre {f} le premier mois, puis {p}/mois", memberLine: "Une lettre quotidienne, un point mensuel, −20 % sur le livre de l'année et la lecture à deux ; renouvelé chaque mois, résiliable à tout moment", memberPer: "/mois",
    fine: "Un pass se paie une fois et ne se renouvelle pas ; usage illimité pendant sa durée, dans la limite d'un usage raisonnable.",
    buy: "{name} {p}", going: "Vers le paiement…",
    active: "{name} · fin le {date}", activeMember: "Membre · inclus", activePass: "Pass actif",
    memberCardOnly: "L'abonnement se renouvelle automatiquement : il se paie par carte (Visa, Mastercard, UnionPay), pas avec Alipay. Pour payer avec Alipay, prenez un pass.", endsAt: "fin", capHit: "C'est assez pour aujourd'hui — revenez demain.",
    loginToUse: "Cette adresse a déjà un compte ; connectez-vous par e-mail pour utiliser le pass.",
    includedPass: "Illimité pendant votre pass · jusqu'au {date}", includedMember: "Illimité pour les membres",
    upgradeBtn: "Voir la lecture complète avec un pass 1 jour", upgradeFirst: "Premier pass {p} (ensuite {full})", upgradeNote: "Pendant 24 heures, tout le reste est inclus aussi", loading: "Chargement des prix…",
    product: { 1: "YaoFlow pass 1 jour (contenu numérique, sans renouvellement)", 7: "YaoFlow pass 7 jours (contenu numérique, sans renouvellement)", 30: "YaoFlow pass 30 jours (contenu numérique, sans renouvellement)" },
  },
  de: {
    title: "Die vollständige Deutung öffnen", lead: "Ein Pass deckt alle bezahlten Deutungen der Seite ab, solange er läuft: ausführliche Deutungen und Nachfragen, Tarot, Losdeutungen, die Horoskop-Berichte.",
    name: { 1: "1-Tages-Pass", 7: "7-Tage-Pass", 30: "30-Tage-Pass" },
    line: { 1: "Alles, was dich heute beschäftigt", 7: "Die Sache dieser Woche, bis sie klar ist", 30: "Ein Monat, dann endet er einfach" },
    first: "Erstes Mal {p}", firstTag: "Dein erster 1-Tages-Pass",
    member: "Mitglied {f} im ersten Monat, danach {p}/Monat", memberLine: "Ein täglicher Brief, ein monatlicher Ausblick, 20 % auf Jahresbuch und Paardeutung; monatlich verlängert, jederzeit kündbar", memberPer: "/Monat",
    fine: "Ein Pass wird einmal bezahlt und verlängert sich nicht; unbegrenzte Nutzung während der Laufzeit im Rahmen der fairen Nutzung.",
    buy: "{name} {p}", going: "Zur Zahlung…",
    active: "{name} · endet am {date}", activeMember: "Mitglied · enthalten", activePass: "Pass aktiv",
    memberCardOnly: "Die Mitgliedschaft verlängert sich automatisch und ist nur per Karte (Visa, Mastercard, UnionPay) zahlbar, nicht mit Alipay. Mit Alipay zahlst du für einen Pass.", endsAt: "endet", capHit: "Das reicht für heute – komm morgen wieder.",
    loginToUse: "Diese Adresse hat schon ein Konto; melde dich per E-Mail an, um den Pass zu nutzen.",
    includedPass: "Unbegrenzt, solange dein Pass läuft · bis {date}", includedMember: "Unbegrenzt für Mitglieder",
    upgradeBtn: "Die ausführliche Deutung mit einem 1-Tages-Pass sehen", upgradeFirst: "Erster Pass {p} (danach {full})", upgradeNote: "24 Stunden lang ist auch alles andere enthalten", loading: "Preise werden geladen…",
    product: { 1: "YaoFlow 1-Tages-Pass (digitaler Inhalt, keine Verlängerung)", 7: "YaoFlow 7-Tage-Pass (digitaler Inhalt, keine Verlängerung)", 30: "YaoFlow 30-Tage-Pass (digitaler Inhalt, keine Verlängerung)" },
  },
  es: {
    title: "Abrir la lectura completa", lead: "Un pase cubre todas las lecturas de pago del sitio mientras dura: lecturas completas y preguntas de seguimiento, tarot, lecturas de suerte, informes de carta.",
    name: { 1: "Pase de 1 día", 7: "Pase de 7 días", 30: "Pase de 30 días" },
    line: { 1: "Todo lo que te ronda hoy", 7: "El asunto de la semana, hasta verlo claro", 30: "Un mes, y luego termina" },
    first: "Primera vez {p}", firstTag: "tu primer pase de 1 día",
    member: "Miembro {f} el primer mes, luego {p}/mes", memberLine: "Una carta diaria, un repaso mensual, 20 % menos en el libro del año y la lectura en pareja; se renueva cada mes, cancela cuando quieras", memberPer: "/mes",
    fine: "El pase se paga una vez y no se renueva; uso ilimitado mientras dura, dentro de un uso razonable.",
    buy: "{name} {p}", going: "Yendo al pago…",
    active: "{name} · termina el {date}", activeMember: "Miembro · incluido", activePass: "Pase activo",
    memberCardOnly: "La membresía se renueva sola, así que se paga con tarjeta (Visa, Mastercard, UnionPay), no con Alipay. Para pagar con Alipay, elige un pase.", endsAt: "termina", capHit: "Por hoy es suficiente; vuelve mañana.",
    loginToUse: "Esta dirección ya tiene cuenta; inicia sesión por correo para usar el pase.",
    includedPass: "Ilimitado mientras dure tu pase · hasta el {date}", includedMember: "Ilimitado para miembros",
    upgradeBtn: "Ver la lectura completa con un pase de 1 día", upgradeFirst: "Primer pase {p} (luego {full})", upgradeNote: "Durante 24 horas, todo lo demás también está incluido", loading: "Cargando precios…",
    product: { 1: "YaoFlow pase de 1 día (contenido digital, sin renovación)", 7: "YaoFlow pase de 7 días (contenido digital, sin renovación)", 30: "YaoFlow pase de 30 días (contenido digital, sin renovación)" },
  },
  pt: {
    title: "Abrir a leitura completa", lead: "Um passe cobre todas as leituras pagas do site enquanto durar: leituras completas e perguntas de seguimento, tarô, leituras de sorte, relatórios do mapa.",
    name: { 1: "Passe de 1 dia", 7: "Passe de 7 dias", 30: "Passe de 30 dias" },
    line: { 1: "Tudo o que está na sua cabeça hoje", 7: "O assunto da semana, até ficar claro", 30: "Um mês, e depois termina" },
    first: "Primeira vez {p}", firstTag: "seu primeiro passe de 1 dia",
    member: "Membro {f} no primeiro mês, depois {p}/mês", memberLine: "Uma carta diária, um panorama mensal, 20% de desconto no livro do ano e na leitura a dois; renova todo mês, cancele quando quiser", memberPer: "/mês",
    fine: "O passe é pago uma vez e não renova; uso ilimitado enquanto durar, dentro do uso razoável.",
    buy: "{name} {p}", going: "Indo para o pagamento…",
    active: "{name} · termina em {date}", activeMember: "Membro · incluído", activePass: "Passe ativo",
    memberCardOnly: "A assinatura renova sozinha, então é paga com cartão (Visa, Mastercard, UnionPay), não com Alipay. Para pagar com Alipay, escolha um passe.", endsAt: "termina", capHit: "Por hoje chega — volte amanhã.",
    loginToUse: "Este endereço já tem conta; entre por e-mail para usar o passe.",
    includedPass: "Ilimitado enquanto seu passe durar · até {date}", includedMember: "Ilimitado para membros",
    upgradeBtn: "Ver a leitura completa com um passe de 1 dia", upgradeFirst: "Primeiro passe {p} (depois {full})", upgradeNote: "Durante 24 horas, tudo o mais também está incluído", loading: "Carregando preços…",
    product: { 1: "YaoFlow passe de 1 dia (conteúdo digital, sem renovação)", 7: "YaoFlow passe de 7 dias (conteúdo digital, sem renovação)", 30: "YaoFlow passe de 30 dias (conteúdo digital, sem renovação)" },
  },
};
export const tongkaT = (locale: string): TongkaCopy => TONGKA_T[locale] ?? TONGKA_T.en!;
export const fill = (s: string, vars: Record<string, string | number>) => Object.entries(vars).reduce((acc, [k, v]) => acc.split(`{${k}}`).join(String(v)), s);
