import type { Metadata } from "next";
import { Suspense } from "react";
import { sceneLocales } from "@/lib/scenes";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import SiteNav from "@/components/SiteNav";
import { navItemsFor } from "@/lib/site-nav";
import { ADMIN_COOKIE } from "@/lib/admin-auth";
import localFont from "next/font/local";
import { isLocale, t, type Locale, LOCALES, LOCALE_META } from "@/lib/i18n";
import { asLocale } from "@/lib/locales";
import PageView from "@/components/PageView";
import GaTag from "@/components/GaTag";
import { gaBootstrap } from "@/lib/ga";
import LanguageMenu from "@/components/LanguageMenu";
import AccountLink from "@/components/AccountLink";
import cjkVersions from "@/lib/cjk-fonts.json";
import { ERR_CAPTURE_SCRIPT } from "@/lib/err-capture";
import "../globals.css";
import { BRAND_HAN, brandName, isHan } from "@/lib/brand";
import FooterGroups from "@/components/FooterGroups";
import XunwuBack from "@/components/xunwu/XunwuBack";
import { featureVisible } from "@/lib/features";
import { xunwuBackUi } from "@/lib/xunwu-text";
import { serviceOpenIn } from "@/lib/services";

// 09-29 PageSpeed: the four CJK faces used to come in through next/font here,
// which put all four stylesheets (~95 KB each over the wire) render-blocking on
// every page of every language. They are now plain self-hosted stylesheets
// (public/fonts/cjk/, built by scripts/fetch-cjk-fonts.mjs before `next build`;
// still no Google request at runtime, so mainland China is unaffected) and each
// page links only its own script's face. One face per script, not one CJK face
// for all four: Simplified forms are wrong on a Taiwanese page (說/骨/起), and
// plainly foreign on a Japanese one (直/誤/者).
const CJK_SHEET: Record<string, string | undefined> = { sc: "sc", hant: "tc", jp: "jp", kr: "kr" };
// 10-01: content hash of each sheet, written by fetch-cjk-fonts.mjs at prebuild
const CJK_V: Record<string, string | undefined> = cjkVersions;

// 10-02: the two Latin faces are files in src/fonts (the @fontsource 5.3.0 latin subsets), not fetched from Google
// at build time — next/font/google needs fonts.googleapis.com during `next build`, and that fetch failed on the
// server twice on 10-01/10-02, each time failing the whole build. Same families, weights and styles as before.
const ebGaramond = localFont({
  src: [
    { path: "../../fonts/eb-garamond-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "../../fonts/eb-garamond-latin-400-italic.woff2", weight: "400", style: "italic" },
    { path: "../../fonts/eb-garamond-latin-500-normal.woff2", weight: "500", style: "normal" },
    { path: "../../fonts/eb-garamond-latin-500-italic.woff2", weight: "500", style: "italic" },
    { path: "../../fonts/eb-garamond-latin-600-normal.woff2", weight: "600", style: "normal" },
    { path: "../../fonts/eb-garamond-latin-600-italic.woff2", weight: "600", style: "italic" },
  ],
  variable: "--font-serif-en",
  display: "swap",
  // 10-16 (Neil, on the error board): six preloaded Latin files on every page — the Chinese pages (nearly all our
  // readers) barely use them, and an interrupted preload was reported as a failed load 25 times a week. The face
  // still loads from the stylesheet when a page uses it, with a swap.
  preload: false,
});

const jetbrainsMono = localFont({
  src: [
    { path: "../../fonts/jetbrains-mono-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "../../fonts/jetbrains-mono-latin-500-normal.woff2", weight: "500", style: "normal" },
  ],
  variable: "--font-mono",
  display: "swap",
  // 09-29: small labels only — a swap is invisible, a preload competes with the page's own text
  preload: false,
});

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }));
}

export async function generateMetadata(
  { params }: { params: Promise<{ locale: string }> },
): Promise<Metadata> {
  const { locale } = await params;
  const l = asLocale(locale);
  const title = `${brandName(l)} · ${t(l, "tagline")}`; // 10-22 进度表 81: 「爻流 YaoFlow · 一事一卦」 on Chinese pages
  // metaDesc, not heroSub (09-19): heroSub explains on the page that the model
  // only reads the chart back — that stays. But this string is what search
  // snippets and social share cards quote verbatim, and the 09-15 rule is that
  // promo copy is not pitched in the AI's name. See lib/i18n.ts.
  const description = t(l, "metaDesc");
  return {
    // absolute base so og:image URLs resolve correctly behind the CDN
    metadataBase: new URL(process.env.SITE_URL ?? "https://yaoflow.com"),
    title,
    description,
    // no `alternates` here on purpose: metadata merges down, so a canonical
    // on the layout would stamp every page with the home's URL (it did — see
    // 开发日志 09-07). Each page sets pageAlternates() for its own path.
    openGraph: {
      siteName: brandName(l),
      type: "website",
      locale: LOCALE_META[l].ogLocale,
      title,
      description,
    },
    twitter: { card: "summary_large_image" },
    // 09-29 加到主屏幕: the site had no icon at all (favicon 404). Files in public/.
    manifest: `/api/manifest/${l}`,
    icons: {
      icon: [{ url: "/favicon.ico?v=1", sizes: "any" } /* ?v=1: Cloudflare had cached the old 404 for /favicon.ico */, { url: "/icon-32.png", type: "image/png", sizes: "32x32" }],
      apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
    },
    appleWebApp: { title: isHan(l) ? BRAND_HAN : "YaoFlow" },
    // 09-24 进度表待定 11: Pinterest website claim (the tag must be on every page, in <head>)
    other: { "p:domain_verify": "e1fbaa0cad1ade9730869c55a718af68" },
  };
}

export default async function LocaleLayout(
  { children, params }: { children: React.ReactNode; params: Promise<{ locale: string }> },
) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const l = locale as Locale;

  const fonts = `${ebGaramond.variable} ${jetbrainsMono.variable}`;
  const script = LOCALE_META[l].ogFont;
  const own = CJK_SHEET[script];
  // Latin, Japanese and Korean pages still set runs of classical Chinese (卦名, 卦辭) in the
  // Traditional face — that sheet loads after first paint, off the critical path
  // 10-01: those few lines take the slices alone (tc-slices.css) — the Traditional core is 1 MB, worth it only on a
  // Traditional page. Every sheet carries ?v=<content hash> so a changed one gets past the day-long cache.
  const extra = script === "latin" || script === "jp" || script === "kr" ? `/fonts/cjk/tc-slices.css?v=${CJK_V["tc-slices"] ?? ""}` : null;
  const adminCookie = (await cookies()).get(ADMIN_COOKIE)?.value;
  const nav = await navItemsFor(l, adminCookie);
  // 10-29 进度表 127 尋物 回訪: 1–7 days after a cast, any Chinese page asks 「找到了沒？」 (the card shows only to that browser)
  // 10-29 进度表 128: every language 尋物 is open in
  const xwBack = serviceOpenIn("xunwu", l) && (await featureVisible("xunwu", adminCookie)) ? xunwuBackUi(l) : null;

  return (
    // data-script picks the face and the type scale (globals.css): the four
    // Latin languages share English's, the four CJK scripts each get their own.
    <html lang={LOCALE_META[l].htmlLang} data-script={LOCALE_META[l].ogFont} className={fonts} suppressHydrationWarning>
      <head>
        {/* 10-02: first thing on the page — reports errors even when React never starts (lib/err-capture.ts) */}
        <script dangerouslySetInnerHTML={{ __html: ERR_CAPTURE_SCRIPT }} />
        {/* 10-27 Google Analytics 4 (lib/ga.ts): consent defaults first, the tag after load; an admin browser counts as internal */}
        <script dangerouslySetInnerHTML={{ __html: gaBootstrap(!!adminCookie) }} />
        {own && <link rel="stylesheet" href={`/fonts/cjk/${own}.css?v=${CJK_V[own] ?? ""}`} />}
      </head>
      <body className="min-h-screen flex flex-col">
        {extra && (
          <script
            // appended after the load event: off the critical path (a plain <link> would block rendering,
            // and even an early async one was counted against LCP on pages with no Chinese at all)
            dangerouslySetInnerHTML={{ __html: `(function(){function a(){var l=document.createElement("link");l.rel="stylesheet";l.href=${JSON.stringify(extra)};document.head.appendChild(l)}if(document.readyState==="complete")a();else addEventListener("load",a)})()` }}
          />
        )}
        <PageView locale={l} />
        <GaTag />

        {/* Masthead: a printed document's, not an app's. 10-22 进度表 76 C: the four doors (問事／看自己／每天／我的) sit in it
            on a desktop and as the bottom tab bar on a phone (lib/site-nav.ts, components/SiteNav.tsx). */}
        <header className="site-chrome flex items-center justify-between gap-6 px-[var(--s-4)] md:px-12 py-4 border-b border-[var(--ink-16)]">
          <Link href={`/${l}`} className="flex items-baseline gap-3 shrink-0">
            <span className="brand-mark t-label !text-[11px] !tracking-[0.24em]">
              {t(l, "brand")}
            </span>
            <span className="t-sect hidden lg:inline">{t(l, "tagline")}</span>
          </Link>
          <SiteNav items={nav} locale={l} where="top" />
          <div className="flex items-center gap-5 shrink-0">
            <AccountLink locale={l} />
            <LanguageMenu current={l} />
          </div>
        </header>

        {/* 11-06 (卦页偶发 React #418, ~1 in 5 loads in a clean headless Chrome): instrumenting React's mismatch throw showed
            it always fails on <main> with the hydration cursor already inside it — React had hydrated into <main>, a client
            component further on was not ready yet (its chunk still arriving), the work restarted from the root with the
            cursor left behind, and the page was thrown away and drawn again. A boundary here keeps such a wait inside it:
            React leaves that part as the server drew it and hydrates it when the code is in. */}
        <main className="flex-1">
          <Suspense fallback={null}>
            {xwBack && <XunwuBack locale={l} ui={xwBack.ui} cats={xwBack.cats} />}
            {children}
          </Suspense>
        </main>
        <Suspense fallback={null}>
          <SiteNav items={nav} locale={l} where="bottom" />
        </Suspense>

        <footer className="site-chrome px-[var(--s-4)] md:px-12 pt-10 pb-[calc(2.5rem+2.75rem+env(safe-area-inset-bottom))] md:pb-10 border-t border-[var(--ink-16)] mt-[var(--s-6)]">
          {/* 10-22 进度表 88 (设计稿 頁尾): every product by its group, Chinese pages */}
          <FooterGroups locale={l} />
          <nav className="flex flex-wrap gap-x-6 gap-y-3 mb-5">
            {/* 大众一卦 (09-21, A2): the daily door, first in the footer */}
            <Link href={`/${l}/today`} className="t-label hover:text-[var(--ink)] transition-colors">
              {t(l, "dailyNav")}
            </Link>
            <Link
              href={`/${l}/gua`}
              className="t-label hover:text-[var(--ink)] transition-colors"
            >
              {t(l, "navGua")}
            </Link>
            {sceneLocales().includes(l) && (
              <Link href={`/${l}/for`} className="t-label hover:text-[var(--ink)] transition-colors">
                {t(l, "scenesTitle")}
              </Link>
            )}
            <Link href={`/${l}/cases`} className="t-label hover:text-[var(--ink)] transition-colors">
              {t(l, "casesTitle")}
            </Link>
            {/* /accuracy 09-26 撤下（Neil：数据难看）；页面代码留在 _accuracy，恢复时改回目录名并加回这里与 sitemap */}
            {(["about", "terms", "privacy"] as const).map((p) => (
              <Link
                key={p}
                href={`/${l}/${p}`}
                className="t-label hover:text-[var(--ink)] transition-colors"
              >
                {t(l, p === "about" ? "navAbout" : p === "terms" ? "navTerms" : "navPrivacy")}
              </Link>
            ))}
          </nav>
          <p className="t-small max-w-2xl">{t(l, "disclaimer")}</p>
          <p className="t-small mt-1">{t(l, "footer")}</p>
        </footer>
      </body>
    </html>
  );
}
