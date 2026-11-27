import { describe, expect, it, vi } from "vitest";
import { watchTap } from "../src/components/SiteNav";

/** 11-08: a tab tap whose in-page navigation went nowhere opens the page the plain way after 2.5 s. */
describe("the four doors always open", () => {
  it("falls back to a plain load only when the address did not change", () => {
    vi.useFakeTimers();
    const assign = vi.fn();
    const loc = { pathname: "/zh-hant/cases/fc44ba8b66", href: "https://yaoflow.com/zh-hant/cases/fc44ba8b66", assign };
    (globalThis as unknown as { window: unknown }).window = { location: loc, setTimeout: (f: () => void, ms: number) => setTimeout(f, ms) };
    watchTap("/zh-hant/services/self")();
    vi.advanceTimersByTime(2_600);
    expect(assign).toHaveBeenCalledWith("/zh-hant/services/self");
    assign.mockClear();
    watchTap("/zh-hant/services/daily")();
    loc.pathname = "/zh/services/daily"; // the router got there (via the script redirect)
    vi.advanceTimersByTime(2_600);
    expect(assign).not.toHaveBeenCalled();
    watchTap("/zh/services/daily")(); // the door you are on
    vi.advanceTimersByTime(2_600);
    expect(assign).not.toHaveBeenCalled();
    vi.useRealTimers();
    delete (globalThis as unknown as { window?: unknown }).window;
  });
});
