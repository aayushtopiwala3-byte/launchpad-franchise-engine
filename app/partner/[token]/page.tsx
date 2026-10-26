"use client";

import { Suspense, use, useState } from "react";
import { OnboardingPlan } from "../../../components/decision/OnboardingPlan";
import { Button, Card, CardHeader, EmptyState, StatusChip } from "../../../components/ui/primitives";
import { FIELD_LABELS, PARTNER_REPORTABLE_FIELDS } from "../../../lib/partner";
import { useStore } from "../../../lib/state/store";
import type { Applicant, RawApplicationRow } from "../../../lib/types";

export default function PartnerPage({ params }: PageProps<"/partner/[token]">) {
  return (
    <Suspense fallback={null}>
      <Resolved params={params} />
    </Suspense>
  );
}

function Resolved({ params }: { params: PageProps<"/partner/[token]">["params"] }) {
  const { token } = use(params);
  const { result, policy, hydrated } = useStore();

  const applicant = result?.applicants.find((a) => a.partnerToken === decodeURIComponent(token));

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-8">
      <header className="mb-5">
        <p className="text-sm font-semibold tracking-tight">{policy.brandName}</p>
        <p className="text-xs text-muted">Your franchise application</p>
      </header>

      {!hydrated ? null : !applicant ? (
        <Card>
          <EmptyState
            title="This link does not match an application"
            body="The link may belong to an earlier upload. Ask your contact at the brand to send a fresh one."
          />
        </Card>
      ) : (
        <PartnerBody applicant={applicant} statusLabel={policy.statusLabels[applicant.status]} />
      )}
    </div>
  );
}

function PartnerBody({ applicant: a, statusLabel }: { applicant: Applicant; statusLabel: string }) {
  return (
    <div className="space-y-4">
      <Card className="p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-2">
          <StatusChip status={a.status} label={statusLabel} />
          <h1 className="text-lg font-semibold tracking-tight">
            {a.normalised.applicantName ?? a.applicationId}
          </h1>
        </div>

        <p className="mt-2 text-base leading-relaxed">{a.reasonSentence}</p>

        <div className="mt-3 border-t border-line pt-3">
          <h2 className="text-xs font-medium text-muted">What to do next</h2>
          <p className="mt-0.5 text-sm">{a.nextStep}</p>
        </div>

        {a.assignedPin ? (
          <p className="mt-3 rounded border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-sm text-emerald-900">
            Pin code <span className="font-mono">{a.assignedPin}</span> is held for you
            {a.reservedUntil ? ` until ${a.reservedUntil}` : ""}.
          </p>
        ) : a.suggestedPins.length > 0 ? (
          <p className="mt-3 rounded border border-purple-200 bg-purple-50 px-2.5 py-1.5 text-sm text-purple-900">
            These pin codes are still free nearby:{" "}
            <span className="font-mono">{a.suggestedPins.join(", ")}</span>. None of them is held
            for you yet — tell us if you can find a site in one of them.
          </p>
        ) : null}
      </Card>

      {a.onboardingPlan ? <OnboardingPlan plan={a.onboardingPlan} /> : null}

      <SomethingChangedForm applicant={a} />

      <p className="text-center text-xs text-muted">
        Nothing you send here changes your application on its own. A person at the brand reviews it
        first.
      </p>
    </div>
  );
}

function SomethingChangedForm({ applicant: a }: { applicant: Applicant }) {
  const { addPendingUpdate, pendingUpdates } = useStore();
  const [field, setField] = useState<string>(PARTNER_REPORTABLE_FIELDS[0]);
  const [newValue, setNewValue] = useState("");
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState(false);

  const mine = pendingUpdates.filter((u) => u.applicationId === a.applicationId);
  const oldValue = String(a.raw[field as keyof RawApplicationRow] ?? "");

  const submit = () => {
    addPendingUpdate({
      id: `${a.applicationId}-${Date.now()}`,
      applicationId: a.applicationId,
      submittedAt: new Date().toISOString(),
      message: message.trim(),
      proposedPatches: [
        {
          applicationId: a.applicationId,
          field,
          oldValue: oldValue || null,
          newValue: newValue.trim(),
          sourceQuote: message.trim() || `Reported through the partner link`,
        },
      ],
      state: "pending",
    });
    setSent(true);
    setNewValue("");
    setMessage("");
  };

  return (
    <Card>
      <CardHeader
        title="Something has changed"
        subtitle="Tell us what is different and we will look at it again. This does not change anything by itself."
      />
      <div className="space-y-3 px-4 py-3">
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-sm">
            <span className="block text-xs text-muted">What changed</span>
            <select
              value={field}
              onChange={(e) => {
                setField(e.target.value);
                setSent(false);
              }}
              className="mt-0.5 h-9 rounded-md border border-line bg-surface px-2 text-sm"
            >
              {PARTNER_REPORTABLE_FIELDS.map((f) => (
                <option key={f} value={f}>
                  {FIELD_LABELS[f]}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="block text-xs text-muted">It is now</span>
            <input
              value={newValue}
              onChange={(e) => {
                setNewValue(e.target.value);
                setSent(false);
              }}
              placeholder={oldValue || "not stated before"}
              className="mt-0.5 h-9 rounded-md border border-line bg-surface px-2.5 text-sm"
            />
          </label>
          <span className="pb-2 text-xs text-muted">
            was {oldValue ? <code className="font-mono">{oldValue}</code> : "not stated"}
          </span>
        </div>

        <textarea
          value={message}
          onChange={(e) => {
            setMessage(e.target.value);
            setSent(false);
          }}
          rows={2}
          placeholder="Anything else we should know? (optional)"
          className="w-full rounded-md border border-line bg-surface px-2.5 py-2 text-sm"
        />

        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="primary"
            disabled={newValue.trim().length === 0}
            onClick={submit}
          >
            Send it to the brand
          </Button>
          {sent ? (
            <span className="text-sm text-emerald-800">
              Sent. Someone at the brand will review it.
            </span>
          ) : null}
        </div>

        {mine.length > 0 ? (
          <ul className="space-y-1 border-t border-line pt-3 text-sm">
            {mine.map((u) => (
              <li key={u.id} className="flex flex-wrap items-baseline gap-2">
                <span className="text-muted">{u.submittedAt.slice(0, 10)}</span>
                <span>
                  {u.proposedPatches
                    .map((p) => `${FIELD_LABELS[p.field] ?? p.field} → ${p.newValue}`)
                    .join(", ")}
                </span>
                <span
                  className={
                    u.state === "accepted"
                      ? "text-emerald-800"
                      : u.state === "rejected"
                        ? "text-stone-600"
                        : "text-amber-800"
                  }
                >
                  {u.state === "pending"
                    ? "waiting on the brand"
                    : u.state === "accepted"
                      ? "applied"
                      : "not applied"}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </Card>
  );
}
