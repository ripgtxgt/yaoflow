/**
 * 10-24 微信／QQ 里打开的付款中转页 (app/[locale]/pay/page.tsx, lib/inapp-pay.ts): why the payment cannot go on in here,
 * where 「在浏览器打开」 is, the link to copy, and the card that does work in here. {app} is the app's name. Same keys in
 * every language (test/pay-hop-1024.test.ts).
 */
export interface PayHopCopy {
  appName: { wechat: string; qq: string };
  title: string; lead: string; point: string;
  step1: string; step2: string; step3: string;
  copy: string; copied: string; manual: string;
  card: string; cardNote: string; after: string;
}

export const PAY_HOP_T: Record<string, PayHopCopy> = {
  "zh-hant": {
    appName: { wechat: "微信", qq: "QQ" },
    title: "{app}裡沒辦法跳到支付寶",
    lead: "{app}不讓網頁打開支付寶，所以在這裡付款會一直卡在跳轉（不會扣款）。換到瀏覽器裡付就好，價格一樣。",
    point: "點右上角「···」",
    step1: "點右上角的「···」",
    step2: "選「在瀏覽器打開」（iPhone 上可能寫「在 Safari 中打開」或「在默認瀏覽器中打開」）",
    step3: "瀏覽器會直接打開付款頁，選支付寶就能付。",
    copy: "複製付款連結", copied: "已複製。打開 Safari 或其他瀏覽器，貼到網址列就能付款。", manual: "複製不了的話，長按下面這行選取：",
    card: "我用銀行卡，就在這裡付", cardNote: "在{app}裡只能刷 Visa、萬事達、銀聯卡；支付寶和 Apple Pay 要在瀏覽器裡用。",
    after: "付好以後，在瀏覽器裡就能看；回到{app}，用同一個信箱登入也看得到。",
  },
  zh: {
    appName: { wechat: "微信", qq: "QQ" },
    title: "{app}里没办法跳到支付宝",
    lead: "{app}不让网页打开支付宝，所以在这里付款会一直卡在跳转（不会扣款）。换到浏览器里付就好，价格一样。",
    point: "点右上角「···」",
    step1: "点右上角的「···」",
    step2: "选「在浏览器打开」（iPhone 上可能写「在 Safari 中打开」或「在默认浏览器中打开」）",
    step3: "浏览器会直接打开付款页，选支付宝就能付。",
    copy: "复制付款链接", copied: "已复制。打开 Safari 或其他浏览器，粘贴到地址栏就能付款。", manual: "复制不了的话，长按下面这行选中：",
    card: "我用银行卡，就在这里付", cardNote: "在{app}里只能刷 Visa、万事达、银联卡；支付宝和 Apple Pay 要在浏览器里用。",
    after: "付好以后，在浏览器里就能看；回到{app}，用同一个邮箱登录也看得到。",
  },
  en: {
    appName: { wechat: "WeChat", qq: "QQ" },
    title: "{app} can't open Alipay",
    lead: "{app} doesn't let web pages hand over to Alipay, so paying here keeps spinning (nothing is charged). Open it in your browser and pay there — the price is the same.",
    point: "Tap “···” at the top right",
    step1: "Tap “···” at the top right",
    step2: "Choose “Open in browser” (on iPhone it may say “Open in Safari” or “Open in default browser”)",
    step3: "The payment page opens in your browser — choose Alipay there.",
    copy: "Copy the payment link", copied: "Copied. Open Safari or another browser and paste it into the address bar.", manual: "If copying doesn't work, press and hold this line to select it:",
    card: "I'll pay by card, right here", cardNote: "Inside {app} only cards work (Visa, Mastercard, UnionPay); Alipay and Apple Pay need a browser.",
    after: "Once it's paid you can read it in the browser; back in {app}, sign in with the same email to see it there too.",
  },
  ja: {
    appName: { wechat: "WeChat", qq: "QQ" },
    title: "{app}の中ではAlipayに移動できません",
    lead: "{app}はウェブページからAlipayを開けないため、ここでのお支払いは移動中のまま止まります（請求はありません）。ブラウザで開いてお支払いください。価格は同じです。",
    point: "右上の「···」をタップ",
    step1: "右上の「···」をタップ",
    step2: "「ブラウザで開く」を選ぶ（iPhoneでは「Safariで開く」などと表示されます）",
    step3: "ブラウザで支払いページが開きます。Alipayを選んでください。",
    copy: "支払いリンクをコピー", copied: "コピーしました。Safariなどのブラウザを開き、アドレスバーに貼り付けてください。", manual: "コピーできない場合は、下の行を長押しして選択してください：",
    card: "カードでこのまま支払う", cardNote: "{app}の中で使えるのはカード（Visa、Mastercard、銀聯）だけです。AlipayとApple Payはブラウザでご利用ください。",
    after: "お支払い後はブラウザでそのまま見られます。{app}に戻って同じメールアドレスでログインしても見られます。",
  },
  ko: {
    appName: { wechat: "위챗", qq: "QQ" },
    title: "{app} 안에서는 알리페이로 넘어갈 수 없어요",
    lead: "{app}에서는 웹페이지가 알리페이를 열 수 없어서, 여기서 결제하면 이동 중에 멈춰 있어요(청구되지 않아요). 브라우저에서 열어 결제해 주세요. 가격은 같아요.",
    point: "오른쪽 위 「···」 누르기",
    step1: "오른쪽 위의 「···」를 누르세요",
    step2: "「브라우저에서 열기」를 고르세요 (iPhone에서는 「Safari에서 열기」 등으로 보일 수 있어요)",
    step3: "브라우저에서 결제 페이지가 열리면 알리페이를 고르세요.",
    copy: "결제 링크 복사", copied: "복사했어요. Safari 등 브라우저를 열고 주소창에 붙여 넣으세요.", manual: "복사가 안 되면 아래 줄을 길게 눌러 선택하세요:",
    card: "카드로 여기서 결제할게요", cardNote: "{app} 안에서는 카드(Visa, Mastercard, 은련)만 돼요. 알리페이와 Apple Pay는 브라우저에서 써 주세요.",
    after: "결제가 끝나면 브라우저에서 바로 볼 수 있어요. {app} 앱으로 돌아가 같은 이메일로 로그인해도 보여요.",
  },
  fr: {
    appName: { wechat: "WeChat", qq: "QQ" },
    title: "{app} ne peut pas ouvrir Alipay",
    lead: "{app} empêche les pages web de passer la main à Alipay : ici, le paiement tourne sans fin (rien n'est débité). Ouvrez la page dans votre navigateur pour payer — au même prix.",
    point: "Touchez « ··· » en haut à droite",
    step1: "Touchez « ··· » en haut à droite",
    step2: "Choisissez « Ouvrir dans le navigateur » (sur iPhone : « Ouvrir dans Safari » ou similaire)",
    step3: "La page de paiement s'ouvre dans le navigateur : choisissez Alipay.",
    copy: "Copier le lien de paiement", copied: "Copié. Ouvrez Safari ou un autre navigateur et collez-le dans la barre d'adresse.", manual: "Si la copie ne marche pas, appuyez longuement sur cette ligne pour la sélectionner :",
    card: "Je paie par carte, ici", cardNote: "Dans {app}, seules les cartes fonctionnent (Visa, Mastercard, UnionPay) ; Alipay et Apple Pay demandent un navigateur.",
    after: "Une fois payé, vous pouvez le lire dans le navigateur ; de retour dans {app}, connectez-vous avec la même adresse pour le voir aussi.",
  },
  de: {
    appName: { wechat: "WeChat", qq: "QQ" },
    title: "{app} kann Alipay nicht öffnen",
    lead: "{app} lässt Webseiten nicht zu Alipay wechseln – die Zahlung hier dreht sich endlos (es wird nichts abgebucht). Öffnen Sie die Seite im Browser und zahlen Sie dort – zum selben Preis.",
    point: "Oben rechts auf „···“ tippen",
    step1: "Tippen Sie oben rechts auf „···“",
    step2: "Wählen Sie „Im Browser öffnen“ (auf dem iPhone z. B. „In Safari öffnen“)",
    step3: "Die Zahlungsseite öffnet sich im Browser – wählen Sie dort Alipay.",
    copy: "Zahlungslink kopieren", copied: "Kopiert. Öffnen Sie Safari oder einen anderen Browser und fügen Sie ihn in die Adresszeile ein.", manual: "Falls das Kopieren nicht klappt, halten Sie diese Zeile gedrückt, um sie zu markieren:",
    card: "Ich zahle hier per Karte", cardNote: "In {app} funktionieren nur Karten (Visa, Mastercard, UnionPay); Alipay und Apple Pay brauchen einen Browser.",
    after: "Nach der Zahlung können Sie es im Browser lesen; zurück in {app} sehen Sie es nach der Anmeldung mit derselben E-Mail auch dort.",
  },
  es: {
    appName: { wechat: "WeChat", qq: "QQ" },
    title: "{app} no puede abrir Alipay",
    lead: "{app} no deja que las páginas web pasen a Alipay, así que aquí el pago se queda cargando (no se cobra nada). Abre la página en tu navegador y paga allí; el precio es el mismo.",
    point: "Toca «···» arriba a la derecha",
    step1: "Toca «···» arriba a la derecha",
    step2: "Elige «Abrir en el navegador» (en iPhone puede decir «Abrir en Safari»)",
    step3: "La página de pago se abre en el navegador: elige Alipay.",
    copy: "Copiar el enlace de pago", copied: "Copiado. Abre Safari u otro navegador y pégalo en la barra de direcciones.", manual: "Si no se puede copiar, mantén pulsada esta línea para seleccionarla:",
    card: "Pago con tarjeta aquí", cardNote: "Dentro de {app} solo funcionan las tarjetas (Visa, Mastercard, UnionPay); Alipay y Apple Pay necesitan un navegador.",
    after: "Una vez pagado, puedes leerlo en el navegador; de vuelta en {app}, inicia sesión con el mismo correo para verlo también allí.",
  },
  pt: {
    appName: { wechat: "WeChat", qq: "QQ" },
    title: "O {app} não consegue abrir o Alipay",
    lead: "O {app} não deixa páginas da web passarem para o Alipay, então aqui o pagamento fica carregando (nada é cobrado). Abra a página no navegador e pague lá — o preço é o mesmo.",
    point: "Toque em «···» no canto superior direito",
    step1: "Toque em «···» no canto superior direito",
    step2: "Escolha «Abrir no navegador» (no iPhone pode aparecer «Abrir no Safari»)",
    step3: "A página de pagamento abre no navegador — escolha Alipay.",
    copy: "Copiar o link de pagamento", copied: "Copiado. Abra o Safari ou outro navegador e cole na barra de endereço.", manual: "Se não der para copiar, toque e segure esta linha para selecioná-la:",
    card: "Vou pagar com cartão aqui", cardNote: "Dentro do {app} só funcionam cartões (Visa, Mastercard, UnionPay); Alipay e Apple Pay precisam de um navegador.",
    after: "Depois de pago, você já pode ler no navegador; de volta ao {app}, entre com o mesmo e-mail para ver lá também.",
  },
};
export const payHopT = (l: string): PayHopCopy => PAY_HOP_T[l] ?? PAY_HOP_T.en!;
