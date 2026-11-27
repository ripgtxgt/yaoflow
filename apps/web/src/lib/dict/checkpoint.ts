import { checkpointsOf } from "../db";
import { timingSegments } from "../revisit";

/**
 * 10-12 多段应期 (进度表 §四 29). The short letter the day after an EARLIER window of a reading closes — the reading
 * named several, and the heads-up / day-of letters spoke of the first. It asks one thing: did that stretch bring a
 * stir? The answer never scores the reading; the revisit after the last window still asks how it turned out.
 * Placeholders: {range} = this stretch, {next} = the reading's last stretch (both already formatted).
 * Same keys in every language (test/checkpoint.test.ts).
 */
export interface CheckpointCopy {
  subject: string;
  title: string;
  lead: string;
  asked: string;
  quoteLabel: string;
  how: string;
  seen: string;
  none: string;
  unsure: string;
  later: string;
  note: string;
  open: string;
  foot: string;
  /** the page after a tap */
  pSeen: string;
  pNone: string;
  pUnsure: string;
  pNote: string;
  pOpen: string;
  pInvalid: string;
}

export const CHECKPOINT_T: Record<string, CheckpointCopy> = {
  zh: {
    subject: "{range} 这段，有没有一点动静？",
    title: "{range} 这段过去了",
    lead: "你问的这件事，卦里给了不止一段日子。前面这一段刚过，先来问一句。",
    asked: "你当时问的",
    quoteLabel: "解读里的应期",
    how: "{range} 这几天，有没有一点动静？点一下就好。",
    seen: "有一点动静",
    none: "没什么动静",
    unsure: "说不上来",
    later: "这不是最后的结果。卦里还有一段 {next}，那段过了，我们再来问你事情最后怎么样。",
    note: "想多说几句，可以记一笔进展",
    open: "回看这份解读",
    foot: "",
    pSeen: "记下了：{range} 这段先有了动静。接下来看 {next}，那段过了我们再来问你结果。",
    pNone: "记下了：{range} 这段没什么动静。前面这段没动，不等于整件事不成——卦里真正要看的是 {next}，那段过了我们再来问你。",
    pUnsure: "记下了。说不上来也没关系，接下来看 {next}，那段过了我们再来问你。",
    pNote: "记一笔进展",
    pOpen: "回看这份解读",
    pInvalid: "这个链接打不开了。直接回复那封信告诉我们也可以。",
  },
  "zh-hant": {
    subject: "{range} 這段，有沒有一點動靜？",
    title: "{range} 這段過去了",
    lead: "你問的這件事，卦裡給了不只一段日子。前面這一段剛過，先來問一句。",
    asked: "你當時問的",
    quoteLabel: "解讀裡的應期",
    how: "{range} 這幾天，有沒有一點動靜？點一下就好。",
    seen: "有一點動靜",
    none: "沒什麼動靜",
    unsure: "說不上來",
    later: "這不是最後的結果。卦裡還有一段 {next}，那段過了，我們再來問你事情最後怎麼樣。",
    note: "想多說幾句，可以記一筆進展",
    open: "回看這份解讀",
    foot: "",
    pSeen: "記下了：{range} 這段先有了動靜。接下來看 {next}，那段過了我們再來問你結果。",
    pNone: "記下了：{range} 這段沒什麼動靜。前面這段沒動，不等於整件事不成——卦裡真正要看的是 {next}，那段過了我們再來問你。",
    pUnsure: "記下了。說不上來也沒關係，接下來看 {next}，那段過了我們再來問你。",
    pNote: "記一筆進展",
    pOpen: "回看這份解讀",
    pInvalid: "這個連結打不開了。直接回覆那封信告訴我們也可以。",
  },
  en: {
    subject: "{range}: did anything stir?",
    title: "The {range} stretch has passed",
    lead: "Your reading named more than one stretch of days. The first has just passed, so a quick question.",
    asked: "What you asked",
    quoteLabel: "The timing in your reading",
    how: "Around {range}, did anything stir at all? One tap is enough.",
    seen: "Something stirred",
    none: "Nothing much",
    unsure: "Hard to say",
    later: "This is not the final word. Your reading also named {next}; once that has passed we will ask how it turned out.",
    note: "Want to say more? Add a progress note",
    open: "Open the reading",
    foot: "",
    pSeen: "Noted: something stirred around {range}. Next comes {next}; once it has passed we will ask how it turned out.",
    pNone: "Noted: nothing much around {range}. A quiet first stretch does not mean the matter is off — the stretch that counts is {next}, and we will ask after it.",
    pUnsure: "Noted. Hard to say is fine. Next comes {next}; we will ask after it.",
    pNote: "Add a progress note",
    pOpen: "Open the reading",
    pInvalid: "This link no longer works. You can simply reply to the letter instead.",
  },
  ja: {
    subject: "{range}、何か動きはありましたか？",
    title: "{range} の期間が過ぎました",
    lead: "この件の鑑定では、時期が一つではありませんでした。最初の期間が過ぎたので、ひとことだけ伺います。",
    asked: "あのときの質問",
    quoteLabel: "鑑定に書いた時期",
    how: "{range} のあいだ、何か動きはありましたか？ ワンタップで大丈夫です。",
    seen: "少し動きがあった",
    none: "特に動きはなかった",
    unsure: "よくわからない",
    later: "これが最終的な結果ではありません。鑑定にはもう一つ {next} があります。その期間が過ぎたら、結果をあらためて伺います。",
    note: "詳しく書きたいときは、経過を記録できます",
    open: "鑑定を読み返す",
    foot: "",
    pSeen: "記録しました。{range} にまず動きがありました。次は {next}。過ぎたら結果を伺います。",
    pNone: "記録しました。{range} は特に動きなし。最初の期間が静かでも、この件がだめというわけではありません。本当に見るのは {next}、過ぎたらまた伺います。",
    pUnsure: "記録しました。わからなくても大丈夫です。次は {next}、過ぎたらまた伺います。",
    pNote: "経過を記録する",
    pOpen: "鑑定を読み返す",
    pInvalid: "このリンクは使えなくなりました。メールに直接ご返信いただいてもかまいません。",
  },
  ko: {
    subject: "{range}, 조금이라도 움직임이 있었나요?",
    title: "{range} 기간이 지났어요",
    lead: "이 일의 풀이에는 시기가 하나가 아니었어요. 첫 번째 기간이 막 지나서 한 가지만 여쭤봐요.",
    asked: "그때 물었던 것",
    quoteLabel: "풀이에 적힌 시기",
    how: "{range} 동안 조금이라도 움직임이 있었나요? 한 번만 눌러 주세요.",
    seen: "조금 움직임이 있었다",
    none: "별다른 움직임 없었다",
    unsure: "잘 모르겠다",
    later: "이게 마지막 결과는 아니에요. 풀이에는 {next} 기간도 있어요. 그 기간이 지나면 일이 어떻게 됐는지 다시 여쭤볼게요.",
    note: "더 적고 싶다면 진행 상황을 기록할 수 있어요",
    open: "풀이 다시 보기",
    foot: "",
    pSeen: "기록했어요. {range}에 먼저 움직임이 있었네요. 다음은 {next}, 지나면 결과를 여쭤볼게요.",
    pNone: "기록했어요. {range}에는 별 움직임이 없었네요. 첫 기간이 조용해도 일이 안 된다는 뜻은 아니에요. 정말 볼 것은 {next}이고, 지나면 다시 여쭤볼게요.",
    pUnsure: "기록했어요. 잘 모르겠어도 괜찮아요. 다음은 {next}, 지나면 다시 여쭤볼게요.",
    pNote: "진행 상황 기록하기",
    pOpen: "풀이 다시 보기",
    pInvalid: "이 링크는 더 이상 열리지 않아요. 메일에 바로 답장해 주셔도 돼요.",
  },
  fr: {
    subject: "{range} : quelque chose a-t-il bougé ?",
    title: "La période du {range} est passée",
    lead: "Votre lecture nommait plus d'une période. La première vient de passer, d'où cette petite question.",
    asked: "Ce que vous aviez demandé",
    quoteLabel: "Le moment indiqué dans la lecture",
    how: "Autour du {range}, quelque chose a-t-il bougé ? Un clic suffit.",
    seen: "Un peu, oui",
    none: "Pas grand-chose",
    unsure: "Difficile à dire",
    later: "Ce n'est pas le dernier mot. La lecture nommait aussi {next} ; une fois cette période passée, nous vous demanderons comment cela a tourné.",
    note: "Envie d'en dire plus ? Ajoutez une note de suivi",
    open: "Revoir la lecture",
    foot: "",
    pSeen: "Noté : quelque chose a bougé autour du {range}. Vient ensuite {next} ; nous vous demanderons le résultat après.",
    pNone: "Noté : pas grand-chose autour du {range}. Une première période calme ne veut pas dire que c'est fichu — celle qui compte est {next}, et nous reviendrons vers vous après.",
    pUnsure: "Noté. Difficile à dire, c'est très bien. Vient ensuite {next} ; nous reviendrons vers vous après.",
    pNote: "Ajouter une note de suivi",
    pOpen: "Revoir la lecture",
    pInvalid: "Ce lien ne fonctionne plus. Vous pouvez simplement répondre à la lettre.",
  },
  de: {
    subject: "{range}: Hat sich etwas bewegt?",
    title: "Der Zeitraum {range} ist vorbei",
    lead: "Deine Deutung nannte mehr als einen Zeitraum. Der erste ist gerade vorbei, darum eine kurze Frage.",
    asked: "Was du gefragt hattest",
    quoteLabel: "Der Zeitpunkt aus der Deutung",
    how: "Hat sich um {range} etwas bewegt? Ein Tipp genügt.",
    seen: "Ein wenig, ja",
    none: "Nicht viel",
    unsure: "Schwer zu sagen",
    later: "Das ist noch nicht das letzte Wort. Die Deutung nannte auch {next}; wenn dieser Zeitraum vorbei ist, fragen wir, wie es ausgegangen ist.",
    note: "Mehr dazu? Notiere den Verlauf",
    open: "Deutung noch einmal lesen",
    foot: "",
    pSeen: "Notiert: Um {range} hat sich etwas bewegt. Als Nächstes kommt {next}; danach fragen wir nach dem Ergebnis.",
    pNone: "Notiert: Um {range} kaum etwas. Ein ruhiger erster Zeitraum heißt nicht, dass nichts daraus wird — entscheidend ist {next}, danach fragen wir noch einmal.",
    pUnsure: "Notiert. Schwer zu sagen ist in Ordnung. Als Nächstes kommt {next}; danach fragen wir noch einmal.",
    pNote: "Verlauf notieren",
    pOpen: "Deutung noch einmal lesen",
    pInvalid: "Dieser Link funktioniert nicht mehr. Du kannst einfach auf den Brief antworten.",
  },
  es: {
    subject: "{range}: ¿se movió algo?",
    title: "Pasó el periodo del {range}",
    lead: "Tu lectura nombró más de un periodo. El primero acaba de pasar, así que una pregunta rápida.",
    asked: "Lo que preguntaste",
    quoteLabel: "El momento que daba la lectura",
    how: "Alrededor del {range}, ¿se movió algo? Basta con un toque.",
    seen: "Algo se movió",
    none: "No mucho",
    unsure: "Difícil de decir",
    later: "Esta no es la última palabra. La lectura también nombraba {next}; cuando pase, te preguntaremos cómo terminó.",
    note: "¿Quieres contar más? Añade una nota de avance",
    open: "Volver a la lectura",
    foot: "",
    pSeen: "Anotado: algo se movió alrededor del {range}. Sigue {next}; cuando pase te preguntaremos el resultado.",
    pNone: "Anotado: no mucho alrededor del {range}. Un primer periodo tranquilo no significa que no vaya a pasar — el que cuenta es {next}, y te preguntaremos después.",
    pUnsure: "Anotado. Difícil de decir está bien. Sigue {next}; te preguntaremos después.",
    pNote: "Añadir una nota de avance",
    pOpen: "Volver a la lectura",
    pInvalid: "Este enlace ya no funciona. Puedes responder directamente a la carta.",
  },
  pt: {
    subject: "{range}: algo se mexeu?",
    title: "O período de {range} passou",
    lead: "Sua leitura apontou mais de um período. O primeiro acabou de passar, então uma pergunta rápida.",
    asked: "O que você perguntou",
    quoteLabel: "O momento indicado na leitura",
    how: "Por volta de {range}, algo se mexeu? Um toque basta.",
    seen: "Algo se mexeu",
    none: "Não muito",
    unsure: "Difícil dizer",
    later: "Esta não é a palavra final. A leitura também apontava {next}; quando passar, perguntaremos como terminou.",
    note: "Quer contar mais? Adicione uma nota de andamento",
    open: "Rever a leitura",
    foot: "",
    pSeen: "Anotado: algo se mexeu por volta de {range}. Depois vem {next}; quando passar, perguntaremos o resultado.",
    pNone: "Anotado: não muito por volta de {range}. Um primeiro período calmo não quer dizer que não vai acontecer — o que conta é {next}, e perguntaremos depois.",
    pUnsure: "Anotado. Difícil dizer está tudo bem. Depois vem {next}; perguntaremos depois.",
    pNote: "Adicionar uma nota de andamento",
    pOpen: "Rever a leitura",
    pInvalid: "Este link não funciona mais. Você pode simplesmente responder à carta.",
  },
};

export function cpT(locale: string, key: keyof CheckpointCopy, vars: Record<string, string> = {}): string {
  const table = CHECKPOINT_T[locale] ?? CHECKPOINT_T.en!;
  return table[key].replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? `{${k}}`);
}

/** "10月13日–16日" / "Oct 13 – 16" in the reader's language. */
export function formatSpan(start: Date, end: Date, htmlLang: string): string {
  const f = new Intl.DateTimeFormat(htmlLang, { month: "long", day: "numeric" });
  if (start.getTime() === end.getTime()) return f.format(start);
  // across a new year formatRange spells out both years ("2026/12/7至2027/1/5"); month and day read better
  if (start.getFullYear() !== end.getFullYear()) return `${f.format(start)} – ${f.format(end)}`;
  try { return f.formatRange(start, end); } catch { return `${f.format(start)} – ${f.format(end)}`; }
}

/** The stretch after this one: the next check-in's, else the reading's last window (read from its timing line), else the day before the final revisit. */
export function nextStretch(rv: { id: number; timing_quote: string | null; created_at: number; due_at: number }, seq: number, lang: string): string {
  const later = checkpointsOf(rv.id).find((k) => k.seq > seq);
  if (later) return formatSpan(new Date(later.start_at), new Date(later.end_at), lang);
  const last = timingSegments(rv.timing_quote, new Date(rv.created_at)).at(-1);
  if (last) return formatSpan(last.start, last.end, lang);
  return new Intl.DateTimeFormat(lang, { month: "long", day: "numeric" }).format(new Date(rv.due_at - 86_400_000));
}
