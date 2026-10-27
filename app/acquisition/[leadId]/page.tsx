"use client";

// One lead. The page is a record of a conversation plus two optional AI helpers, and it is
// arranged so the difference is always visible: what somebody recorded sits above, what a
// model wrote sits below in a card that says so and that nothing else reads.

import Link from "next/link";
import { Suspense, use, useMemo, useState } from "react";
import { AppShell } from "../../../components/shell/AppShell";
import { LeadAssist } from "../../../components/crm/LeadAssist";
import { OutreachComposer } from "../../../components/crm/OutreachComposer";
import {
  Banner,
  Button,
  Card,
  CardHeader,
  DemoBadge,
  EmptyState,
  Field,
  Labelled,
  NotStated,
  Select,
  TextArea,
  TextInput,
} from "../../../components/ui/primitives";
import { canLink, followUpState, handoffPlan } from "../../../lib/crm/leads";
import { LEAD_STAGES, type InteractionKind, type LeadStage } from "../../../lib/crm/types";
import { useFirstPaint } from "../../../lib/state/firstPaint";
import { useStore } from "../../../lib/state/store";

const KINDS: InteractionKind[] = ["call", "email", "meeting", "message", "note"];

export default function LeadPage({ params }: { params: Promise<{ leadId: string }> }) {
  return (
    <Suspense fallback={null}>
      <Resolved params={params} />
    </Suspense>
  );
}

function Resolved({ params }: { params: Promise<{ leadId: string }> }) {
  const { leadId } = use(params);
  const store = useStore();

  const painted = useFirstPaint();
  const lead = store.leads.find((l) => l.leadId === leadId);

  if (!painted || !store.hydrated) {
    return (
      <AppShell>
        <EmptyState title="Loading…" body="Reading anything saved in this browser." />
      </AppShell>
    );
  }

  if (!lead) {
    return (
      <AppShell>
        <EmptyState
          title="No such lead"
          body={`Nothing in this session has the ID ${leadId}. It may have been on a different machine, or the sample records may have been cleared.`}
        />
      </AppShell>
    );
  }

  return <LeadBody leadId={lead.leadId} />;
}

function LeadBody({ leadId }: { leadId: string }) {
  const {
    leads,
    result,
    asOfDate,
    updateLead,
    logInteraction,
    setLeadStage,
    linkLeadToApplication,
  } = useStore();
  const lead = leads.find((l) => l.leadId === leadId)!;
  const today = asOfDate ?? new Date().toISOString().slice(0, 10);

  const [kind, setKind] = useState<InteractionKind>("call");
  const [summary, setSummary] = useState("");
  const [by, setBy] = useState(lead.assignedTo ?? "");
  const [applicationId, setApplicationId] = useState("");
  const [linkError, setLinkError] = useState<string | null>(null);

  const plan = useMemo(() => handoffPlan(lead), [lead]);
  const fu = followUpState(lead, today);

  const knownIds = useMemo(
    () => new Set((result?.applicants ?? []).map((a) => a.applicationId)),
    [result],
  );

  const addInteraction = () => {
    const text = summary.trim();
    if (!text) return;
    logInteraction(lead.leadId, {
      id: `${lead.leadId}-I${Date.now()}`,
      at: new Date().toISOString(),
      kind,
      summary: text,
      by: by.trim() || "not recorded",
    });
    setSummary("");
  };

  const link = () => {
    const id = applicationId.trim().toUpperCase();
    const check = canLink(lead, id, leads, knownIds);
    if (!check.ok) {
      setLinkError(check.reason);
      return;
    }
    setLinkError(null);
    linkLeadToApplication(lead.leadId, id);
    setApplicationId("");
  };

  return (
    <AppShell>
      <div className="space-y-4">
        <div>
          <Link href="/acquisition" className="text-sm underline underline-offset-2">
            ← All leads
          </Link>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight">{lead.name}</h1>
            <span className="text-sm text-muted">{lead.leadId}</span>
            {lead.isDemo ? <DemoBadge /> : null}
          </div>
        </div>

        {lead.isDemo ? (
          <Banner tone="info" title="This is an illustrative record">
            Invented for the demonstration. It describes no real person, the email domain
            cannot resolve and the number is not issued to anyone.
          </Banner>
        ) : null}

        {lead.consentToContact === false ? (
          <Banner tone="warn" title="This lead has not agreed to be contacted">
            Drafting a message is still allowed — sending it is a decision for you, not for
            this page, and nothing here sends anything.
          </Banner>
        ) : null}

        <Card>
          <CardHeader
            title="What was recorded"
            subtitle="Typed by a person during the conversation. Nothing here was inferred."
          />
          <dl className="grid gap-x-6 gap-y-3 px-4 py-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="City">{lead.city ?? <NotStated />}</Field>
            <Field label="Preferred territory">
              {lead.preferredTerritoryId ?? <NotStated />}
            </Field>
            <Field label="Source">{lead.source}</Field>
            <Field label="Assigned to">{lead.assignedTo ?? <NotStated />}</Field>
            <Field label="Email">{lead.email ?? <NotStated />}</Field>
            <Field label="Phone">{lead.phone ?? <NotStated />}</Field>
            <Field label="Preferred channel">{lead.preferredChannel ?? <NotStated />}</Field>
            <Field label="Consent to contact">
              {lead.consentToContact === null
                ? "Not recorded — which is not the same as refused"
                : lead.consentToContact
                  ? "Given"
                  : "Refused"}
            </Field>
            <Field label="Investment stated">
              {lead.investmentRange.minLakh === null && lead.investmentRange.maxLakh === null ? (
                <NotStated />
              ) : (
                `₹${lead.investmentRange.minLakh ?? "?"}–${lead.investmentRange.maxLakh ?? "?"} lakh, as stated by the prospect and unverified`
              )}
            </Field>
            <Field label="Retail experience">
              {lead.retailExperienceYears === null ? (
                <NotStated />
              ) : (
                `${lead.retailExperienceYears} year${lead.retailExperienceYears === 1 ? "" : "s"}, self-reported`
              )}
            </Field>
            <Field label="Site readiness">{lead.siteReadiness}</Field>
            <Field label="Recorded">{lead.createdAt.slice(0, 10)}</Field>
          </dl>
          {lead.notes ? (
            <p className="border-t border-line px-4 py-3 text-sm">{lead.notes}</p>
          ) : null}
        </Card>

        <div className="stagger grid gap-3 lg:grid-cols-2">
          <Card className="lift">
            <CardHeader
              title="Stage and next action"
              subtitle="A stage records how far the conversation has got. It is not an assessment and it decides nothing."
            />
            <div className="grid gap-3 px-4 py-3 sm:grid-cols-2">
              <Labelled label="Acquisition stage">
                <Select
                  value={lead.stage}
                  onChange={(e) =>
                    setLeadStage(lead.leadId, e.target.value as LeadStage, by.trim() || "not recorded")
                  }
                >
                  {LEAD_STAGES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </Select>
              </Labelled>
              <Labelled label="Next follow-up" hint={`Measured against the as-of date, ${today}.`}>
                <TextInput
                  type="date"
                  value={lead.nextFollowUpAt?.slice(0, 10) ?? ""}
                  onChange={(e) =>
                    updateLead(lead.leadId, {
                      nextFollowUpAt: e.target.value ? `${e.target.value}T09:00:00.000Z` : null,
                    })
                  }
                />
              </Labelled>
            </div>
            <p className="border-t border-line px-4 py-2 text-xs text-muted">
              {lead.nextFollowUpAt
                ? `Follow-up is ${fu}.`
                : "No follow-up is scheduled, so this lead will not appear in anyone's queue."}
            </p>
          </Card>

          <Card className="lift">
            <CardHeader
              title="Log an interaction"
              subtitle="Written down as it happened. The log is append-only — nothing here edits history."
            />
            <div className="grid gap-3 px-4 py-3 sm:grid-cols-2">
              <Labelled label="Kind">
                <Select value={kind} onChange={(e) => setKind(e.target.value as InteractionKind)}>
                  {KINDS.map((k) => (
                    <option key={k} value={k}>
                      {k}
                    </option>
                  ))}
                </Select>
              </Labelled>
              <Labelled label="Logged by">
                <TextInput value={by} onChange={(e) => setBy(e.target.value)} />
              </Labelled>
              <div className="sm:col-span-2">
                <Labelled label="What happened">
                  <TextArea
                    rows={2}
                    value={summary}
                    onChange={(e) => setSummary(e.target.value)}
                  />
                </Labelled>
              </div>
            </div>
            <div className="border-t border-line px-4 py-3">
              <Button size="sm" variant="primary" onClick={addInteraction} disabled={!summary.trim()}>
                Record it
              </Button>
            </div>
          </Card>
        </div>

        <Card>
          <CardHeader title="History" subtitle="Most recent first." />
          {lead.interactions.length === 0 ? (
            <EmptyState
              title="Nothing logged yet"
              body="No call, email or meeting has been recorded against this lead."
            />
          ) : (
            <ol className="stagger divide-y divide-line">
              {[...lead.interactions]
                .sort((a, b) => b.at.localeCompare(a.at))
                .map((i) => (
                  <li
                    key={i.id}
                    className="px-4 py-2.5 text-sm transition-colors duration-150 hover:bg-stone-50"
                  >
                    <div className="flex flex-wrap items-baseline gap-x-2 text-xs text-muted">
                      <span className="font-medium uppercase tracking-wide">{i.kind}</span>
                      <span>{i.at.slice(0, 10)}</span>
                      <span className="ml-auto">{i.by}</span>
                    </div>
                    <p className="mt-0.5">{i.summary}</p>
                  </li>
                ))}
            </ol>
          )}
        </Card>

        <LeadAssist lead={lead} />

        <OutreachComposer lead={lead} />

        <Card>
          <CardHeader
            title="Handing this over to an application"
            subtitle="What a lead can contribute to the form, and what it genuinely cannot."
          />
          <div className="grid gap-4 px-4 py-3 sm:grid-cols-2">
            <div>
              <p className="text-xs font-medium text-muted">Carries across</p>
              <ul className="mt-1 space-y-0.5 text-sm">
                {Object.entries(plan.prefill)
                  .filter(([, v]) => v !== "" && v !== undefined)
                  .map(([k, v]) => (
                    <li key={k}>
                      <span className="text-muted">{k}:</span> {String(v)}
                    </li>
                  ))}
              </ul>
            </div>
            <div>
              <p className="text-xs font-medium text-muted">
                The applicant still has to supply this
              </p>
              <ul className="mt-1 space-y-1 text-sm">
                {plan.missing.map((m) => (
                  <li key={m.field}>
                    <span className="font-medium">{m.label}</span>
                    <span className="block text-xs text-muted">{m.why}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="border-t border-line px-4 py-3">
            {lead.linkedApplicationId ? (
              <p className="text-sm">
                Linked to{" "}
                <Link
                  href={`/applicants/${lead.linkedApplicationId}`}
                  className="font-medium underline underline-offset-2"
                >
                  {lead.linkedApplicationId}
                </Link>
                . The engine decides that application; this link records that they are the same
                person and nothing more.
              </p>
            ) : (
              <div className="flex flex-wrap items-end gap-2">
                <Labelled
                  label="Link to an application already in the dataset"
                  hint="Linking records that a lead and an applicant are the same person. It changes no verdict."
                >
                  <TextInput
                    className="w-48"
                    placeholder="APP-001"
                    value={applicationId}
                    onChange={(e) => setApplicationId(e.target.value)}
                  />
                </Labelled>
                <Button size="sm" variant="secondary" onClick={link} disabled={!applicationId.trim()}>
                  Link
                </Button>
              </div>
            )}
            {linkError ? (
              <p className="mt-2 text-sm text-red-700">{linkError}</p>
            ) : null}
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
