import { LAYER_OF, type Layer } from "./san-cai";

/**
 * 11-05 进度表 136 问事叠看: the reader's 本命卦 laid over the chart they just cast, layer by layer (lines 1–2 what they do
 * and feel, 3–4 how they think, 5–6 what they want and how they are with people). Same yin/yang in a layer = this matter
 * runs the way they are used to; opposite = it asks for a way they are not used to; split = half and half. The layer
 * the moving line sits in gets the action. Computed here; the model only writes the sentences (BMG_RULE).
 */
export interface BmgOverlay {
  hexagram: string;
  /** "本來的你" + "現在的你", one line each, for the model's context */
  layers: { layer: Layer; lines: [number, number]; match: "same" | "opposite" | "split"; moving: boolean }[];
}

export function bmgOverlay(bmgLines: readonly number[], castPolarity: readonly number[], changing: readonly number[], hexName: string): BmgOverlay {
  const layers = (["act", "think", "want"] as Layer[]).map((layer, i) => {
    const a = i * 2, b = a + 1;
    const s = [bmgLines[a] === castPolarity[a], bmgLines[b] === castPolarity[b]];
    const match = s[0] && s[1] ? "same" : !s[0] && !s[1] ? "opposite" : "split";
    return { layer, lines: [a + 1, b + 1] as [number, number], match: match as "same" | "opposite" | "split", moving: changing.some((p) => LAYER_OF(p) === layer) };
  });
  return { hexagram: hexName, layers };
}

export const BMG_RULE = `- THE READER'S OWN HEXAGRAM (11-05): when the payload has \`reader_bmg\`, this reader took our 本命卦 quiz; \`reader_bmg.hexagram\` is theirs and \`layers\` compares it with THIS chart, layer by layer (act = what they do and feel, think = how they think and judge, want = what they want and how they are with people). Add ONE short passage, opening with 「以你的本命卦來說」 (simplified 「以你的本命卦来说」; other languages: "Going by your own hexagram"), in the field noted below: for a layer marked same, say this matter runs the way they are used to there; for opposite, that it asks them to work in a way they are not used to; skip split layers. Where \`moving\` is true, that layer gets the one concrete thing to do. Two or three sentences at most, plain words, no personality labels, never better or worse as a person. Never mention a quiz, a test, MBTI or four letters.`;
