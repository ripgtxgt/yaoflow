import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { allProvidersDown, chatJson, chatJsonFull, parseJsonLoose, probeProviders, providers, providersDown, repairJson } from "../src/lib/llm";
import { generateReadingFor, generationsInFlight } from "../src/lib/generate";

/** 09-15: a chain of hosts for the same model, with a ten-minute circuit breaker per host. */

const ok = (text: string, finish = "stop") => new Response(JSON.stringify({ choices: [{ message: { content: text }, finish_reason: finish }] }), { status: 200, headers: { "content-type": "application/json" } });
const fail = (status: number) => new Response("busy", { status });

/** 10-04: the weekly review's report was cut off at max_tokens (finish_reason "length") and read as nothing. */
describe("an answer cut off at max_tokens", () => {
  it("chatJsonFull says the answer was cut off; chatJson still hands the text", async () => {
    process.env.DEEPSEEK_API_KEY = "re_ds";
    vi.stubGlobal("fetch", async () => ok('{"summary":"写到一半', "length"));
    expect(await chatJsonFull([{ role: "user", content: "json" }])).toEqual({ content: '{"summary":"写到一半', cutOff: true });
    expect(await chatJson([{ role: "user", content: "json" }])).toBe('{"summary":"写到一半');
    vi.stubGlobal("fetch", async () => ok('{"ok":true}'));
    expect((await chatJsonFull([{ role: "user", content: "json" }])).cutOff).toBe(false);
    vi.unstubAllGlobals();
  });

  it("repairJson keeps every value the model finished and drops the one it was writing", () => {
    // cut inside a string value, inside a nested array of objects
    expect(JSON.parse(repairJson('{"summary":"好","findings":[{"title":"一","people":["P1","P2"]},{"title":"二","detail":"写到一')!))
      .toEqual({ summary: "好", findings: [{ title: "一", people: ["P1", "P2"] }, { title: "二" }] });
    // cut inside a key, after a colon, after a comma, inside a number, inside a literal
    expect(repairJson('{"a":"x","b')).toBe('{"a":"x"}');
    expect(repairJson('{"a":"x","b":')).toBe('{"a":"x"}');
    expect(repairJson('{"a":["x","y"],')).toBe('{"a":["x","y"]}');
    expect(repairJson('{"a":[1,2,3')).toBe('{"a":[1,2,3]}');
    expect(repairJson('{"a":true,"b":fal')).toBe('{"a":true}');
    // an escaped quote inside the cut string does not end it early
    expect(repairJson('{"a":"he said \\"hi","b":"ok","c":"cut \\"he')).toBe('{"a":"he said \\"hi","b":"ok"}');
    // a complete answer comes back as it is, without words around it; nothing complete gives null
    expect(repairJson('```json\n{"a":1}\n```')).toBe('{"a":1}');
    expect(repairJson('{"a":"never clo')).toBeNull();
    expect(repairJson("no json here")).toBeNull();
    expect(repairJson("")).toBeNull();
  });

  it("parseJsonLoose reads a whole answer as is, a cut-off one up to the last finished value, and throws on nothing", () => {
    expect(parseJsonLoose('{"a":1}')).toEqual({ value: { a: 1 }, repaired: false });
    expect(parseJsonLoose('{"a":1,"b":"cu')).toEqual({ value: { a: 1 }, repaired: true });
    expect(() => parseJsonLoose('{"a":"cu')).toThrow(/JSON/);
    // 10-30: paragraph breaks typed raw inside a string (answers in Latin languages) are read, not thrown away
    expect(parseJsonLoose('{"answer":"First.\n\nSecond\tpart."}').value).toEqual({ answer: "First.\n\nSecond\tpart." });
    expect(parseJsonLoose('{"answer":"Line one\nline two", "n": 2}\n').value).toEqual({ answer: "Line one\nline two", n: 2 });
  });
});

describe("provider chain", () => {
  const saved = { ...process.env };
  beforeEach(() => {
    process.env.DEEPSEEK_API_KEY = "re_ds";
    process.env.SILICONFLOW_API_KEY = "re_sf";
    delete process.env.ARK_API_KEY;
    delete process.env.ARK_MODEL;
    delete process.env.LLM_FORCE_PROVIDER;
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    process.env = { ...saved };
  });

  it("orders DeepSeek first, then the hosts that have a key; Ark needs a model id; a forced provider pins the chain", () => {
    expect(providers().map((p) => p.name)).toEqual(["deepseek", "siliconflow"]);
    process.env.ARK_API_KEY = "ark_x";
    expect(providers().map((p) => p.name)).toEqual(["deepseek", "siliconflow"]);
    process.env.ARK_MODEL = "deepseek-v4-flash-xxxx";
    expect(providers().map((p) => p.name)).toEqual(["deepseek", "siliconflow", "ark"]);
    process.env.LLM_FORCE_PROVIDER = "siliconflow";
    expect(providers().map((p) => p.name)).toEqual(["siliconflow"]);
    // thinking stays off on every host — the readings are tuned for the plain model
    for (const p of providers()) expect(JSON.stringify(p.extra)).toContain("disabled");
  });

  it("falls through to the next host on a timeout or 5xx, and remembers the primary is down", async () => {
    const calls: string[] = [];
    vi.stubGlobal("fetch", async (url: string) => {
      calls.push(url);
      return url.includes("deepseek.com") ? fail(503) : ok('{"hi":"from siliconflow"}');
    });
    const out = await chatJson([{ role: "user", content: "json please" }]);
    expect(out).toBe('{"hi":"from siliconflow"}');
    expect(calls.map((u) => new URL(u).host)).toEqual(["api.deepseek.com", "api.siliconflow.cn"]);
    expect(providersDown()).toContain("deepseek");

    // while the primary is down, the next call goes straight to the backup
    calls.length = 0;
    await chatJson([{ role: "user", content: "json again" }]);
    expect(calls.map((u) => new URL(u).host)).toEqual(["api.siliconflow.cn"]);
  });

  it("does not mark a host down for a non-transient error, but still tries the next one", async () => {
    // a fresh module instance so the breaker state from the previous test is gone
    vi.resetModules();
    const { chatJson: fresh, providersDown: freshDown } = await import("../src/lib/llm");
    const calls: string[] = [];
    vi.stubGlobal("fetch", async (url: string) => {
      calls.push(url);
      return url.includes("deepseek.com") ? fail(401) : ok("{}");
    });
    expect(await fresh([{ role: "user", content: "json" }])).toBe("{}");
    expect(calls).toHaveLength(2);
    expect(freshDown()).not.toContain("deepseek");

    // every host failing surfaces the last error instead of hanging
    vi.stubGlobal("fetch", async () => fail(500));
    await expect(fresh([{ role: "user", content: "json" }])).rejects.toThrow(/llm http 500/);
  });

  it("probes every host: a failing host is marked down before a reader meets it, a recovered one is cleared", async () => {
    vi.resetModules();
    const llm = await import("../src/lib/llm");
    vi.stubGlobal("fetch", async (url: string) => (url.includes("deepseek.com") ? fail(503) : ok("好")));
    const r1 = await llm.probeProviders();
    expect(r1.map((p) => [p.name, p.ok])).toEqual([["deepseek", false], ["siliconflow", true]]);
    expect(llm.providersDown()).toEqual(["deepseek"]);
    expect(llm.allProvidersDown()).toBe(false);

    vi.stubGlobal("fetch", async () => fail(503));
    await llm.probeProviders();
    expect(llm.allProvidersDown()).toBe(true);

    vi.stubGlobal("fetch", async () => ok("好"));
    const r3 = await llm.probeProviders();
    expect(r3.every((p) => p.ok)).toBe(true);
    expect(llm.providersDown()).toEqual([]);
  });

  it("generates each session once: concurrent callers share the running generation", async () => {
    let calls = 0;
    const body = JSON.stringify({
      summary: "这一卦说的是你现在的处境，不急。", inner_condition: "你心里其实已经有答案了。", outer_condition: "外面的人还没表态。",
      movement: "事情会慢慢往前挪。", direction: "先按兵不动更稳。", next_step: "这周先问清楚一件事。", caution: "别一冲动就答应。", reflection_question: "你真正怕的是什么？",
    });
    vi.stubGlobal("fetch", async () => { calls++; await new Promise((r) => setTimeout(r, 40)); return ok(body); });
    const input = { question: "我该不该接这个 offer", values: [7, 8, 9, 8, 7, 8] as never, castAtMs: Date.UTC(2026, 8, 15, 4), tzOffsetMinutes: 480 };
    const a = generateReadingFor("cs_dedupe", "one", input, false, "zh");
    const b = generateReadingFor("cs_dedupe", "one", input, false, "zh");
    expect(generationsInFlight()).toBe(1);
    const [ra, rb] = await Promise.all([a, b]);
    expect(ra).toBe(rb);
    expect(calls).toBe(1);
    expect(generationsInFlight()).toBe(0);
    // once finished, a new request for the same session generates afresh (the page decides whether it needs to)
    await generateReadingFor("cs_dedupe", "one", input, false, "zh");
    expect(calls).toBe(2);
  });
});