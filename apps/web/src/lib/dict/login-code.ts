/**
 * 10-02 登录码: the six digits in every sign-in letter, and the box on the sign-in page that takes them — for readers
 * who opened YaoFlow inside Threads / Instagram, where the letter's link signs in a different browser.
 * zh-hant says 登入 (Taiwan), as the rest of the hand-written traditional copy does.
 */
export const LOGIN_CODE_T = {
  zh: {
    mailLabel: "登录码",
    mailHow: "如果你是在 Threads、Instagram 等 App 里打开 YaoFlow 的，回到原来的页面，在登录框里输入这 6 位数字就能登录，不用点下面的链接（链接会在别的浏览器里打开）。登录码和链接一样，15 分钟内有效。",
    formLabel: "邮件里的 6 位登录码", formHint: "在 Threads、Instagram 里打开的？直接在这里输入登录码，不用点邮件里的链接。",
    formGo: "登录", formBad: "登录码不对，再看一下邮件里的 6 位数字。", formExpired: "这个登录码已经过期或用过了，请重新发一封。", formTooMany: "试错太多次了，请重新发一封登录邮件。",
  },
  "zh-hant": {
    mailLabel: "登入碼",
    mailHow: "如果你是在 Threads、Instagram 等 App 裡打開 YaoFlow 的，回到原來的頁面，在登入框輸入這 6 位數字就能登入，不用點下面的連結（連結會在別的瀏覽器裡打開）。登入碼和連結一樣，15 分鐘內有效。",
    formLabel: "郵件裡的 6 位登入碼", formHint: "在 Threads、Instagram 裡打開的？直接在這裡輸入登入碼，不用點郵件裡的連結。",
    formGo: "登入", formBad: "登入碼不對，再看一下郵件裡的 6 位數字。", formExpired: "這個登入碼已經過期或用過了，請重新寄一封。", formTooMany: "試錯太多次了，請重新寄一封登入郵件。",
  },
  en: {
    mailLabel: "Sign-in code",
    mailHow: "Opened YaoFlow inside Threads, Instagram or another app? Go back to that page and type these 6 digits into the sign-in box — no need to tap the link below (it would open in a different browser). Like the link, the code works for 15 minutes.",
    formLabel: "The 6-digit code from the email", formHint: "Opened this inside Threads or Instagram? Type the code here — no need to tap the link in the email.",
    formGo: "Sign in", formBad: "That code doesn't match — check the 6 digits in the email.", formExpired: "This code has expired or was already used — send a new email.", formTooMany: "Too many tries — please send a new sign-in email.",
  },
  ja: {
    mailLabel: "ログインコード",
    mailHow: "Threads や Instagram などのアプリ内で YaoFlow を開いた場合は、元のページに戻ってログイン欄にこの 6 桁を入力してください。下のリンクを押す必要はありません（リンクは別のブラウザで開きます）。コードもリンクと同じく 15 分間有効です。",
    formLabel: "メールに記載の 6 桁のログインコード", formHint: "Threads や Instagram の中で開いていますか？メールのリンクを押さずに、ここにコードを入力できます。",
    formGo: "ログイン", formBad: "コードが一致しません。メールの 6 桁をもう一度ご確認ください。", formExpired: "このコードは期限切れか、すでに使われています。メールをもう一度送ってください。", formTooMany: "試行回数が多すぎます。ログインメールをもう一度送ってください。",
  },
  ko: {
    mailLabel: "로그인 코드",
    mailHow: "Threads, Instagram 같은 앱 안에서 YaoFlow를 열었다면 원래 페이지로 돌아가 로그인 칸에 이 6자리를 입력하세요. 아래 링크를 누를 필요가 없어요(링크는 다른 브라우저에서 열려요). 코드도 링크처럼 15분간 유효해요.",
    formLabel: "메일에 있는 6자리 로그인 코드", formHint: "Threads나 Instagram 안에서 열었나요? 메일의 링크를 누르지 말고 여기에 코드를 입력하세요.",
    formGo: "로그인", formBad: "코드가 맞지 않아요. 메일의 6자리를 다시 확인해 주세요.", formExpired: "이 코드는 만료되었거나 이미 사용되었어요. 메일을 다시 보내 주세요.", formTooMany: "시도 횟수가 너무 많아요. 로그인 메일을 다시 보내 주세요.",
  },
  fr: {
    mailLabel: "Code de connexion",
    mailHow: "Vous avez ouvert YaoFlow dans Threads, Instagram ou une autre app ? Revenez sur cette page et saisissez ces 6 chiffres dans le champ de connexion — inutile de toucher le lien ci-dessous (il s'ouvrirait dans un autre navigateur). Comme le lien, le code vaut 15 minutes.",
    formLabel: "Le code à 6 chiffres reçu par e-mail", formHint: "Ouvert dans Threads ou Instagram ? Saisissez le code ici, sans toucher le lien de l'e-mail.",
    formGo: "Me connecter", formBad: "Ce code ne correspond pas — vérifiez les 6 chiffres de l'e-mail.", formExpired: "Ce code a expiré ou a déjà servi — demandez un nouvel e-mail.", formTooMany: "Trop d'essais — demandez un nouvel e-mail de connexion.",
  },
  de: {
    mailLabel: "Anmeldecode",
    mailHow: "YaoFlow in Threads, Instagram oder einer anderen App geöffnet? Geh zurück zu dieser Seite und gib diese 6 Ziffern im Anmeldefeld ein — du musst den Link unten nicht antippen (er würde sich in einem anderen Browser öffnen). Wie der Link gilt der Code 15 Minuten.",
    formLabel: "Der 6-stellige Code aus der E-Mail", formHint: "In Threads oder Instagram geöffnet? Gib den Code hier ein, ohne den Link in der E-Mail anzutippen.",
    formGo: "Anmelden", formBad: "Der Code stimmt nicht — prüf die 6 Ziffern in der E-Mail.", formExpired: "Der Code ist abgelaufen oder wurde schon benutzt — fordere eine neue E-Mail an.", formTooMany: "Zu viele Versuche — fordere bitte eine neue Anmelde-E-Mail an.",
  },
  es: {
    mailLabel: "Código para entrar",
    mailHow: "¿Abriste YaoFlow dentro de Threads, Instagram u otra app? Vuelve a esa página y escribe estos 6 dígitos en la casilla para entrar; no hace falta tocar el enlace de abajo (se abriría en otro navegador). Como el enlace, el código vale 15 minutos.",
    formLabel: "El código de 6 dígitos del correo", formHint: "¿Lo abriste en Threads o Instagram? Escribe el código aquí, sin tocar el enlace del correo.",
    formGo: "Entrar", formBad: "Ese código no coincide; revisa los 6 dígitos del correo.", formExpired: "Este código caducó o ya se usó; pide un correo nuevo.", formTooMany: "Demasiados intentos; pide un nuevo correo para entrar.",
  },
  pt: {
    mailLabel: "Código de acesso",
    mailHow: "Abriu o YaoFlow dentro do Threads, Instagram ou outro app? Volte para essa página e digite estes 6 dígitos no campo de entrada — não precisa tocar no link abaixo (ele abriria em outro navegador). Como o link, o código vale 15 minutos.",
    formLabel: "O código de 6 dígitos do e-mail", formHint: "Abriu no Threads ou no Instagram? Digite o código aqui, sem tocar no link do e-mail.",
    formGo: "Entrar", formBad: "Esse código não confere — confira os 6 dígitos do e-mail.", formExpired: "Este código expirou ou já foi usado — peça um novo e-mail.", formTooMany: "Tentativas demais — peça um novo e-mail de acesso.",
  },
} as const;

export type LoginCodeKey = keyof (typeof LOGIN_CODE_T)["zh"];
export function lc(locale: string, key: LoginCodeKey): string {
  return ((LOGIN_CODE_T as Record<string, Record<LoginCodeKey, string>>)[locale] ?? LOGIN_CODE_T.en)[key];
}
