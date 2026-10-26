"use client";

import { useState } from "react";
import { useStore } from "../lib/state/store";
import { Button, Card, CardHeader, SeverityChip, Stat } from "./ui/primitives";
import type { QualityIssue } from "../lib/types";

const SEVERITIES: QualityIssue["severity"][] = ["blocking", "warning", "info"];

export function ProcessingPanel() {
  const { parseReport, result, includeExampleRow, setIncludeExampleRow, busy } = useStore();
  const [showNormalisations, setShowNormalisations] = useState(false);

  if (!parseReport || !result) return null;

  const log = result.normalisationLog;
  const bySeverity = SEVERITIES.map((severity) => ({
    severity,
    count: result.issues.filter((i) => i.severity === severity).length,
  }));
  const excluded = parseReport.exampleRowsExcluded;

  return (
    <Card>
      <CardHeader
        title="What was read from the file"
        subtitle={`${parseReport.fileName} — this is everything the parser did before any rule ran.`}
      />

      <div className="space-y-4 px-4 py-3">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Applications" value={result.applicants.length} />
          <Stat label="Territories" value={result.territories.length} />
          <Stat label="Normalisations" value={log.length} />
          <Stat label="Processed in" value={`${parseReport.processedMs} ms`} />
        </div>

        <div>
          <h3 className="text-xs font-medium text-muted">Sheets</h3>
          <ul className="mt-1 space-y-1 text-sm">
            {parseReport.sheetsFound.map((s) => (
              <li key={s.requested}>
                <span className="font-medium">{s.requested}</span>
                {s.matchedAs === s.requested ? null : (
                  <span className="text-muted"> — matched the tab named “{s.matchedAs}”</span>
                )}
                <span className="text-muted">
                  {" "}
                  · header on row {parseReport.headerRows[s.requested] ?? "?"} ·{" "}
                  {parseReport.rowsRead[s.requested] ?? 0} of {s.rows} rows below it were read
                </span>
              </li>
            ))}
            {parseReport.sheetsMissing.map((name) => (
              <li key={name} className="text-amber-800">
                <span className="font-medium">{name}</span> — no tab matched this name.
                {name === "Existing stores"
                  ? " The built-in store list was used instead."
                  : " Nothing from it was read."}
              </li>
            ))}
          </ul>
          <p className="mt-1 text-xs text-muted">
            Existing stores came from{" "}
            {parseReport.storesSource === "uploaded" ? "your file" : "the built-in list"}.
            {parseReport.storeDifferences.length > 0
              ? ` ${parseReport.storeDifferences.length} differ from the built-in list.`
              : ""}
          </p>
        </div>

        {excluded.length > 0 || includeExampleRow ? (
          <div className="rounded border border-line bg-stone-50 px-3 py-2.5 text-sm">
            {includeExampleRow ? (
              <p>
                The template’s grey example row is being treated as real data. If that was not
                intended, take it back out.
              </p>
            ) : (
              <p>
                {excluded.length} row{excluded.length === 1 ? " was" : "s were"} skipped for matching
                the template’s grey example exactly
                {excluded.length > 0
                  ? ` (${excluded.map((e) => `${e.sheet} row ${e.rowNumber}`).join(", ")})`
                  : ""}
                . If that row is real, put it back.
              </p>
            )}
            <Button
              size="sm"
              variant="secondary"
              className="mt-2"
              disabled={busy !== null}
              onClick={() => setIncludeExampleRow(!includeExampleRow)}
            >
              {includeExampleRow ? "Exclude it again" : "Include it"}
            </Button>
          </div>
        ) : null}

        {parseReport.rowErrors.length > 0 ? (
          <div>
            <h3 className="text-xs font-medium text-muted">Rows that could not be read</h3>
            <ul className="mt-1 space-y-0.5 text-sm text-amber-800">
              {parseReport.rowErrors.map((e, i) => (
                <li key={`${e.sheet}-${e.row}-${i}`}>
                  {e.sheet} row {e.row} — {e.message}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div>
          <h3 className="text-xs font-medium text-muted">Data-quality issues</h3>
          <div className="mt-1 flex flex-wrap gap-2 text-sm">
            {bySeverity.map(({ severity, count }) => (
              <span key={severity} className="flex items-center gap-1.5">
                <SeverityChip severity={severity} />
                <span className="tabular-nums">{count}</span>
              </span>
            ))}
          </div>
        </div>

        {log.length > 0 ? (
          <div>
            <Button size="sm" variant="ghost" onClick={() => setShowNormalisations((v) => !v)}>
              {showNormalisations ? "Hide" : "Show"} all {log.length} normalisations
            </Button>
            {showNormalisations ? (
              <div className="mt-2 max-h-80 overflow-auto rounded border border-line">
                <table className="w-full text-left text-sm">
                  <thead className="sticky top-0 border-b border-line bg-stone-50 text-xs text-muted">
                    <tr>
                      <th className="px-3 py-1.5 font-medium">Rule</th>
                      <th className="px-2 py-1.5 font-medium">Where</th>
                      <th className="px-2 py-1.5 font-medium">Was</th>
                      <th className="px-3 py-1.5 font-medium">Became</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {log.map((n, i) => (
                      <tr key={`${n.ruleId}-${n.subjectId}-${n.column}-${i}`}>
                        <td className="px-3 py-1.5 font-mono text-xs">{n.ruleId}</td>
                        <td className="px-2 py-1.5 text-muted">
                          {n.subjectId} · {n.column}
                        </td>
                        <td className="px-2 py-1.5 font-mono text-xs">{n.from || "(blank)"}</td>
                        <td className="px-3 py-1.5 font-mono text-xs">{n.to || "(blank)"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </Card>
  );
}
