/**
 * 10-22 分開 (Neil, after a reader's complaint: 「我在問不同的對象…系統自動幫我歸類成同一個事件的後續發展…請問該如何讓每一次的
 * 卦象都能被獨立解說」): the reader can say that THIS cast is a new matter — with the 「不是同一件事？分開」 tap on the cast page
 * (`solo: true` travels with the cast into the checkout, the paid record and the reading), or with the words themselves:
 * she wrote 「（全新事件）」 in front of her question and the word rules filed it under the old matter anyway.
 *
 * A solo cast opens its own matter and its own thread, and its free line and reading see nothing of the earlier casts.
 */
export const SOLO_WORDS = /全新(?:的)?(?:事件|一件事|事)|新的一件事|另(?:外)?一件事|不同(?:的)?(?:事件|一件事)|不是同一件事|新事件|(?:不要|不用|別|别|不)參考(?:之前|以前|前面|上)|(?:不要|不用|别|不)参考(?:之前|以前|前面|上)|單獨(?:解|看|算)|单独(?:解|看|算)|\bnew matter\b|\bdifferent matter\b|\bseparate matter\b|\bunrelated to (?:my|the) (?:earlier|previous|last)\b|\bfresh question\b/i;

/** Whether the reader asked for this cast to stand alone — by the page's flag or by their own words. */
export function soloOf(input: { question?: string | null; solo?: boolean | null } | null | undefined): boolean {
  if (!input) return false;
  if (input.solo === true) return true;
  return SOLO_WORDS.test(input.question ?? "");
}

/**
 * Cues that a love question is about SOMEONE ELSE than the person of the open matter — 「我會遇到可以認真交往的人嗎」 asked
 * minutes after 「他會回我嗎」 is a new matter, not a new angle on him. Used by the word-rule fallback, which otherwise files
 * any love question within three days of a love matter under it; the model gets the same examples in its prompt.
 */
export const OTHER_PERSON = /新認識|新认识|另(?:外)?一個人|另(?:外)?一个人|另(?:外)?一位|下一個|下一个|下一任|下一段|新的?對象|新的?对象|新的人|新歡|新欢|未來的(?:另一半|伴侶|對象|他|她)|未来的(?:另一半|伴侣|对象|他|她)|會遇到|会遇到|遇得到|遇到(?:可以|適合|合適|合适|對的|对的)|遇見|遇见|正緣|正缘|桃花|其他人|別人|别人|第三者|\bsomeone (?:new|else)\b|\bnew (?:person|partner|guy|girl|man|woman)\b|\bnext (?:one|partner|relationship)\b|\bmeet (?:someone|anyone|a )/i;
