"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AppShell } from "../../components/shell/AppShell";
import { Explain } from "../../components/decision/Explain";
import { RequireData } from "../../components/RequireData";
import {
  Card,
  EmptyState,
  NotStated,
  StatusChip,
  cn,
} from "../../components/ui/primitives";
import type { Applicant, PipelineResult, Status } from "../../lib/types";

const STATUSES: Status[] = ["APPROVED", "WAITLISTED", "ON HOLD", "REDIRECTED", "NOT PROCEEDING"];
type SortKey = "score" | "id" | "status";

function Select({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex items-center gap-1.5 text-sm">
      <span className="text-muted">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 rounded-md border border-line bg-surface px-2 text-sm"
      >
        <option value="">All</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}

function Table({ rows }: { rows: Applicant[] }) {
  return (
    <>
      {/* Desktop */}
      <table className="hidden w-full text-left text-sm sm:table">
        <thead className="border-b border-line text-xs text-muted">
          <tr>
            <th className="px-4 py-2 font-medium">Application</th>
            <th className="px-2 py-2 font-medium">Name</th>
            <th className="px-2 py-2 font-medium">City</th>
            <th className="px-2 py-2 font-medium">Pin</th>
            <th className="px-2 py-2 font-medium">Status</th>
            <th className="px-2 py-2 text-right font-medium">Score</th>
            <th className="px-4 py-2 font-medium">Why</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((a) => (
            <tr key={a.key} className="align-top hover:bg-stone-50">
              <td className="px-4 py-2">
                <Link
                  href={`/applicants/${encodeURIComponent(a.key)}`}
                  className="font-mono text-xs underline underline-offset-2"
                >
                  {a.applicationId}
                </Link>
                {a.isDuplicateHold ? (
                  <span className="ml-1 text-xs text-amber-700">dup</span>
                ) : null}
              </td>
              <td className="px-2 py-2">{a.normalised.applicantName ?? <NotStated />}</td>
              <td className="px-2 py-2">{a.normalised.city ?? <NotStated />}</td>
              <td className="px-2 py-2 font-mono text-xs">
                {a.normalised.pinCode ?? <NotStated />}
              </td>
              <td className="px-2 py-2">
                <StatusChip status={a.status} />
              </td>
              <td className="px-2 py-2 text-right tabular-nums">{a.score.total}</td>
              <td className="max-w-md px-4 py-2 text-muted">
                {a.reasonSentence}
                <Explain block>{a.reasonCode}</Explain>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Mobile */}
      <ul className="divide-y divide-line sm:hidden">
        {rows.map((a) => (
          <li key={a.key} className="space-y-1 px-4 py-3">
            <div className="flex items-center gap-2">
              <Link
                href={`/applicants/${encodeURIComponent(a.key)}`}
                className="font-mono text-xs underline underline-offset-2"
              >
                {a.applicationId}
              </Link>
              <StatusChip status={a.status} />
              <span className="ml-auto text-sm tabular-nums">{a.score.total}</span>
            </div>
            <p className="text-sm font-medium">{a.normalised.applicantName ?? <NotStated />}</p>
            <p className="text-xs text-muted">
              {a.normalised.city ?? "city not stated"} · pin {a.normalised.pinCode ?? "not stated"}
            </p>
            <p className="text-sm text-muted">{a.reasonSentence}</p>
            <Explain block>{a.reasonCode}</Explain>
          </li>
        ))}
      </ul>
    </>
  );
}

function Filters({ result }: { result: PipelineResult }) {
  const [status, setStatus] = useState("");
  const [territory, setTerritory] = useState("");
  const [city, setCity] = useState("");
  const [tier, setTier] = useState("");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("score");

  const cities = useMemo(
    () => [...new Set(result.applicants.map((a) => a.normalised.city).filter((c): c is string => !!c))].sort(),
    [result],
  );

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = result.applicants.filter(
      (a) =>
        (!status || a.status === status) &&
        (!territory || a.territoryId === territory) &&
        (!city || a.normalised.city === city) &&
        (!tier || a.tier === tier) &&
        (!q ||
          a.applicationId.toLowerCase().includes(q) ||
          (a.normalised.applicantName ?? "").toLowerCase().includes(q) ||
          (a.normalised.pinCode ?? "").includes(q)),
    );
    const sorted = [...filtered];
    if (sort === "score") sorted.sort((a, b) => b.score.total - a.score.total);
    if (sort === "id") sorted.sort((a, b) => a.applicationId.localeCompare(b.applicationId));
    if (sort === "status")
      sorted.sort(
        (a, b) => STATUSES.indexOf(a.status) - STATUSES.indexOf(b.status) || b.score.total - a.score.total,
      );
    return sorted;
  }, [result, status, territory, city, tier, query, sort]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search ID, name or pin"
          className="h-8 w-52 rounded-md border border-line bg-surface px-2.5 text-sm"
        />
        <Select label="Status" value={status} options={STATUSES} onChange={setStatus} />
        <Select
          label="Territory"
          value={territory}
          options={result.territories.map((t) => t.territoryId)}
          onChange={setTerritory}
        />
        <Select label="City" value={city} options={cities} onChange={setCity} />
        <Select label="Tier" value={tier} options={["Tier 1", "Tier 2", "Tier 3"]} onChange={setTier} />
        <label className="flex items-center gap-1.5 text-sm">
          <span className="text-muted">Sort</span>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="h-8 rounded-md border border-line bg-surface px-2 text-sm"
          >
            <option value="score">Score, highest first</option>
            <option value="status">Status</option>
            <option value="id">Application ID</option>
          </select>
        </label>
        <span className="ml-auto text-sm text-muted">
          {rows.length} of {result.applicants.length}
        </span>
      </div>

      <Card className={cn("overflow-hidden", rows.length === 0 && "border-dashed")}>
        {rows.length === 0 ? (
          <EmptyState
            title="Nothing matches those filters"
            body="Clear a filter to widen the search. Every application is still here — none were dropped."
          />
        ) : (
          <Table rows={rows} />
        )}
      </Card>
    </div>
  );
}

export default function Applicants() {
  return (
    <AppShell>
      <RequireData>
        {(result) => (
          <div className="space-y-4">
            <div>
              <h1 className="text-xl font-semibold tracking-tight">Applicants</h1>
              <p className="text-sm text-muted">
                Every row from the file, with the one-line reason for its decision. Open any row for
                the full rule trace.
              </p>
            </div>
            <Filters result={result} />
          </div>
        )}
      </RequireData>
    </AppShell>
  );
}
