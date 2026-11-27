import type { Locale } from "./locales";

/**
 * Hexagram names in the Latin-script languages, King Wen order (index n−1),
 * following each language's standard I Ching edition — all in the Wilhelm
 * lineage (Wilhelm 1924 · Perrot 1973 · Vogelmann 1976 · Pensamento 1982),
 * so a French and a German reader meet the names their own bookshelf uses.
 */
export const LATIN_NAMES: Partial<Record<Locale, readonly string[]>> = {
  de: [
    "Das Schöpferische", "Das Empfangende", "Die Anfangsschwierigkeit", "Die Jugendtorheit", "Das Warten", "Der Streit", "Das Heer", "Das Zusammenhalten",
    "Des Kleinen Zähmungskraft", "Das Auftreten", "Der Friede", "Die Stockung", "Gemeinschaft mit Menschen", "Besitz von Großem", "Die Bescheidenheit", "Die Begeisterung",
    "Die Nachfolge", "Die Arbeit am Verdorbenen", "Die Annäherung", "Die Betrachtung", "Das Durchbeißen", "Die Anmut", "Die Zersplitterung", "Die Wiederkehr",
    "Die Unschuld", "Des Großen Zähmungskraft", "Die Ernährung", "Des Großen Übergewicht", "Das Abgründige", "Das Haftende", "Die Einwirkung", "Die Dauer",
    "Der Rückzug", "Des Großen Macht", "Der Fortschritt", "Die Verfinsterung des Lichts", "Die Sippe", "Der Gegensatz", "Das Hemmnis", "Die Befreiung",
    "Die Minderung", "Die Mehrung", "Der Durchbruch", "Das Entgegenkommen", "Die Sammlung", "Das Empordringen", "Die Bedrängnis", "Der Brunnen",
    "Die Umwälzung", "Der Tiegel", "Das Erregende", "Das Stillehalten", "Die Entwicklung", "Das heiratende Mädchen", "Die Fülle", "Der Wanderer",
    "Das Sanfte", "Das Heitere", "Die Auflösung", "Die Beschränkung", "Innere Wahrheit", "Des Kleinen Übergewicht", "Nach der Vollendung", "Vor der Vollendung",
  ],
  fr: [
    "Le Créateur", "Le Réceptif", "La Difficulté initiale", "La Folie juvénile", "L'Attente", "Le Conflit", "L'Armée", "La Solidarité",
    "Le Pouvoir d'apprivoisement du petit", "La Marche", "La Paix", "La Stagnation", "Communauté avec les hommes", "Le Grand Avoir", "L'Humilité", "L'Enthousiasme",
    "La Suite", "Le Travail sur ce qui est corrompu", "L'Approche", "La Contemplation", "Mordre au travers", "La Grâce", "L'Éclatement", "Le Retour",
    "L'Innocence", "Le Pouvoir d'apprivoisement du grand", "Les Commissures des lèvres", "La Prépondérance du grand", "L'Insondable", "Ce qui s'attache", "L'Influence", "La Durée",
    "La Retraite", "La Puissance du grand", "Le Progrès", "L'Obscurcissement de la lumière", "La Famille", "L'Opposition", "L'Obstacle", "La Libération",
    "La Diminution", "L'Augmentation", "La Percée", "Venir à la rencontre", "Le Rassemblement", "La Poussée vers le haut", "L'Accablement", "Le Puits",
    "La Révolution", "Le Chaudron", "L'Éveilleur", "L'Immobilisation", "Le Développement", "L'Épousée", "L'Abondance", "Le Voyageur",
    "Le Doux", "Le Serein", "La Dissolution", "La Limitation", "La Vérité intérieure", "La Prépondérance du petit", "Après l'accomplissement", "Avant l'accomplissement",
  ],
  es: [
    "Lo Creativo", "Lo Receptivo", "La Dificultad Inicial", "La Necedad Juvenil", "La Espera", "El Conflicto", "El Ejército", "La Solidaridad",
    "La Fuerza Domesticadora de lo Pequeño", "El Porte", "La Paz", "El Estancamiento", "Comunidad con los Hombres", "La Posesión de lo Grande", "La Modestia", "El Entusiasmo",
    "El Seguimiento", "El Trabajo en lo Echado a Perder", "El Acercamiento", "La Contemplación", "La Mordedura Tajante", "La Gracia", "La Desintegración", "El Retorno",
    "La Inocencia", "La Fuerza Domesticadora de lo Grande", "Las Comisuras de la Boca", "La Preponderancia de lo Grande", "Lo Abismal", "Lo Adherente", "El Influjo", "La Duración",
    "La Retirada", "El Poder de lo Grande", "El Progreso", "El Oscurecimiento de la Luz", "La Familia", "El Antagonismo", "El Impedimento", "La Liberación",
    "La Merma", "El Aumento", "La Resolución", "El Ir al Encuentro", "La Reunión", "La Subida", "La Desazón", "El Pozo",
    "La Revolución", "El Caldero", "Lo Suscitativo", "El Aquietamiento", "La Evolución", "La Muchacha que se Casa", "La Plenitud", "El Andariego",
    "Lo Suave", "Lo Sereno", "La Disolución", "La Restricción", "La Verdad Interior", "La Preponderancia de lo Pequeño", "Después de la Consumación", "Antes de la Consumación",
  ],
  pt: [
    "O Criativo", "O Receptivo", "A Dificuldade Inicial", "A Insensatez Juvenil", "A Espera", "O Conflito", "O Exército", "A União",
    "O Poder de Domar do Pequeno", "A Conduta", "A Paz", "A Estagnação", "Comunidade com os Homens", "A Grande Posse", "A Modéstia", "O Entusiasmo",
    "O Seguir", "O Trabalho sobre o que se Deteriorou", "A Aproximação", "A Contemplação", "Morder Através", "A Graça", "A Desintegração", "O Retorno",
    "A Inocência", "O Poder de Domar do Grande", "Os Cantos da Boca", "A Preponderância do Grande", "O Abismal", "O Aderir", "A Influência", "A Duração",
    "A Retirada", "O Poder do Grande", "O Progresso", "O Obscurecimento da Luz", "A Família", "A Oposição", "O Impedimento", "A Libertação",
    "A Diminuição", "O Aumento", "A Resolução", "Vir ao Encontro", "A Reunião", "O Impulso para Cima", "A Opressão", "O Poço",
    "A Revolução", "O Caldeirão", "O Incitar", "A Quietude", "O Desenvolvimento", "A Jovem que se Casa", "A Abundância", "O Andarilho",
    "A Suavidade", "A Alegria", "A Dissolução", "A Limitação", "A Verdade Interior", "A Preponderância do Pequeno", "Após a Conclusão", "Antes da Conclusão",
  ],
};
