/**
 * 09-29 会员增购包邮件 — the first batch (Neil: 「给额度用完的会员和只剩下 2 次以下的会员发一封」).
 * The same letter the cron sends once PACK_OFFER_AUTO=on (lib/pack-offer.ts); nothing goes out without --send --yes.
 *   cd apps/web && npx tsx --tsconfig tsconfig.json ../../scripts/pack-offer-mails.ts --list            (who, masked)
 *   … --preview --out=/tmp/pack-preview   (one HTML per language present + a sample for zh-hant/zh/en)
 *   … --send --yes
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { packOfferCandidates, packOfferLetter, sendPackOffer, type PackOfferCandidate } from "../apps/web/src/lib/pack-offer";

const arg = (k: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split("=").slice(1).join("=") ?? null;
const OUT = arg("out") ?? "/tmp/pack-preview";
const mask = (e: string) => e.replace(/^(.{2}).*(@.*)$/, "$1***$2");

async function main() {
  const list = await packOfferCandidates();
  if (process.argv.includes("--list")) {
    console.log(`due now: ${list.length}`);
    for (const c of list) console.log(`#${c.customerId} ${mask(c.email)} ${c.locale} ${c.currency} left ${c.left}`);
  }
  if (process.argv.includes("--preview")) {
    mkdirSync(OUT, { recursive: true });
    const samples: PackOfferCandidate[] = [];
    for (const l of ["zh-hant", "zh", "en"] as const) {
      const real = list.find((c) => c.locale === l);
      samples.push(real ?? { customerId: 0, email: "preview@example.com", locale: l, left: 0, key: "preview", reset: Date.now() + 20 * 86_400_000, currency: l === "zh-hant" ? "TWD" : l === "zh" ? "CNY" : "USD" });
    }
    // the "2 left" variant too
    samples.push({ ...samples[0]!, left: 2, email: "preview@example.com", customerId: 0 });
    samples.forEach((c, i) => {
      const m = packOfferLetter({ ...c, email: "preview@example.com" });
      writeFileSync(`${OUT}/${i + 1}-${c.locale}-left${c.left}.html`, m.html);
      writeFileSync(`${OUT}/${i + 1}-${c.locale}-left${c.left}.txt`, `Subject: ${m.subject}\n\n${m.text}`);
    });
    console.log(`previews → ${OUT}`);
  }
  if (process.argv.includes("--send")) {
    if (!process.argv.includes("--yes")) { console.log("add --yes to send"); return; }
    let sent = 0, failed = 0;
    for (const c of list) { if (await sendPackOffer(c)) sent += 1; else failed += 1; await new Promise((r) => setTimeout(r, 400)); }
    console.log(`sent ${sent}, failed ${failed}`);
  }
}
void main();
