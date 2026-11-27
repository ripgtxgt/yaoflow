/**
 * 10-25 (Neil: 「把这些可以不登录使用的产品也改为需要登录才能使用」): the card that stands where 起卦／抽牌／擲筊／求籤／解籤
 * starts when nobody is signed in. Says only what to do.
 */
export interface LoginGateCopy { title: string; lead: string; btn: string }
export const LOGIN_GATE_T: Record<string, LoginGateCopy> = {
  "zh-hant": { title: "登入後就能開始", lead: "輸入信箱，收一組驗證碼就能登入，不用設密碼。問過的事都會存在「我的」。", btn: "用信箱登入" },
  zh: { title: "登录后就能开始", lead: "输入邮箱，收一组验证码就能登录，不用设密码。问过的事都会存在「我的」。", btn: "用邮箱登录" },
  en: { title: "Sign in to begin", lead: "Enter your email and we send you a code — no password. Everything you ask is kept under “Mine”.", btn: "Sign in with email" },
  ja: { title: "ログインして始めましょう", lead: "メールアドレスを入れると確認コードが届きます。パスワードは不要です。尋ねたことは「マイページ」に残ります。", btn: "メールでログイン" },
  ko: { title: "로그인하고 시작하세요", lead: "이메일을 입력하면 인증 코드가 옵니다. 비밀번호는 필요 없어요. 물어본 일은 ‘내 기록’에 남습니다.", btn: "이메일로 로그인" },
  fr: { title: "Connectez-vous pour commencer", lead: "Entrez votre e-mail, nous vous envoyons un code — sans mot de passe. Tout ce que vous demandez est gardé dans « Mon espace ».", btn: "Se connecter par e-mail" },
  de: { title: "Melde dich an, um zu beginnen", lead: "Gib deine E-Mail ein, wir schicken dir einen Code – ohne Passwort. Alles, was du fragst, bleibt unter „Meins“.", btn: "Mit E-Mail anmelden" },
  es: { title: "Inicia sesión para empezar", lead: "Escribe tu correo y te enviamos un código, sin contraseña. Todo lo que preguntes queda en «Lo mío».", btn: "Entrar con correo" },
  pt: { title: "Entre para começar", lead: "Digite seu e-mail e enviamos um código — sem senha. Tudo o que você perguntar fica em “Meu”.", btn: "Entrar com e-mail" },
};
export const loginGateT = (locale: string): LoginGateCopy => LOGIN_GATE_T[locale] ?? LOGIN_GATE_T["zh-hant"]!;

/** where the login page sends the reader back to: this page with what they had typed (`next` keeps path + query, no #) */
export function gateNext(path: string, sp: Record<string, string | string[] | undefined>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) if (typeof v === "string" && v) q.set(k, v.slice(0, 300));
  const s = q.toString().replace(/\+/g, "%20").replace(/\*/g, "%2A"); // the login page takes only [A-Za-z0-9-_/?=&%.] (lib/auth safeNextPath)
  return s ? `${path}?${s}` : path;
}
