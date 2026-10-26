import { describe, expect, it } from "vitest";
import type { Contradiction } from "../../lib/engine/quality";
import { appRow, run, statusOf, terRow } from "../helpers";

/** A note the deterministic twin is guaranteed to catch: a search that cannot be ongoing. */
const SEARCHING = "Still looking for a shop near the market.";

const flagsFor = (result: ReturnType<typeof run>, id: string) =>
  result.issues.filter((i) => i.subjectId === id || i.id === "DQ-13");

describe("AI enrichment folded into the pipeline", () => {
  const apps = [appRow({ applicationId: "APP-900", spaceAvailable: "Rented", notes: SEARCHING })];
  const territories = [terRow()];

  it("finds the contradiction with no AI at all", () => {
    const result = run(apps, territories);
    expect(result.issues.some((i) => i.id === "DQ-13")).toBe(true);
    expect(statusOf(result, "APP-900")).toBe("ON HOLD");
  });

  it("reaches the same verdict when the AI agrees", () => {
    const ai = new Map<string, Contradiction[]>([
      [
        "APP-900",
        [{ field: "Space available", quote: SEARCHING, explanation: "They are still searching." }],
      ],
    ]);
    const withAi = run(apps, territories, { contradictions: ai });
    expect(statusOf(withAi, "APP-900")).toBe("ON HOLD");
    // One finding per field, so an agreeing AI must not double-report it.
    expect(withAi.issues.filter((i) => i.id === "DQ-13")).toHaveLength(1);
  });

  it("keeps the deterministic finding when the AI returns nothing", () => {
    const silent = new Map<string, Contradiction[]>([["APP-900", []]]);
    const withAi = run(apps, territories, { contradictions: silent });
    const without = run(apps, territories);
    expect(statusOf(withAi, "APP-900")).toBe(statusOf(without, "APP-900"));
    expect(flagsFor(withAi, "APP-900")).toEqual(flagsFor(without, "APP-900"));
  });

  it("lets the AI add a finding the twin could not see", () => {
    const ai = new Map<string, Contradiction[]>([
      [
        "APP-900",
        [{ field: "Investment", quote: "budget has halved", explanation: "Halved since filing." }],
      ],
    ]);
    const withAi = run(apps, territories, { contradictions: ai });
    const fields = withAi.issues.filter((i) => i.id === "DQ-13").map((i) => i.column);
    expect(fields).toHaveLength(2);
    expect(fields.join(" ")).toContain("Investment");
  });
});
