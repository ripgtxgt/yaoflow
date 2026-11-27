import { describe, expect, it } from "vitest";
import { PRIVACY, TERMS } from "../src/lib/legal";
import { PRIVACY_HANT, TERMS_HANT } from "../src/lib/legal-hant";
import { contentFor } from "../src/lib/content";

describe("繁體條款與隱私權政策是手寫的，且和簡體逐節逐段對齊", () => {
  it("same sections and paragraph counts as zh; contentFor serves the hand-written text", () => {
    expect(TERMS_HANT.length).toBe(TERMS.length);
    expect(PRIVACY_HANT.length).toBe(PRIVACY.length);
    TERMS.forEach((s, i) => expect(TERMS_HANT[i]!.p.length).toBe(s.zh.p.length));
    PRIVACY.forEach((s, i) => expect(PRIVACY_HANT[i]!.p.length).toBe(s.zh.p.length));
    expect(contentFor(TERMS[0]!, "zh-hant")).toBe(TERMS_HANT[0]);
    const all = JSON.stringify([TERMS_HANT, PRIVACY_HANT]);
    expect(all).not.toMatch(/一事一佔|臺|爲|裏/);
    // every number in zh appears in the hand-written paragraph
    TERMS.forEach((s, i) => s.zh.p.forEach((p, j) => {
      for (const n of p.match(/\d+(?:\.\d+)?/g) ?? []) expect(TERMS_HANT[i]!.p[j]).toContain(n);
    }));
  });
});
