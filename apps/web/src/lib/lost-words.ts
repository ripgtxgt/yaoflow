/**
 * 10-29 进度表 127 尋物 — is a question about a lost THING? Words only (both scripts, Cantonese too), so the cast page can
 * offer the free 尋物 card beside a lost-thing cast without loading the engine; lib/lost-item.ts reads the chart.
 * Never a person or a pet (寵物版 comes later), never a figure of speech (「工作丟了」「機會不見了」「找回自己」).
 * 10-29 进度表 128: the seven other languages too (the 尋物 page carries its question into the cast in the reader's own
 * language: "Can I find my wallet? …", 「財布は見つかりますか？」…).
 */
export const LOST_RE = /不見|不见|丟了|丢了|丟失|丢失|遺失|遗失|弄丟|弄丢|搞丟|搞丢|掉了|失物|尋物|寻物|找得回|找回|找不到|找不着|找不著|唔見|搵唔到|搵返|落在哪|被偷|被盜|被盗|偷走/;
export const NOT_ITEM_RE = /貓|猫|狗|寵物|宠物|鸚鵡|鹦鹉|兔子|鳥|鸟|走失|失蹤|失踪|離家出走|离家出走|找人|找不到工作|找不到對象|找不到对象|找不到方向|找回自己|找回感覺|找回感觉|找回信心|復合|复合|(孩子|小孩|兒子|儿子|女兒|女儿|老人|爸爸|媽媽|妈妈|老公|老婆|男友|女友|朋友|他|她)(不見了|不见了|走失|失蹤|失踪|找不到了|聯絡不上|联络不上)/;
export const ITEM_RE = /東西|东西|物品|證|证|護照|护照|駕照|驾照|文件|合約|合约|合同|書|书|票|單據|单据|衣|外套|褲|裤|帽|鞋|包|袋|行李|圍巾|围巾|車|车|鑰匙|钥匙|錢|钱|現金|现金|卡|首飾|首饰|戒指|項鍊|项链|耳環|耳环|手鍊|手链|手鐲|手镯|手錶|手表|金|玉|手機|手机|電腦|电脑|平板|耳機|耳机|相機|相机|眼鏡|眼镜|傘|伞|3C/i;

/** the same three tests in the seven other languages — lost / not a thing (a person, a pet, a feeling) / a thing named */
export const LOST_FOREIGN = /\b(lost|losing|misplaced?|can'?t find|cannot find|missing|stolen|find (?:my|it|them)|get (?:it|them|my \w+) back)\b|なくし|無くし|失くし|なくな|無くな|紛失|落とし|見つか|探し物|盗まれ|잃어버|분실|못 찾|찾을 수|도난|되찾|\b(perdu|égaré|perdue|retrouver|volé|disparu)|\b(verloren|verlegt|verschwunden|finde (?:ich )?\w* ?nicht|finde\w* .{0,40}wieder|wiederfinden|gestohlen|weg ist)|\b(perd[íi]|perdido|perdida|extravi|no encuentro|encontrar|recuperar|robad)|\b(perdi|perdido|perdida|sumiu|não acho|encontrar|roubad)/i;
export const NOT_ITEM_FOREIGN = /\b(dog|cat|pet|bird|my (?:son|daughter|child|kid|husband|wife|boyfriend|girlfriend|ex|friend|mother|father)|person|someone|lost (?:my )?(?:job|love|faith|hope|way|myself|weight|touch)|find (?:love|a job|myself))\b|犬|猫|ペット|迷子|彼氏|彼女|恋人|元彼|元カノ|復縁|仕事を失|강아지|고양이|반려|애인|남친|여친|헤어진|직장을 잃|\b(chien|chat|animal|mon (?:fils|ex|copain|mari)|ma (?:fille|copine|femme)|perdu mon travail|retrouver l'amour)|\b(Hund|Katze|Haustier|mein(?:en)? (?:Sohn|Ex|Freund|Mann)|meine (?:Tochter|Freundin|Frau)|Job verloren|Liebe finden)|\b(perro|gato|mascota|mi (?:hijo|hija|ex|novio|novia|esposo|esposa)|perd[íi] (?:mi )?trabajo|encontrar (?:el )?amor)|\b(cachorro|gato|pet|meu (?:filho|ex|namorado|marido)|minha (?:filha|namorada|esposa)|perdi (?:o )?emprego|encontrar (?:o )?amor)/i;
export const ITEM_FOREIGN = /\b(wallet|purse|keys?|phone|iphone|laptop|tablet|passport|ID|license|card|cards|ring|necklace|earrings?|bracelet|watch|jewel(?:le)?ry|bag|backpack|jacket|coat|glasses|umbrella|document|documents|camera|headphones|earbuds|airpods|thing|things|item|stuff|belongings)\b|財布|鍵|スマホ|スマートフォン|携帯|パソコン|パスポート|免許証|マイナンバー|カード|指輪|ネックレス|ピアス|イヤリング|時計|アクセサリー|バッグ|カバン|鞄|傘|眼鏡|メガネ|書類|証明書|衣類|服|物|もの|持ち物|지갑|열쇠|휴대폰|핸드폰|증명서|장신구|옷|폰|노트북|여권|신분증|면허증|카드|반지|목걸이|귀걸이|팔찌|시계|가방|우산|안경|서류|물건|소지품|\b(portefeuille|cl[ée]s?|t[ée]l[ée]phone|portable|passeport|papiers|carte|bague|collier|montre|bijou|sac|lunettes|parapluie|objet|affaires?|chose)|\b(Portemonnaie|Geldbeutel|Schlüssel|Handy|Laptop|Ausweis|Pass|Führerschein|Karte|Ring|Kette|Uhr|Schmuck|Tasche|Rucksack|Brille|Schirm|Dokument|Sache|Sachen|Ding|Gegenstand)|\b(cartera|billetera|llaves?|tel[ée]fono|celular|m[óo]vil|pasaporte|documento|licencia|tarjeta|anillo|collar|reloj|joya|bolso|mochila|gafas|lentes|paraguas|objeto|cosa|cosas|pertenencias?)|\b(carteira|chaves?|celular|telefone|passaporte|documento|RG|CNH|cart[ãa]o|anel|colar|rel[óo]gio|joia|bolsa|mochila|[óo]culos|guarda-chuva|objeto|coisa|coisas|pertences)/i;

/** a lost thing, named in the question (the question must name a thing) */
export function isLostThing(question: string): boolean {
  const q = question.slice(0, 300);
  if (LOST_RE.test(q) && !NOT_ITEM_RE.test(q) && ITEM_RE.test(q)) return true;
  return LOST_FOREIGN.test(q) && !NOT_ITEM_FOREIGN.test(q) && ITEM_FOREIGN.test(q);
}
