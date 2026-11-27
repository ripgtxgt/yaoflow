/**
 * 09-30 续订专属 (Neil: 「如果都这样操作的话，那349的一次性会员都卖不出去了」→「好，都做吧」).
 * Copy for: the renew-only perks line where people subscribe, the account page once renewal is off, the page
 * that comes before Stripe's cancel screen, and the line in the cancellation letters.
 * Words follow the site: 深断 / full reading / 本格鑑定 / 심층 풀이 / lecture approfondie / Tiefendeutung / lectura completa / leitura completa.
 * {n} a number, {date} a formatted day, {carry} the carry-over cap.
 * 10-22 进度表 93 (Neil: 「如果会员取消续订了，权益该怎么办呢？」→「可以的」): rewritten for the 通卡 model — no counts left
 * (a member has no allowance any more), what carries on until the end, what stops after it, what stays, and the one tap
 * back; the cancel page says the same as the letter (lib/dict/retain.ts).
 */
export interface RenewPerksCopy {
  joinPerks: string;
  carried: string;
  offNote: string;
  resume: string;
  manageCard: string;
  manageCancel: string;
  title: string;
  lead: string;
  loseTitle: string;
  lose1: string;
  lose2: string;
  lose3: string;
  keepTitle: string;
  keep1: string;
  go: string;
  stay: string;
  after: string;
  already: string;
  /** 10-22 进度表 93: the account page, renewal off — what stays and what stops once the period ends */
  afterEnd: string;
}

export const RENEW_PERKS_T: Record<string, RenewPerksCopy> = {
  zh: {
    joinPerks: "自动续费会员另有：每月 5 张「送一卦」，可以送给朋友（关掉续费后不再发新的）。",
    carried: "（含上期顺延 {n} 份）",
    offNote: "续费已关闭：到 {date} 前会员权益全部照常；「送一卦」不再发新的链接。",
    resume: "恢复续费",
    manageCard: "换卡 / 发票",
    manageCancel: "取消续费",
    title: "取消续费之前",
    lead: "取消后不会再扣款。到 {date} 前，会员的一切照常。",
    loseTitle: "到期后，这些会停：",
    lose1: "每日信、流月信、报告的每月更新",
    lose2: "今日一签全文、按你八字算的每天的内容、会员价",
    lose3: "命盘问答；「送一卦」关掉续费起就不再发新的（已送出的照常有效）",
    keepTitle: "到期后照样留着：",
    keep1: "已写好的报告（运势章停在最后一次更新的版本）、正缘画像、问答记录、买过的年书与合盘、回访信、生辰档案",
    go: "继续取消（前往 Stripe）",
    stay: "不取消了",
    after: "之后改主意，在账户页点一下就能恢复续费；之后有事再来，买一张通卡就好。",
    already: "续费已经关闭了。",
    afterEnd: "到期后，已写好的报告与记录仍可查看；每日信、流月信、报告更新与会员价不再提供。",
  },
  "zh-hant": {
    joinPerks: "自動續訂會員另有：每月 5 張「送一卦」，可以送給朋友（關掉續訂後不再發新的）。",
    carried: "（含上期順延 {n} 份）",
    offNote: "續訂已關閉：到 {date} 前會員權益全部照常；「送一卦」不再發新的連結。",
    resume: "恢復續訂",
    manageCard: "換卡 / 發票",
    manageCancel: "取消續訂",
    title: "取消續訂之前",
    lead: "取消後不會再扣款。到 {date} 前，會員的一切照常。",
    loseTitle: "到期後，這些會停：",
    lose1: "每日信、流月信、報告的每月更新",
    lose2: "今日一籤全文、按你八字算的每天的內容、會員價",
    lose3: "命盤問答；「送一卦」關掉續訂起就不再發新的（已送出的照常有效）",
    keepTitle: "到期後照樣留著：",
    keep1: "已寫好的報告（運勢章停在最後一次更新的版本）、正緣畫像、問答紀錄、買過的年書與合盤、回訪信、生辰檔案",
    go: "繼續取消（前往 Stripe）",
    stay: "不取消了",
    after: "之後改主意，在帳戶頁點一下就能恢復續訂；之後有事再來，買一張通卡就好。",
    already: "續訂已經關閉了。",
    afterEnd: "到期後，已寫好的報告與紀錄仍可查看；每日信、流月信、報告更新與會員價不再提供。",
  },
  en: {
    joinPerks: "Auto-renewing members also get 5 gift readings a month to send to friends (no new ones once renewal is off).",
    carried: " (incl. {n} carried over)",
    offNote: "Renewal is off: everything in your membership carries on until {date}; no new gift links are issued.",
    resume: "Turn renewal back on",
    manageCard: "Card / invoices",
    manageCancel: "Cancel renewal",
    title: "Before you cancel",
    lead: "You won't be charged again. Until {date}, everything in your membership carries on.",
    loseTitle: "When it ends, these stop:",
    lose1: "The daily letter, the monthly letter and the monthly report rewrites",
    lose2: "The daily lot's full text, the day read from your own chart, and member prices",
    lose3: "Chart Q&A; no new gift links from the moment renewal is off (links already sent still work)",
    keepTitle: "Kept after it ends:",
    keep1: "Reports already written (time-bound chapters as last rewritten), your Q&A history, year books and pair reports you bought, follow-up letters and your saved birth details",
    go: "Continue to cancel (on Stripe)",
    stay: "Keep my membership",
    after: "Change your mind later? One tap on your account page turns renewal back on. And if something comes up later, a pass is all you need.",
    already: "Renewal is already off.",
    afterEnd: "After it ends, reports already written and your records stay readable; the daily and monthly letters, report rewrites and member prices stop.",
  },
  ja: {
    joinPerks: "自動更新の会員にはさらに、毎月5回の贈り物鑑定があります（自動更新を止めると新しいリンクは発行されません）。",
    carried: "（前期からの繰り越し {n} 回を含む）",
    offNote: "自動更新はオフです：{date} まで会員の内容はすべてそのまま使えます。贈り物鑑定の新しいリンクは発行されません。",
    resume: "自動更新を再開",
    manageCard: "カード変更 / 領収書",
    manageCancel: "自動更新を解約",
    title: "解約の前に",
    lead: "今後の請求はありません。{date} まで、会員の内容はすべてそのままです。",
    loseTitle: "期間が終わると、次のものが止まります：",
    lose1: "毎日のレター、月のレター、レポートの毎月の書き直し",
    lose2: "今日のおみくじ全文、あなたの命式で読む毎日の内容、会員価格",
    lose3: "命盤への質問。贈り物鑑定は自動更新を止めた時点で新しいリンクが出なくなります（送信済みのリンクは有効）",
    keepTitle: "期間が終わっても残るもの：",
    keep1: "作成済みのレポート（運勢の章は最後に書き直した版のまま）、質問の記録、購入した年運・相性レポート、振り返りのメール、保存した生年月日",
    go: "解約へ進む（Stripe）",
    stay: "解約しない",
    after: "気が変わったら、アカウントページのワンタップで自動更新を再開できます。また何かあれば、パスを買うだけで大丈夫です。",
    already: "自動更新はすでにオフです。",
    afterEnd: "期間終了後も、作成済みのレポートと記録は閲覧できます。毎日・月のレター、レポートの書き直し、会員価格は終了します。",
  },
  ko: {
    joinPerks: "자동 갱신 회원은 매달 친구에게 보낼 수 있는 선물 풀이 5회가 더 있습니다(자동 갱신을 끄면 새로 발급되지 않음).",
    carried: " (지난 기간 이월 {n}회 포함)",
    offNote: "자동 갱신이 꺼져 있습니다: {date}까지 멤버십 내용은 모두 그대로입니다. 선물 풀이 새 링크는 발급되지 않습니다.",
    resume: "자동 갱신 다시 켜기",
    manageCard: "카드 / 영수증",
    manageCancel: "자동 갱신 해지",
    title: "해지하기 전에",
    lead: "더 이상 결제되지 않습니다. {date}까지 멤버십의 모든 것이 그대로입니다.",
    loseTitle: "기간이 끝나면 이것들이 멈춥니다:",
    lose1: "매일 편지, 월간 편지, 리포트 매월 다시 쓰기",
    lose2: "오늘의 제비 전문, 내 명식으로 읽는 매일의 내용, 회원 가격",
    lose3: "차트 질문. 선물 풀이는 자동 갱신을 끈 때부터 새 링크가 나오지 않습니다(이미 보낸 링크는 유효)",
    keepTitle: "기간이 끝나도 남는 것:",
    keep1: "이미 쓰인 리포트(운세 장은 마지막으로 다시 쓴 판), 질문 기록, 산 연간 운세 책과 궁합 리포트, 돌아보기 편지, 저장한 생년월일",
    go: "해지 계속하기 (Stripe)",
    stay: "해지하지 않기",
    after: "마음이 바뀌면 계정 페이지에서 한 번만 누르면 자동 갱신이 다시 켜집니다. 나중에 일이 생기면 패스 한 장이면 됩니다.",
    already: "자동 갱신이 이미 꺼져 있습니다.",
    afterEnd: "기간이 끝난 뒤에도 이미 쓰인 리포트와 기록은 볼 수 있습니다. 매일·월간 편지, 리포트 다시 쓰기, 회원 가격은 끝납니다.",
  },
  fr: {
    joinPerks: "Les membres en renouvellement automatique ont aussi 5 lectures offertes par mois à envoyer à des proches (plus de nouvelles une fois le renouvellement désactivé).",
    carried: " (dont {n} reportées)",
    offNote: "Le renouvellement est désactivé : tout votre abonnement continue jusqu'au {date} ; plus aucun nouveau lien cadeau n'est émis.",
    resume: "Réactiver le renouvellement",
    manageCard: "Carte / factures",
    manageCancel: "Annuler le renouvellement",
    title: "Avant d'annuler",
    lead: "Vous ne serez plus débité. Jusqu'au {date}, tout votre abonnement continue.",
    loseTitle: "À la fin, ceci s'arrête :",
    lose1: "La lettre quotidienne, la lettre mensuelle et la réécriture mensuelle des rapports",
    lose2: "Le texte complet de la baguette du jour, la journée lue dans votre thème et les prix membres",
    lose3: "Les questions sur le thème ; plus de nouveaux liens cadeaux dès la désactivation (les liens déjà envoyés restent valables)",
    keepTitle: "Conservé après la fin :",
    keep1: "Les rapports déjà écrits (chapitres liés au temps dans leur dernière version), vos questions, les livres de l'année et rapports de couple achetés, les lettres de suivi et vos données de naissance enregistrées",
    go: "Continuer l'annulation (sur Stripe)",
    stay: "Garder mon abonnement",
    after: "Vous changez d'avis ? Un seul geste sur la page de votre compte réactive le renouvellement. Et si quelque chose arrive plus tard, un pass suffit.",
    already: "Le renouvellement est déjà désactivé.",
    afterEnd: "Après la fin, les rapports déjà écrits et vos historiques restent consultables ; les lettres, les réécritures et les prix membres s'arrêtent.",
  },
  de: {
    joinPerks: "Mitglieder mit automatischer Verlängerung bekommen außerdem 5 Geschenk-Deutungen im Monat für Freunde (keine neuen mehr, sobald die Verlängerung aus ist).",
    carried: " (davon {n} übertragen)",
    offNote: "Die Verlängerung ist aus: Bis {date} läuft deine Mitgliedschaft unverändert weiter; neue Geschenk-Links gibt es nicht mehr.",
    resume: "Verlängerung wieder einschalten",
    manageCard: "Karte / Rechnungen",
    manageCancel: "Verlängerung kündigen",
    title: "Bevor du kündigst",
    lead: "Es wird nichts mehr abgebucht. Bis {date} läuft deine Mitgliedschaft unverändert weiter.",
    loseTitle: "Nach dem Ende hört das auf:",
    lose1: "Der tägliche und der monatliche Brief und die monatliche Neufassung der Berichte",
    lose2: "Der volle Text des Tagesloses, der nach deinem Horoskop gelesene Tag und die Mitgliederpreise",
    lose3: "Fragen zum Horoskop; ab dem Ausschalten keine neuen Geschenk-Links (bereits verschickte bleiben gültig)",
    keepTitle: "Bleibt nach dem Ende:",
    keep1: "Bereits geschriebene Berichte (zeitgebundene Kapitel in der zuletzt geschriebenen Fassung), deine Fragen, gekaufte Jahresbücher und Paar-Berichte, Rückfrage-Briefe und deine gespeicherten Geburtsdaten",
    go: "Weiter kündigen (bei Stripe)",
    stay: "Mitgliedschaft behalten",
    after: "Doch anders entschieden? Ein Tippen auf deiner Kontoseite schaltet die Verlängerung wieder ein. Und wenn später etwas ansteht, reicht ein Pass.",
    already: "Die Verlängerung ist bereits aus.",
    afterEnd: "Nach dem Ende bleiben bereits geschriebene Berichte und deine Aufzeichnungen lesbar; Briefe, Neufassungen und Mitgliederpreise enden.",
  },
  es: {
    joinPerks: "Los miembros con renovación automática además tienen 5 lecturas de regalo al mes para enviar a amigos (no salen nuevas al desactivar la renovación).",
    carried: " (incluye {n} del periodo anterior)",
    offNote: "La renovación está desactivada: hasta el {date} tu membresía sigue igual; ya no se emiten nuevos enlaces de regalo.",
    resume: "Volver a activar la renovación",
    manageCard: "Tarjeta / facturas",
    manageCancel: "Cancelar la renovación",
    title: "Antes de cancelar",
    lead: "No se te volverá a cobrar. Hasta el {date}, tu membresía sigue igual.",
    loseTitle: "Al terminar, esto se detiene:",
    lose1: "La carta diaria, la carta mensual y la reescritura mensual de los informes",
    lose2: "El texto completo de la varilla del día, el día leído desde tu carta y los precios de miembro",
    lose3: "Las preguntas sobre la carta; desde que desactivas la renovación no salen nuevos enlaces de regalo (los ya enviados siguen valiendo)",
    keepTitle: "Se conserva al terminar:",
    keep1: "Los informes ya escritos (los capítulos ligados al tiempo en su última versión), tus preguntas, los libros del año e informes de pareja comprados, las cartas de seguimiento y tus datos de nacimiento guardados",
    go: "Seguir con la cancelación (en Stripe)",
    stay: "Mantener mi membresía",
    after: "¿Cambias de idea? Con un toque en tu página de cuenta vuelves a activar la renovación. Y si más adelante surge algo, basta con un pase.",
    already: "La renovación ya está desactivada.",
    afterEnd: "Al terminar, los informes ya escritos y tus registros siguen disponibles; las cartas, las reescrituras y los precios de miembro terminan.",
  },
  pt: {
    joinPerks: "Membros com renovação automática também têm 5 leituras de presente por mês para enviar a amigos (não saem novas com a renovação desligada).",
    carried: " (inclui {n} do período anterior)",
    offNote: "A renovação está desligada: até {date} a sua assinatura continua igual; não saem novos links de presente.",
    resume: "Religar a renovação",
    manageCard: "Cartão / faturas",
    manageCancel: "Cancelar a renovação",
    title: "Antes de cancelar",
    lead: "Você não será cobrado de novo. Até {date}, a sua assinatura continua igual.",
    loseTitle: "Quando terminar, isto para:",
    lose1: "A carta diária, a carta mensal e a reescrita mensal dos relatórios",
    lose2: "O texto completo da vareta do dia, o dia lido no seu mapa e os preços de membro",
    lose3: "As perguntas sobre o mapa; desde que desliga a renovação não saem novos links de presente (os já enviados continuam valendo)",
    keepTitle: "Fica depois do fim:",
    keep1: "Os relatórios já escritos (capítulos ligados ao tempo na última versão), as suas perguntas, os livros do ano e relatórios do casal comprados, as cartas de acompanhamento e os seus dados de nascimento guardados",
    go: "Continuar o cancelamento (no Stripe)",
    stay: "Manter minha assinatura",
    after: "Mudou de ideia? Um toque na página da sua conta religa a renovação. E se algo surgir depois, basta um passe.",
    already: "A renovação já está desligada.",
    afterEnd: "Depois do fim, os relatórios já escritos e os seus registros continuam disponíveis; as cartas, as reescritas e os preços de membro acabam.",
  },
};

export function rp(locale: string, key: keyof RenewPerksCopy, vars: Record<string, string | number> = {}): string {
  const s = (RENEW_PERKS_T[locale] ?? RENEW_PERKS_T.en!)[key];
  return s.replace(/\{(\w+)\}/g, (_, k: string) => (k in vars ? String(vars[k]) : `{${k}}`));
}
