import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import PageShell from "@/components/ui/PageShell";
import TrackOnce from "@/components/TrackOnce";
import ShareSheet from "@/components/ShareSheet";
import BmgFigure from "@/components/bmg/BmgFigure";
import BmgPairInvite from "@/components/bmg/BmgPairInvite";
import { canSee } from "@/lib/features";
import { brandName } from "@/lib/brand";
import { isLocale } from "@/lib/locales";
import { serviceOpenIn } from "@/lib/services";
import { BID_COOKIE } from "@/lib/browsers";
import { currentCustomer } from "@/lib/auth";
import { dimLines, hexByKw, linesOf, RESULT_COPY, stressChain } from "@/lib/bmg";
import { bmgByToken } from "@/lib/bmg-store";
import { pairLayers } from "@/lib/bmg-pair";

export const dynamic = "force-dynamic";

/**
 * 11-05 进度表 136 本命卦 — the result (01-题库与六维文案.md 第四～六节): the figure growing line by line, the six
 * dimensions in two halves (本来的你 / 现在的你), what pressure turns it into, one thing to try, the way into a cast with
 * it, the share card. The link shows the hexagram only, never who took it. Not indexed (the 64 pages of 进度表 139 are).
 */
export async function generateMetadata({ params }: { params: Promise<{ locale: string; token: string }> }): Promise<Metadata> {
  const { locale, token } = await params;
  const r = isLocale(locale) ? bmgByToken(token) : null;
  const h = r ? hexByKw(r.kw) : null;
  if (!h) return {};
  const site = (process.env.SITE_URL ?? "https://yaoflow.com").replace(/\/$/, "");
  return {
    title: { absolute: `我的本命卦：${h.name}（${h.title}）— ${brandName(locale as "zh-hant")}` }, description: h.oneLine,
    robots: { index: false, follow: true },
    openGraph: { title: `我的本命卦：${h.name}`, description: `${h.title}。${h.oneLine}`, images: [`${site}/api/bmg/card?k=${h.kw}`] },
  };
}

export default async function BmgResult({ params, searchParams }: { params: Promise<{ locale: string; token: string }>; searchParams: Promise<{ new?: string }> }) {
  const { locale, token } = await params;
  const { new: fresh } = await searchParams;
  if (!isLocale(locale) || !serviceOpenIn("bmg", locale)) notFound();
  if (!(await canSee("bmg"))) notFound();
  const r = bmgByToken(token);
  if (!r) notFound();
  const h = hexByKw(r.kw)!;
  const lines = linesOf(r.lines);
  const ties = (r.ties ?? "").split(",").filter(Boolean).map(Number);
  const dims = dimLines(lines, ties);
  const [, pressure] = stressChain(lines);
  const site = (process.env.SITE_URL ?? "https://yaoflow.com").replace(/\/$/, "");
  const bid = (await cookies()).get(BID_COOKIE)?.value ?? null;
  const me = await currentCustomer();
  const mine = (!!bid && r.bid === bid) || (!!me && r.customer_id === me.customerId);
  // 进度表 138 合卦: a result taken from an invitation shows the two side by side (only while that feature is visible)
  const pairOn = await canSee("bmg-pair");
  const inviter = pairOn && r.invited_by ? bmgByToken(r.invited_by) : null;
  const pair = inviter ? pairLayers(linesOf(inviter.lines), lines) : null;
  const half = (from: number, to: number) => dims.filter((d) => d.line >= from && d.line <= to).reverse();
  return (
    <PageShell>
      <TrackOnce event="bmg_view" locale={locale} method={mine ? (fresh ? "result:new" : "result:mine") : "result:shared"} />
      <p className="t-label !text-[var(--gold-text)]">本命卦</p>
      <div className="mt-[var(--s-4)] flex flex-col items-center text-center">
        <BmgFigure lines={lines} animate={!!fresh} />
        <h1 className={`t-d1 mt-[var(--s-5)] ${fresh ? "figure-in-late" : ""}`}>{h.name}</h1>
        <p className="t-d3 mt-1 !text-[var(--cinnabar)]">{h.title}</p>
        <p className="t-body mt-[var(--s-3)] max-w-[32rem]">{h.oneLine}</p>
        {r.mode === "full" && r.type4 && <p className="t-small mt-2 !text-[var(--ink-45)]">{RESULT_COPY.guess(r.type4)}</p>}
      </div>
      <p className="t-body mt-[var(--s-6)] leading-relaxed">{RESULT_COPY.open(h.name)}</p>

      {[[RESULT_COPY.upper, RESULT_COPY.upperNote, 4, 6], [RESULT_COPY.lower, RESULT_COPY.lowerNote, 1, 3]].map(([title, note, a, b]) => (
        <section key={String(title)} className="mt-[var(--s-6)]">
          <h2 className="t-sect">{title}</h2>
          <p className="t-small mt-1 !text-[var(--ink-45)]">{note}</p>
          <ul className="mt-[var(--s-3)] grid gap-3">
            {half(a as number, b as number).map((d) => (
              <li key={d.line} className="border-l-2 border-[var(--ink-16)] pl-3">
                <p className="t-label !text-[var(--ink-45)]">{d.label}</p>
                <p className="t-body"><b>{d.name}</b>：{d.text}{d.both ? <span className="!text-[var(--ink-45)]"> {RESULT_COPY.both}</span> : null}</p>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <section className="mt-[var(--s-6)] grid gap-[var(--s-4)] md:grid-cols-2">
        <div className="border border-[var(--ink-16)] rounded-[2px] p-[var(--s-4)]"><h2 className="t-sect">你的長處</h2><p className="t-body mt-2">{h.strength}</p></div>
        <div className="border-l-2 border-[var(--cinnabar)] p-[var(--s-4)]"><h2 className="t-sect">容易卡住的地方</h2><p className="t-body mt-2">{h.stuck}</p></div>
      </section>

      <section className="mt-[var(--s-6)]">
        <h2 className="t-sect">壓力大的時候</h2>
        <div className="mt-[var(--s-3)] flex items-center gap-[var(--s-4)]">
          <BmgFigure lines={pressure.lines} width={44} animate={false} />
          <p className="t-body flex-1">{RESULT_COPY.stress(`${h.short}卦`, `${pressure.short}卦`, pressure.oneLine)}</p>
        </div>
      </section>

      <section className="mt-[var(--s-6)] border-l-2 border-[var(--gold)] bg-[var(--gold)]/[0.07] px-[var(--s-4)] py-[var(--s-4)]">
        <h2 className="t-sect !text-[var(--gold-text)]">{RESULT_COPY.tryTitle}</h2>
        <p className="t-body mt-2">{h.tryThis}</p>
      </section>

      {pair && inviter && (
        <section className="mt-[var(--s-6)]" id="pair">
          <h2 className="t-sect">你們倆的本命卦</h2>
          <p className="t-small mt-1 !text-[var(--ink-45)]">朋友是{hexByKw(inviter.kw)!.name}，你是{h.name}。六個爻一層一層對照：</p>
          <ul className="mt-[var(--s-3)] grid gap-2">{pair.map((p) => <li key={p.line} className="t-body"><b>{p.label}</b>：{p.text}</li>)}</ul>
        </section>
      )}

      <section className="mt-[var(--s-6)] ink-block p-[var(--s-5)]">
        <p className="t-body !text-[var(--paper)]">{RESULT_COPY.cta}</p>
        <Link href={`/${locale}/cast?c=bmg`} data-heat="bmg-to-cast" className="inline-block mt-[var(--s-4)] t-label !text-[var(--paper)] border border-[var(--paper-66)] rounded-[2px] px-5 py-3 hover:border-[var(--paper)] transition-colors">{RESULT_COPY.ctaBtn} →</Link>
      </section>

      <section className="mt-[var(--s-6)]">
        <h2 className="t-sect">分享我的本命卦</h2>
        <ShareSheet locale={locale} surface="bmg" url={`${site}/${locale}/bmg/r/${r.token}`} text={`我的本命卦是${h.name}：${h.title}。${h.oneLine}`} image={`/api/bmg/card?k=${h.kw}`} fileName={`bmg-${h.kw}.png`} />
      </section>

      {mine && pairOn && !inviter && <BmgPairInvite url={`${site}/${locale}/bmg?inv=${r.token}&c=bmg-pair`} />}

      <p className="t-small mt-[var(--s-6)]">
        <Link href={`/${locale}/bmg?c=bmg-retake`} className="underline underline-offset-4">{mine ? "重新做一次" : "我也想知道我的本命卦"} →</Link>
      </p>
      <p className="t-small mt-[var(--s-5)] !text-[var(--ink-45)]">{RESULT_COPY.footer}</p>
    </PageShell>
  );
}
