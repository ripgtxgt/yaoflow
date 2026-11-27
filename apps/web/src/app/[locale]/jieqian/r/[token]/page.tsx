import RefundedNote from "@/components/RefundedNote";
import { sessionRefunded } from "@/lib/db";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { hkReader } from "@/lib/register";
import Link from "next/link";
import { cv } from "@/lib/dict/convert";
import { notFound } from "next/navigation";
import { qianDrawByToken } from "@/lib/db";
import { currentCustomer } from "@/lib/auth";
import { entitlementFor } from "@/lib/subscription";
import { getCheckoutSession, type CheckoutSession } from "@/lib/stripe";
import { qianTagSuffix, HK_SETS, isTemple, isVagueTemple, qianWording, JIEQIAN_PATH, qianByNum, qianCastUrl, qianDiffAt, qianPath, qianPoemAt, qianSituation, qianSetName, qianTag, qianTempleName, QIAN_LOCALE, QIAN_SET, QIAN_TOKEN_RE } from "@/lib/qian";
import { qianShareUrl } from "@/lib/qian-meta";
import { ensureQianPersonal, fulfilQianPayment, qianFollowupOf, type QianPersonal, mailQianOnce } from "@/lib/qian-personal";
import QianCard from "@/components/QianCard";
import QianShare from "@/components/QianShare";
import QianFriend from "@/components/QianFriend";
import ShareMoment from "@/components/ShareMoment";
import { ssh } from "@/lib/dict/share-sheet";
import QianFooter from "@/components/QianFooter";
import { QianCastLink, QianFollowup, QianPersonalBuy } from "@/components/QianActions";
import ResultPage from "@/components/product/ResultPage";
import CrossCards from "@/components/CrossCards";
import LoveBridge from "@/components/LoveBridge";
import type { Locale } from "@/lib/locales";

/**
 * 10-12 解籤 (进度表 §四 36 ③): one reader's lot against their own matter. 10-13 (Neil: 解籤一律付费): free is only the
 * poem; the plain reading, the part for their kind of matter, the personal reading and its one follow-up come with the
 * paid reading (light-reading price, or a member's allowance). The cast door stays. Token URL, never the question; noindex.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "解籤結果 | YaoFlow", robots: { index: false, follow: false } };

const SECTION_LABEL = { love: "感情", work: "工作與事業", overall: "整體" } as const;

export default async function QianResultPage({ params, searchParams }: { params: Promise<{ locale: string; token: string }>; searchParams: Promise<{ paid?: string }> }) {
  const { locale, token } = await params;
  if (locale !== QIAN_LOCALE || !QIAN_TOKEN_RE.test(token)) notFound();
  let d = qianDrawByToken(token);
  if (!d) notFound();
  const e0 = qianByNum(d.num, d.set_name);
  if (!e0) notFound();
  // 10-12 读者识别: Hong Kong wording for a Hong Kong reader (kept on the draw, or seen now) and for the 黃大仙靈籤
  let hkNow = false;
  try { hkNow = hkReader(await headers()); } catch { /* no request */ }
  const e = qianWording(e0, d.register === "hk" || d.register === "yue" || HK_SETS.has(e0.set) || hkNow);

  // back from Stripe: record the payment here (the fulfil sweep does the same for a buyer who never comes back)
  const { paid } = await searchParams;
  if (!d.paid_at && paid && /^cs_[A-Za-z0-9_]{10,200}$/.test(paid)) {
    try {
      const s = await getCheckoutSession(paid);
      if (s.metadata?.qian === token) fulfilQianPayment(s as CheckoutSession);
    } catch { /* the sweep will catch it */ }
    d = qianDrawByToken(token) ?? d;
  }
  if (d.paid_at && sessionRefunded(d.paid_session)) return <RefundedNote hans={false} home={`/${locale}`} />;
  let personal: QianPersonal | null = null;
  if (d.paid_at) personal = await ensureQianPersonal(token).catch(() => null);
  // 10-14: the letter with this link — once per lot; a buyer back from Stripe and a member's allowance land here first
  if (personal) void mailQianOnce(token, (process.env.SITE_URL ?? "https://yaoflow.com").replace(/\/$/, "")).catch(() => null);

  // 10-12 承接 ⑨: a signed-in member with light readings left gets the personal reading as one of them
  let member = false, pass = false;
  try { const me = await currentCustomer(); if (me) { const ent = await entitlementFor(me.customerId); member = !!ent.active && ent.lightLeft > 0; pass = member && !!ent.pass; } } catch { /* signed out */ }
  const sit = qianSituation(d.situation);
  const part = sit.section === "love" ? e.love : sit.section === "work" ? e.work : e.overall;
  const site = (process.env.SITE_URL ?? "https://yaoflow.com").replace(/\/$/, "");
  // 10-12 各廟用字: the slip as the reader's temple prints it; where it differs from the text our reading was written from, say so
  const temple = isTemple(d.temple) && !isVagueTemple(d.temple) ? d.temple : null;
  const diffs = qianDiffAt(e, temple);
  const castHref = qianCastUrl({ token, question: d.question, situation: d.situation, num: e.num, title: e.title, set: e.set });
  const fu = qianFollowupOf(d);
  const shareImg = `/api/qian/card/${e.num}${e.set !== QIAN_SET ? `?s=${e.set}` : temple && diffs.length ? `?t=${temple}` : ""}`;
  // 10-22 进度表 76 ⑤: the result template — head · answer (the slip) · free · ask · pay · revisit · share · cross · sticky
  // 10-13 (Neil: 「解签一律不免费啊，都是需要付费的」): before payment only the poem; the plain reading, the part for their
  // kind of matter and the personal reading all come with the paid reading (or a member's allowance)
  return (
    <ResultPage
      locale={QIAN_LOCALE}
      head={{ label: `${qianSetName(e)} · 第 ${e.num} 籤${qianTagSuffix(e)}`, question: e.title, meta: `你問的（${sit.label}）：「${d.question}」` }}
      answer={
        <>
          <QianCard num={e.num} ganzhi={qianTag(e)} poem={qianPoemAt(e, temple)} setName={qianSetName(e)} />
          {temple && diffs.length > 0 && (
            <p className="t-small mt-[var(--s-3)] !text-[var(--ink-66)]">
              {qianTempleName(temple)}的籤上作{diffs.map((x) => `「${x.theirs}」`).join("、")}；其他廟多作{diffs.map((x) => `「${x.base}」`).join("、")}。
            </p>
          )}
        </>
      }
      free={d.paid_at ? (
        <>
          <section>
            <h2 className="t-sect mb-[var(--s-3)]">白話</h2>
            <p className="t-body leading-relaxed">{e.plain}</p>
          </section>
          <section className="mt-[var(--s-6)]">
            <h2 className="t-sect mb-[var(--s-3)]">放在{SECTION_LABEL[sit.section]}上怎麼看</h2>
            <p className="t-body leading-relaxed">{part}</p>
            {sit.section !== "overall" && <p className="t-body leading-relaxed mt-[var(--s-3)] text-[var(--ink-66)]">{e.overall}</p>}
          </section>
          {/* 10-13 进度表 41 ③: after the plain reading — the people you went to the temple with */}
          <ShareMoment id={`qian:${token.slice(-10)}`} locale="zh-hant" title={ssh("zh-hant", "templeAsk")} body={ssh("zh-hant", "templeBody")}>
            <QianShare surface="qian" primary="line" num={e.num} title={e.title} setName={qianSetName(e)} url={qianShareUrl(site, e.num, e.set)} image={shareImg} />
          </ShareMoment>
          {personal && (
            <section id="personal" className="mt-[var(--s-6)] panel px-[var(--s-4)] py-[var(--s-5)] scroll-mt-20">
              <h2 className="t-sect mb-[var(--s-3)]">這支籤放在你這件事上</h2>
              <p className="t-body leading-relaxed">{personal.reading}</p>
              {personal.watch && <p className="t-body leading-relaxed mt-[var(--s-3)] border-l-2 border-[var(--gold)] pl-4">{personal.watch}</p>}
            </section>
          )}
          {!personal && (
            <section id="personal" className="mt-[var(--s-6)] panel px-[var(--s-4)] py-[var(--s-5)]">
              <p className="t-body">付款收到了，專屬你的解讀還在寫，幾分鐘後重新整理這一頁就會出現，也會寄到你付款時填的信箱。</p>
            </section>
          )}
        </>
      ) : undefined}
      ask={personal ? (
        <div className="panel px-[var(--s-4)] py-[var(--s-2)]">
          <QianFollowup token={token} castHref={castHref} num={e.num} done={fu ? { question: fu.question, answer: fu.followup.answer, cast: fu.followup.cast } : null} />
        </div>
      ) : undefined}
      pay={!d.paid_at ? (
        <section id="personal" className="panel px-[var(--s-4)] py-[var(--s-5)] scroll-mt-20">
          <h2 className="t-sect mb-[var(--s-2)]">看這支籤的白話，和放在你這件事上怎麼讀</h2>
          <p className="t-small mb-[var(--s-4)] !text-[var(--ink-66)]">籤詩白話、放在{SECTION_LABEL[sit.section]}上怎麼看，和照你的問題寫的專屬解讀，一次給你。</p>
          <QianPersonalBuy token={token} member={member} pass={pass} />
        </section>
      ) : undefined}
      share={
        <section>
          <h2 className="t-sect mb-[var(--s-2)]">把這支籤傳出去</h2>
          <QianShare surface="qian" num={e.num} title={e.title} setName={qianSetName(e)} url={qianShareUrl(site, e.num, e.set)} image={shareImg} />
          <QianFriend surface="qian" />
        </section>
      }
      cross={
        <>
        {/* 10-13 承接 (Neil: 「在写法上把『起一卦看日子』讲得更明确」): the lot was step one; what the cast adds, in three steps */}
        <section id="cast" className="ink-block mt-[var(--s-6)] p-[var(--s-5)] scroll-mt-20">
          {/* 10-14 进度表 43: the same promise as the cast page's card, said once above the step */}
          <p className="t-small mb-2 !text-[var(--paper-66)]">{cv("zh-hant", "cdLead")}</p>
          <h2 className="t-d3">{personal?.next || e.ask_next}</h2>
          <ol className="mt-[var(--s-4)] grid gap-[var(--s-3)] sm:grid-cols-3">
            {[
              ["籤", "大方向和心態", "你剛看完"],
              ["卦", "同一件事，看哪幾天", "給日期或幾天的窗口"],
              ["回訪", "到那幾天，寫信問你", "應了沒，我們一起對照"],
            ].map(([k, a, b], i) => (
              <li key={k} className={`border-t pt-2 ${i === 0 ? "border-[var(--paper-66)]/40 opacity-60" : "border-[var(--paper-66)]"}`}>
                <p className="t-label !text-[var(--paper-66)]">{i + 1} · {k}</p>
                <p className="t-body !text-[var(--paper)] mt-1">{a}</p>
                <p className="t-small !text-[var(--paper-66)] mt-0.5">{b}</p>
              </li>
            ))}
          </ol>
          <p className="t-small mt-[var(--s-4)] !text-[var(--paper-66)]">問題已經幫你帶過去，不用重打；解讀會一併參考這支籤。起卦不用錢，先看一句斷語，要日子再看深斷。</p>
          <QianCastLink href={castHref} num={e.num} />
          <p className="t-small mt-[var(--s-3)] !text-[var(--paper-66)]">{cv("zh-hant", "cdTrust")}</p>
          <p className="t-label mt-1 !normal-case !tracking-[0.04em] !text-[var(--paper-66)]">{cv("zh-hant", "cdNot")}</p>
        </section>
        {/* 10-22 进度表 86 承接地圖: 六爻 is the panel above; 擲筊 and 今日一籤 under it */}
        <LoveBridge locale="zh-hant" question={d.question} surface="jieqian" />
        <CrossCards source="jieqian" locale={"zh-hant" as Locale} exclude={["jieqian"]} skipMain />
        </>
      }
      foot={
        <>
          <p className="t-small mt-[var(--s-6)] !text-[var(--ink-45)]"><Link href={qianPath(e.num, e.set)} className="underline underline-offset-4">第 {e.num} 籤的完整解說（感情、工作）→</Link></p>
          <nav className="mt-[var(--s-4)] t-label"><Link href={JIEQIAN_PATH} className="hover:text-[var(--ink)] transition-colors">← 線上解籤</Link></nav>
          <QianFooter />
        </>
      }
      sticky={!d.paid_at
        ? <a href="#personal" data-heat="qian-sticky-buy" className="block text-center min-h-[var(--s-6)] px-6 py-3 rounded-[2px] bg-[var(--ink)] !text-[var(--paper)] text-[13px] tracking-[0.16em] no-underline">看白話，和放在你這件事上怎麼讀</a>
        : <Link href={castHref} data-heat="qian-sticky-cast" className="block text-center min-h-[var(--s-6)] px-6 py-3 rounded-[2px] bg-[var(--ink)] !text-[var(--paper)] text-[13px] tracking-[0.16em] no-underline">想知道哪一天？為這件事起一卦 →</Link>}
    />
  );
}
