"use client";

import { type ReactNode, useEffect, useState } from "react";
import { useStore } from "../lib/state/store";
import type { PipelineResult } from "../lib/types";
import { DataLoader } from "./DataLoader";
import { Card, EmptyState } from "./ui/primitives";

/**
 * Every data page routes through this, so a judge who lands on a deep link never
 * sees a blank screen — they see the three buttons that get them unstuck.
 */
export function RequireData({ children }: { children: (result: PipelineResult) => ReactNode }) {
  const { result, hydrated } = useStore();

  // The pages above this suspend on their params promise, so this subtree can first render
  // after the store has already restored. Painting the restored result on that first pass
  // would contradict the placeholder the server sent and fail hydration, so the first paint
  // here is always the placeholder and the data arrives on the pass after it.
  const [painted, setPainted] = useState(false);
  useEffect(() => setPainted(true), []);

  if (!painted || !hydrated) {
    return (
      <Card>
        <EmptyState title="Loading…" body="Reading anything saved in this browser." />
      </Card>
    );
  }

  if (!result) {
    return (
      <Card>
        <EmptyState
          title="No applications loaded yet"
          body="Load the sample data to see the whole flow in one click, or upload your own Applications and Territories workbook."
          action={<DataLoader size="md" onLoaded={() => undefined} />}
        />
      </Card>
    );
  }

  return <>{children(result)}</>;
}
