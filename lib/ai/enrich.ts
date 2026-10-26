import type { BusinessClassification, RawApplicationRow } from "../types";
import type { Contradiction } from "../engine/quality";
import { askAi, type AiClientOptions } from "./client";
import type { ClassifyPayload, ContradictionsPayload } from "./types";

export interface AiEnrichment {
  classifications: Map<string, BusinessClassification>;
  contradictions: Map<string, Contradiction[]>;
  attempted: number;
  failed: number;
  /** Shown on the AI lamp, so the operator sees why it went amber. */
  firstFailure: string | null;
}

export const EMPTY_ENRICHMENT: AiEnrichment = {
  classifications: new Map(),
  contradictions: new Map(),
  attempted: 0,
  failed: 0,
  firstFailure: null,
};

/** Enough parallelism to finish a 28-row sheet quickly without flooding the endpoint. */
const CONCURRENCY = 6;

async function pool<T>(items: T[], run: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const workers = Array.from({ length: Math.min(CONCURRENCY, items.length) }, async () => {
    while (next < items.length) await run(items[next++]);
  });
  await Promise.all(workers);
}

const classifyInput = (r: RawApplicationRow) => ({
  currentBusiness: r.currentBusiness,
  notes: r.notes,
});

const contradictionsInput = (r: RawApplicationRow) => ({
  fields: {
    City: r.city,
    "Space available": r.spaceAvailable,
    Floor: r.floor,
    "Space size": r.spaceSizeSqft,
    Investment: r.investmentLakh,
    "Target launch": r.targetLaunchMonths,
  },
  notes: r.notes,
});

/**
 * Runs AI-1 and AI-2 over the rows that have text worth reading. Every row the AI cannot
 * label is simply left out of the maps, which makes the pipeline use its deterministic twin.
 */
export async function enrichWithAi(
  rows: RawApplicationRow[],
  want: { classify: boolean; contradictions: boolean },
  options: AiClientOptions,
): Promise<AiEnrichment> {
  const out: AiEnrichment = {
    classifications: new Map(),
    contradictions: new Map(),
    attempted: 0,
    failed: 0,
    firstFailure: null,
  };

  const fail = (reason: string | null) => {
    out.failed += 1;
    out.firstFailure ??= reason;
  };

  const jobs: (() => Promise<void>)[] = [];

  for (const row of rows) {
    const id = row.applicationId.trim().toUpperCase();
    if (!id) continue;

    if (want.classify && `${row.currentBusiness} ${row.notes}`.trim() !== "") {
      jobs.push(async () => {
        out.attempted += 1;
        const { data, reason } = await askAi<ClassifyPayload>(
          "classify",
          classifyInput(row),
          options,
        );
        if (!data) return fail(reason);
        out.classifications.set(id, {
          category: data.category,
          evidenceQuote: data.evidence_quote,
          confidence: data.confidence,
          source: "ai",
        });
      });
    }

    // Nothing in the notes means nothing can contradict the form.
    if (want.contradictions && row.notes.trim() !== "") {
      jobs.push(async () => {
        out.attempted += 1;
        const { data, reason } = await askAi<ContradictionsPayload>(
          "contradictions",
          contradictionsInput(row),
          options,
        );
        if (!data) return fail(reason);
        out.contradictions.set(id, data.contradictions);
      });
    }
  }

  await pool(jobs, (job) => job());
  return out;
}
