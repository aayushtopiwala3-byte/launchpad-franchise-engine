"use client";

import { Card, CardHeader, RuleTag } from "../ui/primitives";
import type { DecisionTraceEntry } from "../../lib/types";

function values(entry: DecisionTraceEntry): string {
  const pairs = Object.entries(entry.values).filter(([, v]) => v !== null && v !== "");
  if (pairs.length === 0) return "—";
  return pairs.map(([k, v]) => `${k}: ${v}`).join(" · ");
}

export function RuleTrace({ trace }: { trace: DecisionTraceEntry[] }) {
  return (
    <Card className="overflow-hidden">
      <CardHeader
        title="Every rule that was checked"
        subtitle="In the order the engine ran them. This is the whole decision — there is nothing behind it."
      />
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-line text-xs text-muted">
            <tr>
              <th className="px-4 py-2 font-medium">Rule</th>
              <th className="px-2 py-2 font-medium">What was checked</th>
              <th className="px-2 py-2 font-medium">The actual values</th>
              <th className="px-4 py-2 font-medium">Outcome</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line align-top">
            {trace.map((entry, i) => {
              const failed = entry.outcome.startsWith("Fail");
              return (
                <tr key={`${entry.ruleId}-${i}`} className={failed ? "bg-red-50/40" : undefined}>
                  <td className="px-4 py-2">
                    <RuleTag id={entry.ruleId} />
                  </td>
                  <td className="px-2 py-2">{entry.description}</td>
                  <td className="px-2 py-2 text-muted">{values(entry)}</td>
                  <td
                    className={`px-4 py-2 ${failed ? "font-medium text-red-800" : "text-emerald-700"}`}
                  >
                    {entry.outcome}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
