/**
 * 09-26 (Neil, on a member who cast twelve times in a day on one matter —
 * 「她把算卦当成了 AI」): a question that reads as a reply to the last reading
 * ("所以我要讓她知道？" / "你不是說今晚有時機" / "那就不用給他知道呀？")
 * is not a new matter. It belongs under that reading as a follow-up, and a new
 * cast on it must at least know what was said last time. Client-safe.
 */
const REPLY_START = /^(所以|那麼|那么|那就|那我|那要|那該|那该|那是|那|還是|还是|可是|但是|但|不過|不过|難道|难道|你不是說|你不是说|不是說|不是说|你說|你说|剛剛|刚刚|剛才|刚才|意思是|也就是說|也就是说|這樣|这样|然後|然后)/;
const REPLY_ANY = /(你不是說|你不是说|你剛說|你刚说|你說的|你说的|剛剛那卦|刚刚那卦|上一卦|上一個卦|上一个卦|剛才那卦|刚才那卦|前一卦|你上次說|你上次说)/;
const EN_REPLY = /^(so\b|but you said|you said|then\b|and then\b|wait\b|what about\b|but\b)|\b(you (just )?said|last reading|the reading said)\b/i;
const JA_REPLY = /^(じゃあ|では|でも|つまり|それなら)|(さっきの(卦|鑑定)|前の(卦|鑑定))/;
const KO_REPLY = /^(그럼|그러면|그래서|근데|하지만)|(아까 (그 )?괘|지난 풀이)/;

export function looksLikeReply(question: string): boolean {
  const q = question.trim();
  if (q.length < 2) return false;
  return REPLY_START.test(q) || REPLY_ANY.test(q) || EN_REPLY.test(q) || JA_REPLY.test(q) || KO_REPLY.test(q);
}

/** how long after a reading a reply-like question is taken as answering it */
export const REPLY_WINDOW_MS = 6 * 3_600_000;
