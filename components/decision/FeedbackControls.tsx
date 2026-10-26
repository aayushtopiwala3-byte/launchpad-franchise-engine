"use client";

import { useState } from "react";
import { useStore } from "../../lib/state/store";
import { Button, Card, CardHeader } from "../ui/primitives";
import type { Applicant, Status } from "../../lib/types";

const STATUSES: Status[] = ["APPROVED", "WAITLISTED", "ON HOLD", "REDIRECTED", "NOT PROCEEDING"];

export function FeedbackControls({ applicant }: { applicant: Applicant }) {
  const store = useStore();
  const existing = store.feedback.find((f) => f.applicationId === applicant.applicationId);
  const override = store.overrides.find((o) => o.applicationId === applicant.applicationId);

  const [reason, setReason] = useState(existing?.reason ?? "");
  const [showOverride, setShowOverride] = useState(false);
  const [toStatus, setToStatus] = useState<Status>(applicant.status);
  const [overrideReason, setOverrideReason] = useState("");
  const [locked, setLocked] = useState(true);

  const failedRules = [...applicant.gateResults, ...applicant.readinessResults]
    .filter((r) => !r.passed)
    .map((r) => r.ruleId);

  const record = (verdict: "agree" | "disagree") =>
    store.addFeedback({
      applicationId: applicant.applicationId,
      verdict,
      reason: reason.trim() || null,
      ruleIds: failedRules,
      tier: applicant.tier,
      createdAt: new Date().toISOString(),
    });

  return (
    <Card>
      <CardHeader
        title="Was this decision right?"
        subtitle="Your answer feeds the calibration report. It never changes this decision by itself."
      />
      <div className="space-y-3 px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant={existing?.verdict === "agree" ? "primary" : "secondary"}
            onClick={() => record("agree")}
          >
            This is right
          </Button>
          <Button
            size="sm"
            variant={existing?.verdict === "disagree" ? "primary" : "secondary"}
            onClick={() => record("disagree")}
          >
            This is wrong
          </Button>
          {existing ? (
            <span className="text-xs text-muted">
              Recorded {existing.verdict === "agree" ? "agreement" : "disagreement"}.
            </span>
          ) : null}
        </div>

        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          onBlur={() => existing && record(existing.verdict)}
          rows={2}
          placeholder="The tool got this wrong because… (optional)"
          className="w-full rounded-md border border-line bg-surface px-2.5 py-2 text-sm"
        />

        <div className="border-t border-line pt-3">
          {override ? (
            <div className="space-y-2">
              <p className="text-sm">
                <span className="font-medium">Overridden</span> from {override.fromStatus} to{" "}
                {override.toStatus}
                {override.locked ? " and locked, so re-runs keep it" : ""}. {override.reason}
              </p>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => store.removeOverride(applicant.applicationId)}
              >
                Remove the override
              </Button>
            </div>
          ) : showOverride ? (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="text-muted">Change to</span>
                <select
                  value={toStatus}
                  onChange={(e) => setToStatus(e.target.value as Status)}
                  className="h-8 rounded-md border border-line bg-surface px-2 text-sm"
                >
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
                <label className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={locked}
                    onChange={(e) => setLocked(e.target.checked)}
                  />
                  <span className="text-muted">Keep this through re-runs</span>
                </label>
              </div>
              <textarea
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
                rows={2}
                placeholder="Why are you overriding this? (required)"
                className="w-full rounded-md border border-line bg-surface px-2.5 py-2 text-sm"
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="primary"
                  disabled={overrideReason.trim().length === 0 || toStatus === applicant.status}
                  onClick={() => {
                    store.addOverride({
                      applicationId: applicant.applicationId,
                      fromStatus: applicant.status,
                      toStatus,
                      reason: overrideReason.trim(),
                      locked,
                      who: "Operator",
                      when: new Date().toISOString(),
                    });
                    setShowOverride(false);
                  }}
                >
                  Save the override
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setShowOverride(false)}>
                  Cancel
                </Button>
              </div>
              {toStatus === applicant.status ? (
                <p className="text-xs text-muted">
                  Pick a status different from the current one.
                </p>
              ) : null}
            </div>
          ) : (
            <Button size="sm" variant="ghost" onClick={() => setShowOverride(true)}>
              Override this decision
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}
