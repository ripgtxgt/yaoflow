import RefundedNote from "@/components/RefundedNote";
import { sessionRefunded } from "@/lib/db";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { currentCustomer } from "@/lib/auth";
import { entitlementFor } from "@/lib/subscription";
import { getCheckoutSession, type CheckoutSession } from "@/lib/stripe";
import { canSee } from "@/lib/features";
import { ANSWERS, cardById, cardImage, dealtOf, TAROT_TOKEN_RE, tarotDraw, tarotSlug } from "@/lib/tarot";
import { ensureTarotPersonal, fulfilTarotPayment, mailTarotOnce, tarotFollowupOf, type TarotPersonal } from "@/lib/tarot-personal";
import { CardImg, TarotAnswer, TarotBuy, TarotCastLink, TarotFollowup, TarotRevisit } from "@/components/TarotFlow";
import { tarotUi } from "@/lib/tarot-ui";
import { cardsLineIn, positionsIn, tarotText } from "@/lib/tarot-text";
import { meaningIn } from "@/lib/tarot-meaning-text";
import { fmt } from "@/lib/l10n/core";
import AutoRefresh from "@/components/AutoRefresh";
import { toHans } from "@/lib/hant";
import ResultPage from "@/components/product/ResultPage";
import CrossCards from "@/components/CrossCards";
import LoveBridge from "@/components/LoveBridge";
import type { Locale } from "@/lib/locales";

export const dynamic = "force-dynamic";
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return { title: tarotText(locale).result.metaTitle, robots: { index: false, follow: false } };
}

/**
 * 10-16 进度表 68: a spread's own page (token URL; the question shows only here, never in the URL). Free: the cards, their
 * positions, upright / reversed, keywords and each card's overall meaning. Paid (light-reading price, members included):
 * the cards read against this matter, one follow-up, and the reader's own day to be asked what happened.
 */
export default async function TarotResultPage({ params, searchParams }: { params: Promise<{ locale: string; token: string }>; searchParams: Promise<{ paid?: string; answered?: string }> }) {
  const { locale, token } = await params;
  if (!TAROT_TOKEN_RE.test(token)) notFound();
  let d = tarotDraw(token);
  if (!d || d.locale !== locale) notFound();
  // a spread already paid stays readable even if the switch is turned off later; an unpaid one follows the switch
  if (!d.paid_at && !(await canSee("tarot"))) notFound();
  const hans = locale === "zh";
  // the reading itself is written in 繁體 for both Chinese pages (the 简体 page converts it); other languages are written in them
  const w = (s: string) => (hans ? toHans(s) : s);
  const t = tarotText(locale);
  const r = t.result;
  const ui = tarotUi(locale);
  const site = (process.env.SITE_URL ?? "https://yaoflow.com").replace(/\/$/, "");

  const { paid, answered } = await searchParams;
  if (!d.paid_at && paid && /^cs_[A-Za-z0-9_]{10,200}$/.test(paid)) {
    try {
      const s = await getCheckoutSession(paid);
      if (s.metadata?.tarot === token) fulfilTarotPayment(s as CheckoutSession);
    } catch { /* the sweep will catch it */ }
    d = tarotDraw(token) ?? d;
  }
  if (d.paid_at && sessionRefunded(d.paid_session)) return <RefundedNote hans={hans} locale={locale} home={`/${locale}`} />;
  let personal: TarotPersonal | null = null;
  // 10-17 (Neil: 「解读很慢」): never hold the page for the writing — wait a moment, else show it as being written and refresh
  if (d.paid_at) personal = await Promise.race([ensureTarotPersonal(token).catch(() => null), new Promise<null>((r) => setTimeout(() => r(null), 2500))]);
  if (personal) void mailTarotOnce(token, site).catch(() => null);

  let member = false;
  let viewerEmail: string | null = null; // 10-22 进度表 90: a signed-in reader's free spread can be asked at the account's address
  let pass = false; // 10-24: a 通卡 holder's button says 通卡已含, not 會員已含
  try { const me = await currentCustomer(); if (me) { viewerEmail = me.email ?? null; const ent = await entitlementFor(me.customerId); member = !!ent.active && ent.lightLeft > 0; pass = member && !!ent.pass; } } catch { /* signed out */ }

  const pos = positionsIn(locale, d.spread);
  const cards = dealtOf(d).map((x, i) => ({ x, c: cardById(x.id)!, m: meaningIn(x.id, locale), name: t.cards[x.id] ?? x.id, pos: pos[i] ?? "" }));
  const side = (rev: boolean) => (rev ? ui.reversed : ui.upright);
  // 10-17 承接: the cast carries the spread (tarot = token; tc = the card names, words only for the cast page's line)
  const castHref = `/${locale}/cast?${new URLSearchParams({ q: d.question, tarot: token, tc: cardsLineIn(dealtOf(d), locale).slice(0, 80), c: "tarot" }).toString()}`;
  const fu = tarotFollowupOf(d);
  const showAnswer = !!d.revisit_sent_at || answered === "1" || !!d.revisit_answer;
  const cardsRow = (
    <div className="flex justify-center gap-[var(--s-4)] flex-wrap">
      {cards.map(({ x, c, name, pos: p }) => (
        <figure key={c.id} className="text-center max-w-[10rem]">
          {p && <p className="t-label mb-2">{p}</p>}
          <CardImg img={cardImage(c)} rev={x.rev} name={name} />
          <figcaption className="mt-2">
            <Link href={`/${locale}/tarot/${tarotSlug(c)}`} className="t-body font-medium underline-offset-4 hover:underline">{name}</Link>
            <p className="t-small !text-[var(--ink-66)]">{side(x.rev)}</p>
          </figcaption>
        </figure>
      ))}
    </div>
  );
  // the free reading: each card's own meaning; once paid, the cards read against this matter grow under it
  const free = (
    <>
      {cards.map(({ x, c, m, name, pos: p }, i) => m && (
        <section key={c.id} className={i === 0 ? "" : "mt-[var(--s-6)]"}>
          <h2 className="t-sect">{fmt(p ? r.cardHead : r.cardHeadNoPos, { pos: p, name, side: side(x.rev) })}</h2>
          <p className="t-small mt-1 !text-[var(--gold-text)]">{(x.rev ? m.keywords.reversed : m.keywords.upright).join(" · ")}</p>
          <p className="t-body mt-[var(--s-3)] leading-relaxed">{(x.rev ? m.reversed : m.upright).overall}</p>
        </section>
      ))}
      {personal && (
        <section id="personal" className="mt-[var(--s-6)] panel px-[var(--s-4)] py-[var(--s-5)] scroll-mt-20">
          <h2 className="t-sect mb-[var(--s-3)]">{r.personalHead}</h2>
          <p className="t-body leading-relaxed">{w(personal.reading)}</p>
          {/* 10-17 (Neil: 「应该跟我的六爻的那个一样」): one block per card like the reading page — the label on its own line
              (position · card · upright/reversed), a rule above, the text below; the card's name is not repeated in the text */}
          {personal.cards.length > 1 && personal.cards.map((line, i) => {
            const c = cards[i];
            const label = c ? fmt(c.pos ? r.cardHead : r.cardHeadNoPos, { pos: c.pos, name: c.name, side: side(c.x.rev) }) : "";
            // the model may open the line with the card's name (and its side) — the label above already says it
            const nm = c ? (hans || locale === "zh-hant" ? (cardById(c.c.id)?.zh ?? c.name) : c.name) : "";
            const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            const sides = hans || locale === "zh-hant" ? "[正逆]位" : `${esc(ui.upright)}|${esc(ui.reversed)}`;
            const text = c ? line.replace(new RegExp(`^\\s*${esc(nm)}\\s*(?:[（(]?(?:${sides})[）)]?)?\\s*[：:]\\s*`, "i"), "") : line;
            return (
              <div key={i} className="mt-[var(--s-5)] pt-[var(--s-4)] border-t border-[var(--ink-16)]">
                <h3 className="t-sect mb-[var(--s-2)]">{label}</h3>
                <p className="t-body leading-relaxed">{w(text)}</p>
              </div>
            );
          })}
          {personal.watch && (
            <div className="mt-[var(--s-5)] rounded-[2px] border-l-2 border-[var(--gold)] bg-[var(--gold)]/[0.07] px-[var(--s-4)] py-[var(--s-4)]">
              <h3 className="t-sect mb-[var(--s-2)] !text-[var(--gold-text)]">{r.stepNow}</h3>
              <p className="t-body leading-relaxed">{w(personal.watch)}</p>
            </div>
          )}
        </section>
      )}
      {d.paid_at && !personal && (
        <section id="personal" className="mt-[var(--s-6)] panel px-[var(--s-4)] py-[var(--s-5)]">
          <p className="t-body">{r.writing}</p>
          <AutoRefresh every={5000} max={36} />
        </section>
      )}
    </>
  );
  // 10-22 进度表 76 ⑤: the result template — head · answer (the cards) · free · ask · pay · revisit · cross · sticky
  return (
    <ResultPage
      locale={locale as Locale}
      head={{ label: d.spread === 3 ? r.head3 : r.head1, question: fmt(r.quote, { q: d.question }) }}
      answer={cardsRow}
      free={free}
      ask={personal ? (
        <div className="panel px-[var(--s-4)] py-[var(--s-2)]">
          <TarotFollowup token={token} castHref={castHref} ui={ui} locale={locale} done={fu ? { question: fu.question, answer: w(fu.followup.answer), cast: fu.followup.cast } : null} />
        </div>
      ) : undefined}
      pay={!d.paid_at ? (
        <section id="personal" className="panel px-[var(--s-4)] py-[var(--s-5)] scroll-mt-20">
          <h2 className="t-sect mb-[var(--s-2)]">{r.payHead}</h2>
          <p className="t-small mb-[var(--s-4)] !text-[var(--ink-66)]">{r.payLead}</p>
          <TarotBuy token={token} member={member} pass={pass} ui={ui} locale={locale} />
        </section>
      ) : undefined}
      revisit={
        // 10-22 进度表 90 (设计稿 R7「付不付費都給回訪」): a free spread gets the same 「過一陣子回來問你」
        <section id="revisit" className="border-t border-[var(--ink-16)] pt-[var(--s-5)] scroll-mt-20">
          {showAnswer ? (
            <TarotAnswer token={token} ui={ui} current={d.revisit_answer} labels={ANSWERS.map((a) => ({ id: a, label: t.answers[a] }))} />
          ) : (
            <>
              <h2 className="t-sect">{ui.rvHead}</h2>
              <p className="t-small mt-1 mb-[var(--s-4)] !text-[var(--ink-66)]">{d.paid_at ? ui.rvSub : ui.rvFreeSub}</p>
              <TarotRevisit token={token} ui={ui} locale={locale} hasEmail={!!(d.email ?? viewerEmail)} due={d.revisit_due} outcome={d.outcome_def} days={d.revisit_days} plan={d.plan ?? null} free={!d.paid_at} />
            </>
          )}
        </section>
      }
      cross={
        <>
        <section id="cast" className="ink-block mt-[var(--s-6)] p-[var(--s-5)] scroll-mt-20">
          <h2 className="t-d3">{personal?.next ? w(personal.next) : r.castHead}</h2>
          <p className="t-small mt-[var(--s-3)] !text-[var(--paper-66)]">{r.castLead}</p>
          <TarotCastLink href={castHref} ui={ui} locale={locale} />
        </section>
        {/* 10-22 进度表 86 承接地圖: 六爻 is the panel above; 擇日 and 合盤 (with a birth profile) under it */}
        <LoveBridge locale={locale} question={d.question} surface="tarot" />
        <CrossCards source="tarot" locale={locale as Locale} exclude={["tarot"]} skipMain />
        </>
      }
      foot={
        <>
          <p className="t-small mt-[var(--s-6)] !text-[var(--ink-45)]">{r.faces}</p>
          <nav className="mt-[var(--s-4)] t-label"><Link href={`/${locale}/tarot`} className="hover:text-[var(--ink)] transition-colors">← {r.back}</Link></nav>
        </>
      }
      sticky={!d.paid_at
        ? <a href="#personal" data-heat="tarot-sticky-buy" className="block text-center min-h-[var(--s-6)] px-6 py-3 rounded-[2px] bg-[var(--ink)] !text-[var(--paper)] text-[13px] tracking-[0.16em] no-underline">{r.stickyBuy}</a>
        // 10-22 进度表 87 (设计稿 R10): paid and no revisit set yet — the bottom button sets it; once set, the cast
        : !d.revisit_due && !d.revisit_answer
        ? <a href="#revisit" data-heat="tarot-sticky-revisit" className="block text-center min-h-[var(--s-6)] px-6 py-3 rounded-[2px] bg-[var(--ink)] !text-[var(--paper)] text-[13px] tracking-[0.16em] no-underline">{r.stickyRevisit}</a>
        : <a href={castHref} data-heat="tarot-sticky-cast" className="block text-center min-h-[var(--s-6)] px-6 py-3 rounded-[2px] bg-[var(--ink)] !text-[var(--paper)] text-[13px] tracking-[0.16em] no-underline">{ui.castBtn}</a>}
    />
  );
}
