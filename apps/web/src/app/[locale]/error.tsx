"use client";

import { useEffect } from "react";
import { useParams } from "next/navigation";
import { track } from "@/lib/track";

/**
 * 10-02 (iOS 16.2 Threads reader: 「Application error: a client-side exception has occurred」 — Next.js's own blank
 * page, in English, with no way forward). When a page fails in the browser the reader now gets a page in their
 * language with a reload button and what to try next, and we get the error with its message (client_error,
 * method "boundary:…"). A script that went missing after a deploy (a chunk-load error) reloads the page once by
 * itself — the fresh page asks for the new files.
 */
const T: Record<string, { title: string; body: string; reload: string; home: string; hint: string }> = {
  zh: { title: "这一页没能打开", body: "可能是网络不稳，或这个浏览器版本较旧。点下面重新载入试试。", reload: "重新载入", home: "回到首页", hint: "如果一直这样：在右上角「⋯」里选「在浏览器中打开」，或用 Safari / Chrome 打开 yaoflow.com。" },
  "zh-hant": { title: "這一頁沒能打開", body: "可能是網路不穩，或這個瀏覽器版本較舊。點下面重新載入試試。", reload: "重新載入", home: "回到首頁", hint: "如果一直這樣：在右上角「⋯」裡選「在瀏覽器中開啟」，或用 Safari / Chrome 打開 yaoflow.com。" },
  en: { title: "This page didn't load", body: "The connection may be unsteady, or this browser may be too old. Try reloading.", reload: "Reload", home: "Back to home", hint: "If it keeps happening: choose \"Open in browser\" from the ⋯ menu, or open yaoflow.com in Safari or Chrome." },
  ja: { title: "このページを開けませんでした", body: "通信が不安定か、ブラウザのバージョンが古い可能性があります。再読み込みをお試しください。", reload: "再読み込み", home: "トップへ戻る", hint: "何度も起きる場合は、右上の「⋯」から「ブラウザで開く」を選ぶか、Safari / Chrome で yaoflow.com を開いてください。" },
  ko: { title: "이 페이지를 열지 못했습니다", body: "연결이 불안정하거나 브라우저 버전이 오래되었을 수 있습니다. 다시 불러와 보세요.", reload: "다시 불러오기", home: "처음으로", hint: "계속 이러면 오른쪽 위 「⋯」에서 「브라우저에서 열기」를 고르거나 Safari / Chrome으로 yaoflow.com을 여세요." },
  fr: { title: "La page ne s'est pas chargée", body: "La connexion est peut-être instable, ou ce navigateur trop ancien. Essayez de recharger.", reload: "Recharger", home: "Retour à l'accueil", hint: "Si cela se répète : choisissez « Ouvrir dans le navigateur » dans le menu ⋯, ou ouvrez yaoflow.com dans Safari ou Chrome." },
  de: { title: "Die Seite wurde nicht geladen", body: "Vielleicht ist die Verbindung instabil oder der Browser zu alt. Versuche, neu zu laden.", reload: "Neu laden", home: "Zur Startseite", hint: "Wenn es wieder passiert: im Menü ⋯ „Im Browser öffnen“ wählen oder yaoflow.com in Safari oder Chrome öffnen." },
  es: { title: "La página no se cargó", body: "Puede que la conexión sea inestable o que el navegador sea antiguo. Prueba a recargar.", reload: "Recargar", home: "Volver al inicio", hint: "Si sigue pasando: elige «Abrir en el navegador» en el menú ⋯, o abre yaoflow.com en Safari o Chrome." },
  pt: { title: "A página não carregou", body: "A conexão pode estar instável ou o navegador ser antigo. Tente recarregar.", reload: "Recarregar", home: "Voltar ao início", hint: "Se continuar: escolha \"Abrir no navegador\" no menu ⋯, ou abra yaoflow.com no Safari ou no Chrome." },
};

const CHUNK = /ChunkLoadError|Loading (?:CSS )?chunk|Importing a module script failed|Failed to fetch dynamically imported module|error loading dynamically imported module/i;

export default function LocaleError({ error }: { error: Error & { digest?: string }; reset: () => void }) {
  const params = useParams();
  const l = typeof params?.locale === "string" && T[params.locale] ? params.locale : "en";
  const tx = T[l]!;

  useEffect(() => {
    const message = String(error?.message ?? "").replace(/\s+/g, " ");
    track("client_error", { locale: l, method: `boundary:${message}`.slice(0, 24), msg: `${error?.name ?? "Error"}: ${message}${error?.digest ? ` #${error.digest}` : ""}`.slice(0, 160) });
    if (CHUNK.test(message)) {
      try {
        if (!sessionStorage.getItem("yf_chunk_reload")) { sessionStorage.setItem("yf_chunk_reload", "1"); window.location.reload(); }
      } catch { /* no storage: the button is there */ }
    }
  }, [error, l]);

  return (
    <div className="mx-auto max-w-xl px-6 pt-20 pb-24 text-center">
      <h1 className="t-d3">{tx.title}</h1>
      <p className="t-body mt-4 text-[var(--ink-66)]">{tx.body}</p>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-3">
        <button type="button" onClick={() => window.location.reload()} className="min-h-[48px] px-6 py-3 rounded-[2px] bg-[var(--ink)] text-[var(--paper)] text-[13px] tracking-[0.14em]">{tx.reload}</button>
        <a href={`/${l}`} className="t-small underline underline-offset-4">{tx.home}</a>
      </div>
      <p className="t-small mt-8 !text-[var(--ink-45)]">{tx.hint}</p>
    </div>
  );
}
