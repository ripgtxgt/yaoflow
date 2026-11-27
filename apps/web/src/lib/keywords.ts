import type { Topic } from "./topic";

/**
 * Keyword rules for the six languages beyond Chinese and English, so a
 * question written in Japanese, Korean, French, German, Spanish or
 * Portuguese still gets a deterministic topic (→ 用神) and time scale
 * (→ 应期 horizon) — the zh/en rules live next to their callers in topic.ts
 * and timing.ts; these extend them. Word forms are matched loosely (stems,
 * case-insensitive) because questions arrive unpolished.
 */

const join = (parts: string[]) => new RegExp(parts.join("|"), "iu");

export const TOPIC_KW: Record<Exclude<Topic, "other">, RegExp> = {
  career: join([
    // ja
    "仕事|職|転職|退職|辞め|上司|同僚|昇進|昇給|面接|履歴書|起業|会社|プロジェクト|取引先|顧客|リストラ|商品|製品|販売|宣伝|マーケティング|ブランド|開店|発売|ローンチ",
    // ko
    "직장|직업|이직|퇴사|퇴직|사직|상사|동료|승진|연봉|면접|이력서|창업|회사|프로젝트|거래처|고객|해고|제품|상품|판매|홍보|마케팅|브랜드|매장|가게|출시|런칭",
    // fr
    "travail|boulot|emploi|carrière|poste|démission|patron|collègue|promotion|augmentation|entretien|\\bcv\\b|entreprise|société|projet|associé|client|licenci|produit|lancement|marketing|marque|campagne|boutique|magasin",
    // de
    "arbeit|\\bjob|beruf|karriere|stelle|kündig|\\bchef|vorgesetzt|kolleg|beförderung|gehaltserhöhung|bewerbung|vorstellungsgespräch|lebenslauf|firma|unternehmen|projekt|kunde|entlassung|produkt|launch|marketing|marke\\b|kampagne|laden\\b|geschäft",
    // es
    "trabajo|empleo|carrera|puesto|renuncia|\\bjefe|\\bjefa|compañer|ascenso|aumento|entrevista|currículum|empresa|compañía|proyecto|socio|cliente|despido|producto|lanzamiento|marca\\b|campaña|tienda|negocio",
    // pt
    "trabalho|emprego|cargo|demiss|pedir as contas|chefe|colega|promoção|entrevista|currículo|companhia|projeto|sócio|demitid|lançamento|campanha|loja\\b|negócio",
  ]),
  relationship: join([
    "恋|好き|片思い|告白|付き合|別れ|復縁|結婚|離婚|夫|妻|彼氏|彼女|お見合い|浮気|家族|両親|友達|友人",
    "사랑|연애|좋아|짝사랑|고백|사귀|이별|헤어|재회|결혼|이혼|남편|아내|남친|여친|남자친구|여자친구|소개팅|바람|가족|부모|친구",
    "amour|relation\\b|couple|sentiment|amoureu|rupture|séparation|reconqu|\\bex\\b|mariage|marier|divorce|\\bmari\\b|copain|copine|petit ami|petite amie|famille|parents|\\bami",
    "liebe|beziehung|verliebt|schwarm|gefühl|trennung|schluss gemacht|zurück zu|heirat|hochzeit|scheidung|\\bmann\\b|\\bfrau\\b|freund|partner|familie|eltern|affäre",
    "amor\\b|relación|pareja|sentimiento|enamora|me gusta|ruptura|separación|volver con|matrimonio|casar|boda|divorcio|marido|espos|novio|novia|familia|padres|\\bamig|aventura|romance",
    "relacionamento|namoro|apaixonad|gosto d|término|voltar com|casamento|divórcio|mulher\\b|namorad|família|\\bpais\\b",
  ]),
  money: join([
    "お金|金銭|財|収入|投資|資産|株|ファンド|住宅|マンション|ローン|借金|損|儲|利益|価格|値上|値下|貯金",
    "돈|재물|수입|투자|자산|주식|펀드|코인|아파트|부동산|대출|빚|손해|손실|수익|가격|월급|저축",
    "argent|financ|invest|bourse|\\bactions\\b|crypto|maison|appartement|immobilier|prêt|crédit|dette|perte|gagner|profit|prix|salaire|épargne",
    "geld|finanz|invest|aktie|fonds|krypto|\\bhaus\\b|wohnung|immobilie|kredit|darlehen|schulden|verlust|verdienen|gewinn|preis|gehalt|erspar|sparen",
    "dinero|financ|invers|invertir|acciones|bolsa|fondo|cripto|\\bcasa\\b|\\bpiso\\b|departamento|inmueble|hipoteca|préstamo|deuda|pérdida|ganar|ganancia|beneficio|precio|salario|sueldo|ahorro",
    "dinheiro|apartamento|imóvel|financiamento|empréstimo|dívida|prejuízo|perda|lucro|preço|salário|poupança",
  ]),
  health: join([
    "体調|健康|病気|病院|手術|検査|痛|不眠|眠れ|不安|うつ|気分|ストレス|治療",
    "건강|병(?=[\\s이가은는을]|$)|아프|병원|수술|검사|통증|불면|불안|우울|기분|스트레스|치료",
    "santé|malade|maladie|hôpital|opération|chirurgie|douleur|sommeil|insomnie|anxi|dépress|stress|thérapie|traitement",
    "gesund|krank|krankenhaus|operation|\\bop\\b|schmerz|schlaf|angst|depress|therapie|behandlung|körper",
    "salud|enferm|hospital|operación|cirugía|dolor|sueño|insomnio|ansiedad|depresión|estrés|terapia|tratamiento|cuerpo",
    "saúde|doen|cirurgia|\\bdor\\b|sono\\b|insônia|insónia|estresse",
  ]),
  study: join([
    "勉強|試験|受験|学校|大学|専攻|留学|出願|論文|学位|資格|研修",
    "공부|시험|수능|학교|대학|전공|유학|지원서|논문|학위|자격증",
    "étude|examen|concours|école|université|\\bfac\\b|diplôme|thèse|master|formation|candidature",
    "studium|studieren|prüfung|klausur|schule|universität|\\buni\\b|abschluss|diplom|doktor|promotion|master|ausbildung|weiterbildung",
    "estudi|examen|oposici|escuela|universidad|facultad|título|tesis|máster|doctorado|curso|formación|solicitud",
    "prova\\b|exame|vestibular|concurso|escola|universidade|faculdade|diploma|tese\\b|mestrado|doutorado",
  ]),
  decision: join([
    "べきか|どちら|選ぶ|選べ|決め|迷っ|悩ん|引っ越|残るか|価値があ",
    "할까|말까|어느 쪽|선택|결정|고민|망설|이사(?=[\\s를가는]|$)|남을까|갈까|가치가",
    "dois-je|devrais-je|faut-il|lequel|laquelle|choisir|décider|décision|hésite|déménager|rester ou|vaut-il",
    "soll ich|sollte ich|welche[rs]?\\b|wählen|entscheiden|entscheidung|zögere|unsicher|umziehen|bleiben oder|lohnt",
    "\\bdebo\\b|debería|cuál\\b|elegir|escoger|decidir|decisión|\\bdudo|\\bduda\\b|mudarme|quedarme o|vale la pena",
    "\\bdevo\\b|deveria|qual\\b|escolher|dúvida|hesit|mudar-me|me mudar|ficar ou|vale a pena",
  ]),
};

/**
 * 09-24: the scale words used to say "morgen but not heute morgen" and
 * "mañana but not esta mañana" with lookbehind, which older Safari cannot
 * parse — and topic.ts, which runs in the browser, imports this file. The
 * same distinction now happens here, on the text: "this morning" becomes a
 * this-afternoon phrase that only the NOW list knows.
 */
export const scaleText = (q: string): string =>
  q.replace(/heute morgen/gi, "heute nachmittag").replace(/\b(esta|la) mañana/gi, "$1 tarde");

/** Time-scale words. Checked in the same order as the zh/en rules: day → now → choose → long. */
export const SCALE_KW = {
  day: join([
    "明日|あした|明後日|今週|来週|週末|ここ数日|数日以内|\\d{1,2}\\s*月\\s*\\d{1,2}\\s*日|[月火水木金土日]曜",
    "내일|모레|이번 주|다음 주|주말|며칠|\\d{1,2}\\s*월\\s*\\d{1,2}\\s*일|[월화수목금토일]요일",
    "demain|cette semaine|semaine prochaine|week-end|ces jours-ci|dans quelques jours|\\b(?:lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)\\b|\\d{1,2}\\s+(?:janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre)",
    "\\bmorgen\\b|übermorgen|diese woche|nächste woche|wochenende|nächsten tagen|paar tagen|\\b(?:montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag)\\b|\\d{1,2}\\.\\s*(?:januar|februar|märz|april|mai|juni|juli|august|september|oktober|november|dezember)",
    "\\bmañana\\b|pasado mañana|esta semana|semana que viene|próxima semana|fin de semana|estos días|en unos días|\\b(?:lunes|martes|miércoles|jueves|viernes|sábado|domingo)\\b|\\d{1,2}\\s+de\\s+(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)",
    "amanhã|semana que vem|estes dias|nestes dias|em alguns dias|segunda-feira|terça|quarta-feira|quinta-feira|sexta|\\d{1,2}\\s+de\\s+(?:janeiro|fevereiro|março|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)",
  ]),
  now: join([
    "今日|本日|今朝|今夜|今晩|今から|この後|あとで|すぐに|直ちに|午前|午後|昼|夕方",
    "지금|오늘|당장|곧(?=\\s|$)|바로(?=\\s|$)|오전|오후|점심|저녁|이따|잠시 후",
    "maintenant|tout de suite|aujourd'hui|ce matin|ce soir|cet après-midi|à l'instant|en ce moment|ce midi",
    "\\bjetzt\\b|sofort|\\bgleich\\b|heute|vormittag|nachmittag|mittag|im moment|gerade\\b",
    "\\bahora\\b|ya mismo|\\bhoy\\b|esta mañana|esta tarde|esta noche|en este momento|ahorita|mediodía",
    "\\bagora\\b|\\bhoje\\b|esta manhã|esta tarde|esta noite|neste momento|meio-dia",
  ]),
  choose: join([
    "いつ(?:始め|行|す|やる|動|辞め|引っ越|買|売|出す|切り出す)|いつ.{0,10}(?:いい|良い|よい|適切|ベスト)|時期|タイミング|どの月|吉日",
    "언제\\s*(?:시작|가야|해야|하면|하는 게|사야|팔아야|떠나|그만|이사|출시|런칭)|언제.{0,12}(?:좋을까|좋은가|좋겠|적당|적절|하는 게)|시기|타이밍|어느 달|길일",
    "quand (?:dois|devrais|faut|commencer|lancer|partir|vendre|acheter|démissionner|déménager)|quel (?:est le )?(?:bon|meilleur) moment|meilleur moment pour|bon moment pour|quel mois",
    "wann (?:soll|sollte|beginne|starte|gehe|verkaufe|kaufe|kündige|ziehe|bringe)|wann ist (?:ein|der) (?:gute|beste|richtige)|beste[rn]? zeitpunkt|guter zeitpunkt|welcher monat",
    "cuándo (?:debo|debería|empezar|empiezo|lanzar|irme|vender|comprar|renunciar|mudarme)|cuál es (?:el|un) (?:buen|mejor) momento|mejor momento para|buen momento para|qué mes",
    "quando (?:devo|deveria|começar|começo|lançar|ir embora|vender|comprar|pedir demissão|me mudar)|qual (?:é )?(?:o|um) (?:bom|melhor) momento|melhor momento para|bom momento para|que mês|qual mês",
  ]),
  long: join([
    "海外|移住|移民|留学|定住|家を買|マンションを買|不動産|結婚|離婚|出産|妊娠|起業|開業|開店|転職|大学院|受験|公務員|長期|今後数年|数年以内|将来|運命|一生|人生|大きな方向",
    "해외|이민|유학|정착|이주|집을 사|아파트를 사|부동산|결혼|이혼|출산|임신|창업|개업|가게를|전직|이직|대학원|공무원|장기|앞으로 몇 년|몇 년 안|미래|운명|평생|인생|큰 방향",
    "étranger|émigr|immigr|expatri|s'installer|acheter (?:une|un) (?:maison|appartement|logement)|immobilier|mariage|me marier|divorce|enfant|grossesse|enceinte|créer (?:une|mon) entreprise|monter (?:une|ma) (?:boîte|entreprise)|ouvrir (?:un|une) (?:commerce|boutique)|reconversion|changer de (?:carrière|métier|voie)|doctorat|long terme|années à venir|prochaines années|avenir|destin|toute (?:ma|la) vie",
    "ausland|auswander|einwander|niederlassen|umsiedeln|haus kaufen|wohnung kaufen|immobilie|heirat|hochzeit|scheidung|\\bkind\\b|schwanger|gründen|gründung|existenz|eröffnen|berufswechsel|umschul|promotion|doktor|langfristig|nächsten jahre|kommenden jahre|zukunft|schicksal|ganzes leben|lebens",
    "extranjero|emigrar|inmigrar|otro país|establecerme|comprar (?:una|un) (?:casa|piso|departamento|vivienda)|inmueble|matrimonio|casarme|boda|divorcio|\\bhijo|embarazo|embarazada|emprender|montar (?:un|una) (?:negocio|empresa)|abrir (?:un|una) (?:negocio|tienda)|cambiar de (?:carrera|profesión|rumbo)|doctorado|oposiciones|largo plazo|próximos años|años que vienen|futuro|destino|toda (?:mi|la) vida",
    "exterior|estrangeiro|emigrar|imigrar|morar fora|me estabelecer|comprar (?:uma|um) (?:casa|apartamento|imóvel)|imóvel|casamento|casar\\b|divórcio|\\bfilho|gravidez|grávida|empreender|abrir (?:um|uma) (?:negócio|empresa|loja)|mudar de (?:carreira|profissão|rumo)|doutorado|concurso público|longo prazo|próximos anos|anos que vêm|futuro|destino|vida inteira|toda a vida",
  ]),
};

/** Money words that make 妻财 the focal line whatever the topic. */
export const MONEY_KW = join([
  "お金|借金|収入|給料|投資|株|儲|損|家賃|価格|予算|宣伝|販売|売上|注文|集客|支払|払っ",
  "돈|빚|수입|월급|투자|주식|수익|손해|임대료|가격|예산|홍보|매출|주문|고객|지불|갚",
  "argent|dette|revenu|salaire|invest|prix|loyer|budget|vente|chiffre d'affaires|client|marketing|lancement|payer|paie|me doit",
  "geld|schulden|einkommen|gehalt|invest|preis|miete|budget|verkauf|umsatz|kunde|marketing|launch|bezahl|zahlt|schuldet",
  "dinero|deuda|ingreso|salario|sueldo|invers|precio|alquiler|presupuesto|venta|factura|cliente|marketing|lanzamiento|pagar|pagará|pague|cobrar|me debe",
  "dinheiro|dívida|renda|salário|preço|aluguel|orçamento|faturamento|lançamento|pagar|pague|cobrar|me deve",
]);
