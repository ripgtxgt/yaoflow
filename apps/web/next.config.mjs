/** @type {import('next').NextConfig} */
const nextConfig = {
  // Stamped once per build: the sitemap's lastmod for pages whose text ships
  // with the code. A lastmod of "now" on every request is a signal Google
  // documents as one it learns to ignore.
  env: { BUILD_TIME: new Date().toISOString() },
  // 10-01 审计: `next build` used to write into the .next the live server reads from — every deploy gave visitors
  // 502s and missing-chunk errors for a minute (nginx: 17 × 502 on 10-01, Threads landings among them). Deploys now
  // build into NEXT_DIST_DIR=.next-build and swap it in just before the restart.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  transpilePackages: ["@yaoflow/engine"],
  // Keep the OG-image font package out of the bundle: its .woff files are
  // read from disk at runtime, and webpack has no business parsing them.
  serverExternalPackages: ["@fontsource/eb-garamond"],
  // Next 15.2+ streams metadata into <body> for clients it thinks run JS —
  // Googlebot included. Google ignores a canonical/hreflang outside <head>,
  // so /en was folded into "/" as a duplicate (GSC 09-24). Everyone gets the
  // tags in <head>, rendered before the first byte.
  htmlLimitedBots: /.*/,
  // 09-29: self-hosted CJK faces (scripts/fetch-cjk-fonts.mjs). Slice files are named by
  // the hash of their source URL, so they never change; the sheets may, a day's cache.
  async headers() {
    return [
      { source: "/fonts/cjk/:dir/:file", headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }] },
      { source: "/fonts/cjk-core/:file", headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }] },
      { source: "/fonts/cjk/:file.css", headers: [{ key: "Cache-Control", value: "public, max-age=86400" }] },
    ];
  },
};

export default nextConfig;
