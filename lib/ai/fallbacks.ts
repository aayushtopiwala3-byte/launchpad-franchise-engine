import { ALLOWED_CITIES, CITY_ALIASES } from "../reference";
import type { Contradiction } from "../engine/quality";
import type { BusinessClassification, NormalisedApplication } from "../types";

const RETAIL_NOUNS = ["shop", "store", "retail", "showroom", "outlet", "mart", "boutique", "chain"];
const OWNER_VERBS = ["own", "owns", "runs", "running", "manage", "managing", "proprietor"];
const ADJACENT = [
  "salon", "restaurant", "hotel", "cafe", "tailor", "bakery", "agency", "dealer",
  "distributor", "service centre", "service center", "clinic", "tea stall", "juice",
];

/** Returns the matched term exactly as it appears in the source, so the quote is real. */
function findTerm(haystack: string, needle: string): string | null {
  const i = haystack.toLowerCase().indexOf(needle);
  return i === -1 ? null : haystack.slice(i, i + needle.length);
}

/** AI-1 deterministic twin. Keyword match only; never infers from the name or city. */
export function classifyBusinessFallback(input: string | null): BusinessClassification {
  const source = (input ?? "").trim();
  if (!source) {
    return { category: "unrelated_or_none", evidenceQuote: null, confidence: 1, source: "fallback" };
  }
  const lower = source.toLowerCase();

  const noun = RETAIL_NOUNS.find((t) => lower.includes(t));
  const verb = OWNER_VERBS.find((t) => new RegExp(`\\b${t}\\b`).test(lower));
  if (noun && verb) {
    return {
      category: "retail_owner",
      evidenceQuote: findTerm(source, noun),
      confidence: 0.9,
      source: "fallback",
    };
  }

  const adj = ADJACENT.find((t) => lower.includes(t));
  if (adj) {
    return {
      category: "customer_facing_adjacent",
      evidenceQuote: findTerm(source, adj),
      confidence: 0.85,
      source: "fallback",
    };
  }

  return { category: "unrelated_or_none", evidenceQuote: null, confidence: 0.8, source: "fallback" };
}

const NO_SPACE_PHRASES = [
  "still looking",
  "yet to find",
  "searching for a shop",
  "have not found",
  "havent found",
  "haven't found",
  "not found a shop",
  "still searching",
];
const UPPER_FLOOR_PHRASES = ["first floor", "upper floor", "1st floor", "second floor"];

/** AI-2 deterministic twin. Phrase match only; silent when unsure. */
export function detectContradictionsFallback(n: NormalisedApplication): Contradiction[] {
  const notes = n.notes;
  if (!notes) return [];
  const lower = notes.toLowerCase();
  const out: Contradiction[] = [];

  if (n.spaceAvailable === "Owned" || n.spaceAvailable === "Rented") {
    for (const p of NO_SPACE_PHRASES) {
      const quote = findTerm(notes, p);
      if (quote) {
        out.push({
          field: "Space available",
          quote: extractClause(notes, p),
          explanation: `The notes describe an ongoing search, which cannot be true if the space is already ${n.spaceAvailable}.`,
        });
        break;
      }
    }
  }

  if (n.floor === "Ground") {
    for (const p of UPPER_FLOOR_PHRASES) {
      const quote = findTerm(notes, p);
      if (quote) {
        out.push({
          field: "Floor",
          quote: extractClause(notes, p),
          explanation: "The notes describe an upper floor, but the Floor field says Ground.",
        });
        break;
      }
    }
  }

  if (n.city) {
    for (const c of ALLOWED_CITIES) {
      if (c.city === n.city) continue;
      const names = [c.city, ...Object.keys(CITY_ALIASES).filter((k) => CITY_ALIASES[k] === c.city)];
      for (const name of names) {
        if (name.length < 5) continue;
        if (new RegExp(`\\b${name}\\b`, "i").test(lower)) {
          out.push({
            field: "City",
            quote: extractClause(notes, name),
            explanation: `The notes mention ${c.city}, but the City field says ${n.city}.`,
          });
          break;
        }
      }
      if (out.some((o) => o.field === "City")) break;
    }
  }

  return out;
}

/** Widen a matched term to the surrounding clause so the quoted evidence reads naturally. */
function extractClause(source: string, term: string): string {
  const i = source.toLowerCase().indexOf(term.toLowerCase());
  if (i === -1) return source.trim();
  let start = i;
  let end = i + term.length;
  while (start > 0 && !".;\n".includes(source[start - 1])) start--;
  while (end < source.length && !".;\n".includes(source[end])) end++;
  return source.slice(start, end).trim();
}
