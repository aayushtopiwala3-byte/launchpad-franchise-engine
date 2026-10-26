import type { AiCallType } from "./types";

/**
 * Published Gemini Flash rates, US dollars per million tokens. Only used to decide when
 * to stop calling, so an approximate figure is honest as long as it is labelled as one.
 */
const USD_PER_MILLION = { input: 0.3, output: 2.5 };

export const DEFAULT_COST_CEILING_USD = 0.5;

export interface CostEntry {
  at: string;
  callType: AiCallType;
  model: string;
  inputTokens: number;
  outputTokens: number;
  estimatedUsd: number;
  cached: boolean;
  ms: number;
}

export function estimateUsd(inputTokens: number, outputTokens: number): number {
  return (
    (inputTokens / 1_000_000) * USD_PER_MILLION.input +
    (outputTokens / 1_000_000) * USD_PER_MILLION.output
  );
}

export class CostLedger {
  private entries: CostEntry[] = [];

  constructor(readonly ceilingUsd: number = DEFAULT_COST_CEILING_USD) {}

  record(entry: CostEntry): void {
    this.entries.push(entry);
  }

  get totalUsd(): number {
    return this.entries.reduce((sum, e) => sum + e.estimatedUsd, 0);
  }

  get calls(): readonly CostEntry[] {
    return this.entries;
  }

  /** Checked before each call, so the ceiling can never be crossed by more than one call. */
  get exhausted(): boolean {
    return this.totalUsd >= this.ceilingUsd;
  }

  reset(): void {
    this.entries = [];
  }
}
