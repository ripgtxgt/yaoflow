import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { recordOps } from "@/lib/db";
import { baziReport, factsOf } from "./report";

/**
 * 10-19 (Neil: 正緣畫像先試配圖，用 SiliconFlow 現有帳號) — one illustration per 正緣畫像 (v2: a portrait of an invented
 * adult of the partner type, see portraitPrompt). SiliconFlow
 * /v1/images/generations (BAZI_IMAGE_MODEL, default Kwai-Kolors/Kolors) with the same SILICONFLOW_API_KEY as the
 * chat fallback; the picture is downloaded once (their link expires) into DATA_DIR/bazi-portrait/<token>.jpg and
 * served by /api/bazi/portrait/<token>. Concurrent callers share one generation; a failure is retried on a later view.
 */
const DIR = join(process.env.DATA_DIR ?? join(process.cwd(), ".data"), "bazi-portrait");
export const portraitFile = (token: string) => join(DIR, `${token}.v2.img`);
export const hasPortrait = (token: string) => existsSync(portraitFile(token));
export const readPortrait = (token: string): Buffer | null => (hasPortrait(token) ? readFileSync(portraitFile(token)) : null);

/**
 * 10-19 (Neil: 「這是什麼東西，太抽象了」) v2 — a person, not a landscape: a half-length illustrated portrait of an invented
 * adult of the partner's type. Looks follow the spouse star's element as 《靈樞·陰陽二十五人》 describes the five types
 * (木 tall and fine-featured, 火 sharp-chinned and bright-eyed, 土 round and steady, 金 square and fair, 水 soft-faced
 * and deep-eyed); how vivid the presence is follows the star's strength; the expression follows the 夫妻宮's relations
 * (沖 an edge in the eyes, 刑／害 a guarded warmth, 合 a gentle smile); clothes in the element's palette. The partner is
 * drawn as the partner the reader chose (10-21: 異性 by default, or 同性; the 配偶星 follows that choice). Always an adult; never a
 * real person; no text.
 */
const LOOK: Record<string, string> = {
  木: "身形修長，臉型偏長，眉目清秀，氣質斯文",
  火: "輪廓分明，下巴略尖，眼神明亮有神，笑起來很有感染力",
  土: "臉型圓潤飽滿，五官敦厚，神情溫和穩重",
  金: "臉型方正，膚色白皙，五官俐落，氣質乾淨利落",
  水: "臉型柔和，眼神深邃，氣質安靜內斂",
};
const PRESENCE: Record<string, string> = { 鲜明: "存在感很強，氣場鮮明", 适中: "氣質自然大方", 隐约: "氣質低調含蓄", 不见: "氣質低調含蓄" };
type Facts = { gender: "male" | "female"; zhengyuan?: { partner?: "male" | "female"; star: { element: string; strength: string }; palace: { relations: string[] } }; imagePrompt?: { element: string; palette: string[] } };
export function portraitPrompt(f: Facts): { prompt: string; negative: string } | null {
  const z = f.zhengyuan, ip = f.imagePrompt;
  if (!z || !ip) return null;
  const el = z.star.element || ip.element;
  const rel = z.palace.relations.join("");
  const look = /[冲沖]/.test(rel) ? "眼神帶一點銳氣與張力" : /[刑害]/.test(rel) ? "神情外冷內熱，像有心事" : /合/.test(rel) ? "嘴角帶著溫柔的笑意" : "神情放鬆自在";
  const partner = z.partner ?? (f.gender === "male" ? "female" : "male");
  const who = partner === "female" ? "一位二十多歲到三十歲的成年女性" : "一位二十多歲到三十歲的成年男性";
  return {
    // 10-28: 「精緻的數位插畫（不是照片）」 — gpt-image reads 插畫 loosely and paints near-photo faces; said twice it keeps a
    // painted finish, which is the product's stance (a type of person, never a real one)
    prompt: `精緻的數位插畫（不是照片，不要寫實攝影質感），東方人物半身肖像，${who}，${LOOK[el] ?? LOOK["水"]}，${PRESENCE[z.star.strength] ?? "氣質自然大方"}，${look}。穿著以${ip.palette.slice(0, 2).join("、")}為主色的現代簡約服裝，柔和自然光，乾淨的淺色背景帶一點${ip.palette[0]}色調，畫面溫暖、高級、有質感，看向鏡頭。`,
    negative: "文字, 字母, 水印, logo, 簽名, 未成年, 兒童, 多人, 裸露, 暴露, 恐怖, 畸形, 多餘手指, 模糊, 低品質, 照片寫實的真人, 名人",
  };
}

/**
 * 10-28 (Neil: 「这个是 openai 的 api key，你可以调用 gpt image 了」) — the engine: OpenAI gpt-image when OPENAI_API_KEY is set
 * (BAZI_IMAGE_MODEL, default gpt-image-2; side by side with Kolors it kept the 五行 looks and the palette and had no
 * baked-in 「AI生成」 mark), else SiliconFlow Kolors as before. A gpt-image failure falls back to Kolors for that portrait.
 */
export function portraitEngine(): { kind: "openai" | "siliconflow"; model: string } | null {
  const m = process.env.BAZI_IMAGE_MODEL;
  if (process.env.OPENAI_API_KEY && (!m || m.startsWith("gpt-image"))) return { kind: "openai", model: m ?? "gpt-image-2" };
  if (process.env.SILICONFLOW_API_KEY) return { kind: "siliconflow", model: m && !m.startsWith("gpt-image") ? m : "Kwai-Kolors/Kolors" };
  return null;
}

async function generateOpenai(prompt: string, model: string): Promise<Buffer> {
  const res = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, prompt: `${prompt} 不要任何文字、字母、水印、簽名。`, size: "1024x1536", quality: "medium", output_format: "jpeg", n: 1 }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) throw new Error(`openai ${res.status} ${(await res.text()).slice(0, 120)}`);
  const j = (await res.json()) as { data?: { b64_json?: string; url?: string }[] };
  const d = j.data?.[0];
  if (d?.b64_json) return Buffer.from(d.b64_json, "base64");
  if (!d?.url) throw new Error("openai: no image");
  const img = await fetch(d.url, { signal: AbortSignal.timeout(60_000) });
  if (!img.ok) throw new Error(`download ${img.status}`);
  return Buffer.from(await img.arrayBuffer());
}

async function generateSiliconflow(prompt: string, negative: string, model: string): Promise<Buffer> {
  const res = await fetch("https://api.siliconflow.cn/v1/images/generations", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.SILICONFLOW_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, prompt, negative_prompt: negative, image_size: "768x1024", batch_size: 1, num_inference_steps: 25, guidance_scale: 6 }),
    signal: AbortSignal.timeout(90_000),
  });
  if (!res.ok) throw new Error(`gen ${res.status} ${(await res.text()).slice(0, 120)}`);
  const j = (await res.json()) as { images?: { url?: string }[]; data?: { url?: string }[] };
  const url = j.images?.[0]?.url ?? j.data?.[0]?.url;
  if (!url) throw new Error("no image url");
  const img = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!img.ok) throw new Error(`download ${img.status}`);
  return Buffer.from(await img.arrayBuffer());
}

const running = new Map<string, Promise<boolean>>();
let failedAt = new Map<string, number>();

export function ensurePortrait(token: string): Promise<boolean> {
  if (hasPortrait(token)) return Promise.resolve(true);
  const r = baziReport(token);
  if (!r || r.kind !== "love" || !r.paid_at) return Promise.resolve(false);
  const pp = portraitPrompt(factsOf(r) as unknown as Facts);
  const engine = portraitEngine();
  if (!pp || !engine) return Promise.resolve(false);
  if (Date.now() - (failedAt.get(token) ?? 0) < 60_000) return Promise.resolve(false); // a failed try waits a minute
  const going = running.get(token);
  if (going) return going;
  const p = (async () => {
    const { prompt, negative } = pp;
    const t0 = Date.now();
    try {
      let buf: Buffer, used = engine.model;
      if (engine.kind === "openai") {
        try { buf = await generateOpenai(prompt, engine.model); }
        catch (e) {
          if (!process.env.SILICONFLOW_API_KEY) throw e;
          recordOps("bazi_portrait_fallback", `${token.slice(-6)} ${(e instanceof Error ? e.message : "?").slice(0, 120)}`);
          used = "Kwai-Kolors/Kolors";
          buf = await generateSiliconflow(prompt, negative, used);
        }
      } else buf = await generateSiliconflow(prompt, negative, engine.model);
      if (buf.length < 5_000) throw new Error("tiny image");
      mkdirSync(DIR, { recursive: true });
      writeFileSync(portraitFile(token), buf);
      recordOps("bazi_portrait", `${token.slice(-6)} ${Math.round((Date.now() - t0) / 1000)}s ${Math.round(buf.length / 1024)}KB ${used}`);
      return true;
    } catch (e) {
      failedAt.set(token, Date.now());
      if (failedAt.size > 500) failedAt = new Map([...failedAt].slice(-100));
      recordOps("bazi_portrait_fail", `${token.slice(-6)} ${(e instanceof Error ? e.message : "?").slice(0, 160)}`);
      return false;
    }
  })().finally(() => running.delete(token));
  running.set(token, p);
  return p;
}
