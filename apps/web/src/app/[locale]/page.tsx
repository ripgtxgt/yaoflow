import { featureOn } from "@/lib/features";
import JsonLd from "@/components/JsonLd";
import { homeJsonLd } from "@/lib/site-jsonld";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { isLocale, t, type Locale, asLocale, pageAlternates } from "@/lib/i18n";
import { SOURCES, TRUST_POINTS, pick } from "@/lib/trust";
import Section from "@/components/Section";
import { LOVE_LANDING_LOCALE, LOVE_LANDINGS, loveLandingPath } from "@/lib/love-landing";
import { JIEQIAN_PATH } from "@/lib/qian-meta";
import QuestionForm from "@/components/QuestionForm";
import { GUA, guaSlug } from "@/lib/gua";
import { hexName } from "@/lib/names";
import { HOME_AB_SCRIPT } from "@/lib/ab";
import { entryT } from "@/lib/dict/entry";
import { homeHead } from "@/lib/seo-head";
import { LOCALE_META } from "@/lib/locales";
import { outcomeRecordsOn } from "@/lib/outcome-records";
import { resultsCounts } from "@/lib/results-line";
import PromoStrip from "@/components/PromoStrip";
import HomeDoors from "@/components/HomeDoors";
import { recordsForPage } from "@/lib/outcome-records";
import { stateLabel } from "@/components/OutcomeRecords";
import { casePath } from "@/lib/cases";
import { TOPIC_NAMES, type Topic } from "@/lib/topic";
import { hexagramByNumber } from "@yaoflow/engine";
import { cv } from "@/lib/dict/convert";
import { brandName } from "@/lib/brand";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const l = asLocale(locale);
  // 10-02 进度表 27: the 繁體 home's <head> says 卜卦 and 六爻 (the hero and H1 below are untouched — A/B test h)
  const head = homeHead(l);
  if (!head) return { alternates: pageAlternates(l, "") };
  return {
    title: head.title,
    description: head.description,
    alternates: pageAlternates(l, ""),
    // a page's openGraph replaces the layout's whole object, so the layout's fields come along
    openGraph: { siteName: brandName(l), type: "website", locale: LOCALE_META[l].ogLocale, title: head.title, description: head.description },
  };
}

export default async function Landing(
  { params }: { params: Promise<{ locale: string }> },
) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const l = locale as Locale;
  const e = entryT(l);
  // 09-30 对照测试 h: AB_HOME=off at build time keeps everyone on the old hero.
  // 10-08 (Neil: 「要，收了吧」): ended on the old hero — the two started a cast at the same rate (63% / 64%) and paid
  // within noise (3.1% / 3.7% by landed browser). No script, no chips; the h1 markup stays behind .abh-b (display none).
  const homeAb = false; // was: (process.env.AB_HOME ?? "on") !== "off"

  const zhPage = l === "zh-hant" || l === "zh";
  return (
    <>
    <JsonLd data={homeJsonLd(l, homeHead(l)?.description ?? null)} />
    {/* 10-22 进度表 88 (设计稿第 2 節「左問右今天」): on a desktop the first screen is two columns — the question on the
        left, 今天 on the right; a phone keeps one column in the design's order (question → 今天 → three groups → …) */}
    <div className={`mx-auto w-full max-w-[46rem] px-[var(--s-4)] md:px-8 ${zhPage ? "lg:max-w-[64rem]" : ""}`}>
    <div className={zhPage ? "lg:grid lg:grid-cols-[minmax(0,1fr)_19rem] lg:gap-x-12 lg:items-start" : ""}>
    <div className="min-w-0">
      {/* 09-30 对照测试 h — decided before the hero paints, so neither arm flashes (lib/ab.ts) */}
      {homeAb && <script dangerouslySetInnerHTML={{ __html: HOME_AB_SCRIPT }} />}
      {/* ---- h1 arm: the reader's own situation first, one line, no method talk ---- */}
      <header className="abh-b pt-8 md:pt-14 pb-[var(--s-5)]">
        <h1 className="t-d1 max-w-[20ch]">{e.heroTitle}</h1>
        <p className="t-body mt-4 max-w-[52ch] text-[var(--ink-66)]">{e.heroSub}</p>
        {/* 10-14 进度表 43 ④: the one line that sets us apart, said without naming anyone */}
        <p className="t-small mt-3 max-w-[52ch] !text-[var(--ink)]" data-heat="home-checkin-line">{cv(l, "cdLead")}</p>
      </header>
      {/* ---- masthead block: the figure, then the claim ---- */}
      <header className="abh-a pt-10 md:pt-16 pb-[var(--s-6)]">
        {/* The empty ruler: five dashed slots, the first line waiting in gold.
            No Unicode glyph (tofu/mis-drawn on many devices), and no specific
            hexagram — the generic surface must not look like an answer. */}
        <div className="flex flex-col-reverse gap-[7px] w-[56px] md:w-[64px] mb-7 select-none" aria-hidden>
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <span
              key={i}
              className={`block h-[7px] rounded-[1px] border ${
                i === 0
                  ? "border-[var(--gold-text)] border-solid"
                  : "border-[var(--ink-16)] border-dashed"
              }`}
            />
          ))}
        </div>
        <h1 className="t-d1 max-w-[20ch]">{t(l, "heroTitle")}</h1>
        <p className="t-body mt-5 max-w-[52ch] text-[var(--ink-66)]">{t(l, "heroSub")}</p>
        {/* 10-14 进度表 43 ④ → 10-22 进度表 79: on the Chinese pages the first sentence now says this itself */}
        {l !== "zh-hant" && l !== "zh" && <p className="t-small mt-3 max-w-[52ch] !text-[var(--ink)]" data-heat="home-checkin-line">{cv(l, "cdLead")}</p>}
      </header>

      {/* ---- 01 the question ---- */}
      <Section n="01" title={t(l, "sectQuestion")}>
        {/* 10-22 进度表 88 (设计稿 H1; the A/B is over — Neil: 「没有A/B边了现在」): the example questions under the box, and a
            real question as the box's example */}
        <QuestionForm locale={l} chips={{ lead: e.chipsLead, items: e.chips }} chipsOpen
          placeholder={zhPage ? (l === "zh" ? "他断联三周了，这个月会先发消息吗？" : "他斷聯三週了，這個月會先傳訊息嗎？") : undefined}
          beginLabel={zhPage ? (l === "zh" ? "起一卦，看日子" : "起一卦，看日子") : undefined} />
        {/* 10-22 进度表 76 C → 88: the switch row under the question; 今天 in the right column; the rest below */}
        <HomeDoors locale={l} part="switch" />
        {/* 10-12 (进度表 §四 37): the 繁體 love landing pages — search doors, linked from the front so they are found */}
        {/* 10-12 (进度表 §四 36): the 繁體 side door for a lot drawn at a temple */}
        {l === LOVE_LANDING_LOCALE && (
          <p className="t-small mt-[var(--s-4)]"><Link href={JIEQIAN_PATH} data-heat="home-jieqian" className="underline underline-offset-4 hover:text-[var(--cinnabar)]">在廟裡求了籤？我有籤號，幫我解 →</Link>{featureOn("today-qian") && <><span className="mx-2 opacity-30">·</span><Link href="/zh-hant/today-qian" data-heat="home-tq" className="underline underline-offset-4 hover:text-[var(--cinnabar)]">今日一籤：每天抽一支 →</Link></>}</p>
        )}
        {l === LOVE_LANDING_LOCALE && (
          <p className="t-small mt-[var(--s-5)] !text-[var(--ink-45)] flex flex-wrap gap-x-3 gap-y-1">
            <span>感情常見問法：</span>
            {LOVE_LANDINGS.map((x) => <Link key={x.slug} href={loveLandingPath(x.slug)} data-heat={`home-ask-${x.slug}`} className="underline underline-offset-4 hover:text-[var(--ink)]">{x.short}</Link>)}
          </p>
        )}
      </Section>
    </div>
    <div className="lg:pt-[7.5rem]">
      <HomeDoors locale={l} part="today" />
    </div>
    </div>
    </div>
    <div className="mx-auto w-full max-w-[46rem] px-[var(--s-4)] md:px-8">
      <HomeDoors locale={l} part="rest" />

      {/* ---- 10-22 进度表 79 (10-21 定稿設計 第二屏): the results, laid out as counts — what readers reported when their
           windows came, 問事 as a whole (六爻＋塔羅; private ones counted, never shown). Only with the records on, Chinese pages. */}
      {outcomeRecordsOn() && (l === "zh-hant" || l === "zh") && (() => {
        const c = resultsCounts();
        const hant = l === "zh-hant";
        const n = (v: number) => v.toLocaleString("en-US");
        return (
          <section className="py-[var(--s-6)] border-t border-[var(--ink-16)]" data-heat="home-results">
            <h2 className="t-d3">{hant ? "不說大話，把結果擺出來。" : "不说大话，把结果摆出来。"}</h2>
            {/* 10-23 进度表 104 ②: 「已問 N 件」(sent, or answered first); the readings' scores in /outcomes' words, the spreads'
                 and free casts' facts on a line of their own */}
            <p className="t-body mt-[var(--s-3)] tabular-nums leading-relaxed">
              {hant ? <>已問 <b>{n(c.asked)}</b> 件 · 回來作答 <b>{n(c.answered)}</b> 件</> : <>已问 <b>{n(c.asked)}</b> 件 · 回来作答 <b>{n(c.answered)}</b> 件</>}
            </p>
            <p className="t-small mt-[var(--s-2)] tabular-nums leading-relaxed" data-heat="home-results-judged">
              {hant
                ? <>六爻解讀（對照當時的判斷）：應了 <b>{n(c.judged.hit)}</b> · 部分 <b>{n(c.judged.partial)}</b> · 沒應 <b>{n(c.judged.miss)}</b> · 不確定 <b>{n(c.judged.unclear)}</b> · 還沒定 <b>{n(c.judged.open)}</b></>
                : <>六爻解读（对照当时的判断）：应了 <b>{n(c.judged.hit)}</b> · 部分 <b>{n(c.judged.partial)}</b> · 没应 <b>{n(c.judged.miss)}</b> · 不确定 <b>{n(c.judged.unclear)}</b> · 还没定 <b>{n(c.judged.open)}</b></>}
            </p>
            {/* the spreads' and free casts' line waits for their first answer (their first windows close from 10-30) */}
            {c.facts.happened + c.facts.stirred + c.facts.nothing + c.facts.open > 0 && <p className="t-small mt-1 tabular-nums leading-relaxed" data-heat="home-results-facts">
              {hant
                ? <>塔羅與免費起卦（讀者自己說的）：發生了 <b>{n(c.facts.happened)}</b> · 有動靜 <b>{n(c.facts.stirred)}</b> · 沒動靜 <b>{n(c.facts.nothing)}</b> · 還沒定 <b>{n(c.facts.open)}</b></>
                : <>塔罗与免费起卦（读者自己说的）：发生了 <b>{n(c.facts.happened)}</b> · 有动静 <b>{n(c.facts.stirred)}</b> · 没动静 <b>{n(c.facts.nothing)}</b> · 还没定 <b>{n(c.facts.open)}</b></>}
            </p>}
            <p className="t-small mt-[var(--s-2)] !text-[var(--ink-45)]">{hant ? "應期到了回去問；不公開的只計數。應了沒應都放，只數件數，不算比例。" : "应期到了回去问；不公开的只计数。应了没应都放，只数件数，不算比例。"}</p>
            {/* 10-22 进度表 88 (设计稿 H4): readers' own reports, the newest first — one on a phone, three on a desktop */}
            {(() => {
              const recs = recordsForPage({ locale: l, limit: 3 });
              if (!recs.length) return null;
              return (
                <ul className="mt-[var(--s-4)] grid gap-3 md:grid-cols-3" data-heat="home-results-cases">
                  {recs.map((r, i) => {
                    const p = hexagramByNumber(r.primary);
                    const topic = TOPIC_NAMES[(r.topic && r.topic in TOPIC_NAMES ? r.topic : "other") as Topic][l];
                    return (
                      <li key={r.publicId} className={`${i > 0 ? "hidden md:block" : ""} rounded-[6px] border border-[var(--ink-16)] p-4`}>
                        <p className="t-label !text-[var(--ink-45)]">{topic}{p ? ` · ${hexName(p, l)}` : ""}</p>
                        {r.window && <p className="t-small mt-1 !text-[var(--ink-66)] line-clamp-2">{r.window}</p>}
                        <p className="t-small mt-2">
                          <span className={r.state === "hit" ? "!text-[var(--cinnabar)]" : r.state === "partial" ? "!text-[var(--gold-text)]" : ""}>{hant ? "回報：" : "回报："}{stateLabel(r.state, l)}</span>
                          <Link href={casePath(l, r.publicId)} className="ml-2 underline underline-offset-4 !text-[var(--ink-66)]">{hant ? "看這一卦" : "看这一卦"} →</Link>
                        </p>
                      </li>
                    );
                  })}
                </ul>
              );
            })()}
            <p className="t-small mt-[var(--s-3)]">
              <Link href={`/${l}/outcomes`} data-heat="home-outcomes" className="underline underline-offset-4 hover:text-[var(--cinnabar)]">{hant ? "逐件看公開的卦例 →" : "逐件看公开的卦例 →"}</Link>
            </p>
          </section>
        );
      })()}

      {/* 10-22 进度表 88 (设计稿 H6 界線): what we do not ask, in one line */}
      {zhPage && (
        <p className="t-small pb-[var(--s-5)] !text-[var(--ink-45)]" data-heat="home-bounds">
          {l === "zh" ? "健康、官司、赌博不问 · 同一件事不重问 · 日子只供参考，重大决定请找专业。" : "健康、官司、賭博不問 · 同一件事不重問 · 日子只供參考，重大決定請找專業。"}
        </p>
      )}

      {/* ---- 02 how this works ---- */}
      <Section n="02" title={t(l, "sectHow")}>
        <div className="flex flex-col gap-[var(--s-5)]">
          {TRUST_POINTS.map((p, i) => {
            const c = pick(p, l);
            return (
              <div key={p.k} className="grid grid-cols-[28px_1fr] gap-x-3">
                <span className="t-label !text-[var(--cinnabar)] pt-[5px]">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div>
                  <h3 className="t-d3">{c.title}</h3>
                  <p className="t-small mt-[var(--s-2)]">{c.body}</p>
                </div>
              </div>
            );
          })}
        </div>
      </Section>

      {/* ---- 03 sources ---- */}
      <Section n="03" title={t(l, "sectSources")} last>
        <p className="t-small text-[var(--ink-45)] mb-[var(--s-4)]">{t(l, "sourcesNote")}</p>
        <ul className="flex flex-col">
          {SOURCES.map((s, i) => {
            const c = pick(s, l);
            return (
              <li key={s.href}>
                <a
                  href={s.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`group flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 py-3
                              ${i < SOURCES.length - 1 ? "border-b border-dotted border-[var(--ink-16)]" : ""}`}
                >
                  <span className="t-body !text-[15px] group-hover:text-[var(--cinnabar)] transition-colors">
                    {c.title}
                  </span>
                  {/* must be allowed to wrap: the English notes are long sentences */}
                  <span className="t-label !normal-case !tracking-[0.04em] min-w-0">{c.note}</span>
                </a>
              </li>
            );
          })}
        </ul>

        {/* 09-23 (§14 ⑯): the 64 pages had 24 landings a week — the home, our
            strongest page, linked only to their index. One named link each. */}
        <nav aria-label={t(l, "navGua")} className="mt-[var(--s-6)]">
          <p className="t-label mb-[var(--s-3)]">{t(l, "navGua")}</p>
          <ul className="flex flex-wrap gap-x-4 gap-y-1.5">
            {GUA.map((h) => (
              <li key={h.number}>
                <Link href={`/${l}/gua/${guaSlug(h)}`} className="t-small !text-[var(--ink-66)] hover:!text-[var(--ink)] transition-colors">
                  {hexName(h, l)}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        {/* 10-22 进度表 58 ②: the owner's two picks for the front page (lib/promo.ts; /admin/features) */}
        <PromoStrip surface="home" locale={l} exclude={["cast"]} />

        <div className="flex flex-wrap gap-x-6 mt-[var(--s-5)]">
          <Link href={`/${l}/gua`} className="t-label hover:text-[var(--ink)] transition-colors">
            {t(l, "navGua")} →
          </Link>
          <Link href={`/${l}/about`} className="t-label hover:text-[var(--ink)] transition-colors">
            {t(l, "navAbout")} →
          </Link>
        </div>
      </Section>
    </div>
    </>
  );
}
