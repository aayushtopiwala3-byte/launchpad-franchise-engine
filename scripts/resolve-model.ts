/**
 * Rewrites RESOLVED_MODEL in lib/ai/model.ts with the newest stable flash model the key
 * can actually reach. Run manually; the build must not depend on a network call.
 */
import { writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";

const MODEL_FILE = join(import.meta.dirname, "..", "lib", "ai", "model.ts");

// Anything that is a preview, an alias, or a non-text variant is not a stable text model.
const EXCLUDE = [
  "preview", "exp", "latest", "thinking", "tts", "image", "live", "native-audio", "lite",
];

/** "gemini-3.10-flash" must sort above "gemini-3.9-flash", so compare numerically. */
function versionOf(name: string): number[] {
  const m = name.match(/gemini-([\d.]+)-flash/);
  if (!m) return [0];
  return m[1].split(".").map(Number);
}

function newer(a: string, b: string): boolean {
  const [va, vb] = [versionOf(a), versionOf(b)];
  for (let i = 0; i < Math.max(va.length, vb.length); i++) {
    const [x, y] = [va[i] ?? 0, vb[i] ?? 0];
    if (x !== y) return x > y;
  }
  return false;
}

const key = process.env.GEMINI_API_KEY;
if (!key) throw new Error("Set GEMINI_API_KEY before running this script.");

const res = await fetch(
  `https://generativelanguage.googleapis.com/v1beta/models?pageSize=200&key=${key}`,
);
if (!res.ok) throw new Error(`ListModels failed: ${res.status} ${await res.text()}`);

const body = (await res.json()) as {
  models: { name: string; supportedGenerationMethods?: string[] }[];
};

const candidates = body.models
  .filter((m) => m.supportedGenerationMethods?.includes("generateContent"))
  .map((m) => m.name.replace(/^models\//, ""))
  .filter((n) => n.includes("flash") && !EXCLUDE.some((e) => n.includes(e)));

if (candidates.length === 0) throw new Error("No stable flash model is reachable with this key.");

const best = candidates.reduce((a, b) => (newer(b, a) ? b : a));
console.log(`Candidates: ${candidates.join(", ")}`);
console.log(`Resolved:   ${best}`);

const source = readFileSync(MODEL_FILE, "utf8");
const updated = source.replace(
  /export const RESOLVED_MODEL = "[^"]*";/,
  `export const RESOLVED_MODEL = "${best}";`,
);
if (updated === source) console.log("Already up to date.");
else {
  writeFileSync(MODEL_FILE, updated);
  console.log(`Wrote ${MODEL_FILE}`);
}
