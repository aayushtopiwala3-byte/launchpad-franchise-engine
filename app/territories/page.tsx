"use client";

import { AppShell } from "../../components/shell/AppShell";
import { RequireData } from "../../components/RequireData";
import { TerritoryCard } from "../../components/TerritoryCard";

export default function Territories() {
  return (
    <AppShell>
      <RequireData>
        {(result) => (
          <div className="space-y-4">
            <div>
              <h1 className="text-xl font-semibold tracking-tight">Territory board</h1>
              <p className="text-sm text-muted">
                One card per territory: what it can take, what is holding each pin, who is queued,
                and what is blocking any slot still empty.
              </p>
            </div>
            <div className="grid gap-3 lg:grid-cols-2">
              {result.territories.map((t) => (
                <TerritoryCard key={t.territoryId} territory={t} />
              ))}
            </div>
          </div>
        )}
      </RequireData>
    </AppShell>
  );
}
