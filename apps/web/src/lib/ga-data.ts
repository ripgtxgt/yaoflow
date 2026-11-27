import { createSign } from "node:crypto";
import { readFileSync } from "node:fs";
import { db, recordOps } from "./db";
import { GA_PROPERTY } from "./ga";

/**
 * 10-27 Google Analytics → our admin (Neil: 「有效的數據和我們的後台做一下融合」). What GA knows and we do not: where
 * people come from (channel, source, the page they land on), from which country and device, how many come back. We
 * read it with the GA Data API as a service account (key file at GA_SA_FILE, read-only access to the property) and keep
 * each report an hour in ga_reports. No key file → every reader of this gets null and the admin says 「未連接」.
 */
const SCOPE = "https://www.googleapis.com/auth/analytics.readonly";
const TTL = 3_600_000;

let ready = false;
function ensure(): void {
  if (ready) return;
  db().exec("CREATE TABLE IF NOT EXISTS ga_reports (key TEXT PRIMARY KEY, json TEXT NOT NULL, at INTEGER NOT NULL)");
  ready = true;
}

interface SaKey { client_email: string; private_key: string; token_uri?: string }
function saKey(): SaKey | null {
  const file = process.env.GA_SA_FILE;
  if (!file) return null;
  try {
    const k = JSON.parse(readFileSync(file, "utf8")) as SaKey;
    return k.client_email && k.private_key ? k : null;
  } catch { return null; }
}
export const gaConnected = () => !!saKey();

const b64u = (b: Buffer | string) => Buffer.from(b).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
let token: { v: string; exp: number } | null = null;
async function accessToken(k: SaKey): Promise<string> {
  if (token && token.exp > Date.now() + 60_000) return token.v;
  const now = Math.floor(Date.now() / 1000), aud = k.token_uri ?? "https://oauth2.googleapis.com/token";
  const head = b64u(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = b64u(JSON.stringify({ iss: k.client_email, scope: SCOPE, aud, iat: now, exp: now + 3600 }));
  const sig = b64u(createSign("RSA-SHA256").update(`${head}.${claim}`).sign(k.private_key));
  const res = await fetch(aud, {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${head}.${claim}.${sig}` }),
    signal: AbortSignal.timeout(10_000),
  });
  const j = (await res.json()) as { access_token?: string; expires_in?: number; error?: string };
  if (!j.access_token) throw new Error(`token ${j.error ?? res.status}`);
  token = { v: j.access_token, exp: Date.now() + (j.expires_in ?? 3600) * 1000 };
  return token.v;
}

export interface GaRow { dims: string[]; mets: number[] }
export interface GaTable { dims: string[]; mets: string[]; rows: GaRow[]; totals: number[] }

interface ReportSpec { dims: string[]; mets: string[]; days: number; limit?: number; orderBy?: string; endDaysAgo?: number }
async function runReport(k: SaKey, r: ReportSpec): Promise<GaTable> {
  const body = {
    dateRanges: [{ startDate: `${r.days}daysAgo`, endDate: r.endDaysAgo ? `${r.endDaysAgo}daysAgo` : "today" }],
    dimensions: r.dims.map((name) => ({ name })),
    metrics: r.mets.map((name) => ({ name })),
    limit: r.limit ?? 20,
    metricAggregations: ["TOTAL"],
    ...(r.orderBy ? { orderBys: [r.orderBy === "date" ? { dimension: { dimensionName: "date" } } : { metric: { metricName: r.orderBy }, desc: true }] } : {}),
  };
  const res = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${GA_PROPERTY}:runReport`, {
    method: "POST", headers: { authorization: `Bearer ${await accessToken(k)}`, "content-type": "application/json" },
    body: JSON.stringify(body), signal: AbortSignal.timeout(15_000),
  });
  const j = (await res.json()) as { rows?: { dimensionValues?: { value: string }[]; metricValues?: { value: string }[] }[]; totals?: { metricValues: { value: string }[] }[]; error?: { message: string } };
  if (j.error) throw new Error(j.error.message.slice(0, 120));
  return {
    dims: r.dims, mets: r.mets,
    // a report with no dimensions comes back without dimensionValues (and its one row IS the total)
    rows: (j.rows ?? []).map((x) => ({ dims: (x.dimensionValues ?? []).map((v) => v.value), mets: (x.metricValues ?? []).map((v) => Number(v.value)) })),
    totals: (j.totals?.[0]?.metricValues ?? (r.dims.length === 0 ? j.rows?.[0]?.metricValues : undefined) ?? []).map((v) => Number(v.value)),
  };
}

/** the reports the admin shows; 28 days unless said */
export const GA_REPORTS: Record<string, ReportSpec> = {
  overview28: { dims: [], mets: ["activeUsers", "newUsers", "sessions", "engagedSessions", "averageSessionDuration", "screenPageViews", "transactions", "purchaseRevenue"], days: 28 },
  overview7: { dims: [], mets: ["activeUsers", "newUsers", "sessions", "engagedSessions", "averageSessionDuration", "screenPageViews", "transactions", "purchaseRevenue"], days: 7 },
  yesterday: { dims: [], mets: ["activeUsers", "newUsers", "sessions", "engagedSessions", "transactions", "purchaseRevenue"], days: 1, endDaysAgo: 1 },
  daily: { dims: ["date"], mets: ["activeUsers", "sessions", "transactions"], days: 28, limit: 40, orderBy: "date" },
  channels: { dims: ["sessionDefaultChannelGroup"], mets: ["sessions", "activeUsers", "engagementRate", "transactions", "purchaseRevenue"], days: 28, orderBy: "sessions" },
  sources: { dims: ["sessionSource", "sessionMedium"], mets: ["sessions", "newUsers", "engagementRate", "transactions", "purchaseRevenue"], days: 28, limit: 20, orderBy: "sessions" },
  landing: { dims: ["landingPage"], mets: ["sessions", "engagementRate", "transactions", "purchaseRevenue"], days: 28, limit: 20, orderBy: "sessions" },
  countries: { dims: ["country"], mets: ["activeUsers", "sessions", "transactions", "purchaseRevenue"], days: 28, limit: 15, orderBy: "activeUsers" },
  devices: { dims: ["deviceCategory"], mets: ["activeUsers", "sessions", "engagementRate", "transactions"], days: 28, orderBy: "activeUsers" },
  events: { dims: ["eventName"], mets: ["eventCount", "totalUsers"], days: 28, limit: 30, orderBy: "eventCount" },
  returning: { dims: ["newVsReturning"], mets: ["activeUsers", "sessions", "engagementRate", "transactions"], days: 28 },
};

/** every report, from the hour's cache or fresh; null when GA is not connected */
export async function gaReports(opts: { fresh?: boolean } = {}): Promise<{ at: number; tables: Record<string, GaTable>; error?: string } | null> {
  const k = saKey();
  if (!k) return null;
  ensure();
  const cached = db().prepare("SELECT json, at FROM ga_reports WHERE key = 'all'").get() as { json: string; at: number } | undefined;
  if (cached && !opts.fresh && Date.now() - cached.at < TTL) return { at: cached.at, tables: JSON.parse(cached.json) };
  try {
    const entries = await Promise.all(Object.entries(GA_REPORTS).map(async ([name, spec]) => [name, await runReport(k, spec)] as const));
    const tables = Object.fromEntries(entries);
    const at = Date.now();
    db().prepare("INSERT INTO ga_reports (key, json, at) VALUES ('all', ?, ?) ON CONFLICT(key) DO UPDATE SET json = excluded.json, at = excluded.at").run(JSON.stringify(tables), at);
    return { at, tables };
  } catch (e) {
    const error = e instanceof Error ? e.message : "?";
    recordOps("ga_data_fail", error.slice(0, 100));
    return cached ? { at: cached.at, tables: JSON.parse(cached.json), error } : { at: 0, tables: {}, error };
  }
}

/** yesterday's GA numbers for the morning 運營摘要 (lib/daily-insight.ts): flat counts + top channels; {} when not connected */
export async function gaYesterday(): Promise<Record<string, number | Record<string, number>>> {
  const r = await gaReports().catch(() => null);
  const y = r?.tables.yesterday, ch = r?.tables.channels;
  if (!y?.totals.length) return {};
  const [users, newUsers, sessions, engaged, tx, rev] = y.totals;
  const channels28: Record<string, number> = {};
  for (const row of ch?.rows.slice(0, 6) ?? []) channels28[row.dims[0]] = row.mets[0];
  return { gaUsers: users, gaNewUsers: newUsers, gaSessions: sessions, gaEngagedSessions: engaged, gaTransactions: tx, gaRevenue: Math.round(rev * 100) / 100, gaChannelSessions28d: channels28 };
}
