import type {
  Applicant,
  Competitor,
  DecisionTraceEntry,
  ExistingStore,
  Status,
  Territory,
} from "../types";
import type { GateOutcome } from "./gates";

const PRIORITY_ORDER = { High: 0, Medium: 1, Low: 2 } as const;

export interface AllocationCandidate {
  key: string;
  applicationId: string;
  territoryId: string | null;
  city: string | null;
  pin: string | null;
  score: number;
  spaceReadinessPoints: number;
  investment: number;
  isReady: boolean;
  isDuplicateHold: boolean;
  gateFailure: GateOutcome["failure"];
  /** False when the applicant's location is unconfirmed, so no pin may be held for them. */
  eligibleForReservation: boolean;
}

export interface AllocationOutcome {
  status: Status;
  rank: number | null;
  assignedPin: string | null;
  reservedUntil: string | null;
  suggestedPins: string[];
  trace: DecisionTraceEntry[];
  competitors: Competitor[];
  /** Applicant who took the pin this candidate wanted, if any. */
  pinTakenBy: string | null;
}

export interface AllocationResult {
  byKey: Map<string, AllocationOutcome>;
  territories: Territory[];
}

/** Sort key for ranking: score desc, space readiness desc, investment desc, Application ID asc. */
function rankCompare(a: AllocationCandidate, b: AllocationCandidate): number {
  if (a.score !== b.score) return b.score - a.score;
  if (a.spaceReadinessPoints !== b.spaceReadinessPoints)
    return b.spaceReadinessPoints - a.spaceReadinessPoints;
  if (a.investment !== b.investment) return b.investment - a.investment;
  return a.applicationId < b.applicationId ? -1 : a.applicationId > b.applicationId ? 1 : 0;
}

function whyRankedHigher(higher: AllocationCandidate, lower: AllocationCandidate): string {
  if (higher.score !== lower.score)
    return `Scored ${higher.score} against ${lower.score}.`;
  if (higher.spaceReadinessPoints !== lower.spaceReadinessPoints)
    return `Tied on ${higher.score} points; ahead on space readiness (${higher.spaceReadinessPoints} against ${lower.spaceReadinessPoints}).`;
  if (higher.investment !== lower.investment)
    return `Tied on score and space readiness; ahead on investment (${higher.investment} lakh against ${lower.investment} lakh).`;
  return `Tied on every measure; ordered by Application ID (${higher.applicationId} before ${lower.applicationId}).`;
}

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function allocate(
  candidates: AllocationCandidate[],
  territories: Territory[],
  stores: ExistingStore[],
  asOfDate: string,
  reservationWindowDays: number,
): AllocationResult {
  const byKey = new Map<string, AllocationOutcome>();
  const blank = (): AllocationOutcome => ({
    status: "ON HOLD",
    rank: null,
    assignedPin: null,
    reservedUntil: null,
    suggestedPins: [],
    trace: [],
    competitors: [],
    pinTakenBy: null,
  });
  for (const c of candidates) byKey.set(c.key, blank());

  /** Every pin that is spoken for, and by whom. Enforces one store per pin. */
  const claimed = new Map<string, { kind: "store" | "approved" | "reserved"; id: string }>();
  for (const s of stores) claimed.set(s.pinCode, { kind: "store", id: s.storeId });

  const territoryById = new Map(territories.map((t) => [t.territoryId, t]));
  const remainingCapacity = new Map<string, number>();
  for (const t of territories) remainingCapacity.set(t.territoryId, t.usableCapacity);

  // --- Step 1: gate failures and non-ready applicants settle first. ---
  const pendingGateRedirect: AllocationCandidate[] = [];
  for (const c of candidates) {
    const o = byKey.get(c.key)!;

    if (c.isDuplicateHold) {
      o.status = "ON HOLD";
      o.trace.push({
        ruleId: "DQ-08",
        description: "Duplicate Application ID held for confirmation",
        values: { "Application ID": c.applicationId },
        outcome: "ON HOLD, excluded from allocation so it cannot take a pin from the original row.",
      });
      continue;
    }

    if (c.gateFailure) {
      const f = c.gateFailure;
      if (f.want === "reject") {
        o.status = "NOT PROCEEDING";
        o.trace.push({
          ruleId: f.ruleId,
          description: "Hard gate failed with no fixable path now",
          values: {},
          outcome: `NOT PROCEEDING — ${f.reason}`,
        });
      } else if (f.want === "hold") {
        o.status = "ON HOLD";
        o.trace.push({
          ruleId: f.ruleId,
          description: "Hard gate failed but the block is resolvable",
          values: {},
          outcome: `ON HOLD — ${f.reason}`,
        });
      } else {
        // Resolved after allocation, so the pins we name are genuinely still free.
        pendingGateRedirect.push(c);
        o.trace.push({
          ruleId: f.ruleId,
          description: "Applicant's own pin cannot take a store",
          values: {},
          outcome: `Looking for a free pin nearby — ${f.reason}`,
        });
      }
      continue;
    }

    if (!c.isReady) {
      o.status = "ON HOLD";
      continue;
    }
  }

  // --- Step 2: territory loop, Pass A then Pass B. ---
  const ordered = [...territories].sort((a, b) => {
    const pa = a.priority ? PRIORITY_ORDER[a.priority] : 3;
    const pb = b.priority ? PRIORITY_ORDER[b.priority] : 3;
    if (pa !== pb) return pa - pb;
    return a.territoryId < b.territoryId ? -1 : a.territoryId > b.territoryId ? 1 : 0;
  });

  const readyByTerritory = new Map<string, AllocationCandidate[]>();
  for (const c of candidates) {
    if (!c.isReady || c.gateFailure || c.isDuplicateHold || !c.territoryId) continue;
    const list = readyByTerritory.get(c.territoryId) ?? [];
    list.push(c);
    readyByTerritory.set(c.territoryId, list);
  }

  for (const t of ordered) {
    const ready = (readyByTerritory.get(t.territoryId) ?? []).sort(rankCompare);
    const pendingRelocate: AllocationCandidate[] = [];

    // Competitors: everyone ready in the same territory, flagged when they share a pin.
    for (const c of ready) {
      const o = byKey.get(c.key)!;
      o.competitors = ready
        .filter((x) => x.key !== c.key)
        .map((x): Competitor => {
          const xIsHigher = rankCompare(x, c) < 0;
          return {
            applicationId: x.applicationId,
            applicantName: null,
            pinCode: x.pin,
            score: x.score,
            status: "APPROVED",
            samePin: x.pin !== null && x.pin === c.pin,
            whyRankedHigher: xIsHigher ? whyRankedHigher(x, c) : null,
          };
        });
    }

    // PASS A
    ready.forEach((c, index) => {
      const o = byKey.get(c.key)!;
      o.rank = index + 1;
      const capacity = remainingCapacity.get(t.territoryId) ?? 0;

      if (capacity === 0) {
        o.status = "WAITLISTED";
        const ahead = ready.slice(0, index);
        o.trace.push({
          ruleId: "A-01",
          description: "Pass A — capacity already exhausted when this applicant was reached",
          values: {
            Territory: t.territoryId,
            "Usable capacity": t.usableCapacity,
            Rank: index + 1,
            "Ready applicants ahead": ahead.length,
          },
          outcome: `WAITLISTED at rank ${index + 1} of ${ready.length}. ${t.territoryId} has ${t.usableCapacity} usable slot${t.usableCapacity === 1 ? "" : "s"} and ${ahead.length} applicant${ahead.length === 1 ? "" : "s"} ranked ahead.`,
          competitorId: ahead.length > 0 ? ahead[ahead.length - 1].applicationId : undefined,
        });
        return;
      }

      const holder = c.pin ? claimed.get(c.pin) : undefined;
      if (c.pin && !holder) {
        claimed.set(c.pin, { kind: "approved", id: c.applicationId });
        remainingCapacity.set(t.territoryId, capacity - 1);
        o.status = "APPROVED";
        o.assignedPin = c.pin;
        o.trace.push({
          ruleId: "A-01",
          description: "Pass A — slot claimed at the applicant's own pin",
          values: {
            Territory: t.territoryId,
            Pin: c.pin,
            Rank: index + 1,
            "Capacity before": capacity,
            "Capacity after": capacity - 1,
          },
          outcome: `APPROVED and pin ${c.pin} claimed.`,
        });
      } else {
        o.pinTakenBy = holder ? holder.id : null;
        pendingRelocate.push(c);
        o.trace.push({
          ruleId: "A-01",
          description: "Pass A — the applicant's own pin was already taken",
          values: { Pin: c.pin, "Taken by": holder ? holder.id : null, Rank: index + 1 },
          outcome: `Held for Pass B. Pin ${c.pin} is held by ${holder ? holder.id : "another party"}.`,
          competitorId: holder && holder.kind !== "store" ? holder.id : undefined,
        });
      }
    });

    // PASS B
    for (const c of pendingRelocate) {
      const o = byKey.get(c.key)!;
      const remaining = t.pins.filter(
        (p) => !t.cededPins.includes(p) && !claimed.has(p),
      );
      if (remaining.length > 0) {
        o.status = "REDIRECTED";
        o.suggestedPins = remaining;
        o.trace.push({
          ruleId: "A-02",
          description: "Pass B — free pins remain in the same territory",
          values: { Territory: t.territoryId, "Free pins": remaining.join(", ") },
          outcome: `REDIRECTED to ${remaining.join(" or ")} in ${t.territoryId}. This is advice only: it takes no slot and holds no pin.`,
        });
        continue;
      }

      const elsewhere = findCityAlternatives(c.city, t.territoryId, territories, claimed, remainingCapacity, true);
      if (elsewhere.pins.length > 0) {
        o.status = "REDIRECTED";
        o.suggestedPins = elsewhere.pins;
        o.trace.push({
          ruleId: "A-02",
          description: "Pass B — no pin left here, but another territory in the same city has room",
          values: { "Other territories": elsewhere.territoryIds.join(", "), "Free pins": elsewhere.pins.join(", ") },
          outcome: `REDIRECTED to ${elsewhere.pins.join(" or ")} in ${elsewhere.territoryIds.join(", ")}. Advice only: no slot taken, no pin held.`,
        });
        continue;
      }

      o.status = "WAITLISTED";
      o.trace.push({
        ruleId: "A-02",
        description: "Pass B — no free pin anywhere in this city",
        values: { Territory: t.territoryId, City: c.city },
        outcome: `WAITLISTED at rank ${o.rank}. There is no free pin code left in ${c.city} to point them at.`,
      });
    }
  }

  // --- Step 3: gate-level redirects (G-03 / G-04), now that approvals are settled. ---
  for (const c of pendingGateRedirect) {
    const o = byKey.get(c.key)!;
    const own = c.territoryId ? territoryById.get(c.territoryId) : undefined;
    const inOwn = own
      ? own.pins.filter((p) => !own.cededPins.includes(p) && !claimed.has(p))
      : [];
    const elsewhere = findCityAlternatives(c.city, c.territoryId, territories, claimed, remainingCapacity, false);
    const pins = [...new Set([...inOwn, ...elsewhere.pins])];

    if (pins.length > 0) {
      o.status = "REDIRECTED";
      o.suggestedPins = pins;
      o.pinTakenBy = c.pin ? (claimed.get(c.pin)?.id ?? null) : null;
      o.trace.push({
        ruleId: "A-02",
        description: "Free pin codes exist nearby, so this is advice rather than a rejection",
        values: { "Free pins": pins.join(", "), City: c.city },
        outcome: `REDIRECTED to ${pins.join(" or ")}. Advice only: no slot taken, no pin held.`,
      });
    } else {
      // Nothing to point at. The spec says WAITLISTED rather than REDIRECTED.
      o.status = "WAITLISTED";
      o.trace.push({
        ruleId: "A-02",
        description: "No free pin code exists to redirect to",
        values: { City: c.city },
        outcome: `WAITLISTED. REDIRECTED needs a named free pin to point at, and there is none in ${c.city}.`,
      });
    }
  }

  // --- Step 4: Pass C provisional reservations, per territory, in the same order. ---
  const reservedUntil = addDays(asOfDate, reservationWindowDays);
  for (const t of ordered) {
    const holds = candidates
      .filter(
        (c) =>
          c.territoryId === t.territoryId &&
          byKey.get(c.key)!.status === "ON HOLD" &&
          c.eligibleForReservation &&
          !c.isDuplicateHold,
      )
      .sort(rankCompare);

    for (const c of holds) {
      const o = byKey.get(c.key)!;
      const capacity = remainingCapacity.get(t.territoryId) ?? 0;
      if (capacity <= 0) {
        o.trace.push({
          ruleId: "A-03",
          description: "Pass C — no capacity left for a provisional reservation",
          values: { Territory: t.territoryId, "Capacity left": 0 },
          outcome: `No pin reserved. ${t.territoryId} has no slot free to hold. A reservation becomes available if a slot frees up.`,
        });
        continue;
      }
      const holder = c.pin ? claimed.get(c.pin) : undefined;
      if (c.pin && !holder) {
        claimed.set(c.pin, { kind: "reserved", id: c.applicationId });
        remainingCapacity.set(t.territoryId, capacity - 1);
        o.reservedUntil = reservedUntil;
        o.assignedPin = null;
        o.trace.push({
          ruleId: "A-03",
          description: "Pass C — pin reserved provisionally while the block is cleared",
          values: { Pin: c.pin, "Reserved until": reservedUntil, Territory: t.territoryId },
          outcome: `Pin ${c.pin} held for this applicant until ${reservedUntil}. It is released automatically after that date.`,
        });
      } else {
        o.pinTakenBy = holder ? holder.id : null;
        o.trace.push({
          ruleId: "A-03",
          description: "Pass C — the applicant's own pin is already held",
          values: { Pin: c.pin, "Held by": holder ? holder.id : null },
          outcome: `No reservation: pin ${c.pin} is taken by ${holder ? holder.id : "another party"}. A reservation becomes available if a slot frees.`,
          competitorId: holder && holder.kind !== "store" ? holder.id : undefined,
        });
      }
    }
  }

  // --- Step 5: write the final pin map back onto the territories. ---
  for (const t of territories) {
    t.pinHolders = {};
    for (const p of t.pins) {
      if (t.cededPins.includes(p)) continue;
      const h = claimed.get(p);
      if (h) t.pinHolders[p] = h;
    }
    t.freePins = t.pins.filter((p) => !t.cededPins.includes(p) && !claimed.has(p));
    const ready = (readyByTerritory.get(t.territoryId) ?? []).sort(rankCompare);
    t.queue = ready.map((c, i) => ({
      applicationId: c.applicationId,
      score: c.score,
      status: byKey.get(c.key)!.status,
      rank: i + 1,
    }));
    const capacityLeft = remainingCapacity.get(t.territoryId) ?? 0;
    t.unfilledSlotBlocker =
      capacityLeft > 0
        ? ready.length === 0
          ? `${capacityLeft} slot${capacityLeft === 1 ? "" : "s"} still open and no applicant here passes all the checks yet.`
          : `${capacityLeft} slot${capacityLeft === 1 ? "" : "s"} still open with no further ready applicant at a free pin code.`
        : null;
  }

  return { byKey, territories };
}

/**
 * Pass B's cross-city hop needs a free pin *and* a slot, because the applicant is
 * competing for capacity. A gate redirect needs only a free pin: the applicant's own
 * pin can never take a store, so naming where they could apply instead is advice
 * rather than a claim on a slot.
 */
function findCityAlternatives(
  city: string | null,
  excludeTerritoryId: string | null,
  territories: Territory[],
  claimed: Map<string, { kind: string; id: string }>,
  remainingCapacity: Map<string, number>,
  requireCapacity: boolean,
): { pins: string[]; territoryIds: string[] } {
  if (!city) return { pins: [], territoryIds: [] };
  const pins: string[] = [];
  const territoryIds: string[] = [];
  const others = territories
    .filter((t) => t.city === city && t.territoryId !== excludeTerritoryId)
    .sort((a, b) => (a.territoryId < b.territoryId ? -1 : 1));
  for (const t of others) {
    if (requireCapacity && (remainingCapacity.get(t.territoryId) ?? 0) <= 0) continue;
    const free = t.pins.filter((p) => !t.cededPins.includes(p) && !claimed.has(p));
    if (free.length === 0) continue;
    pins.push(...free);
    territoryIds.push(t.territoryId);
  }
  return { pins: [...new Set(pins)], territoryIds };
}

/**
 * FINAL INVARIANT: no pin code may be claimed or reserved by more than one party,
 * counting existing stores. Throwing here rolls the whole run back.
 */
export function assertOneStorePerPin(
  applicants: Applicant[],
  stores: ExistingStore[],
): void {
  const holder = new Map<string, string>();
  for (const s of stores) {
    if (holder.has(s.pinCode)) {
      throw new Error(
        `One-store-per-pin invariant violated: pin ${s.pinCode} is held by both ${holder.get(s.pinCode)} and store ${s.storeId}.`,
      );
    }
    holder.set(s.pinCode, `store ${s.storeId}`);
  }
  for (const a of applicants) {
    const pin = a.assignedPin ?? (a.reservedUntil ? a.normalised.pinCode : null);
    if (!pin) continue;
    const existing = holder.get(pin);
    if (existing) {
      throw new Error(
        `One-store-per-pin invariant violated: pin ${pin} is held by both ${existing} and ${a.applicationId}.`,
      );
    }
    holder.set(pin, a.applicationId);
  }
}
