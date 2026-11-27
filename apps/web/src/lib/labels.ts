import type { Relation, Spirit, Strength } from "@yaoflow/engine";

export const RELATION_EN: Readonly<Record<Relation, string>> = {
  parent: "Parent",
  sibling: "Sibling",
  child: "Descendant",
  wealth: "Wealth",
  officer: "Officer",
};

export const SPIRIT_EN: Readonly<Record<Spirit, string>> = {
  qinglong: "Azure Dragon",
  zhuque: "Vermilion Bird",
  gouchen: "Hooked Array",
  tengshe: "Rising Snake",
  baihu: "White Tiger",
  xuanwu: "Black Tortoise",
};

export const STRENGTH_EN: Readonly<Record<Strength, string>> = {
  wang: "peak",
  xiang: "supported",
  xiu: "resting",
  qiu: "confined",
  si: "dormant",
};

export const PHASE_LABEL: Readonly<Record<string, { zh: string; en: string }>> = {
  wood: { zh: "木", en: "Wood" },
  fire: { zh: "火", en: "Fire" },
  earth: { zh: "土", en: "Earth" },
  metal: { zh: "金", en: "Metal" },
  water: { zh: "水", en: "Water" },
};

/**
 * 09-24 translation review: the chart panel showed English six-relations,
 * six-spirits and strength words to fr/de/es/pt readers ("Officer · Azure
 * Dragon · peak"), and English strength words to ko readers. Same words as
 * reading.ts TERMS so the reading's basis and the chart agree.
 */
type Latin = "fr" | "de" | "es" | "pt";
export const RELATION_L10N: Readonly<Record<Latin, Record<Relation, string>>> = {
  fr: { parent: "Parents", sibling: "Frères", child: "Descendants", wealth: "Richesse", officer: "Officier" },
  de: { parent: "Eltern", sibling: "Geschwister", child: "Nachkommen", wealth: "Reichtum", officer: "Beamter" },
  es: { parent: "Padres", sibling: "Hermanos", child: "Descendientes", wealth: "Riqueza", officer: "Oficial" },
  pt: { parent: "Pais", sibling: "Irmãos", child: "Descendentes", wealth: "Riqueza", officer: "Oficial" },
};
export const SPIRIT_L10N: Readonly<Record<Latin, Record<Spirit, string>>> = {
  fr: { qinglong: "Dragon azur", zhuque: "Oiseau vermillon", gouchen: "Gou Chen", tengshe: "Serpent volant", baihu: "Tigre blanc", xuanwu: "Guerrier noir" },
  de: { qinglong: "Grüner Drache", zhuque: "Zinnobervogel", gouchen: "Gouchen", tengshe: "Fliegende Schlange", baihu: "Weißer Tiger", xuanwu: "Schwarze Schildkröte" },
  es: { qinglong: "Dragón azul", zhuque: "Pájaro bermellón", gouchen: "Gou Chen", tengshe: "Serpiente voladora", baihu: "Tigre blanco", xuanwu: "Guerrero negro" },
  pt: { qinglong: "Dragão Azul", zhuque: "Pássaro Vermelho", gouchen: "Gou Chen", tengshe: "Serpente Enroscada", baihu: "Tigre Branco", xuanwu: "Guerreiro Negro" },
};
export const STRENGTH_L10N: Readonly<Record<Latin | "ko", Record<Strength, string>>> = {
  fr: { wang: "plein essor", xiang: "soutenu", xiu: "au repos", qiu: "entravé", si: "éteint" },
  de: { wang: "stark", xiang: "gestützt", xiu: "ruhend", qiu: "gebunden", si: "kraftlos" },
  es: { wang: "pleno", xiang: "apoyado", xiu: "en reposo", qiu: "atado", si: "latente" },
  pt: { wang: "pleno", xiang: "apoiado", xiu: "em repouso", qiu: "preso", si: "dormente" },
  ko: { wang: "왕", xiang: "상", xiu: "휴", qiu: "수", si: "사" },
};
