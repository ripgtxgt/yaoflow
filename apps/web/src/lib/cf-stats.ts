/**
 * Edge-layer numbers from Cloudflare's GraphQL Analytics API, so the admin
 * dashboard can show both layers side by side: what the EDGE saw (IPs,
 * requests, bots included) against what the APP measured (JS sessions).
 * The two can never be reconciled per-person — different identity keys by
 * design (IP vs session id; we deliberately do not track IPs app-side) —
 * but the gap between them is itself the useful number: it is the bot tax.
 *
 * Requires CF_API_TOKEN (Analytics:Read on the zone) and CF_ZONE_ID.
 * Absent or failing, the dashboard simply omits the panel.
 */

export interface EdgeStats {
  uniques: number;
  requests: number;
  cachedPct: number;
  threats: number;
  days: number;
}

/** 09-24: the dashboard asked Cloudflare on every refresh; daily totals move slowly — 5 minutes is plenty */
const EDGE_CACHE = new Map<number, { at: number; v: EdgeStats | null }>();
const EDGE_TTL_MS = 5 * 60_000;

const EDGE_INFLIGHT = new Map<number, Promise<void>>();

/**
 * 09-25: never wait for Cloudflare on a page view. A fresh cache is returned;
 * a stale (or empty) one is returned immediately while one refresh runs in
 * the background — the next view sees the new numbers. The first view after
 * a restart shows "—" for the edge card for a few seconds, which is fine.
 */
export async function fetchEdgeStats(days: number): Promise<EdgeStats | null> {
  const hit = EDGE_CACHE.get(days);
  const fresh = !!hit && Date.now() - hit.at < EDGE_TTL_MS;
  if (!fresh && !EDGE_INFLIGHT.has(days)) {
    const p = fetchEdgeStatsUncached(days)
      .then((v) => { if (v) EDGE_CACHE.set(days, { at: Date.now(), v }); })
      .catch(() => undefined)
      .finally(() => EDGE_INFLIGHT.delete(days));
    EDGE_INFLIGHT.set(days, p);
    if (!hit) await Promise.race([p, new Promise((r) => setTimeout(r, 1500))]); // cold start: give it 1.5s, then render without it
  }
  return EDGE_CACHE.get(days)?.v ?? null;
}

async function fetchEdgeStatsUncached(days: number): Promise<EdgeStats | null> {
  const token = process.env.CF_API_TOKEN;
  const zone = process.env.CF_ZONE_ID;
  if (!token || !zone) return null;

  const to = new Date();
  const from = new Date(to.getTime() - days * 86_400_000);
  const d = (x: Date) => x.toISOString().slice(0, 10);

  const query = `{
    viewer { zones(filter: {zoneTag: "${zone}"}) {
      httpRequests1dGroups(limit: 400, filter: {date_geq: "${d(from)}", date_leq: "${d(to)}"}) {
        sum { requests cachedRequests threats }
        uniq { uniques }
      }
    } }
  }`;

  try {
    const res = await fetch("https://api.cloudflare.com/client/v4/graphql", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      data?: { viewer?: { zones?: { httpRequests1dGroups?: {
        sum: { requests: number; cachedRequests: number; threats: number };
        uniq: { uniques: number };
      }[] }[] } };
    };
    const groups = data.data?.viewer?.zones?.[0]?.httpRequests1dGroups ?? [];
    if (groups.length === 0) return null;

    let requests = 0, cached = 0, threats = 0, uniques = 0;
    for (const g of groups) {
      requests += g.sum.requests;
      cached += g.sum.cachedRequests;
      threats += g.sum.threats;
      uniques += g.uniq.uniques; // CF's own convention: daily uniques, summed
    }
    return {
      uniques,
      requests,
      cachedPct: requests > 0 ? Math.round((cached / requests) * 100) : 0,
      threats,
      days,
    };
  } catch {
    return null; // the dashboard must never break on a third-party API
  }
}
