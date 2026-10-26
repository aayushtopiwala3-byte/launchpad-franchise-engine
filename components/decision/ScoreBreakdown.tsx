"use client";

import { Card, CardHeader } from "../ui/primitives";
import { Explain } from "./Explain";
import type { ScoreBreakdown as Breakdown } from "../../lib/types";

export function ScoreBreakdown({ score }: { score: Breakdown }) {
  return (
    <Card>
      <CardHeader
        title={`Score ${score.total} out of 100`}
        subtitle="Used only to rank applicants against each other. It never decides a verdict on its own."
      />
      <ul className="divide-y divide-line">
        {score.components.map((c) => (
          <li key={c.key} className="px-4 py-2.5">
            <div className="flex items-baseline gap-2 text-sm">
              <span className="font-medium">{c.label}</span>
              <span className="ml-auto shrink-0 tabular-nums">
                {c.points} / {c.max}
              </span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-stone-100">
              <div
                className="h-full rounded-full bg-stone-700"
                style={{ width: `${c.max === 0 ? 0 : (c.points / c.max) * 100}%` }}
              />
            </div>
            <p className="mt-1 text-xs text-muted">{c.basis}</p>
            <Explain block>
              {c.key} · weight {c.max} of 100
            </Explain>
          </li>
        ))}
      </ul>
    </Card>
  );
}
