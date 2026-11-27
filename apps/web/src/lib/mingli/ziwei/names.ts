import { BAZI_NAMES } from "@/lib/mingli/bazi/names";
import { zwNameOf, type ZiweiNames, type ZwLang, type ZwName } from "./names-fmt";

export * from "./names-fmt";

/**
 * 10-30 进度表 128 ④ — the 紫微斗數 names in the seven other languages (the types, keys and helpers: names-fmt.ts).
 * Server pages hand one language's names to the chart components (ZIWEI_NAMES[l] with BAZI_NAMES[l] for the stems,
 * branches, hours and lunar dates); server code names things with zwName(l).
 */
const PY_MAJOR = ["Zi Wei", "Tian Ji", "Tai Yang", "Wu Qu", "Tian Tong", "Lian Zhen", "Tian Fu", "Tai Yin", "Tan Lang", "Ju Men", "Tian Xiang", "Tian Liang", "Qi Sha", "Po Jun"];
const PY_MINOR = ["Zuo Fu", "You Bi", "Wen Chang", "Wen Qu", "Tian Kui", "Tian Yue", "Lu Cun", "Tian Ma", "Qing Yang", "Tuo Luo", "Huo Xing", "Ling Xing", "Di Kong", "Di Jie"];
const BRIGHT_CODE = ["+3", "+2", "+1", "0", "−1", "−2", "−3"];
const MUT_PY = ["Lu", "Quan", "Ke", "Ji"];
const MUT_PY_FULL = ["Hua Lu", "Hua Quan", "Hua Ke", "Hua Ji"];

export const ZIWEI_NAMES: Record<ZwLang, ZiweiNames> = {
  en: {
    major: PY_MAJOR, minor: PY_MINOR,
    gloss: ["the Emperor star", "the Strategist star", "the Sun star", "the Wealth General star", "the Blessing star", "the Integrity star", "the Treasury star", "the Moon star", "the Desire star", "the Great Gate star", "the Minister star", "the Guardian star", "the Commander star", "the Vanguard star"],
    palace: ["Life", "Siblings", "Spouse", "Children", "Wealth", "Health", "Travel", "Friends", "Career", "Property", "Well-being", "Parents"],
    palaceFull: ["Life Palace", "Siblings Palace", "Spouse Palace", "Children Palace", "Wealth Palace", "Health Palace", "Travel Palace", "Friends Palace", "Career Palace", "Property Palace", "Well-being Palace", "Parents Palace"],
    bright: BRIGHT_CODE, brightWord: ["at its peak", "strong", "good", "fair", "even", "subdued", "held in"],
    mut: MUT_PY, mutFull: MUT_PY_FULL, mutGloss: ["flow", "drive", "recognition", "attachment"],
    five: ["Water 2", "Wood 3", "Metal 4", "Earth 5", "Fire 6"],
    layer: { decadal: "D", yearly: "Y", monthly: "M" },
  },
  ja: {
    major: ["紫微", "天機", "太陽", "武曲", "天同", "廉貞", "天府", "太陰", "貪狼", "巨門", "天相", "天梁", "七殺", "破軍"],
    minor: ["左輔", "右弼", "文昌", "文曲", "天魁", "天鉞", "禄存", "天馬", "擎羊", "陀羅", "火星", "鈴星", "地空", "地劫"],
    palace: ["命", "兄弟", "夫妻", "子女", "財帛", "疾厄", "遷移", "交友", "官禄", "田宅", "福徳", "父母"],
    palaceFull: ["命宮", "兄弟宮", "夫妻宮", "子女宮", "財帛宮", "疾厄宮", "遷移宮", "交友宮", "官禄宮", "田宅宮", "福徳宮", "父母宮"],
    bright: ["廟", "旺", "得", "利", "平", "不", "陥"], brightWord: ["廟", "旺", "得", "利", "平", "不", "陥"],
    mut: ["禄", "権", "科", "忌"], mutFull: ["化禄", "化権", "化科", "化忌"], mutGloss: ["流れ", "推進", "評価", "こだわり"],
    five: ["水二局", "木三局", "金四局", "土五局", "火六局"],
    layer: { decadal: "限", yearly: "年", monthly: "月" },
  },
  ko: {
    major: ["자미", "천기", "태양", "무곡", "천동", "염정", "천부", "태음", "탐랑", "거문", "천상", "천량", "칠살", "파군"],
    minor: ["좌보", "우필", "문창", "문곡", "천괴", "천월", "녹존", "천마", "경양", "타라", "화성", "영성", "지공", "지겁"],
    palace: ["명", "형제", "부처", "자녀", "재백", "질액", "천이", "교우", "관록", "전택", "복덕", "부모"],
    palaceFull: ["명궁", "형제궁", "부처궁", "자녀궁", "재백궁", "질액궁", "천이궁", "교우궁", "관록궁", "전택궁", "복덕궁", "부모궁"],
    bright: ["묘", "왕", "득", "리", "평", "불", "함"], brightWord: ["묘", "왕", "득", "리", "평", "불", "함"],
    mut: ["록", "권", "과", "기"], mutFull: ["화록", "화권", "화과", "화기"], mutGloss: ["흐름", "추진", "인정", "집착"],
    five: ["수이국", "목삼국", "금사국", "토오국", "화육국"],
    layer: { decadal: "대", yearly: "년", monthly: "월" },
  },
  fr: {
    major: PY_MAJOR, minor: PY_MINOR,
    gloss: ["l'étoile de l'Empereur", "l'étoile du Stratège", "l'étoile du Soleil", "l'étoile du Général de la richesse", "l'étoile de la Bénédiction", "l'étoile de l'Intégrité", "l'étoile du Trésor", "l'étoile de la Lune", "l'étoile du Désir", "l'étoile de la Grande Porte", "l'étoile du Ministre", "l'étoile du Gardien", "l'étoile du Commandant", "l'étoile de l'Avant-garde"],
    palace: ["Vie", "Fratrie", "Conjoint", "Enfants", "Richesse", "Santé", "Voyages", "Amis", "Carrière", "Biens", "Bien-être", "Parents"],
    palaceFull: ["palais de la Vie", "palais de la Fratrie", "palais du Conjoint", "palais des Enfants", "palais de la Richesse", "palais de la Santé", "palais des Voyages", "palais des Amis", "palais de la Carrière", "palais des Biens", "palais du Bien-être", "palais des Parents"],
    bright: BRIGHT_CODE, brightWord: ["à son apogée", "fort", "bon", "correct", "égal", "atténué", "retenu"],
    mut: MUT_PY, mutFull: MUT_PY_FULL, mutGloss: ["fluidité", "élan", "reconnaissance", "attachement"],
    five: ["Eau 2", "Bois 3", "Métal 4", "Terre 5", "Feu 6"],
    layer: { decadal: "D", yearly: "A", monthly: "M" },
  },
  de: {
    major: PY_MAJOR, minor: PY_MINOR,
    gloss: ["der Kaiserstern", "der Strategenstern", "der Sonnenstern", "der Stern des Reichtumsgenerals", "der Segensstern", "der Stern der Integrität", "der Schatzstern", "der Mondstern", "der Stern des Begehrens", "der Stern des Großen Tores", "der Ministerstern", "der Hüterstern", "der Kommandantenstern", "der Vorhutstern"],
    palace: ["Leben", "Geschwister", "Partner", "Kinder", "Reichtum", "Gesundheit", "Reisen", "Freunde", "Karriere", "Besitz", "Wohlbefinden", "Eltern"],
    palaceFull: ["Lebenspalast", "Geschwisterpalast", "Partnerpalast", "Kinderpalast", "Reichtumspalast", "Gesundheitspalast", "Reisepalast", "Freundespalast", "Karrierepalast", "Besitzpalast", "Palast des Wohlbefindens", "Elternpalast"],
    bright: BRIGHT_CODE, brightWord: ["auf dem Höhepunkt", "stark", "gut", "ordentlich", "ausgeglichen", "gedämpft", "zurückgehalten"],
    mut: MUT_PY, mutFull: MUT_PY_FULL, mutGloss: ["Fluss", "Antrieb", "Anerkennung", "Anhaften"],
    five: ["Wasser 2", "Holz 3", "Metall 4", "Erde 5", "Feuer 6"],
    layer: { decadal: "D", yearly: "J", monthly: "M" },
  },
  es: {
    major: PY_MAJOR, minor: PY_MINOR,
    gloss: ["la estrella del Emperador", "la estrella del Estratega", "la estrella del Sol", "la estrella del General de la riqueza", "la estrella de la Bendición", "la estrella de la Integridad", "la estrella del Tesoro", "la estrella de la Luna", "la estrella del Deseo", "la estrella de la Gran Puerta", "la estrella del Ministro", "la estrella del Guardián", "la estrella del Comandante", "la estrella de la Vanguardia"],
    palace: ["Vida", "Hermanos", "Pareja", "Hijos", "Riqueza", "Salud", "Viajes", "Amigos", "Carrera", "Bienes", "Bienestar", "Padres"],
    palaceFull: ["palacio de la Vida", "palacio de los Hermanos", "palacio de la Pareja", "palacio de los Hijos", "palacio de la Riqueza", "palacio de la Salud", "palacio de los Viajes", "palacio de los Amigos", "palacio de la Carrera", "palacio de los Bienes", "palacio del Bienestar", "palacio de los Padres"],
    bright: BRIGHT_CODE, brightWord: ["en su apogeo", "fuerte", "bueno", "aceptable", "parejo", "atenuado", "contenido"],
    mut: MUT_PY, mutFull: MUT_PY_FULL, mutGloss: ["fluidez", "impulso", "reconocimiento", "apego"],
    five: ["Agua 2", "Madera 3", "Metal 4", "Tierra 5", "Fuego 6"],
    layer: { decadal: "D", yearly: "A", monthly: "M" },
  },
  pt: {
    major: PY_MAJOR, minor: PY_MINOR,
    gloss: ["a estrela do Imperador", "a estrela do Estrategista", "a estrela do Sol", "a estrela do General da riqueza", "a estrela da Bênção", "a estrela da Integridade", "a estrela do Tesouro", "a estrela da Lua", "a estrela do Desejo", "a estrela da Grande Porta", "a estrela do Ministro", "a estrela do Guardião", "a estrela do Comandante", "a estrela da Vanguarda"],
    palace: ["Vida", "Irmãos", "Cônjuge", "Filhos", "Riqueza", "Saúde", "Viagens", "Amigos", "Carreira", "Bens", "Bem-estar", "Pais"],
    palaceFull: ["palácio da Vida", "palácio dos Irmãos", "palácio do Cônjuge", "palácio dos Filhos", "palácio da Riqueza", "palácio da Saúde", "palácio das Viagens", "palácio dos Amigos", "palácio da Carreira", "palácio dos Bens", "palácio do Bem-estar", "palácio dos Pais"],
    bright: BRIGHT_CODE, brightWord: ["no auge", "forte", "bom", "razoável", "equilibrado", "atenuado", "contido"],
    mut: MUT_PY, mutFull: MUT_PY_FULL, mutGloss: ["fluidez", "impulso", "reconhecimento", "apego"],
    five: ["Água 2", "Madeira 3", "Metal 4", "Terra 5", "Fogo 6"],
    layer: { decadal: "D", yearly: "A", monthly: "M" },
  },
};

export const zwName = (l: ZwLang): ZwName => zwNameOf(ZIWEI_NAMES[l], BAZI_NAMES[l], l);
