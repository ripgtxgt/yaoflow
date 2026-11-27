import { describe, expect, it } from "vitest";
import robots from "../src/app/robots";

/** 11-09 (Neil：「好，就按这个改」): block the training-only and backlink crawlers, slow Exa, keep search engines. */
describe("robots.txt", () => {
  const r = robots();
  const rules = Array.isArray(r.rules) ? r.rules : [r.rules];
  const agentsOf = (x: (typeof rules)[number]) => ([] as string[]).concat(x.userAgent ?? []);

  it("blocks ElevenlabsCrawler and the backlink crawlers from the whole site, but not ElevenlabsBot, Ahrefs or Semrush", () => {
    const blocked = rules.find((x) => x.disallow === "/")!;
    expect(agentsOf(blocked)).toEqual(expect.arrayContaining(["ElevenlabsCrawler", "MJ12bot", "SERankingBacklinksBot", "dotbot"]));
    for (const keep of ["ElevenlabsBot", "AhrefsBot", "SemrushBot", "Googlebot", "OAI-SearchBot", "Claude-SearchBot"])
      expect(rules.some((x) => agentsOf(x).includes(keep))).toBe(false);
  });

  it("11-27: meta-externalagent (AI training) is blocked; facebookexternalhit (link previews) is not", () => {
    const blocked = rules.find((x) => x.disallow === "/")!;
    expect(agentsOf(blocked)).toContain("meta-externalagent");
    expect(rules.some((x) => agentsOf(x).includes("facebookexternalhit"))).toBe(false);
  });

  it("Exa gets a crawl delay and the same private paths as everyone", () => {
    const star = rules.find((x) => agentsOf(x).includes("*"))!;
    const exa = rules.find((x) => agentsOf(x).includes("ExaSearchBot"))!;
    expect(exa.crawlDelay).toBe(2);
    expect(exa.disallow).toEqual(star.disallow);
  });
});
