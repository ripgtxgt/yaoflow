import type { RevisitAsk } from "./revisit-judge";

/**
 * 10-07 (Neil: 「做吧」): a question about how another person feels or sees the reader — 他喜不喜歡我, does she still
 * love me, 彼は私をどう思っているか — has nothing observable to check when the window closes. Of the first 58 settled
 * revisit answers, 7 were such questions; 6 came back as 「完全沒發生」, which is not a miss, there was simply no event.
 * These are asked about the signals the reading told them to watch instead, and never scored (lib/revisit-judge.ts).
 *
 * The rule needs both a third person and a feeling word, so 「我喜歡的工作會錄取嗎」 (my favourite job — an event) stays
 * an event question.
 */
const PERSON = /他|她|對方|对方|前任|前男友|前女友|男友|女友|男朋友|女朋友|老公|老婆|先生|太太|那個人|那个人|曖昧|暧昧|\bhe\b|\bshe\b|\bhim\b|\bher\b|\bthey\b|\bex\b|彼|彼女|あの人|그|그녀|그 사람/i;
const FEELING = /喜歡|喜欢|愛不愛|爱不爱|愛我|爱我|還愛|还爱|在乎|想我|想念|有意思|有感覺|有感觉|心裡有|心里有|好感|心意|真心|怎麼看我|怎么看我|怎麼想|怎么想|對我的看法|对我的看法|對我的態度|对我的态度|對我的感覺|对我的感觉|對我有|对我有|放不下|忘不了|like me|love me|loves? me|feel(s|ing)? (about|for) me|feelings for|think(s)? (of|about) me|into me|miss(es)? me|care(s)? about me|好き|愛して|気持ち|どう思って|想って|좋아하|사랑하|마음|어떻게 생각|그리워/i;

/**
 * 10-13 应验校准 (Neil: 「三处都改吧」): the same holds for what another person does or holds in private — whether he is
 * seeing someone else, where she puts the reader in her heart, whether he is hiding something. When the window closes the
 * reader still cannot see it, so 「應了沒」 has nothing to check; two such questions came back as scored misses (#493, #593).
 * Also needs a third person, so 「我會不會後悔換工作」 stays an event question.
 */
const UNSEEN = /別人|别人|其他人|其他女|其他男|別的女|别的女|別的男|别的男|第三者|小三|劈腿|外遇|出軌|出轨|偷吃|腳踏|脚踏|瞞著|瞒着|騙我|骗我|位置|地位|份量|分量|後悔|后悔|認真|认真|是不是真的|seeing (someone|anyone|other)|other (girls?|guys?|women|men|people)|cheat|lying to me|hiding|regret|serious about me|where i stand|他の人|浮気|後悔|다른 사람|바람/i;

/** These name another person's private life on their own, with no pronoun needed (「猴男有與其他異性約會嗎」, #493). */
const SECRET = /異性|异性|新歡|新欢|小三|第三者|劈腿|外遇|出軌|出轨|偷吃|腳踏兩條船|脚踏两条船|拋諸腦後|抛诸脑后|cheating on me|affair|浮気|바람피/i;

/** How this reading's revisit should ask: about the event, or (nothing to verify) about the signals. */
export function revisitAsk(question: string | null | undefined): RevisitAsk {
  if (!question) return "event";
  // 「其他人」 carries 他 but names no one: 「會不會被其他人選上」 is still an event
  const who = question.replace(/其他|其它/g, "");
  if (SECRET.test(question)) return "signals";
  return PERSON.test(who) && (FEELING.test(question) || UNSEEN.test(question)) ? "signals" : "event";
}
