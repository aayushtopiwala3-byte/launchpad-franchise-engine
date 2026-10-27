"use client";

// One filter set, shared by every workspace and held above the router, so moving from the
// command centre to the applicant list keeps the city you picked. It is deliberately NOT
// persisted: a filter is a view of a session, and a stale filter restored days later is the
// kind of thing that makes someone believe a list is empty when it is not.

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import type { Status } from "../types";

export interface Filters {
  city: string | null;
  territoryId: string | null;
  status: Status | null;
  leadStage: string | null;
  onboardingStage: string | null;
  owner: string | null;
  priority: string | null;
  from: string | null;
  to: string | null;
  query: string;
}

export const EMPTY_FILTERS: Filters = {
  city: null,
  territoryId: null,
  status: null,
  leadStage: null,
  onboardingStage: null,
  owner: null,
  priority: null,
  from: null,
  to: null,
  query: "",
};

export function activeFilterCount(f: Filters): number {
  return Object.entries(f).filter(([k, v]) =>
    k === "query" ? v !== "" : v !== null,
  ).length;
}

interface FilterValue {
  filters: Filters;
  set: <K extends keyof Filters>(key: K, value: Filters[K]) => void;
  reset: () => void;
  activeCount: number;
}

const FilterContext = createContext<FilterValue | null>(null);

export function FilterProvider({ children }: { children: ReactNode }) {
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const set = useCallback(<K extends keyof Filters>(key: K, value: Filters[K]) => {
    setFilters((f) => ({ ...f, [key]: value }));
  }, []);
  const reset = useCallback(() => setFilters(EMPTY_FILTERS), []);
  const value = useMemo(
    () => ({ filters, set, reset, activeCount: activeFilterCount(filters) }),
    [filters, set, reset],
  );
  return <FilterContext.Provider value={value}>{children}</FilterContext.Provider>;
}

export function useFilters(): FilterValue {
  const value = useContext(FilterContext);
  if (!value) throw new Error("useFilters must be used inside <FilterProvider>.");
  return value;
}

/** Shared date test. An absent timestamp is never excluded by a date range — it is unknown. */
export function withinRange(iso: string | null, from: string | null, to: string | null): boolean {
  if (!iso) return true;
  const day = iso.slice(0, 10);
  if (from && day < from) return false;
  if (to && day > to) return false;
  return true;
}
