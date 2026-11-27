/**
 * 11-04 (Neil：「要做」— 看板上一下子多出 8 台「在线设备」，是腾讯云／华为云的链接扫描器): the address blocks of the
 * big cloud / hosting networks, so the live board can file a visitor from a server room under 爬虫 instead of 在线.
 * Source: ipverse/asn-ip (public BGP data, per AS number). Re-run now and then; it writes src/data/cloud-ranges.json.
 *   npx tsx scripts/build-cloud-ranges.ts
 * Mobile and home networks are not here on purpose; neither are Apple Private Relay / Cloudflare WARP exits (real people).
 */
import { writeFileSync } from "node:fs";

const ASNS: [number, string][] = [
  [132203, "腾讯云"], [45090, "腾讯云"], [45102, "阿里云"], [37963, "阿里云"], [136907, "华为云"], [55990, "华为云"],
  [135377, "UCloud"], [16509, "AWS"], [14618, "AWS"], [396982, "Google Cloud"], [8075, "Microsoft Azure"], [31898, "Oracle Cloud"],
  [14061, "DigitalOcean"], [63949, "Linode"], [20473, "Vultr"], [16276, "OVH"], [24940, "Hetzner"], [51167, "Contabo"],
];

const v4 = (s: string) => s.split(".").reduce((a, x) => a * 256 + Number(x), 0);
async function list(asn: number, fam: "ipv4" | "ipv6"): Promise<string[]> {
  const r = await fetch(`https://raw.githubusercontent.com/ipverse/asn-ip/master/as/${asn}/${fam}-aggregated.txt`);
  if (!r.ok) return [];
  return (await r.text()).split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
}

async function main() {
  const names = [...new Set(ASNS.map((a) => a[1]))];
  const r4: [number, number, number][] = [];
  const r6: [string, number, number][] = [];
  for (const [asn, name] of ASNS) {
    const i = names.indexOf(name);
    for (const c of await list(asn, "ipv4")) {
      const [ip, bits] = c.split("/");
      const start = v4(ip!), size = 2 ** (32 - Number(bits));
      r4.push([start, start + size - 1, i]);
    }
    for (const c of await list(asn, "ipv6")) { const [ip, bits] = c.split("/"); r6.push([ip!, Number(bits), i]); }
    console.error(asn, name, r4.length, r6.length);
  }
  r4.sort((a, b) => a[0] - b[0]);
  writeFileSync("apps/web/src/data/cloud-ranges.json", JSON.stringify({ built: new Date().toISOString().slice(0, 10), names, v4: r4, v6: r6 }));
}
void main();
