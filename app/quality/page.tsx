"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AppShell } from "../../components/shell/AppShell";
import { ExportButton } from "../../components/ExportButton";
import { RequireData } from "../../components/RequireData";
import {
  Button,
  Card,
  CardHeader,
  EmptyState,
  NotStated,
  RuleTag,
  SeverityChip,
  Stat,
} from "../../components/ui/primitives";
import { SEVERITY_ORDER, compareIssues } from "../../lib/export/workbook";
import type { PipelineResult, QualityIssue, Severity } from "../../lib/types";

type Filter = Severity | "all";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "Everything" },
  { key: "blocking", label: "Blocking" },
  { key: "warning", label: "Warnings" },
  { key: "info", label: "For information" },
];

const SEVERITY_MEANING: Record<Severity, string> = {
  blocking: "The decision cannot be trusted until this is answered.",
  warning: "The decision stands, but somebody should look at this.",
  info: "A value was read in a particular way and it is worth saying so.",
};

/** Applications are the only subject with a card to open. */
const linkFor = (issue: QualityIssue, result: PipelineResult): string | null =>
  result.applicants.some((a) => a.applicationId === issue.subjectId)
    ? `/applicants/${encodeURIComponent(issue.subjectId)}`
    : null;

function Quality({ result }: { result: PipelineResult }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");

  const sorted = useMemo(() => [...result.issues].sort(compareIssues), [result.issues]);

  const counts = useMemo(
    () =>
      Object.fromEntries(
        SEVERITY_ORDER.map((s) => [s, sorted.filter((i) => i.severity === s).length]),
      ) as Record<Severity, number>,
    [sorted],
  );

  const byRule = useMemo(() => {
    const map = new Map<string, { severity: Severity; count: number }>();
    for (const i of sorted) {
      const seen = map.get(i.id);
      map.set(i.id, { severity: i.severity, count: (seen?.count ?? 0) + 1 });
    }
    return [...map.entries()].sort((a, b) => b[1].count - a[1].count || a[0].localeCompare(b[0]));
  }, [sorted]);

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return sorted.filter(
      (i) =>
        (filter === "all" || i.severity === filter) &&
        (needle === "" ||
          `${i.id} ${i.subjectId} ${i.column} ${i.message} ${i.originalValue ?? ""}`
            .toLowerCase()
            .includes(needle)),
    );
  }, [sorted, filter, query]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Data quality</h1>
          <p className="text-sm text-muted">
            Every value the file did not state plainly, where it sits in your sheet, and what was
            done about it. Nothing here was guessed.
          </p>
        </div>
        <ExportButton />
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Findings" value={result.issues.length} hint="Across every sheet" />
        {SEVERITY_ORDER.map((s) => (
          <Stat
            key={s}
            label={s === "info" ? "For information" : s === "warning" ? "Warnings" : "Blocking"}
            value={counts[s]}
            hint={SEVERITY_MEANING[s]}
            tone={s === "blocking" && counts[s] > 0 ? "bad" : s === "warning" && counts[s] > 0 ? "warn" : "default"}
          />
        ))}
      </div>

      {byRule.length > 0 ? (
        <Card>
          <CardHeader
            title="Which checks fired"
            subtitle="Commonest first. One row in your sheet can trip several checks."
          />
          <ul className="flex flex-wrap gap-2 px-4 py-3">
            {byRule.map(([id, { severity, count }]) => (
              <li key={id} className="flex items-center gap-1.5 rounded border border-line px-2 py-1">
                <RuleTag id={id} />
                <SeverityChip severity={severity} />
                <span className="text-sm tabular-nums">{count}</span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <Card>
        <CardHeader
          title="The findings"
          subtitle="Blocking first, then by sheet and row — the order you would work through them."
          action={
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter by ID, column or wording"
              className="w-56 rounded-md border border-line px-2.5 py-1.5 text-sm"
            />
          }
        />

        <div className="flex flex-wrap gap-1.5 border-b border-line px-4 py-2.5">
          {FILTERS.map((f) => (
            <Button
              key={f.key}
              size="sm"
              variant={filter === f.key ? "primary" : "ghost"}
              onClick={() => setFilter(f.key)}
            >
              {f.label}
              {f.key === "all" ? ` (${sorted.length})` : ` (${counts[f.key]})`}
            </Button>
          ))}
        </div>

        {shown.length === 0 ? (
          <EmptyState
            title={result.issues.length === 0 ? "Nothing to report" : "Nothing matches that"}
            body={
              result.issues.length === 0
                ? "Every row read cleanly. No value had to be interpreted and nothing was left unstated."
                : "Clear the filter to see the rest."
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-line bg-stone-50 text-xs text-muted">
                <tr>
                  <th className="px-4 py-2 font-medium">Severity</th>
                  <th className="px-2 py-2 font-medium">Rule</th>
                  <th className="px-2 py-2 font-medium">Where in your file</th>
                  <th className="px-2 py-2 font-medium">Original value</th>
                  <th className="px-2 py-2 font-medium">What we found</th>
                  <th className="px-4 py-2 font-medium">What we did</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line align-top">
                {shown.map((i, index) => {
                  const href = linkFor(i, result);
                  return (
                    <tr key={`${i.id}-${i.sheet}-${i.row}-${i.column}-${index}`}>
                      <td className="px-4 py-2">
                        <SeverityChip severity={i.severity} />
                      </td>
                      <td className="px-2 py-2">
                        <RuleTag id={i.id} />
                      </td>
                      <td className="px-2 py-2 text-muted">
                        <span className="block">
                          {i.sheet}, row {i.row}
                        </span>
                        <span className="block text-xs">{i.column}</span>
                        <span className="block text-xs">
                          {href ? (
                            <Link href={href} className="font-mono underline underline-offset-2">
                              {i.subjectId}
                            </Link>
                          ) : (
                            <span className="font-mono">{i.subjectId}</span>
                          )}
                        </span>
                      </td>
                      <td className="px-2 py-2 font-mono text-xs">
                        {i.originalValue === null || i.originalValue === "" ? (
                          <NotStated />
                        ) : (
                          i.originalValue
                        )}
                      </td>
                      <td className="px-2 py-2">{i.message}</td>
                      <td className="px-4 py-2 text-muted">{i.actionTaken}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

export default function QualityPage() {
  return (
    <AppShell>
      <RequireData>{(result) => <Quality result={result} />}</RequireData>
    </AppShell>
  );
}
