import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { sampleToArrayBuffer } from "../lib/seed/workbook";

const out = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "sample");
mkdirSync(out, { recursive: true });

const file = join(out, "Launchpad_Sample_Data.xlsx");
writeFileSync(file, Buffer.from(sampleToArrayBuffer()));
process.stdout.write(`wrote ${file}\n`);
