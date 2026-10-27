"use client";

import { LEAD_STAGES } from "../../lib/crm/types";
import { MILESTONES } from "../../lib/onboarding/config";
import { useFilters } from "../../lib/state/filters";
import { useStore } from "../../lib/state/store";
import type { Status } from "../../lib/types";
import { Button, Select, TextInput, cn } from "../ui/primitives";

const STATUSES: Status[] = ["APPROVED", "WAITLISTED", "ON HOLD", "REDIRECTED", "NOT PROCEEDING"];

export type Facet =
  | "query"
  | "city"
  | "territory"
  | "status"
  | "leadStage"
  | "onboardingStage"
  | "owner"
  | "priority"
  | "dates";

/**
 * The filter state lives above the router, so the city picked here is still picked after
 * clicking through to an applicant and back. Each workspace shows only the facets that mean
 * something to it; they all read and write the same object.
 */
export function FilterBar({
  facets,
  searchPlaceholder = "Search…",
}: {
  facets: Facet[];
  searchPlaceholder?: string;
}) {
  const { filters, set, reset, activeCount } = useFilters();
  const { result, leads } = useStore();

  const show = (f: Facet) => facets.includes(f);

  const cities = Array.from(
    new Set([
      ...(result?.territories.map((t) => t.city).filter(Boolean) ?? []),
      ...leads.map((l) => l.city).filter(Boolean),
    ] as string[]),
  ).sort();

  const owners = Array.from(
    new Set(leads.map((l) => l.assignedTo).filter(Boolean) as string[]),
  ).sort();

  return (
    <div className="flex flex-wrap items-end gap-2 rounded-xl border border-line bg-surface px-3 py-2.5">
      {show("query") ? (
        <div className="min-w-48 flex-1">
          <TextInput
            type="search"
            aria-label="Search"
            placeholder={searchPlaceholder}
            value={filters.query}
            onChange={(e) => set("query", e.target.value)}
          />
        </div>
      ) : null}

      {show("city") ? (
        <Select
          aria-label="City"
          className="w-auto"
          value={filters.city ?? ""}
          onChange={(e) => set("city", e.target.value || null)}
        >
          <option value="">All cities</option>
          {cities.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </Select>
      ) : null}

      {show("territory") ? (
        <Select
          aria-label="Territory"
          className="w-auto"
          value={filters.territoryId ?? ""}
          onChange={(e) => set("territoryId", e.target.value || null)}
        >
          <option value="">All territories</option>
          {(result?.territories ?? []).map((t) => (
            <option key={t.territoryId} value={t.territoryId}>
              {t.territoryId}
            </option>
          ))}
        </Select>
      ) : null}

      {show("status") ? (
        <Select
          aria-label="Application status"
          className="w-auto"
          value={filters.status ?? ""}
          onChange={(e) => set("status", (e.target.value || null) as Status | null)}
        >
          <option value="">All decisions</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </Select>
      ) : null}

      {show("leadStage") ? (
        <Select
          aria-label="Acquisition stage"
          className="w-auto"
          value={filters.leadStage ?? ""}
          onChange={(e) => set("leadStage", e.target.value || null)}
        >
          <option value="">All acquisition stages</option>
          {LEAD_STAGES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </Select>
      ) : null}

      {show("onboardingStage") ? (
        <Select
          aria-label="Onboarding milestone"
          className="w-auto"
          value={filters.onboardingStage ?? ""}
          onChange={(e) => set("onboardingStage", e.target.value || null)}
        >
          <option value="">All milestones</option>
          {MILESTONES.map((m) => (
            <option key={m.key} value={m.key}>
              {m.number}. {m.title}
            </option>
          ))}
        </Select>
      ) : null}

      {show("owner") ? (
        <Select
          aria-label="Assigned owner"
          className="w-auto"
          value={filters.owner ?? ""}
          onChange={(e) => set("owner", e.target.value || null)}
        >
          <option value="">All owners</option>
          {owners.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </Select>
      ) : null}

      {show("priority") ? (
        <Select
          aria-label="Territory priority"
          className="w-auto"
          value={filters.priority ?? ""}
          onChange={(e) => set("priority", e.target.value || null)}
        >
          <option value="">All priorities</option>
          {["High", "Medium", "Low"].map((p) => (
            <option key={p} value={p}>
              {p} priority
            </option>
          ))}
        </Select>
      ) : null}

      {show("dates") ? (
        <div className="flex items-center gap-1.5">
          <TextInput
            type="date"
            aria-label="From date"
            className="w-auto"
            value={filters.from ?? ""}
            onChange={(e) => set("from", e.target.value || null)}
          />
          <span className="text-xs text-muted">to</span>
          <TextInput
            type="date"
            aria-label="To date"
            className="w-auto"
            value={filters.to ?? ""}
            onChange={(e) => set("to", e.target.value || null)}
          />
        </div>
      ) : null}

      <Button
        size="sm"
        variant="ghost"
        onClick={reset}
        disabled={activeCount === 0}
        className={cn("ml-auto", activeCount === 0 && "opacity-50")}
      >
        Reset{activeCount > 0 ? ` (${activeCount})` : ""}
      </Button>
    </div>
  );
}
