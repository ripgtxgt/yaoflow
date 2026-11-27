import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { jsonLdBlocks } from "../src/lib/json-ld";
import JsonLd from "../src/components/JsonLd";
import { caseJsonLd } from "../src/lib/case-seo";
import type { CaseView } from "../src/lib/db";

// What the visitor's browser extension does with every ld+json block (10-15, Safari 16.6, /qian/liushi-jiazi/38)
const naiveExtension = (text: string) => (JSON.parse(text) as Record<string, string>)["@context"].toLowerCase();

const qianPage = [
  { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [{ "@type": "ListItem", position: 1, name: "YaoFlow" }] },
  { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: [{ "@type": "Question", name: "第 38 籤是什麼意思？" }] },
];

describe("结构化数据：一节点一块、标签内安全（10-15 jamiejen1225 页面报错）", () => {
  it("数组拆成一节点一块：插件那种读法不再崩（整个数组放一块时正是这句报错）", () => {
    expect(() => naiveExtension(JSON.stringify(qianPage))).toThrow(TypeError);
    const blocks = jsonLdBlocks(qianPage);
    expect(blocks).toHaveLength(2);
    for (const b of blocks) expect(naiveExtension(b)).toBe("https://schema.org");
    expect(blocks.map((b) => JSON.parse(b))).toEqual(qianPage);
    expect(jsonLdBlocks(qianPage[0])).toHaveLength(1);
  });

  it("文字里有 </script>、<!--、&、> 也关不掉标签，读回来一字不差", () => {
    const evil = "</script><script>alert(1)</script><!-- a & b > c";
    const [b] = jsonLdBlocks({ "@context": "https://schema.org", name: evil });
    expect(b).not.toMatch(/[<>&]/);
    expect(JSON.parse(b).name).toBe(evil);
  });

  it("卦例页整条链路：作者说法写成 </script><script>… 渲染出来仍只有一个完整的 script（以前会被截断成两段）", () => {
    const base = { primary_num: 47, changed_num: 60, topic: "relationship", locale: "zh-hant", cast_at: Date.UTC(2026, 9, 1), published_at: Date.UTC(2026, 9, 2) } as unknown as CaseView;
    const ld = caseJsonLd(
      { ...base, framing: "</script><script>alert(1)</script>", fields_json: JSON.stringify({ verdict: "</script><img src=x onerror=alert(2)>" }) },
      "https://yaoflow.com",
      "/zh-hant/cases/abc",
    );
    const before = renderToStaticMarkup(createElement("script", { type: "application/ld+json", dangerouslySetInnerHTML: { __html: JSON.stringify(ld) } }));
    expect(before.match(/<\/script/gi)!.length).toBeGreaterThan(1);
    const html = renderToStaticMarkup(createElement(JsonLd, { data: ld }));
    expect(html.match(/<script/gi)).toHaveLength(1);
    expect(html.match(/<\/script/gi)).toHaveLength(1);
    expect(html.endsWith("</script>")).toBe(true);
    const body = html.slice(html.indexOf(">") + 1, -"</script>".length);
    expect((JSON.parse(body) as { mainEntity: { name: string } }).mainEntity.name).toBe("</script><script>alert(1)</script>？");
  });

  it("页面一律走 <JsonLd>，不再手写 ld+json", () => {
    const dir = join(import.meta.dirname, "../src/app");
    const files = (readdirSync(dir, { recursive: true }) as string[]).filter((f) => /\.tsx?$/.test(f));
    expect(files.length).toBeGreaterThan(20);
    const raw = files.filter((f) => readFileSync(join(dir, f), "utf8").includes("application/ld+json"));
    expect(raw).toEqual([]);
  });
});
