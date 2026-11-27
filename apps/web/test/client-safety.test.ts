import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { JA_BANNED, jargonOffense } from "../src/lib/reading";
import { uaBrief } from "../src/lib/ua-brief";
import { ERR_CAPTURE_SCRIPT } from "../src/lib/err-capture";

const SRC = join(import.meta.dirname, "..", "src");
const LOOKBEHIND = /\(\?<[!=]/;

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : /\.(tsx?|mjs)$/.test(f) ? [p] : [];
  });
}

/**
 * 10-02 (iOS 16.2 Threads reader: 「Application error」 on the cast page). A regex lookbehind in the Japanese guard
 * reached the browser through a client component's import of reading.ts, and Safari < 16.4 cannot build one. The
 * build itself is checked on deploy (deploy/build-swap.sh refuses lookbehind in .next/static); these keep the
 * sources from walking back into it.
 */
describe("browser code stays buildable on old Safari", () => {
  it("no client component imports a runtime value from the server-side reading module", () => {
    for (const f of files(SRC)) {
      const src = readFileSync(f, "utf8");
      if (!/^["']use client["']/.test(src)) continue;
      const bad = src.match(/^import\s+(?!type\b)[^;]*from\s+["']@\/lib\/(reading|db|llm|teaser|generate|hant|pairs|subscription|stripe|email)["']/m);
      expect(bad, `${f}: ${bad?.[0]}`).toBeNull();
    }
  });

  it("the light modules the browser gets have no lookbehind", () => {
    for (const f of ["lib/reading-keys.ts", "lib/situation.ts", "lib/track.ts", "lib/err-capture.ts", "lib/live-labels.ts", "lib/presence-const.ts", "components/ReadingArticle.tsx", "components/PageView.tsx"]) {
      expect(LOOKBEHIND.test(readFileSync(join(SRC, f), "utf8")), f).toBe(false);
    }
    expect(LOOKBEHIND.test(ERR_CAPTURE_SCRIPT)).toBe(false);
  });

  it("the Japanese guard works without lookbehind and still names the word", () => {
    for (const re of JA_BANNED) expect(LOOKBEHIND.test(re.source), re.source).toBe(false);
    expect(jargonOffense({ verdict: "この卦は当たります。" }, [], "ja")).toBe("verdict:当たります");
    expect(jargonOffense({ verdict: "当たる気がします。" }, [], "ja")).toBe("verdict:当たる");
    expect(jargonOffense({ verdict: "心当たりがあれば。思い当たる節も。見当たらない。当たり前のこと。" }, [], "ja")).toBeNull();
  });

  it("an error event says which browser had it, briefly", () => {
    expect(uaBrief("Mozilla/5.0 (iPhone; CPU iPhone OS 16_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/20C65 Barcelona 410.2.0.33.71 (iPhone15,3; iOS 16_2; zh_CN; zh-Hans; scale=3.00; 1290x2796; IABMV/1; 850146623)")).toBe("iOS 16.2 · Threads");
    expect(uaBrief("Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36")).toBe("Android 14 · Chrome 130");
    expect(uaBrief("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.3 Safari/605.1.15")).toBe("macOS · Safari 16.3");
    expect(uaBrief("Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 400.0")).toBe("iOS 18.7 · Instagram");
    expect(uaBrief(null)).toBeUndefined();
  });

  it("the head error script is plain ES5 that parses on its own", () => {
    // eslint-disable-next-line no-new-func
    expect(() => new Function(ERR_CAPTURE_SCRIPT)).not.toThrow();
    expect(ERR_CAPTURE_SCRIPT).not.toMatch(/=>|\bconst\b|\blet\b|`|\?\.|\?\?/);
  });
});
