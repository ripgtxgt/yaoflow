import { describe, expect, it, vi } from "vitest";

/** 11-04 T-013: the support desk's reading and drafting fall back to the DeepSeek chain when Claude fails (credit gone). */
vi.mock("../src/lib/llm", async (orig) => {
  const real = await orig<typeof import("../src/lib/llm")>();
  return { ...real, chatJson: vi.fn(async () => '{"kind":"reader"}'), chatText: vi.fn(async () => "草稿") };
});
vi.stubGlobal("fetch", vi.fn(async () => new Response('{"error":{"message":"Your credit balance is too low"}}', { status: 400 })));

describe("T-013 客服自动台 DeepSeek 回退", () => {
  it("json and text come back from DeepSeek when Anthropic answers 400", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    const { supportJson, supportText } = await import("../src/lib/support-llm");
    expect(await supportJson("sys", "user")).toBe('{"kind":"reader"}');
    expect(await supportText("sys", "user")).toBe("草稿");
    const { db } = await import("../src/lib/db");
    const n = (db().prepare("SELECT COUNT(*) AS n FROM ops_events WHERE kind = 'support_llm_fallback'").get() as { n: number }).n;
    expect(n).toBe(2);
    delete process.env.ANTHROPIC_API_KEY;
  });
});
