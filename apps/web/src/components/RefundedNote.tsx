import Link from "next/link";

/**
 * 10-19 (Neil: 退款後不可讀，跟算卦一樣): what a refunded 塔羅 / 解籤 / 八字報告 link shows instead of the reading.
 * 10-30 进度表 128: in the page's language when it is given (`hans` stays for the pages that only pass that).
 */
const T: Record<string, { p: string; home: string }> = {
  "zh-hant": { p: "這份內容已經退款，連結也就不再開放。有問題可以回覆當初那封信，或寫信到 support@yaoflow.com。", home: "回到首頁" },
  zh: { p: "这份内容已经退款，链接也就不再开放。有问题可以回复当初那封信，或写信到 support@yaoflow.com。", home: "回到首页" },
  en: { p: "This was refunded, so the link is no longer open. If you have a question, reply to the original email or write to support@yaoflow.com.", home: "Back to the home page" },
  ja: { p: "この内容は返金済みのため、リンクは閉じています。ご不明な点は、当時のメールに返信するか support@yaoflow.com までご連絡ください。", home: "トップページへ" },
  ko: { p: "환불된 내용이라 링크가 더 이상 열리지 않습니다. 궁금한 점은 받으신 메일에 회신하시거나 support@yaoflow.com으로 연락해 주세요.", home: "홈으로" },
  fr: { p: "Ce contenu a été remboursé : le lien n'est donc plus ouvert. Pour toute question, répondez à l'e-mail d'origine ou écrivez à support@yaoflow.com.", home: "Retour à l'accueil" },
  de: { p: "Das wurde erstattet, deshalb ist der Link nicht mehr offen. Bei Fragen antworte auf die ursprüngliche E-Mail oder schreib an support@yaoflow.com.", home: "Zur Startseite" },
  es: { p: "Esto se reembolsó, así que el enlace ya no está abierto. Si tienes alguna pregunta, responde al correo original o escribe a support@yaoflow.com.", home: "Volver al inicio" },
  pt: { p: "Este conteúdo foi reembolsado, por isso o link não está mais aberto. Se tiver alguma dúvida, responda ao e-mail original ou escreva para support@yaoflow.com.", home: "Voltar ao início" },
};

export default function RefundedNote({ hans, home, locale }: { hans: boolean; home: string; locale?: string }) {
  const t = T[locale ?? (hans ? "zh" : "zh-hant")] ?? T[hans ? "zh" : "zh-hant"]!;
  return (
    <div className="max-w-xl mx-auto px-6 pt-24 pb-24 text-center">
      <p className="opacity-60 mb-6">{t.p}</p>
      <Link href={home} className="underline underline-offset-4">{t.home}</Link>
    </div>
  );
}
