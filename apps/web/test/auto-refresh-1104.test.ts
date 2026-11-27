import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startAutoRefresh, type VisDoc } from "@/lib/auto-refresh";

// 11-04 自动巡检：页面隐藏时不发 router.refresh()（iPhone 后台被掐断 → Load failed → 错误页），回前台补一次。
function fakeDoc() {
  const fns = new Set<() => void>();
  const doc: VisDoc & { set(v: string): void; count(): number } = {
    visibilityState: "visible",
    addEventListener: (_t, fn) => { fns.add(fn); },
    removeEventListener: (_t, fn) => { fns.delete(fn); },
    set(v) { this.visibilityState = v; fns.forEach((f) => f()); },
    count: () => fns.size,
  };
  return doc;
}

describe("startAutoRefresh", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it("refreshes every interval, at most max times, then stops", () => {
    const r = vi.fn();
    const doc = fakeDoc();
    startAutoRefresh(r, { every: 6000, max: 3, doc });
    vi.advanceTimersByTime(6000);
    expect(r).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(60000);
    expect(r).toHaveBeenCalledTimes(3);
    expect(doc.count()).toBe(0);
  });

  it("does not refresh while hidden, catches up once after coming back", () => {
    const r = vi.fn();
    const doc = fakeDoc();
    startAutoRefresh(r, { every: 6000, max: 30, doc });
    doc.set("hidden");
    vi.advanceTimersByTime(18000);
    expect(r).not.toHaveBeenCalled();
    doc.set("visible");
    vi.advanceTimersByTime(999);
    expect(r).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(r).toHaveBeenCalledTimes(1);
  });

  it("no catch-up refresh when nothing was skipped; stop() clears everything", () => {
    const r = vi.fn();
    const doc = fakeDoc();
    const stop = startAutoRefresh(r, { every: 6000, max: 30, doc });
    doc.set("hidden");
    doc.set("visible");
    vi.advanceTimersByTime(2000);
    expect(r).not.toHaveBeenCalled();
    stop();
    vi.advanceTimersByTime(60000);
    expect(r).not.toHaveBeenCalled();
    expect(doc.count()).toBe(0);
  });

  it("works without a document (server / old callers)", () => {
    const r = vi.fn();
    startAutoRefresh(r, { every: 1000, max: 2 });
    vi.advanceTimersByTime(5000);
    expect(r).toHaveBeenCalledTimes(2);
  });
});
