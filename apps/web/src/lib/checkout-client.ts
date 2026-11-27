import type { CatalogId } from "./catalog-ids";

/**
 * 10-22 进度表 57 — the browser's side of the one checkout entrance: POST /api/checkout/v2 {product, …}. The product's
 * own fields ride in `body`; the common ones (locale, currency, timeZone, tzOffsetMinutes) the caller passes as before.
 * Client-safe (no catalog import: the ids are a plain type in lib/catalog-ids.ts).
 */
export async function checkoutV2(product: CatalogId, body: Record<string, unknown>): Promise<Response> {
  return fetch("/api/checkout/v2", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ product, ...body }) });
}
