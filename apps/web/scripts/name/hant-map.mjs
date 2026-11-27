// 10-29 进度表 122: simplified → traditional, one character at a time, with the site's own OpenCC (cn → twp, script only)
import { readFileSync, writeFileSync } from "node:fs";
import * as OpenCC from "opencc-js";
const conv = OpenCC.Converter({ from: "cn", to: "tw" });
const chars = readFileSync(process.argv[2], "utf8").split("\n").filter(Boolean);
const out = {};
for (const c of chars) out[c] = conv(c);
writeFileSync(process.argv[3], JSON.stringify(out));
console.log(Object.keys(out).length);
