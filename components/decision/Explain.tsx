"use client";

import type { ReactNode } from "react";
import { useStore } from "../../lib/state/store";
import { cn } from "../ui/primitives";

/**
 * Explain mode puts the rule code and the raw cell text beside the number it produced.
 * It is annotation only — nothing here is reachable by the engine, so switching it on
 * cannot move a verdict.
 */
export function Explain({ children, block }: { children: ReactNode; block?: boolean }) {
  const { flags } = useStore();
  if (!flags.explainMode) return null;

  return (
    <span
      className={cn(
        "rounded border border-indigo-200 bg-indigo-50 px-1 py-0.5 font-mono text-[11px] leading-tight text-indigo-900",
        block ? "mt-0.5 block w-fit" : "ml-1.5 inline-block align-middle",
      )}
    >
      {children}
    </span>
  );
}

/** The cell exactly as the file holds it, so the reader can see what was interpreted. */
export function RawCell({ value }: { value: string }) {
  return <Explain block>cell: {value.trim() === "" ? "(blank)" : `“${value}”`}</Explain>;
}
