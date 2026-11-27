import type { DictKey, Locale } from "@/lib/i18n";
import type { AskWindow } from "@/lib/ask-window";
import type { ScaleHint } from "@/lib/hints";
import type { GateVerdict } from "@/lib/repeat-gate";
import { LOCALE_META } from "@/lib/locales";
import { checkEmail } from "@/lib/email-check";

/**
 * 10-22 进度表 76 (CastFlow 拆分): the cast page's own words and small formatters — the lines that have no
 * dictionary of their own yet, the paywall mode, the date shapes. No state, no DOM.
 */

/** 10-03 the block before the price (lib/nudge.ts NudgeForPage); 10-06 `goal` says where its button goes (older servers send none = the full reading) */
export type NudgeView = { id: string; title: string; body: string; cta: string; goal?: "deep" | "member" };
export type CapVerdict = Extract<NonNullable<GateVerdict>, { kind: "cap" }>;

/** 10-13 同一件事反复问 (lib/repeat-test.ts ②③): the lock and the address the free line waits for — their words */
const RP_T: Record<string, { lockTitle: string; lockBody: string; gateTitle: string; gateBody: string; gateBtn: string; gateBad: string; rest: string; restCap: string }> = {
  "zh-hant": { rest: "今天先把這件事放下。{date}之後再來看，卦才會有新的話說。", restCap: "今天先把這件事放下，明天再來看，卦才會有新的話說。", lockTitle: "這件事已經問了好幾卦", lockBody: "這幾卦合起來看，才說得清楚。", gateTitle: "留個信箱，看這一句", gateBody: "留下信箱，這件事的幾卦會存在一起；到卦裡說的日子，也會寫信提醒你。不寄廣告。", gateBtn: "看這一句", gateBad: "這個信箱看起來不對，再檢查一下。" },
  zh: { rest: "今天先把这件事放下。{date}之后再来看，卦才会有新的话说。", restCap: "今天先把这件事放下，明天再来看，卦才会有新的话说。", lockTitle: "这件事已经问了好几卦", lockBody: "这几卦合起来看，才说得清楚。", gateTitle: "留个邮箱，看这一句", gateBody: "留下邮箱，这件事的几卦会存在一起；到卦里说的日子，也会写信提醒你。不发广告。", gateBtn: "看这一句", gateBad: "这个邮箱看起来不对，再检查一下。" },
  en: { rest: "Set this down for today. Come back after {date} — the chart will have something new to say.", restCap: "Set this down for today and come back tomorrow — the chart will have something new to say.", lockTitle: "You've cast on this several times already", lockBody: "Read together, these casts say it clearly.", gateTitle: "Leave your email to see this line", gateBody: "Leave your email and the casts on this matter stay together; we'll write when the days in the chart come. No newsletters.", gateBtn: "See the line", gateBad: "That address doesn't look right." },
  // 11-09 (T-033 ④): the other languages read the English here
  ja: { rest: "今日はこの件をいったん置いておきましょう。{date}以降にまた見れば、卦に新しい言葉が出ます。", restCap: "今日はこの件をいったん置いて、明日また見てください。卦に新しい言葉が出ます。", lockTitle: "この件はもう何度も卦を立てています", lockBody: "これらの卦を合わせて読むと、はっきり見えてきます。", gateTitle: "メールアドレスを残して、この一文を見る", gateBody: "メールアドレスを残すと、この件の卦がひとつにまとまり、卦が示す日が来たらお知らせします。広告は送りません。", gateBtn: "この一文を見る", gateBad: "メールアドレスが正しくないようです。" },
  ko: { rest: "오늘은 이 일을 잠시 내려놓으세요. {date} 이후에 다시 보면 괘가 새로운 말을 합니다.", restCap: "오늘은 이 일을 잠시 내려놓고 내일 다시 보세요. 괘가 새로운 말을 합니다.", lockTitle: "이 일로 이미 여러 번 괘를 뽑았어요", lockBody: "이 괘들을 함께 읽어야 분명해집니다.", gateTitle: "이메일을 남기고 이 한 줄 보기", gateBody: "이메일을 남기면 이 일의 괘들이 한곳에 모이고, 괘가 말한 날이 오면 알려 드려요. 광고는 보내지 않습니다.", gateBtn: "한 줄 보기", gateBad: "이메일 주소가 올바르지 않은 것 같아요." },
  fr: { rest: "Laissez cette question de côté pour aujourd'hui. Revenez après le {date} : le tirage aura quelque chose de nouveau à dire.", restCap: "Laissez cette question de côté pour aujourd'hui et revenez demain : le tirage aura quelque chose de nouveau à dire.", lockTitle: "Vous avez déjà fait plusieurs tirages sur cette question", lockBody: "Lus ensemble, ces tirages le disent clairement.", gateTitle: "Laissez votre e-mail pour voir cette phrase", gateBody: "Laissez votre e-mail : les tirages sur cette question restent ensemble, et nous vous écrirons quand les dates du tirage arriveront. Pas de publicité.", gateBtn: "Voir la phrase", gateBad: "Cette adresse ne semble pas correcte." },
  de: { rest: "Leg diese Frage für heute beiseite. Komm nach dem {date} wieder – dann hat das Zeichen etwas Neues zu sagen.", restCap: "Leg diese Frage für heute beiseite und komm morgen wieder – dann hat das Zeichen etwas Neues zu sagen.", lockTitle: "Zu dieser Frage hast du schon mehrmals geworfen", lockBody: "Zusammen gelesen sagen diese Würfe es deutlich.", gateTitle: "E-Mail angeben und diesen Satz sehen", gateBody: "Mit deiner E-Mail bleiben die Würfe zu dieser Frage zusammen, und wir schreiben dir, wenn die Tage aus dem Zeichen kommen. Keine Werbung.", gateBtn: "Satz ansehen", gateBad: "Diese Adresse sieht nicht richtig aus." },
  es: { rest: "Deja este asunto por hoy. Vuelve después del {date}: la tirada tendrá algo nuevo que decir.", restCap: "Deja este asunto por hoy y vuelve mañana: la tirada tendrá algo nuevo que decir.", lockTitle: "Ya has consultado este asunto varias veces", lockBody: "Leídas juntas, estas tiradas lo dicen con claridad.", gateTitle: "Deja tu correo para ver esta frase", gateBody: "Deja tu correo y las tiradas de este asunto quedarán juntas; te escribiremos cuando lleguen los días que marca la tirada. Sin publicidad.", gateBtn: "Ver la frase", gateBad: "Esa dirección no parece correcta." },
  pt: { rest: "Deixe este assunto de lado por hoje. Volte depois de {date}: a tiragem terá algo novo a dizer.", restCap: "Deixe este assunto de lado por hoje e volte amanhã: a tiragem terá algo novo a dizer.", lockTitle: "Você já consultou este assunto várias vezes", lockBody: "Lidas juntas, estas tiragens dizem isso com clareza.", gateTitle: "Deixe seu e-mail para ver esta frase", gateBody: "Deixe seu e-mail e as tiragens deste assunto ficam juntas; escreveremos quando chegarem os dias que a tiragem indica. Sem propaganda.", gateBtn: "Ver a frase", gateBad: "Esse endereço não parece correto." },
};
export const rpT = (locale: string) => RP_T[locale] ?? RP_T.en!;
/** 10-14 进度表 46: the optional 「怎樣算有結果？」 line under the question */
const OH_T: Record<string, { label: string; exLove: string; exWork: string; exOther: string; note: string }> = {
  "zh-hant": { label: "怎樣算有結果？（選填）", exLove: "例如：對方主動傳訊息給我", exWork: "例如：收到錄取通知", exOther: "例如：合約簽下來", note: "到期那天，我們會用這句話問你。" },
  zh: { label: "怎样算有结果？（选填）", exLove: "例如：对方主动发消息给我", exWork: "例如：收到录用通知", exOther: "例如：合同签下来", note: "到期那天，我们会用这句话问你。" },
  en: { label: "What would count as an answer? (optional)", exLove: "e.g. they message me first", exWork: "e.g. I get the offer", exOther: "e.g. the contract is signed", note: "On the day, we'll ask you about exactly this." },
  ja: { label: "どうなれば「答えが出た」と言えますか？（任意）", exLove: "例：相手から先に連絡が来る", exWork: "例：内定の連絡が来る", exOther: "例：契約が決まる", note: "その日が来たら、この一文でお尋ねします。" },
  ko: { label: "어떻게 되면 결과가 나온 걸까요? (선택)", exLove: "예: 상대가 먼저 연락해 온다", exWork: "예: 합격 통보를 받는다", exOther: "예: 계약이 성사된다", note: "그날이 오면 이 문장으로 여쭤볼게요." },
  fr: { label: "Qu'est-ce qui compterait comme une réponse ? (facultatif)", exLove: "ex. il ou elle m'écrit en premier", exWork: "ex. je reçois l'offre", exOther: "ex. le contrat est signé", note: "Le jour venu, nous vous poserons exactement cette question." },
  de: { label: "Woran würdest du merken, dass es eine Antwort gibt? (optional)", exLove: "z. B. die Person schreibt mir zuerst", exWork: "z. B. ich bekomme die Zusage", exOther: "z. B. der Vertrag wird unterschrieben", note: "Am Tag selbst fragen wir dich genau danach." },
  es: { label: "¿Qué contaría como respuesta? (opcional)", exLove: "p. ej., me escribe primero", exWork: "p. ej., recibo la oferta", exOther: "p. ej., se firma el contrato", note: "Ese día te preguntaremos exactamente esto." },
  pt: { label: "O que contaria como resposta? (opcional)", exLove: "ex.: a pessoa me escreve primeiro", exWork: "ex.: recebo a proposta", exOther: "ex.: o contrato é assinado", note: "No dia, vamos perguntar exatamente isto." },
};
export const ohT = (locale: string) => OH_T[locale] ?? OH_T.en!;
/** 10-14 进度表 47 推荐回馈: the light reading a friend's first cast earned — the notice and the banner on the cast it is spent on */
const RF_T: Record<string, { got: string; held: string; heldSharer: string; use: string; banner: string }> = {
  "zh-hant": { got: "朋友分享給你：送你一次輕解讀，30 天內問你的另一件事都能用。", held: "你有一次朋友分享送的輕解讀，{date} 前有效。", heldSharer: "你的朋友起了第一卦，送你一次輕解讀，{date} 前有效。", use: "去用", banner: "朋友起第一卦的回饋：這一卦的輕解讀免費，問你想問的任何一件事。" },
  zh: { got: "朋友分享给你：送你一次轻解读，30 天内问你的另一件事都能用。", held: "你有一次朋友分享送的轻解读，{date} 前有效。", heldSharer: "你的朋友起了第一卦，送你一次轻解读，{date} 前有效。", use: "去用", banner: "朋友起第一卦的回馈：这一卦的轻解读免费，问你想问的任何一件事。" },
  en: { got: "A friend shared this with you: one light reading is yours, for another matter within 30 days.", held: "You have a light reading from a friend's share, good until {date}.", heldSharer: "Your friend cast their first reading — one light reading is yours, good until {date}.", use: "Use it", banner: "A thank-you for a friend's first cast: this cast's light reading is free — ask anything you like." },
  ja: { got: "友だちからのシェア：ライト鑑定を1回プレゼント。30日以内なら、ほかのどんな件にも使えます。", held: "友だちのシェアで届いたライト鑑定が1回あります（{date}まで有効）。", heldSharer: "友だちが初めての卦を立てました。ライト鑑定を1回プレゼント（{date}まで有効）。", use: "使う", banner: "友だちの初めての卦へのお礼：この卦のライト鑑定は無料です。聞きたいことを何でもどうぞ。" },
  ko: { got: "친구가 공유해 줬어요: 라이트 풀이 1회를 드려요. 30일 안에 다른 어떤 일에도 쓸 수 있어요.", held: "친구 공유로 받은 라이트 풀이가 1회 있어요({date}까지).", heldSharer: "친구가 첫 괘를 뽑았어요. 라이트 풀이 1회를 드려요({date}까지).", use: "사용하기", banner: "친구의 첫 괘에 대한 감사: 이 괘의 라이트 풀이는 무료예요. 무엇이든 물어보세요." },
  fr: { got: "Un ami vous a partagé ceci : une lecture légère vous est offerte, pour une autre question dans les 30 jours.", held: "Vous avez une lecture légère offerte par le partage d'un ami, valable jusqu'au {date}.", heldSharer: "Votre ami a fait son premier tirage : une lecture légère vous est offerte, valable jusqu'au {date}.", use: "L'utiliser", banner: "Un merci pour le premier tirage d'un ami : la lecture légère de ce tirage est gratuite — demandez ce que vous voulez." },
  de: { got: "Ein Freund hat das mit dir geteilt: eine kurze Deutung ist für dich, für eine andere Frage innerhalb von 30 Tagen.", held: "Du hast eine kurze Deutung aus dem Teilen eines Freundes, gültig bis {date}.", heldSharer: "Dein Freund hat zum ersten Mal geworfen – eine kurze Deutung ist für dich, gültig bis {date}.", use: "Einlösen", banner: "Ein Dankeschön für den ersten Wurf eines Freundes: die kurze Deutung zu diesem Wurf ist kostenlos – frag, was du möchtest." },
  es: { got: "Un amigo compartió esto contigo: tienes una lectura breve de regalo, para otro asunto en 30 días.", held: "Tienes una lectura breve por lo que compartió un amigo, válida hasta el {date}.", heldSharer: "Tu amigo hizo su primera tirada: tienes una lectura breve de regalo, válida hasta el {date}.", use: "Usarla", banner: "Un agradecimiento por la primera tirada de un amigo: la lectura breve de esta tirada es gratis; pregunta lo que quieras." },
  pt: { got: "Um amigo compartilhou isto com você: uma leitura breve de presente, para outro assunto em até 30 dias.", held: "Você tem uma leitura breve do compartilhamento de um amigo, válida até {date}.", heldSharer: "Seu amigo fez a primeira tiragem: uma leitura breve de presente, válida até {date}.", use: "Usar", banner: "Um agradecimento pela primeira tiragem de um amigo: a leitura breve desta tiragem é grátis — pergunte o que quiser." },
};
export const rfT = (locale: string) => RF_T[locale] ?? RF_T.en!;
/** 10-14: the day the lock lifts, in the reader's own clock and words (10月17日 / October 17). */
export const restLine = (locale: string, until?: number) => {
  if (!until) return rpT(locale).restCap;
  const lang = locale === "zh" ? "zh-CN" : locale === "zh-hant" ? "zh-TW" : RP_T[locale] ? locale : "en-US";
  return rpT(locale).rest.replace("{date}", new Intl.DateTimeFormat(lang, { month: "long", day: "numeric" }).format(until));
};

/** i18n keys for the time-frame chips; "auto" = let the cast decide. */
export const SCALE_KEYS: Record<"auto" | ScaleHint, DictKey> = {
  auto: "hintScaleAuto", now: "hintScaleNow", day: "hintScaleDay", weeks: "hintScaleWeeks", long: "hintScaleLong",
};

/** 09-24: the window the question named, as the reader's own short dates ("9月24日–27日", "Sep 24 – 27"). */
export function fmtAskWindow(w: AskWindow, locale: Locale): string {
  const d = (s: string) => new Date(Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)));
  // CJK: "9月24日–27日" / "9月24日–12月31日" / "9월 24일–27일" — Intl's range style ("9/24 – 9/27") reads like a form field
  const [m1, d1, m2, d2] = [+w.start.slice(5, 7), +w.start.slice(8, 10), +w.end.slice(5, 7), +w.end.slice(8, 10)];
  if (locale === "zh" || locale === "zh-hant" || locale === "ja") {
    return w.start === w.end ? `${m1}月${d1}日` : m1 === m2 ? `${m1}月${d1}日–${d2}日` : `${m1}月${d1}日–${m2}月${d2}日`;
  }
  if (locale === "ko") {
    return w.start === w.end ? `${m1}월 ${d1}일` : m1 === m2 ? `${m1}월 ${d1}일–${d2}일` : `${m1}월 ${d1}일–${m2}월 ${d2}일`;
  }
  try {
    const f = new Intl.DateTimeFormat(LOCALE_META[locale].htmlLang, { month: "short", day: "numeric", timeZone: "UTC" });
    if (w.start === w.end) return f.format(d(w.start));
    const fr = (f as Intl.DateTimeFormat & { formatRange?: (a: Date, b: Date) => string }).formatRange;
    return fr ? fr.call(f, d(w.start), d(w.end)) : `${f.format(d(w.start))} – ${f.format(d(w.end))}`;
  } catch {
    return w.start === w.end ? w.start.slice(5) : `${w.start.slice(5)} – ${w.end.slice(5)}`;
  }
}

// off | on | gift — see lib/paywall.ts. `gift` is the painted door for the
// promotion test: prices exactly as in `on`, the tap is the intent, the
// reading is then given free with a note that says so.
const PAYWALL_MODE = process.env.NEXT_PUBLIC_PAYWALL;
export const PAYWALL = PAYWALL_MODE === "on" || PAYWALL_MODE === "gift";
export const GIFT = PAYWALL_MODE === "gift";
/** 09-26 邮箱校对: the shape is wrong (not merely a suspected typo — the hint under the box handles that) */
export const emailShapeBad = (e: string) => { const v = checkEmail(e); return !v.ok && v.kind === "syntax"; };

/** 10-16: a gift link opened again after it was spent or ran out */
export const GIFT_DEAD = {
  "zh-hant": { used: "這個贈送連結已經用過了，這一卦可以照常看解讀。", expired: "這個贈送連結已經過期了，這一卦可以照常看解讀。", open: "打開用這個連結看過的那份解讀" },
  zh: { used: "这个赠送链接已经用过了，这一卦可以照常看解读。", expired: "这个赠送链接已经过期了，这一卦可以照常看解读。", open: "打开用这个链接看过的那份解读" },
  ja: { used: "このギフトリンクはすでに使われています。この卦は通常どおり読めます。", expired: "このギフトリンクは期限切れです。この卦は通常どおり読めます。", open: "このリンクで読んだ鑑定を開く" },
  en: { used: "This gift link has already been used — you can still get a reading for this cast as usual.", expired: "This gift link has expired — you can still get a reading for this cast as usual.", open: "Open the reading this link was used for" },
} as const;

/** 10-16 进度表 52: the review sites' trial links (lib/review-links.ts) — not 「朋友送了你」 */
export const REVIEW_BANNER = {
  "zh-hant": "這是 YaoFlow 提供給評測用的試用連結：起你自己的卦，起完點「深斷」即可看完整解讀，不需付費。",
  zh: "这是 YaoFlow 提供给评测用的试用链接：起你自己的卦，起完点「深断」即可看完整解读，不需付费。",
  en: "This is a YaoFlow review trial link: cast your own question, then tap the full reading — no payment needed.",
} as const;

/** the save boxes' (matter / cast) error line — one mapping for both */
export type SaveState = "busy" | "bad" | "domain" | "many" | "err" | "done" | null;
