/** 10-22 进度表 55: the catalog's ids as a plain type, for client code (lib/catalog.ts itself is server only) */
export type CatalogId =
  | "deep" | "one"
  | "month" | "year"
  | "pass_1" | "pass_7" | "pass_30"
  | "pack_l" | "pack_s"
  | "qian_personal" | "qian_card"
  | "tarot"
  | "bazi_deep" | "ziwei_deep" | "astro_deep"
  | "hepan" | "nianshu" | "zhengyuan"
  | "name_baby" | "name_rename";
