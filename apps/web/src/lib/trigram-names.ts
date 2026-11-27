import type { TrigramKey } from "@yaoflow/engine";
import type { Locale } from "./locales";

/**
 * Trigram name + nature per language for the languages that don't read the
 * Chinese characters directly (Chinese scripts and Japanese show 乾/天 via
 * forLocale). Names follow each language's standard I Ching translation
 * (Wilhelm lineage); Korean uses the Hangul readings 팔괘 books print.
 */
export const TRIGRAM_NAMES: Partial<Record<Locale, Record<TrigramKey, readonly [string, string]>>> = {
  ko: {
    qian: ["건", "하늘"], dui: ["태", "못"], li: ["리", "불"], zhen: ["진", "우레"],
    xun: ["손", "바람"], kan: ["감", "물"], gen: ["간", "산"], kun: ["곤", "땅"],
  },
  fr: {
    qian: ["Le Créateur", "Ciel"], dui: ["Le Joyeux", "Lac"], li: ["Ce qui s'attache", "Feu"], zhen: ["L'Éveilleur", "Tonnerre"],
    xun: ["Le Doux", "Vent"], kan: ["L'Insondable", "Eau"], gen: ["L'Immobilisation", "Montagne"], kun: ["Le Réceptif", "Terre"],
  },
  de: {
    qian: ["Das Schöpferische", "Himmel"], dui: ["Das Heitere", "See"], li: ["Das Haftende", "Feuer"], zhen: ["Das Erregende", "Donner"],
    xun: ["Das Sanfte", "Wind"], kan: ["Das Abgründige", "Wasser"], gen: ["Das Stillehalten", "Berg"], kun: ["Das Empfangende", "Erde"],
  },
  es: {
    qian: ["Lo Creativo", "Cielo"], dui: ["Lo Sereno", "Lago"], li: ["Lo Adherente", "Fuego"], zhen: ["Lo Suscitativo", "Trueno"],
    xun: ["Lo Suave", "Viento"], kan: ["Lo Abismal", "Agua"], gen: ["El Aquietamiento", "Montaña"], kun: ["Lo Receptivo", "Tierra"],
  },
  pt: {
    qian: ["O Criativo", "Céu"], dui: ["A Alegria", "Lago"], li: ["O Aderir", "Fogo"], zhen: ["O Incitar", "Trovão"],
    xun: ["A Suavidade", "Vento"], kan: ["O Abismal", "Água"], gen: ["A Quietude", "Montanha"], kun: ["O Receptivo", "Terra"],
  },
};
