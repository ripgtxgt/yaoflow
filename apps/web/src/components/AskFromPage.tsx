"use client";

import { useState } from "react";
import { track } from "@/lib/track";
import { askFromPageLocale, type AskLocale as L } from "@/lib/ask-from-page";

/**
 * 11-04 (Neil：「做1，2吧」— 外语转化): readers outside 简体／繁體 come in on a content page (a hexagram, a lot, a dream),
 * read, and leave — 84 English visitors that week, 4 casts. At the end of the page the question box itself, with a few
 * questions people there ask: one tap and they are on the cast page with the question in place (the cast page reads ?q=).
 * Shown on the foreign pages only; the Chinese pages keep their own door.
 */
const T: Record<L, { title: string; body: string; ph: string; go: string; ex: string[] }> = {
  en: {
    title: "Have a question of your own?", body: "Write it the way you would ask a friend — one matter, with a person and a time if there is one. Then toss the coins.",
    ph: "e.g. Will he reach out before the holidays?", go: "Ask with three coins",
    ex: ["Will he reach out before the holidays?", "Should I take the new job offer?", "Will this deal close this month?"],
  },
  ja: {
    title: "ご自身の質問はありますか？", body: "友だちに聞くように、ひとつの事を書いてください。相手や時期があれば一緒に。それからコインを振ります。",
    ph: "例：彼から年内に連絡はありますか", go: "コインを振って占う",
    ex: ["彼から年内に連絡はありますか", "転職の話を受けるべきですか", "今月中に契約はまとまりますか"],
  },
  ko: {
    title: "직접 묻고 싶은 일이 있나요?", body: "친구에게 묻듯 한 가지 일을 적어 주세요. 사람이나 시기가 있다면 함께요. 그다음 동전을 던집니다.",
    ph: "예: 연말 전에 그 사람에게 연락이 올까요?", go: "동전 던져 묻기",
    ex: ["연말 전에 그 사람에게 연락이 올까요?", "이직 제안을 받아야 할까요?", "이번 달 안에 계약이 성사될까요?"],
  },
  fr: {
    title: "Une question à vous ?", body: "Écrivez-la comme à un ami — une seule affaire, avec une personne et un moment s'il y en a. Puis lancez les pièces.",
    ph: "ex. : Va-t-il me recontacter avant les fêtes ?", go: "Demander avec trois pièces",
    ex: ["Va-t-il me recontacter avant les fêtes ?", "Dois-je accepter la nouvelle offre ?", "Ce contrat sera-t-il signé ce mois-ci ?"],
  },
  de: {
    title: "Eine eigene Frage?", body: "Schreiben Sie sie wie an einen Freund – eine Sache, mit Person und Zeitpunkt, falls es sie gibt. Dann werfen Sie die Münzen.",
    ph: "z. B. Meldet er sich vor den Feiertagen?", go: "Mit drei Münzen fragen",
    ex: ["Meldet er sich vor den Feiertagen?", "Soll ich das neue Jobangebot annehmen?", "Kommt der Vertrag diesen Monat zustande?"],
  },
  es: {
    title: "¿Tienes una pregunta propia?", body: "Escríbela como se la harías a un amigo: un solo asunto, con una persona y un momento si los hay. Luego lanza las monedas.",
    ph: "p. ej.: ¿Me escribirá antes de las fiestas?", go: "Preguntar con tres monedas",
    ex: ["¿Me escribirá antes de las fiestas?", "¿Debo aceptar la nueva oferta de trabajo?", "¿Se cerrará este trato este mes?"],
  },
  pt: {
    title: "Tem uma pergunta sua?", body: "Escreva como perguntaria a um amigo — um assunto só, com uma pessoa e um momento se houver. Depois jogue as moedas.",
    ph: "ex.: Ele vai me procurar antes das festas?", go: "Perguntar com três moedas",
    ex: ["Ele vai me procurar antes das festas?", "Devo aceitar a nova proposta de emprego?", "Esse negócio fecha ainda este mês?"],
  },
};

export default function AskFromPage({ locale, from }: { locale: string; from: "gua" | "qian" | "dream" | "tarot" }) {
  const [q, setQ] = useState("");
  if (!askFromPageLocale(locale)) return null;
  const tx = T[locale];
  const go = (question: string, how: string) => {
    const s = question.trim();
    track("heat_click", { locale, method: `ask-from-${from}:${how}` });
    window.location.href = `/${locale}/cast?c=ask-${from}${s ? `&q=${encodeURIComponent(s.slice(0, 200))}` : ""}`;
  };
  return (
    <section className="ink-block mt-[var(--s-6)] p-[var(--s-5)]" data-heat={`ask-from-${from}`}>
      <h2 className="t-d3">{tx.title}</h2>
      <p className="t-small mt-[var(--s-2)] !text-[var(--paper-66)]">{tx.body}</p>
      <form className="mt-[var(--s-4)] flex flex-col gap-[var(--s-3)]" onSubmit={(e) => { e.preventDefault(); go(q, "typed"); }}>
        <textarea
          value={q} onChange={(e) => setQ(e.target.value)} rows={2} maxLength={200} placeholder={tx.ph}
          className="w-full bg-transparent border border-[var(--paper-66)] rounded-[2px] px-3 py-2 t-body !text-[var(--paper)] placeholder:text-[var(--paper-66)] focus:outline-none focus:border-[var(--paper)]"
        />
        <div className="flex flex-wrap gap-2">
          {tx.ex.map((x, i) => (
            <button key={i} type="button" onClick={() => go(x, `ex${i + 1}`)}
              className="t-small !text-[var(--paper)] border border-[var(--paper-66)] rounded-full px-3 py-1 hover:border-[var(--paper)] transition-colors">
              {x}
            </button>
          ))}
        </div>
        <button type="submit" className="self-start t-label !text-[var(--paper)] border border-[var(--paper-66)] rounded-[2px] px-5 py-3 hover:border-[var(--paper)] transition-colors">
          {tx.go}
        </button>
      </form>
    </section>
  );
}
