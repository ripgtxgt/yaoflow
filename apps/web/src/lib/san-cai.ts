/**
 * 11-05 进度表 134 (Neil：「好，可以按照你的顺序去做」；《易学人格学×YaoFlow-护城河与落地-1104.md》P2): which layer of the
 * reader the moving line sits in — the 三才 of 《繫辭》「六爻之動，三極之道也」: lines 1–2 are 地 (what they do and feel),
 * 3–4 are 人 (how they think and judge), 5–6 are 天 (what they want and how they carry themselves among people).
 *
 * With several moving lines only the main one is named, by the old rule for which line leads (朱熹《易學啟蒙》):
 * one moving → that line; two → the upper; three → the middle one; four or five → the lower of the still lines
 * (the reading turns on what does not move); six, or none → no layer (the whole figure turns, or nothing does).
 * When the main line moves and its 應 partner (1–4, 2–5, 3–6) sits in another layer, the payload says that layer is
 * pulled along. Computed here; the model only writes the sentence.
 */
export type Layer = "act" | "think" | "want";

export const LAYER_OF = (pos: number): Layer => (pos <= 2 ? "act" : pos <= 4 ? "think" : "want");
export const ECHO_OF = (pos: number): number => (pos <= 3 ? pos + 3 : pos - 3);

const NAME: Record<Layer, { zh: string; en: string }> = {
  act: { zh: "行动与情绪（初、二爻，地）", en: "what you do and feel (lines 1–2)" },
  think: { zh: "想法与判断（三、四爻，人）", en: "how you think and judge (lines 3–4)" },
  want: { zh: "欲望与处世（五、上爻，天）", en: "what you want and how you carry yourself with others (lines 5–6)" },
};

export function mainLine(changing: readonly number[]): number | null {
  const m = [...new Set(changing)].filter((p) => p >= 1 && p <= 6).sort((a, b) => a - b);
  if (m.length === 1) return m[0]!;
  if (m.length === 2) return m[1]!;
  if (m.length === 3) return m[1]!;
  if (m.length === 4 || m.length === 5) return [1, 2, 3, 4, 5, 6].find((p) => !m.includes(p)) ?? null;
  return null;
}

export interface LayerFact {
  main_line: number;
  main_line_moving: boolean;
  layer: Layer;
  layer_zh: string;
  layer_en: string;
  /** the 應 partner sits in another layer and one of the pair moves — "this here pulls that there" */
  pulls?: { line: number; layer: Layer; layer_zh: string; layer_en: string };
}

export function layerFact(changing: readonly number[]): LayerFact | null {
  const p = mainLine(changing);
  if (!p) return null;
  const layer = LAYER_OF(p);
  const moving = changing.includes(p);
  const e = ECHO_OF(p);
  const eLayer = LAYER_OF(e);
  const pulls = (moving || changing.includes(e)) && eLayer !== layer
    ? { line: e, layer: eLayer, layer_zh: NAME[eLayer].zh, layer_en: NAME[eLayer].en }
    : undefined;
  return { main_line: p, main_line_moving: moving, layer, layer_zh: NAME[layer].zh, layer_en: NAME[layer].en, ...(pulls ? { pulls } : {}) };
}

/** the prompt rule both tiers carry (only used when the payload has `layer`) */
export const LAYER_RULE = `- WHICH LAYER IS MOVING (11-05): when the payload has \`layer\`, it is computed and binding. Lines 1–2 are what the reader does and feels, lines 3–4 how they think and judge, lines 5–6 what they want and how they carry themselves with others. Say ONCE, in one plain sentence in the field noted below, which of these is where the change is happening for them in THIS matter (e.g. "這次動的是你怎麼想、怎麼判斷的那一層：…"). When \`layer.pulls\` is present, add half a sentence that this pulls on the other layer it names ("…也會牽動你實際怎麼做"). Use ordinary words; you may say 初爻/三爻/上爻 but never 三才, 天地人, 爻位 or any other term. With no \`layer\` in the payload, say nothing about layers.`;
