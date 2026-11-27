"use client";

import { useEffect, useState } from "react";
import { FLAG_COOKIE_NAME } from "@/lib/auth-flag";

/**
 * 10-02 付款后自动登录: on the reading page right after a payment, ask once whether this browser — the one that paid —
 * may be signed in to the new account (/api/pay-login decides; lib/pay-login.ts has the rules). When it is, say so
 * plainly, with the address and a way out if it is not theirs. Silent in every other case.
 */
const T: Record<string, { done: string; account: string; notYou: string }> = {
  zh: { done: "已在这台设备登录 {email}。这一卦和以后的卦都收在「我的」里。", account: "我的", notYou: "不是你？退出" },
  "zh-hant": { done: "已在這台裝置登入 {email}。這一卦和以後的卦都收在「我的」裡。", account: "我的", notYou: "不是你？登出" },
  en: { done: "This device is now signed in as {email}. This reading and the next ones are kept under “Mine”.", account: "Mine", notYou: "Not you? Sign out" },
  ja: { done: "この端末で {email} としてログインしました。この鑑定もこれからの鑑定も「マイページ」に残ります。", account: "マイページ", notYou: "ご本人でない場合はログアウト" },
  ko: { done: "이 기기에서 {email}(으)로 로그인했습니다. 이 풀이와 앞으로의 풀이는 「내 정보」에 모입니다.", account: "내 정보", notYou: "본인이 아니면 로그아웃" },
  fr: { done: "Cet appareil est maintenant connecté en tant que {email}. Cette lecture et les suivantes sont gardées dans «\u00a0Mon espace\u00a0».", account: "Mon espace", notYou: "Pas vous ? Se déconnecter" },
  de: { done: "Dieses Gerät ist jetzt als {email} angemeldet. Diese Deutung und die nächsten findest du unter „Mein Bereich“.", account: "Mein Bereich", notYou: "Nicht du? Abmelden" },
  es: { done: "Este dispositivo ya inició sesión como {email}. Esta lectura y las próximas quedan en «Mi espacio».", account: "Mi espacio", notYou: "¿No eres tú? Cerrar sesión" },
  pt: { done: "Este aparelho agora está conectado como {email}. Esta leitura e as próximas ficam em “Meu espaço”.", account: "Meu espaço", notYou: "Não é você? Sair" },
};

export default function PayLogin({ sid, locale }: { sid: string; locale: string }) {
  const [email, setEmail] = useState<string | null>(null);
  const tx = T[locale] ?? T.en!;

  useEffect(() => {
    try {
      if (document.cookie.split(";").some((c) => c.trim().startsWith(`${FLAG_COOKIE_NAME}=1`))) return; // already signed in
      const key = `yf_pl_tried:${sid}`;
      if (sessionStorage.getItem(key)) return; // once per reading per tab
      sessionStorage.setItem(key, "1");
    } catch { /* storage blocked: the server's one-time rule still holds */ }
    fetch("/api/pay-login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sid }) })
      .then((r) => r.json())
      .then((j: { signedIn?: boolean; email?: string; already?: boolean }) => {
        if (j.signedIn && j.email && !j.already) {
          setEmail(j.email);
          window.dispatchEvent(new Event("yf:auth")); // the masthead (it hides its sign-in link once signed in)
        }
      })
      .catch(() => {});
  }, [sid]);

  // signed out elsewhere on the page (send-to, or 「不是你？」): the line goes with it
  useEffect(() => {
    const on = () => { if (!document.cookie.split(";").some((c) => c.trim().startsWith(`${FLAG_COOKIE_NAME}=1`))) setEmail(null); };
    window.addEventListener("yf:auth", on);
    return () => window.removeEventListener("yf:auth", on);
  }, []);

  if (!email) return null;
  const signOut = () => {
    fetch("/api/auth/logout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ locale }) })
      .finally(() => { setEmail(null); window.dispatchEvent(new Event("yf:auth")); });
  };
  return (
    <p className="t-small mt-[var(--s-3)] !text-[var(--ink-66)]" data-heat="pay-login">
      {tx.done.replace("{email}", email)}{" "}
      <a href={`/${locale}/account`} className="underline underline-offset-4">{tx.account} →</a>
      <button type="button" onClick={signOut} className="ml-3 underline underline-offset-4 !text-[var(--ink-45)]">{tx.notYou}</button>
    </p>
  );
}
