import { EMBEDDED_STORES } from "../reference";
import type { ExistingStore } from "../types";

/** The sample workbook ships the same ten stores the app embeds, so the two agree. */
export const SEED_STORES: ExistingStore[] = EMBEDDED_STORES.map((s) => ({ ...s, source: "uploaded" }));
