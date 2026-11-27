import { NextResponse } from "next/server";
import { asLocale } from "@/lib/locales";
import { LOCALE_META, t } from "@/lib/i18n";
import { BRAND_HAN, brandName, isHan } from "@/lib/brand";

/**
 * 09-29 加到主屏幕: one web app manifest per language, so the icon on the
 * phone opens the reader's own account page in their own language.
 *
 * display "browser", not "standalone", on purpose: an iOS home-screen app in
 * standalone mode keeps its own cookie jar, apart from Safari — a member who
 * is signed in in Safari would open the icon and find themselves signed out,
 * and every sign-in link from an email would open back in Safari. "browser"
 * opens the same Safari/Chrome they already use, signed in.
 */
export function GET(_req: Request, { params }: { params: Promise<{ locale: string }> }) {
  return params.then(({ locale }) => {
    const l = asLocale(locale);
    const body = {
      name: `${brandName(l)} · ${t(l, "tagline")}`,
      short_name: isHan(l) ? BRAND_HAN : "YaoFlow",
      description: t(l, "metaDesc"),
      lang: LOCALE_META[l].htmlLang,
      id: `/${l}/`,
      start_url: `/${l}/account?src=home`,
      scope: "/",
      display: "browser",
      background_color: "#f4f2ec",
      theme_color: "#f4f2ec",
      icons: [
        { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
        { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
        { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      ],
    };
    return new NextResponse(JSON.stringify(body), {
      headers: { "content-type": "application/manifest+json; charset=utf-8", "cache-control": "public, max-age=86400" },
    });
  });
}
