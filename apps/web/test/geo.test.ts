import { describe, expect, it } from "vitest";
import { buyerCountry, managedPaymentsAllowed } from "../src/lib/geo";

const h = (o: Record<string, string>) => new Headers(o);

describe("buyer country detection", () => {
  it("prefers an edge country header", async () => {
    expect(await buyerCountry(h({ "cf-ipcountry": "cn" }))).toBe("CN");
    expect(await buyerCountry(h({ "x-vercel-ip-country": "US" }))).toBe("US");
    expect(await buyerCountry(h({ "x-geo-country": " jp " }))).toBe("JP");
  });

  it("ignores malformed header values", async () => {
    // falls through to IP lookup, which has nothing to work with here
    expect(await buyerCountry(h({ "cf-ipcountry": "XX1" }))).toBeNull();
    expect(await buyerCountry(h({ "cf-ipcountry": "" }))).toBeNull();
  });

  it("returns null for private and missing IPs rather than calling out", async () => {
    expect(await buyerCountry(h({}))).toBeNull();
    expect(await buyerCountry(h({ "x-forwarded-for": "127.0.0.1" }))).toBeNull();
    expect(await buyerCountry(h({ "x-forwarded-for": "192.168.1.5" }))).toBeNull();
    expect(await buyerCountry(h({ "x-real-ip": "10.0.0.9" }))).toBeNull();
  });
});

describe("managed payments routing", () => {
  it("disables Managed Payments only for unsupported countries", () => {
    expect(managedPaymentsAllowed("CN")).toBe(false);
    expect(managedPaymentsAllowed("US")).toBe(true);
    expect(managedPaymentsAllowed("JP")).toBe(true);
    expect(managedPaymentsAllowed("DE")).toBe(true);
  });

  it("keeps the default when the country is unknown", () => {
    // a lookup failure must not silently drop Stripe's tax coverage for everyone
    expect(managedPaymentsAllowed(null)).toBe(true);
  });
});
