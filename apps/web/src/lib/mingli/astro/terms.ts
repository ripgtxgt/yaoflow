import type { Foreign } from "@/lib/l10n/core";

/** 10-30 进度表 128 ④: the chart words a foreign astrology report names beside the planets and signs (report.ts, book-foreign.ts) */
export const ASTRO_TERMS: Record<Foreign, { asc: string; mc: string; north: string; south: string; ruler: string; retro: string; house: string }> = {
  en: { asc: "Ascendant", mc: "Midheaven (MC)", north: "North Node", south: "South Node", ruler: "chart ruler", retro: "retrograde", house: "the 7th house" },
  ja: { asc: "アセンダント", mc: "MC（ミッドヘブン）", north: "ノースノード", south: "サウスノード", ruler: "チャートルーラー", retro: "逆行", house: "第7ハウス" },
  ko: { asc: "어센던트(상승점)", mc: "MC(미드헤븐)", north: "노스노드", south: "사우스노드", ruler: "차트 룰러", retro: "역행", house: "7하우스" },
  fr: { asc: "Ascendant", mc: "Milieu du Ciel (MC)", north: "Nœud Nord", south: "Nœud Sud", ruler: "maître de l'Ascendant", retro: "rétrograde", house: "la maison 7" },
  de: { asc: "Aszendent", mc: "Medium Coeli (MC)", north: "aufsteigender Mondknoten", south: "absteigender Mondknoten", ruler: "Herrscher des Aszendenten", retro: "rückläufig", house: "das 7. Haus" },
  es: { asc: "Ascendente", mc: "Medio Cielo (MC)", north: "Nodo Norte", south: "Nodo Sur", ruler: "regente del Ascendente", retro: "retrógrado", house: "la casa 7" },
  pt: { asc: "Ascendente", mc: "Meio do Céu (MC)", north: "Nodo Norte", south: "Nodo Sul", ruler: "regente do Ascendente", retro: "retrógrado", house: "a casa 7" },
};
