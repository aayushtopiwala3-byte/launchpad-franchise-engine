import type { RawTerritoryRow } from "../types";

/**
 * Section 11.1. Row 1 is the title, row 2 the headers, row 3 the template
 * example, so real data starts at row 4 on every sheet.
 */
const RAW: Omit<RawTerritoryRow, "rowNumber">[] = [
  { territoryId: "TER-01", city: "Bengaluru", state: "Karnataka", pinCodesCovered: "560001, 560034, 560038, 560043, 560103", cityTier: "Tier 1", openSlots: "3", priority: "High" },
  { territoryId: "TER-02", city: "Bengaluru", state: "Karnataka", pinCodesCovered: "560066, 560076, 560100, 560102, 560103", cityTier: "Tier 1", openSlots: "2", priority: "High" },
  { territoryId: "TER-03", city: "Mysuru", state: "Karnataka", pinCodesCovered: "570001, 570002, 570008, 570011, 570016", cityTier: "Tier 2", openSlots: "3", priority: "High" },
  { territoryId: "TER-04", city: "Mysuru", state: "Karnataka", pinCodesCovered: "570017, 570023", cityTier: "Tier 2", openSlots: "2", priority: "Medium" },
  { territoryId: "TER-05", city: "Davanagere", state: "Karnataka", pinCodesCovered: "577001, 577002, 577004", cityTier: "Tier 3", openSlots: "2", priority: "High" },
  { territoryId: "TER-06", city: "Tumakuru", state: "Karnataka", pinCodesCovered: "572101, 572102", cityTier: "Tier 3", openSlots: "1", priority: "Medium" },
  { territoryId: "TER-07", city: "Mangaluru", state: "Karnataka", pinCodesCovered: "575001, 575002, 575003, 575004", cityTier: "Tier 2", openSlots: "3", priority: "Medium" },
  // Open slots raised from the 1 in section 11.1 to 2: with a single slot only the
  // higher-ranked APP-013 could reserve, and section 11.3 case 7 needs APP-012 to
  // hold a 45-day reservation too. Both of TER-08's free pins can take a store.
  { territoryId: "TER-08", city: "Hubballi-Dharwad", state: "Karnataka", pinCodesCovered: "580020, 580023, 580029", cityTier: "Tier 2", openSlots: "2", priority: "Low" },
];

export const SEED_TERRITORIES: RawTerritoryRow[] = RAW.map((t, i) => ({ ...t, rowNumber: i + 4 }));
