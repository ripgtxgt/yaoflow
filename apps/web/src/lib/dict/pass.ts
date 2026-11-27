/**
 * 会员单月 (09-26, Neil chose B: 单月 NT$299 不续订，订阅 NT$269/月).
 * {pass} / {month} / {save} are formatted prices, {date} a formatted day.
 *
 * 10-22 (Neil: 「要」): the one-off month is the 30 天通卡 now — every line a reader sees says 通卡 (the 30-day pass by
 * name where a price is the 30-day one), never 單月會員. The consent line under the account page's passes covers all
 * three lengths. `title2nd`／`body2nd` describe the monthly allowance of the older model and only show while it runs.
 */
export interface PassCopy {
  link: string;
  title2nd: string; body2nd: string;
  optSub: string; optSubSave: string; optPass: string; single: string;
  btnPass: string; btnPassNote: string;
  consentPre: string; consentLink: string; consentPost: string;
  done: string; doneLogin: string; active: string; after: string; already: string; error: string;
  mailPlan: string; mailEnds: string; mailNote: string; mailManage: string;
}

export const PASS_T: Record<string, PassCopy> = {
  zh: {
    link: "不想自动续费？30 天通卡 {pass}，到期就停。",
    title2nd: "今天第二卦了",
    body2nd: "接下来还有想问的，会员比一单一单买划算：每月 10 次深断，轻解读不限次。",
    optSub: "开会员 {month}/月 · 自动续费，随时可取消", optSubSave: "比 30 天通卡每月省 {save}",
    optPass: "30 天通卡 {pass} · 不续费", single: "只买这一单",
    btnPass: "30 天通卡 {pass}", btnPassNote: "30 天 · 不自动续费",
    consentPre: "通卡一次付清，在买的天数内有效，到期不会自动扣款；点击付款即表示同意", consentLink: "服务条款", consentPost: "，并要求立即开通。",
    done: "通卡已开通，{date} 到期，不会自动续费。", doneLogin: "通卡已开通。用付款时的邮箱登录就能使用。",
    active: "通卡 · {date} 到期，不会自动续费", after: "到期后想继续，开自动续费会员每月只要 {month}。",
    already: "你已经是会员了。", error: "暂时打不开付款页，请稍后再试。",
    mailPlan: "30 天通卡（不续费）", mailEnds: "到期日", mailNote: "到期不会自动续费，也不会再扣款。", mailManage: "我的账户",
  },
  "zh-hant": {
    link: "不想自動續訂？30 天通卡 {pass}，到期就停。",
    title2nd: "今天第二卦了",
    body2nd: "接下來還有想問的，會員比一單一單買划算：每月 10 次深斷，輕解讀不限次。",
    optSub: "開會員 {month}/月 · 自動續訂，隨時可取消", optSubSave: "比 30 天通卡每月省 {save}",
    optPass: "30 天通卡 {pass} · 不續訂", single: "只買這一單",
    btnPass: "30 天通卡 {pass}", btnPassNote: "30 天 · 不自動續訂",
    consentPre: "通卡一次付清，在買的天數內有效，到期不會自動扣款；點擊付款即表示同意", consentLink: "服務條款", consentPost: "，並要求立即開通。",
    done: "通卡已開通，{date} 到期，不會自動續訂。", doneLogin: "通卡已開通。用付款時的信箱登入就能使用。",
    active: "通卡 · {date} 到期，不會自動續訂", after: "到期後想繼續，開自動續訂會員每月只要 {month}。",
    already: "你已經是會員了。", error: "暫時打不開付款頁，請稍後再試。",
    mailPlan: "30 天通卡（不續訂）", mailEnds: "到期日", mailNote: "到期不會自動續訂，也不會再扣款。", mailManage: "我的帳戶",
  },
  en: {
    link: "Rather not auto-renew? The 30-day pass is {pass} — it simply ends.",
    title2nd: "Your second reading today",
    body2nd: "If more questions are coming, membership beats buying one at a time: 10 full readings a month, light readings without limit.",
    optSub: "Membership {month}/month · renews, cancel any time", optSubSave: "saves {save} a month over the 30-day pass",
    optPass: "30-day pass {pass} · no renewal", single: "Just this one",
    btnPass: "30-day pass {pass}", btnPassNote: "30 days · no auto-renewal",
    consentPre: "A pass is paid once, lasts the days you chose and is never charged again; by paying you agree to the ", consentLink: "Terms", consentPost: " and ask for it to start at once.",
    done: "Your pass is active until {date}. It will not renew.", doneLogin: "Your pass is active. Sign in with the email you paid with to use it.",
    active: "Pass · ends {date}, no renewal", after: "Want to keep going after that? A renewing membership is {month} a month.",
    already: "You're already a member.", error: "The payment page won't open right now — please try again shortly.",
    mailPlan: "30-day pass (no renewal)", mailEnds: "Ends", mailNote: "It does not renew and you will not be charged again.", mailManage: "My account",
  },
  ja: {
    link: "自動更新はちょっと…という方へ：30日パス {pass}、期限が来たら終わります。",
    title2nd: "今日2つ目の問いですね",
    body2nd: "まだ聞きたいことがあるなら、1回ずつ買うよりメンバーがお得です：毎月10回の本格鑑定、ライト鑑定は回数無制限。",
    optSub: "メンバー {month}/月 · 自動更新、いつでも解約可", optSubSave: "30日パスより毎月 {save} お得",
    optPass: "30日パス {pass} · 更新なし", single: "今回の1回だけ",
    btnPass: "30日パス {pass}", btnPassNote: "30日 · 自動更新なし",
    consentPre: "パスは1回払いで、選んだ日数のあいだ有効、その後の請求はありません。お支払いにより", consentLink: "利用規約", consentPost: "に同意し、すぐに開始することを求めたものとします。",
    done: "パスが有効になりました（{date} まで、更新なし）。", doneLogin: "パスが有効になりました。お支払いに使ったメールでログインしてご利用ください。",
    active: "パス · {date} 終了、更新なし", after: "その後も続けるなら、自動更新メンバーは月 {month} です。",
    already: "すでにメンバーです。", error: "お支払いページを開けませんでした。少し後でもう一度お試しください。",
    mailPlan: "30日パス（更新なし）", mailEnds: "終了日", mailNote: "自動更新はなく、再度請求されることはありません。", mailManage: "マイアカウント",
  },
  ko: {
    link: "자동 갱신이 부담되나요? 30일 패스 {pass}, 기간이 끝나면 그대로 끝나요.",
    title2nd: "오늘 두 번째 질문이네요",
    body2nd: "더 물어볼 게 있다면 한 번씩 사는 것보다 멤버십이 유리해요: 매달 심층 풀이 10회, 가벼운 풀이 무제한.",
    optSub: "멤버십 {month}/월 · 자동 갱신, 언제든 해지", optSubSave: "30일 패스보다 매달 {save} 절약",
    optPass: "30일 패스 {pass} · 갱신 없음", single: "이번 한 번만",
    btnPass: "30일 패스 {pass}", btnPassNote: "30일 · 자동 갱신 없음",
    consentPre: "패스는 한 번 결제, 고른 기간 동안 유효하며 이후 추가 결제는 없습니다. 결제하면 ", consentLink: "약관", consentPost: "에 동의하고 즉시 시작을 요청하는 것입니다.",
    done: "패스가 시작됐어요. {date}에 끝나며 갱신되지 않아요.", doneLogin: "패스가 시작됐어요. 결제한 이메일로 로그인해서 이용하세요.",
    active: "패스 · {date} 종료, 갱신 없음", after: "그 뒤에도 계속하려면 자동 갱신 멤버십은 월 {month}입니다.",
    already: "이미 멤버예요.", error: "지금은 결제 페이지를 열 수 없어요. 잠시 후 다시 시도해 주세요.",
    mailPlan: "30일 패스 (갱신 없음)", mailEnds: "종료일", mailNote: "자동 갱신되지 않으며 다시 결제되지 않습니다.", mailManage: "내 계정",
  },
  fr: {
    link: "Pas envie d'un renouvellement automatique ? Le pass 30 jours coûte {pass} — puis c'est tout.",
    title2nd: "Deuxième lecture aujourd'hui",
    body2nd: "S'il vous reste des questions, l'abonnement revient moins cher qu'à l'unité : 10 lectures approfondies par mois, lectures légères illimitées.",
    optSub: "Abonnement {month}/mois · renouvelé, résiliable à tout moment", optSubSave: "{save} de moins par mois que le pass 30 jours",
    optPass: "Pass 30 jours {pass} · sans renouvellement", single: "Juste celle-ci",
    btnPass: "Pass 30 jours {pass}", btnPassNote: "30 jours · sans renouvellement",
    consentPre: "Un pass se paie une fois, dure le nombre de jours choisi et n'est jamais redébité ; en payant, vous acceptez les ", consentLink: "conditions", consentPost: " et demandez qu'il commence tout de suite.",
    done: "Votre pass est actif jusqu'au {date}. Il ne sera pas renouvelé.", doneLogin: "Votre pass est actif. Connectez-vous avec l'e-mail de paiement pour en profiter.",
    active: "Pass · se termine le {date}, sans renouvellement", after: "Envie de continuer ensuite ? L'abonnement renouvelé coûte {month} par mois.",
    already: "Vous êtes déjà abonné·e.", error: "La page de paiement ne s'ouvre pas pour le moment — réessayez dans un instant.",
    mailPlan: "Pass 30 jours (sans renouvellement)", mailEnds: "Fin", mailNote: "Il ne se renouvelle pas et vous ne serez plus débité·e.", mailManage: "Mon compte",
  },
  de: {
    link: "Keine automatische Verlängerung gewünscht? Der 30-Tage-Pass kostet {pass} — danach endet er einfach.",
    title2nd: "Deine zweite Deutung heute",
    body2nd: "Wenn noch mehr Fragen kommen, ist die Mitgliedschaft günstiger als Einzelkäufe: 10 Tiefendeutungen im Monat, leichte Deutungen unbegrenzt.",
    optSub: "Mitgliedschaft {month}/Monat · verlängert sich, jederzeit kündbar", optSubSave: "spart {save} pro Monat gegenüber dem 30-Tage-Pass",
    optPass: "30-Tage-Pass {pass} · keine Verlängerung", single: "Nur diese eine",
    btnPass: "30-Tage-Pass {pass}", btnPassNote: "30 Tage · keine Verlängerung",
    consentPre: "Ein Pass wird einmal bezahlt, gilt für die gewählten Tage und wird nie erneut abgebucht; mit der Zahlung stimmst du den ", consentLink: "Bedingungen", consentPost: " zu und verlangst den sofortigen Beginn.",
    done: "Dein Pass läuft bis {date} und verlängert sich nicht.", doneLogin: "Dein Pass ist aktiv. Melde dich mit der Bezahl-E-Mail an, um ihn zu nutzen.",
    active: "Pass · endet am {date}, keine Verlängerung", after: "Danach weitermachen? Die sich verlängernde Mitgliedschaft kostet {month} im Monat.",
    already: "Du bist bereits Mitglied.", error: "Die Bezahlseite lässt sich gerade nicht öffnen — bitte gleich noch einmal versuchen.",
    mailPlan: "30-Tage-Pass (keine Verlängerung)", mailEnds: "Endet am", mailNote: "Er verlängert sich nicht, es wird nichts mehr abgebucht.", mailManage: "Mein Konto",
  },
  es: {
    link: "¿Prefieres sin renovación automática? El pase de 30 días cuesta {pass}: termina y ya.",
    title2nd: "Tu segunda lectura de hoy",
    body2nd: "Si vienen más preguntas, la membresía sale mejor que comprar de una en una: 10 lecturas completas al mes y lecturas ligeras sin límite.",
    optSub: "Membresía {month}/mes · se renueva, cancela cuando quieras", optSubSave: "ahorra {save} al mes frente al pase de 30 días",
    optPass: "Pase de 30 días {pass} · sin renovación", single: "Solo esta",
    btnPass: "Pase de 30 días {pass}", btnPassNote: "30 días · sin renovación",
    consentPre: "Un pase se paga una vez, dura los días que elijas y no se vuelve a cobrar; al pagar aceptas los ", consentLink: "términos", consentPost: " y pides que empiece ya.",
    done: "Tu pase está activo hasta el {date}. No se renovará.", doneLogin: "Tu pase está activo. Inicia sesión con el correo con el que pagaste para usarlo.",
    active: "Pase · termina el {date}, sin renovación", after: "¿Quieres seguir después? La membresía con renovación cuesta {month} al mes.",
    already: "Ya eres miembro.", error: "Ahora no se abre la página de pago; inténtalo de nuevo en un momento.",
    mailPlan: "Pase de 30 días (sin renovación)", mailEnds: "Termina", mailNote: "No se renueva y no se te volverá a cobrar.", mailManage: "Mi cuenta",
  },
  pt: {
    link: "Prefere sem renovação automática? O passe de 30 dias custa {pass} — e acaba.",
    title2nd: "Sua segunda leitura hoje",
    body2nd: "Se ainda vêm mais perguntas, a assinatura sai melhor do que comprar uma a uma: 10 leituras completas por mês e leituras leves sem limite.",
    optSub: "Assinatura {month}/mês · renova, cancele quando quiser", optSubSave: "economiza {save} por mês em relação ao passe de 30 dias",
    optPass: "Passe de 30 dias {pass} · sem renovação", single: "Só esta",
    btnPass: "Passe de 30 dias {pass}", btnPassNote: "30 dias · sem renovação",
    consentPre: "Um passe é pago uma vez, vale pelos dias escolhidos e não é cobrado de novo; ao pagar você concorda com os ", consentLink: "termos", consentPost: " e pede que comece já.",
    done: "Seu passe está ativo até {date}. Não será renovado.", doneLogin: "Seu passe está ativo. Entre com o e-mail do pagamento para usar.",
    active: "Passe · termina em {date}, sem renovação", after: "Quer continuar depois? A assinatura com renovação custa {month} por mês.",
    already: "Você já é assinante.", error: "A página de pagamento não abre agora — tente de novo em instantes.",
    mailPlan: "Passe de 30 dias (sem renovação)", mailEnds: "Termina em", mailNote: "Não renova e você não será cobrado de novo.", mailManage: "Minha conta",
  },
};

export function passT(locale: string, key: keyof PassCopy, vars: Record<string, string | number> = {}): string {
  const table = PASS_T[locale] ?? PASS_T.en!;
  return table[key].replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? `{${k}}`));
}
