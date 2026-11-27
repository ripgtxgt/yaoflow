import { describe, expect, it } from "vitest";
import { HOME_T } from "@/lib/dict/homescreen";
import { LOCALES } from "@/lib/locales";
import { GET } from "@/app/api/manifest/[locale]/route";

describe("加到主屏幕 (09-29)", () => {
  it("every language has every key, filled", () => {
    const keys = Object.keys(HOME_T.zh).sort();
    for (const l of LOCALES) {
      const row = (HOME_T as Record<string, Record<string, string>>)[l];
      expect(row, l).toBeTruthy();
      expect(Object.keys(row).sort(), l).toEqual(keys);
      for (const k of keys) expect(row[k]!.trim().length, `${l}.${k}`).toBeGreaterThan(1);
    }
  });

  it("manifest opens the account page in the reader's language, in their own browser", async () => {
    const res = await GET(new Request("https://yaoflow.com/api/manifest/zh-hant"), { params: Promise.resolve({ locale: "zh-hant" }) });
    expect(res.headers.get("content-type")).toContain("application/manifest+json");
    const m = await res.json();
    expect(m.start_url).toBe("/zh-hant/account?src=home");
    expect(m.display).toBe("browser"); // standalone would split iOS cookies from Safari
    expect(m.icons.map((i: { src: string }) => i.src)).toContain("/icon-512.png");
    const bad = await GET(new Request("https://yaoflow.com/api/manifest/xx"), { params: Promise.resolve({ locale: "xx" }) });
    expect((await bad.json()).start_url).toMatch(/^\/[a-z-]+\/account\?src=home$/);
  });
});
