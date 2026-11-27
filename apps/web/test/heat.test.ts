import { describe, expect, it } from "vitest";
import { afterTeaser, clickHeat, scrollHeat } from "../src/lib/heat";
import type { TrackedEvent } from "../src/lib/analytics-server";

const ev = (s: string, e: TrackedEvent["e"], x: Partial<TrackedEvent> = {}): TrackedEvent => ({ t: Date.UTC(2026, 8, 24), s, e, ...x });

describe("热区", () => {
  it("预览之后：看到价格、点了、看到没点", () => {
    const evs = [
      ev("a", "teaser_shown"), ev("a", "price_seen", { ms: 4000 }), ev("a", "reading_click"),
      ev("b", "teaser_shown"), ev("b", "price_seen", { ms: 8000 }), ev("b", "page_leave", { path: "/zh-hant/cast", ms: 30000, depth: 80 }),
      ev("c", "teaser_shown"), ev("c", "page_leave", { path: "/zh-hant/cast", ms: 6000, depth: 30 }),
    ];
    const r = afterTeaser(evs);
    expect([r.teased, r.seen, r.clicked, r.seenNotClicked, r.notSeen]).toEqual([3, 2, 1, 1, 1]);
    expect(r.medianDwellNotClicked).toBe(30000);
  });
  it("滚动深度按页面归类，点击按名字数人", () => {
    const evs = [ev("a", "page_leave", { path: "/zh-hant", depth: 60, ms: 1 }), ev("b", "page_leave", { path: "/zh-hant", depth: 20, ms: 3 }),
      ev("a", "heat_click", { method: "price-deep" }), ev("a", "heat_click", { method: "price-deep" }), ev("b", "heat_click", { method: "currency" })];
    const home = scrollHeat(evs).find((g) => g.name === "首页")!;
    expect(home.n).toBe(2);
    expect(home.bands[1]).toBe(0.5); // 50%
    expect(clickHeat(evs)[0]).toEqual({ name: "price-deep", sessions: 1 });
  });
});
