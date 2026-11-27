import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { hexagramByNumber, resolveCast, type LineValue } from "@yaoflow/engine";
import { isLocale, t, type Locale } from "@/lib/i18n";
import { asLocale } from "@/lib/locales";
import { pairByToken, storedReadingForSession } from "@/lib/db";
import { TOKEN_RE } from "@/lib/grants";
import { pairRole, pairStatus } from "@/lib/pairs";
import { jointFor, type JointReading } from "@/lib/joint";
import { hexName, judgmentFor } from "@/lib/names";
import { textsFor } from "@yaoflow/engine";
import FigureMark, { changedYangs, primaryYangs } from "@/components/FigureMark";
import PairActions from "@/components/PairActions";
import { brandName } from "@/lib/brand";

export const dynamic = "force-dynamic";

/** Never index: the page belongs to two people. The token is the only address. */
export async function generateMetadata({ params }: { params: Promise<{ locale: string; token: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const l = asLocale(locale);
  return {
    title: `${t(l, "pairPageTitle")} · ${brandName(l)}`,
    robots: { index: false, follow: false, nocache: true, noarchive: true, nosnippet: true },
    referrer: "no-referrer",
    openGraph: { title: t(l, "pairPageTitle"), type: "website" },
  };
}

function side(sid: string | null) {
  if (!sid) return null;
  const s = storedReadingForSession(sid);
  if (!s) return null;
  const values = s.values as LineValue[];
  const cast = resolveCast(values);
  return { sid, values, cast, locale: asLocale(s.locale) };
}

/**
 * 同题合参 (裂变 V2 ⑥): two casts on the same matter, side by side. Each of
 * the two people, arriving with their own reading session, sees their own
 * side as "you", the other side's figure, and a joint reading written for
 * them. Anyone else sees the two figures and nothing that was said.
 */
export default async function PairPage(
  { params, searchParams }: { params: Promise<{ locale: string; token: string }>; searchParams: Promise<{ sid?: string }> },
) {
  const { locale, token } = await params;
  if (!isLocale(locale)) notFound();
  const l = locale as Locale;
  if (!TOKEN_RE.test(token)) notFound();
  const p = pairByToken(token);
  if (!p || p.dissolved_at) notFound();
  const { sid } = await searchParams;
  const role = pairRole(p, sid ?? null);
  const status = pairStatus(p);
  const a = side(p.a_session_id);
  const b = side(p.b_session_id);
  if (!a) notFound();
  const site = (process.env.SITE_URL ?? "https://yaoflow.com").replace(/\/$/, "");
  const shareUrl = `${site}/${l}/pair/${token}`;
  const code = a.values.join("");

  // the joint reading, for a participant, once both sides have cast
  let joint: JointReading | null = null;
  let jointFailed = false;
  if (role && b) {
    try {
      joint = await jointFor(token, role, l);
    } catch {
      jointFailed = true;
    }
  }

  const mine = role === "b" ? b : a;
  const theirs = role === "b" ? a : b;
  const figure = (s: NonNullable<ReturnType<typeof side>>, label: string, dim = false) => (
    <div className={dim ? "text-[var(--ink-66)]" : ""}>
      <p className="t-label mb-3">{label}</p>
      <div className="flex items-center gap-4">
        <FigureMark yangs={primaryYangs(s.values)} width={48} />
        {s.cast.changed && (
          <>
            <span className="t-label !text-[14px]">→</span>
            <FigureMark yangs={changedYangs(s.values)} width={48} className="opacity-60" />
          </>
        )}
      </div>
      <p className="t-body !text-[15px] mt-3 text-[var(--ink)]">
        {hexName(s.cast.primary, l)}{s.cast.changed ? ` → ${hexName(s.cast.changed, l)}` : ""}
      </p>
      <p className="t-small mt-1">{judgmentFor(textsFor(s.cast.primary.number), l).main}</p>
    </div>
  );

  return (
    <div className="mx-auto w-full max-w-[46rem] px-[var(--s-4)] md:px-8 pt-10 pb-20">
      <p className="t-label">{t(l, "pairPageTitle")}</p>
      {role ? (
        <p className="t-d3 mt-[var(--s-3)]">
          <span className="text-[var(--ink-45)]" aria-hidden>{l === "zh" || l === "zh-hant" || l === "ja" ? "「" : "“"}</span>
          {p.framing}
          <span className="text-[var(--ink-45)]" aria-hidden>{l === "zh" || l === "zh-hant" || l === "ja" ? "」" : "”"}</span>
        </p>
      ) : (
        <p className="t-body mt-[var(--s-3)] text-[var(--ink-66)]">{t(l, "pairGuestNote")}</p>
      )}

      {/* ---- the two figures ---- */}
      <div className="mt-[var(--s-5)] grid sm:grid-cols-2 gap-x-10 gap-y-8 py-[var(--s-5)] border-y border-[var(--ink-16)]">
        {role ? (
          <>
            {mine && figure(mine, t(l, "pairYou"))}
            {theirs ? figure(theirs, t(l, "pairOther"), true) : (
              <div>
                <p className="t-label mb-3">{t(l, "pairOther")}</p>
                <p className="t-body text-[var(--ink-66)]">{t(l, "pairNotYet")}</p>
              </div>
            )}
          </>
        ) : (
          <>
            {figure(a, t(l, "pairSideA"))}
            {b ? figure(b, t(l, "pairSideB"), true) : (
              <div>
                <p className="t-label mb-3">{t(l, "pairSideB")}</p>
                <p className="t-body text-[var(--ink-66)]">{t(l, "pairNotYet")}</p>
              </div>
            )}
          </>
        )}
      </div>

      {/* ---- the joint reading (participants only) ---- */}
      {role && (
        <section className="mt-[var(--s-6)]">
          <h2 className="t-sect mb-[var(--s-4)]">{t(l, "pairJointHead")}</h2>
          {!b ? (
            <p className="t-body text-[var(--ink-66)]">{t(l, "pairNotYet")}</p>
          ) : joint ? (
            <div className="flex flex-col gap-[var(--s-4)]">
              {([
                ["pairJointYou", joint.you],
                ["pairJointOther", joint.other],
                ["pairJointTogether", joint.together],
              ] as const).map(([k, text]) => (
                <div key={k} className="grid md:grid-cols-[112px_1fr] gap-x-6 gap-y-1">
                  <p className="t-label pt-[3px]">{t(l, k)}</p>
                  <p className="t-body leading-relaxed">{text}</p>
                </div>
              ))}
              <div className="ink-block mt-[var(--s-2)] p-[var(--s-5)]">
                <p className="t-label !text-[var(--paper-66)] mb-2">{t(l, "pairJointVerdict")}</p>
                <p className="t-d3">{joint.verdict}</p>
              </div>
            </div>
          ) : (
            <p className="t-body text-[var(--ink-66)]">{jointFailed ? t(l, "pairJointError") : t(l, "pairNotYet")}</p>
          )}
        </section>
      )}

      {/* ---- doors ---- */}
      <div className="mt-[var(--s-6)] flex flex-col gap-[var(--s-4)]">
        {role && mine && (
          <Link href={`/${l}/reading?sid=${encodeURIComponent(mine.sid)}`} className="t-label hover:text-[var(--ink)] transition-colors">
            {t(l, "pairOpenReading")}
          </Link>
        )}
        {role ? (
          <PairActions locale={l} token={token} sid={sid ?? null} shareUrl={shareUrl} />
        ) : (
          <Link
            href={`/${l}/cast?via=${code}`}
            className="inline-block self-start min-h-[var(--s-6)] px-6 py-3 rounded-[2px] bg-[var(--ink)] text-[var(--paper)] text-[13px] tracking-[0.16em]"
          >
            {t(l, "guaCtaButton")}
          </Link>
        )}
        {status === "claimed" && !role && <p className="t-small">{t(l, "pairGuestNote")}</p>}
      </div>
    </div>
  );
}
