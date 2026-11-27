import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll } from "vitest";

/** Every test run gets its own database file. Runs before any module import. */
const dir = mkdtempSync(join(tmpdir(), "yaoflow-test-"));
process.env.DATA_DIR = dir;
// 10-22 通卡: the older membership tests assert the monthly allowance — they run with the 通卡 model off; pass.test.ts turns it on
process.env.TONGKA_MODEL = process.env.TONGKA_MODEL ?? "off";

// 09-23: these were never removed — 2,711 of them filled the server's 1.9 GB
// /tmp until a test run died with "Unknown system error -122" (disk quota).
afterAll(() => {
  try { rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ }
});
