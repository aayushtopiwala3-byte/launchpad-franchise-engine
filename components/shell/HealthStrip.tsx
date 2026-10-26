"use client";

import { LAMP_COLORS, LAMP_LABELS } from "../../lib/state/health";
import { useStore } from "../../lib/state/store";
import type { HealthState } from "../../lib/types";

const ORDER: (keyof HealthState)[] = ["parser", "rules", "ai", "storage"];

export function HealthStrip() {
  const { health } = useStore();
  return (
    <div className="flex items-center gap-3" aria-label="System health">
      {ORDER.map((key) => (
        <span
          key={key}
          className="flex items-center gap-1.5 text-xs text-muted"
          title={`${LAMP_LABELS[key]}: ${health[key].detail}`}
        >
          <span className={`size-2 rounded-full ${LAMP_COLORS[health[key].level]}`} aria-hidden />
          <span className="hidden sm:inline">{LAMP_LABELS[key]}</span>
          <span className="sr-only">
            {LAMP_LABELS[key]} is {health[key].level}. {health[key].detail}
          </span>
        </span>
      ))}
    </div>
  );
}
