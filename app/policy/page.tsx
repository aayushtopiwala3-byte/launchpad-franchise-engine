"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AppShell } from "../../components/shell/AppShell";
import { Banner, Button, Card, CardHeader, cn } from "../../components/ui/primitives";
import { BRAND_DEFAULT_POLICY } from "../../lib/reference";
import { policyDifferences, previewPolicyImpact } from "../../lib/state/policy";
import { useStore } from "../../lib/state/store";
import type { Floor, PolicyProfile, Tier } from "../../lib/types";

const TIERS: Tier[] = ["Tier 1", "Tier 2", "Tier 3"];
const FLOORS: Floor[] = ["Ground", "Mall unit", "Upper"];
const WEIGHTS = ["investment", "experience", "space", "business", "launch"] as const;

function NumberField({
  label,
  value,
  onChange,
  suffix,
  step = 1,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  suffix?: string;
  step?: number;
}) {
  return (
    <label className="flex items-center justify-between gap-3 text-sm">
      <span className="text-muted">{label}</span>
      <span className="flex items-center gap-1.5">
        <input
          type="number"
          step={step}
          value={value}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (Number.isFinite(n)) onChange(n);
          }}
          className="h-8 w-24 rounded-md border border-line bg-surface px-2 text-right tabular-nums"
        />
        {suffix ? <span className="w-12 text-xs text-muted">{suffix}</span> : null}
      </span>
    </label>
  );
}

export default function PolicyPage() {
  const { policy, profiles, applyPolicy, input, asOfDate, result } = useStore();
  const [draft, setDraft] = useState<PolicyProfile>(policy);

  const set = (patch: Partial<PolicyProfile>) => setDraft({ ...draft, ...patch, isDefault: false });

  const changes = useMemo(() => policyDifferences(draft, policy), [draft, policy]);
  const fromBrand = useMemo(() => policyDifferences(draft), [draft]);

  // The preview is the real pipeline run twice, so what it promises is what happens.
  const impact = useMemo(
    () =>
      input && asOfDate && changes.length > 0
        ? previewPolicyImpact(input, asOfDate, policy, draft)
        : null,
    [input, asOfDate, policy, draft, changes.length],
  );

  const weightTotal = WEIGHTS.reduce((sum, k) => sum + draft.scoreWeights[k], 0);

  const load = (profile: PolicyProfile) => setDraft(profile);

  return (
    <AppShell>
      <div className="space-y-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Settings</h1>
          <p className="text-sm text-muted">
            These thresholds are the only thing that changes a decision. Edit one and you will see
            exactly who moves, by name, before anything is applied.
          </p>
        </div>

        <Card>
          <CardHeader
            title="Profiles"
            subtitle={`Active: ${policy.name}${fromBrand.length === 0 ? " (matches brand default)" : ""}`}
            action={
              <Button
                size="sm"
                variant="secondary"
                onClick={() => load(BRAND_DEFAULT_POLICY)}
                disabled={policyDifferences(draft).length === 0}
              >
                Reset to brand defaults
              </Button>
            }
          />
          <div className="flex flex-wrap gap-2 px-4 py-3">
            {profiles.map((p) => (
              <Button
                key={p.name}
                size="sm"
                variant={draft.name === p.name ? "primary" : "secondary"}
                onClick={() => load(p)}
              >
                {p.name}
              </Button>
            ))}
          </div>
        </Card>

        {changes.length > 0 ? (
          <Card className="border-amber-300 bg-amber-50">
            <CardHeader
              title={`${changes.length} unsaved change${changes.length === 1 ? "" : "s"}`}
              subtitle={
                impact
                  ? impact.sentence
                  : result
                    ? "Load a dataset to see who this would move."
                    : "No dataset loaded, so there is nobody to move yet."
              }
              action={
                <div className="flex gap-2">
                  <Button size="sm" variant="ghost" onClick={() => setDraft(policy)}>
                    Discard
                  </Button>
                  <Button size="sm" variant="primary" onClick={() => applyPolicy(draft)}>
                    Apply and re-run
                  </Button>
                </div>
              }
            />
            <div className="space-y-3 px-4 py-3">
              <ul className="space-y-0.5 text-sm">
                {changes.map((c) => (
                  <li key={c.label}>
                    <span className="text-muted">{c.label}:</span> {c.from} → {c.to}
                  </li>
                ))}
              </ul>

              {impact && impact.moves.length > 0 ? (
                <ul className="space-y-0.5 border-t border-amber-200 pt-2 text-sm">
                  {impact.moves.map((m) => (
                    <li key={m.applicationId}>
                      <Link
                        href={`/applicants/${encodeURIComponent(m.applicationId)}`}
                        className="font-mono underline underline-offset-2"
                      >
                        {m.applicationId}
                      </Link>{" "}
                      <span className="text-muted">
                        {m.applicantName ?? "name not stated"} — {policy.statusLabels[m.from]} →{" "}
                        {draft.statusLabels[m.to]}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </Card>
        ) : null}

        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader title="Entry bar by tier" subtitle="Below the minimum is a gate failure." />
            <div className="space-y-4 px-4 py-4">
              {TIERS.map((tier) => (
                <div key={tier} className="space-y-1.5">
                  <p className="text-xs font-semibold">{tier}</p>
                  <NumberField
                    label="Minimum investment"
                    value={draft.tierMinInvestmentLakh[tier]}
                    suffix="lakh"
                    onChange={(n) =>
                      set({ tierMinInvestmentLakh: { ...draft.tierMinInvestmentLakh, [tier]: n } })
                    }
                  />
                  <NumberField
                    label="Minimum space"
                    value={draft.tierMinSpaceSqft[tier]}
                    suffix="sq ft"
                    step={10}
                    onChange={(n) =>
                      set({ tierMinSpaceSqft: { ...draft.tierMinSpaceSqft, [tier]: n } })
                    }
                  />
                  <NumberField
                    label="Preferred band, upper end"
                    value={draft.tierPreferredBand[tier].max}
                    suffix="sq ft"
                    step={50}
                    onChange={(n) =>
                      set({
                        tierPreferredBand: {
                          ...draft.tierPreferredBand,
                          [tier]: { ...draft.tierPreferredBand[tier], max: n },
                        },
                      })
                    }
                  />
                </div>
              ))}
            </div>
          </Card>

          <div className="space-y-4">
            <Card>
              <CardHeader
                title="Score weights"
                subtitle={
                  weightTotal === 100
                    ? "They add up to 100, so a score reads as a percentage."
                    : `They add up to ${weightTotal}. A score will no longer read out of 100.`
                }
              />
              <div className="space-y-1.5 px-4 py-4">
                {WEIGHTS.map((key) => (
                  <NumberField
                    key={key}
                    label={key[0].toUpperCase() + key.slice(1)}
                    value={draft.scoreWeights[key]}
                    suffix="pts"
                    onChange={(n) => set({ scoreWeights: { ...draft.scoreWeights, [key]: n } })}
                  />
                ))}
              </div>
            </Card>

            <Card>
              <CardHeader title="Acceptable floors" subtitle="Anything else fails the floor gate." />
              <div className="flex flex-wrap gap-2 px-4 py-4">
                {FLOORS.map((floor) => {
                  const on = draft.acceptableFloors.includes(floor);
                  return (
                    <button
                      key={floor}
                      onClick={() =>
                        set({
                          acceptableFloors: on
                            ? draft.acceptableFloors.filter((f) => f !== floor)
                            : [...draft.acceptableFloors, floor],
                        })
                      }
                      className={cn(
                        "rounded-full border px-3 py-1 text-sm transition-colors",
                        on
                          ? "border-stone-900 bg-stone-900 text-white"
                          : "border-line text-muted hover:bg-stone-50",
                      )}
                    >
                      {floor}
                    </button>
                  );
                })}
              </div>
            </Card>

            <Card>
              <CardHeader title="Timing and readiness" />
              <div className="space-y-1.5 px-4 py-4">
                <NumberField
                  label="Hard investment floor"
                  value={Math.round(draft.hardInvestmentFloorRatio * 100)}
                  suffix="% of min"
                  step={5}
                  onChange={(n) => set({ hardInvestmentFloorRatio: n / 100 })}
                />
                <NumberField
                  label="Reservation window"
                  value={draft.reservationWindowDays}
                  suffix="days"
                  step={5}
                  onChange={(n) => set({ reservationWindowDays: n })}
                />
                <NumberField
                  label="Realistic build, space secured"
                  value={draft.realisticMonthsSpaceSecured}
                  suffix="months"
                  step={0.5}
                  onChange={(n) => set({ realisticMonthsSpaceSecured: n })}
                />
                <NumberField
                  label="Realistic build, no space yet"
                  value={draft.realisticMonthsNoSpace}
                  suffix="months"
                  step={0.5}
                  onChange={(n) => set({ realisticMonthsNoSpace: n })}
                />
                <NumberField
                  label="Training"
                  value={draft.trainingWeeks}
                  suffix="weeks"
                  onChange={(n) => set({ trainingWeeks: n })}
                />
              </div>
            </Card>

            <Card>
              <CardHeader
                title="Brand"
                subtitle="Shown in the header, partner pages and every message."
              />
              <label className="flex items-center justify-between gap-3 px-4 py-4 text-sm">
                <span className="text-muted">Brand name</span>
                <input
                  value={draft.brandName}
                  onChange={(e) => set({ brandName: e.target.value })}
                  className="h-8 w-56 rounded-md border border-line bg-surface px-2"
                />
              </label>
            </Card>
          </div>
        </div>

        {fromBrand.length > 0 && changes.length === 0 ? (
          <Banner tone="info" title="This profile differs from the brand default">
            {fromBrand.length} threshold{fromBrand.length === 1 ? "" : "s"} differ. Judges are told
            which ones on every page.
          </Banner>
        ) : null}
      </div>
    </AppShell>
  );
}
