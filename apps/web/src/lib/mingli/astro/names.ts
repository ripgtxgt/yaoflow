/**
 * 10-30 进度表 128 ④ — the Western chart's standard names in the seven other languages (signs, planets, the five major
 * aspects), in the order of lib/mingli/astro/chart.ts (SIGNS, PLANETS, ASPECTS). Fixed, not translated: these are the
 * words astrology readers of each language already use. Japanese signs carry 座, as Japanese writes them.
 */
export const ASTRO_NAMES: Record<"en" | "ja" | "ko" | "fr" | "de" | "es" | "pt", { signs: string[]; planets: string[]; aspects: string[] }> = {
  en: {
    signs: ["Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo", "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces"],
    planets: ["Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto"],
    aspects: ["conjunction", "sextile", "square", "trine", "opposition"],
  },
  ja: {
    signs: ["牡羊座", "牡牛座", "双子座", "蟹座", "獅子座", "乙女座", "天秤座", "蠍座", "射手座", "山羊座", "水瓶座", "魚座"],
    planets: ["太陽", "月", "水星", "金星", "火星", "木星", "土星", "天王星", "海王星", "冥王星"],
    aspects: ["コンジャンクション", "セクスタイル", "スクエア", "トライン", "オポジション"],
  },
  ko: {
    signs: ["양자리", "황소자리", "쌍둥이자리", "게자리", "사자자리", "처녀자리", "천칭자리", "전갈자리", "사수자리", "염소자리", "물병자리", "물고기자리"],
    planets: ["태양", "달", "수성", "금성", "화성", "목성", "토성", "천왕성", "해왕성", "명왕성"],
    aspects: ["컨정션", "섹스타일", "스퀘어", "트라인", "어포지션"],
  },
  fr: {
    signs: ["Bélier", "Taureau", "Gémeaux", "Cancer", "Lion", "Vierge", "Balance", "Scorpion", "Sagittaire", "Capricorne", "Verseau", "Poissons"],
    planets: ["Soleil", "Lune", "Mercure", "Vénus", "Mars", "Jupiter", "Saturne", "Uranus", "Neptune", "Pluton"],
    aspects: ["conjonction", "sextile", "carré", "trigone", "opposition"],
  },
  de: {
    signs: ["Widder", "Stier", "Zwillinge", "Krebs", "Löwe", "Jungfrau", "Waage", "Skorpion", "Schütze", "Steinbock", "Wassermann", "Fische"],
    planets: ["Sonne", "Mond", "Merkur", "Venus", "Mars", "Jupiter", "Saturn", "Uranus", "Neptun", "Pluto"],
    aspects: ["Konjunktion", "Sextil", "Quadrat", "Trigon", "Opposition"],
  },
  es: {
    signs: ["Aries", "Tauro", "Géminis", "Cáncer", "Leo", "Virgo", "Libra", "Escorpio", "Sagitario", "Capricornio", "Acuario", "Piscis"],
    planets: ["Sol", "Luna", "Mercurio", "Venus", "Marte", "Júpiter", "Saturno", "Urano", "Neptuno", "Plutón"],
    aspects: ["conjunción", "sextil", "cuadratura", "trígono", "oposición"],
  },
  pt: {
    signs: ["Áries", "Touro", "Gêmeos", "Câncer", "Leão", "Virgem", "Libra", "Escorpião", "Sagitário", "Capricórnio", "Aquário", "Peixes"],
    planets: ["Sol", "Lua", "Mercúrio", "Vênus", "Marte", "Júpiter", "Saturno", "Urano", "Netuno", "Plutão"],
    aspects: ["conjunção", "sextil", "quadratura", "trígono", "oposição"],
  },
};
