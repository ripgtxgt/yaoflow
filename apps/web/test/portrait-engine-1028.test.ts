import { afterEach, describe, expect, it } from "vitest";
import { portraitEngine, portraitPrompt } from "@/lib/mingli/bazi/portrait";

/** 10-28 进度表 120: the 正緣畫像 illustration engine — gpt-image when the OpenAI key is there, Kolors otherwise */
const saved = { o: process.env.OPENAI_API_KEY, s: process.env.SILICONFLOW_API_KEY, m: process.env.BAZI_IMAGE_MODEL };
afterEach(() => {
  for (const [k, v] of [["OPENAI_API_KEY", saved.o], ["SILICONFLOW_API_KEY", saved.s], ["BAZI_IMAGE_MODEL", saved.m]] as const) {
    if (v === undefined) delete process.env[k]; else process.env[k] = v;
  }
});

describe("portraitEngine", () => {
  it("picks gpt-image-2 with the OpenAI key, Kolors with only SiliconFlow, nothing with neither", () => {
    process.env.OPENAI_API_KEY = "k"; process.env.SILICONFLOW_API_KEY = "s"; delete process.env.BAZI_IMAGE_MODEL;
    expect(portraitEngine()).toEqual({ kind: "openai", model: "gpt-image-2" });
    process.env.BAZI_IMAGE_MODEL = "gpt-image-2.5-flare";
    expect(portraitEngine()).toEqual({ kind: "openai", model: "gpt-image-2.5-flare" });
    process.env.BAZI_IMAGE_MODEL = "Kwai-Kolors/Kolors"; // a SiliconFlow model name steers back even with the OpenAI key
    expect(portraitEngine()).toEqual({ kind: "siliconflow", model: "Kwai-Kolors/Kolors" });
    delete process.env.OPENAI_API_KEY; delete process.env.BAZI_IMAGE_MODEL;
    expect(portraitEngine()).toEqual({ kind: "siliconflow", model: "Kwai-Kolors/Kolors" });
    delete process.env.SILICONFLOW_API_KEY;
    expect(portraitEngine()).toBeNull();
  });

  it("the prompt asks for a painted illustration, not a photo, and keeps the 五行 look", () => {
    const p = portraitPrompt({ gender: "female", zhengyuan: { star: { element: "金", strength: "鲜明" }, palace: { relations: ["子丑合"] } }, imagePrompt: { element: "金", palette: ["白", "金"] } })!;
    expect(p.prompt.startsWith("精緻的數位插畫（不是照片")).toBe(true);
    expect(p.prompt).toContain("成年男性");
    expect(p.prompt).toContain("臉型方正");
    expect(p.prompt).toContain("白、金");
    expect(p.negative).toContain("未成年");
  });
});
