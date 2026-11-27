/**
 * 10-31 进度表 129 ①（Neil 10-30「全部都做吧」；回访 309 条）: questions about whether the OTHER person will reach out,
 * reply, come back or meet — 「他會不會主動聯絡我」「會不會復合」「他會回我訊息嗎」. Of the 20 such answered revisits where
 * the reading leaned "will happen", 18 came back 「完全沒發生」: these events are rare to begin with, and a chart that does
 * not argue strongly for them is no reason to promise them. The guard (lib/reading.ts chartGuard) caps them unless the
 * chart carries hard evidence. Simplified text in (the caller converts); Japanese, Korean and the Latin languages too.
 */
const OTHER = /他|她|我们俩|我們倆|我们|我們|咱们|우리|私たち|\bwe\b|\bus\b|对方|對方|前任|ex\b|前男友|前女友|男友|女友|老公|老婆|丈夫|妻子|暧昧|曖昧|彼|元彼|元カノ|相手|그\s?사람|그가|그녀|전\s?남친|전\s?여친|\bhe\b|\bshe\b|\bhim\b|\bher\b|\bmy ex\b|\bil\b|\belle\b|\ber\b|\bsie\b|\bél\b|\bella\b|\bele\b|\bela\b/i;
const CONTACT = /联系|聯繫|联络|聯絡|找我|来找|來找|主动|主動|回复|回覆|回我|回消息|回讯息|回訊息|回信息|传讯|傳訊|发消息|發消息|发讯息|私讯|私訊|消息|讯息|訊息|复合|復合|和好|回来|回來|回头|回頭|挽回|约我|約我|道歉|见面|見面|碰面|重新开始|重新開始|連絡|返信|復縁|よりを戻|会いに|연락|답장|재회|다시\s?만나|돌아오|text me|call me|reach out|contact me|message me|reply|get back together|come back|apologi[sz]e|me (?:recontacter|réécrire|rappeler)|revenir|zurückkommen|melden|schreiben|volver|escribirme|contactarme|voltar|me procurar|me escrever/i;

/** "Will the other person reach out / reply / come back / meet?" — the kind whose base rate is low. */
export function isContactQuestion(question: string): boolean {
  const q = question.trim();
  return !!q && OTHER.test(q) && CONTACT.test(q);
}
