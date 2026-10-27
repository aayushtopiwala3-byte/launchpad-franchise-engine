"use client";

// The role control, and the sentence that stops it pretending to be a login.
//
// The switch is real in the sense that matters: changing it changes what the reducer will
// accept, not merely what the page draws. It is not real in the sense of a security
// boundary, and the panel says so in the same breath rather than in a footnote.

import { ACCESS_LIMITATION, ROLES, ROLE_SUMMARY } from "../../lib/state/access";
import { useStore } from "../../lib/state/store";
import { Select } from "../ui/primitives";

export function RoleSwitcher() {
  const { role, setRole } = useStore();
  return (
    <label className="flex items-center gap-1.5 text-xs text-muted">
      <span className="sr-only sm:not-sr-only">Acting as</span>
      <Select
        aria-label="Acting as role"
        className="w-auto py-1 text-xs"
        value={role}
        onChange={(e) => setRole(e.target.value as (typeof ROLES)[number])}
      >
        {ROLES.map((r) => (
          <option key={r} value={r}>
            {r}
          </option>
        ))}
      </Select>
    </label>
  );
}

/** The full explanation, for the page that is meant to carry it rather than the header. */
export function AccessPanel() {
  const { role } = useStore();
  return (
    <div className="space-y-3 px-4 py-3 text-sm">
      <dl className="space-y-2">
        {ROLES.map((r) => (
          <div key={r}>
            <dt className="font-medium">
              {r}
              {r === role ? <span className="ml-1.5 text-xs text-brand">· acting as this</span> : null}
            </dt>
            <dd className="text-muted">{ROLE_SUMMARY[r]}</dd>
          </div>
        ))}
      </dl>
      <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-amber-900">
        <strong className="font-semibold">This is not authentication.</strong>{" "}
        {ACCESS_LIMITATION}
      </p>
    </div>
  );
}
