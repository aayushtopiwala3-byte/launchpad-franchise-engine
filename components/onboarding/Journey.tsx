"use client";

// The milestone, task and document controls, shared by the internal onboarding workspace and
// the franchise owner portal. One component, one `actor` prop — so the two views cannot drift
// apart on who is allowed to close what, and the partner-facing side is not a second
// implementation that might forget a rule.
//
// Nothing here writes a milestone status or a percentage. It writes task records and document
// records, and everything else on screen is derived from those by `buildJourney`.

import { useState } from "react";
import { MILESTONE_BY_KEY } from "../../lib/onboarding/config";
import type {
  Actor,
  DocumentState,
  JourneyView,
  MilestoneStatus,
  MilestoneView,
} from "../../lib/onboarding/types";
import { useStore } from "../../lib/state/store";
import {
  Banner,
  Button,
  Card,
  CardHeader,
  ProgressBar,
  ProgressRing,
  Select,
  TextInput,
  cn,
} from "../ui/primitives";

const STATUS_STYLE: Record<MilestoneStatus, string> = {
  Complete: "border-emerald-200 bg-emerald-50 text-emerald-800",
  "Awaiting brand verification": "border-sky-200 bg-sky-50 text-sky-800",
  "In progress": "border-amber-200 bg-amber-50 text-amber-900",
  "Not started": "border-stone-200 bg-stone-100 text-stone-600",
  Blocked: "border-stone-300 bg-stone-50 text-stone-500",
};

const STATUS_ACCENT: Record<MilestoneStatus, string> = {
  Complete: "bg-emerald-500",
  "Awaiting brand verification": "bg-sky-500",
  "In progress": "bg-amber-500",
  "Not started": "bg-stone-300",
  Blocked: "bg-stone-200",
};

const DOC_STYLE: Record<DocumentState, string> = {
  Accepted: "border-emerald-200 bg-emerald-50 text-emerald-800",
  "Under review": "border-sky-200 bg-sky-50 text-sky-800",
  Submitted: "border-stone-200 bg-stone-100 text-stone-700",
  "Needs correction": "border-red-200 bg-red-50 text-red-800",
  "Not submitted": "border-stone-200 bg-stone-50 text-stone-500",
};

/** A partner says a document has been sent. Only the brand can judge it. */
const PARTNER_DOC_STATES: DocumentState[] = ["Not submitted", "Submitted"];
const BRAND_DOC_STATES: DocumentState[] = [
  "Submitted",
  "Under review",
  "Accepted",
  "Needs correction",
];

export function MilestoneChip({ status }: { status: MilestoneStatus }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap",
        STATUS_STYLE[status],
      )}
    >
      {status}
    </span>
  );
}

export function DocChip({ state }: { state: DocumentState }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded border px-1.5 py-0.5 text-xs font-medium whitespace-nowrap",
        DOC_STYLE[state],
      )}
    >
      {state}
    </span>
  );
}

/**
 * The percentage and the weights it came from, never one without the other. The figure is
 * completed milestone weight over total configured weight — it is not a guess at how close
 * the store is to opening, and the line underneath says so.
 */
export function ProgressHeader({ view }: { view: JourneyView }) {
  return (
    <Card className="px-4 py-3">
      <div className="flex items-center gap-4">
        <ProgressRing
          percent={view.percentComplete}
          label={`${view.percentComplete} per cent of configured milestone weight complete`}
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <p className="text-sm font-medium">Journey progress</p>
            <p className="text-sm tabular-nums">
              <span className="text-lg font-semibold">{view.percentComplete}%</span>{" "}
              <span className="text-muted">
                — {view.completedWeight} of {view.totalWeight} configured milestone weight
              </span>
            </p>
          </div>
          <ProgressBar
            className="mt-2"
            percent={view.percentComplete}
            label={`${view.percentComplete} per cent of configured milestone weight complete`}
          />
        </div>
      </div>
      <p className="mt-2 text-xs text-muted">
        Weighted by the milestone weights in{" "}
        <code className="font-mono">lib/onboarding/config.ts</code>, counting only milestones
        whose every task and mandatory document is complete. A part-finished milestone counts
        nothing, so this number never runs ahead of the work.
      </p>
    </Card>
  );
}

/**
 * Four separate facts, never collapsed into one. "The partner has finished their list" and
 * "the store may open" are different claims, and a product that merges them tells a partner
 * they can open when nobody has said so.
 */
export function LaunchReadinessCard({ view }: { view: JourneyView }) {
  const l = view.launch;
  const tone =
    l.verdict === "Store opened" || l.verdict === "Authorised to open"
      ? "success"
      : l.verdict === "Awaiting brand authorisation"
        ? "info"
        : "warn";

  return (
    <Card>
      <CardHeader
        title="Launch readiness"
        subtitle="Only the brand's authorisation task makes a store authorised to open. Finishing a personal checklist is not permission."
      />
      <div className="space-y-3 px-4 py-3">
        <Banner tone={tone} title={l.verdict}>
          {l.verdict === "Partner work outstanding"
            ? "Something mandatory is still open. The list below names every one of them."
            : l.verdict === "Awaiting brand authorisation"
              ? "Everything mandatory is done. The store still may not open until the brand issues the authorisation."
              : l.verdict === "Authorised to open"
                ? "The brand has issued the authorisation. The opening itself has not been recorded yet."
                : "The brand recorded that the store opened."}
        </Banner>

        <dl className="grid gap-2 sm:grid-cols-2">
          <Check
            label="Partner tasks complete"
            yes={l.partnerTasksComplete}
            no="Some tasks the partner owns are still open."
            yesText="Every task the partner owns is closed."
          />
          <Check
            label="Brand verification complete"
            yes={l.brandVerificationComplete}
            no="Company staff still have checks to record."
            yesText="Every brand check before launch is recorded."
          />
          <Check
            label="Authorisation to open issued"
            yes={l.authorised}
            no="No brand user has issued it."
            yesText="Issued by a brand user."
          />
          <Check
            label="Nothing mandatory outstanding"
            yes={l.outstandingMandatory.length === 0}
            no={`${l.outstandingMandatory.length} mandatory item${l.outstandingMandatory.length === 1 ? "" : "s"} open.`}
            yesText="Nothing mandatory is open."
          />
        </dl>

        {l.outstandingMandatory.length > 0 ? (
          <div>
            <p className="text-xs font-medium text-muted">
              Outstanding, with who owns each one
            </p>
            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm">
              {l.outstandingMandatory.map((o, i) => (
                <li key={i}>
                  {o.label} <span className="text-muted">— {o.owner}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </Card>
  );
}

function Check({
  label,
  yes,
  yesText,
  no,
}: {
  label: string;
  yes: boolean;
  yesText: string;
  no: string;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border px-3 py-2 transition-colors duration-150",
        yes ? "border-emerald-200 bg-emerald-50/50" : "border-line",
      )}
    >
      <dt className="text-xs font-medium text-muted">{label}</dt>
      <dd className={cn("mt-0.5 text-sm", yes ? "text-emerald-800" : "text-stone-700")}>
        {yes ? yesText : no}
      </dd>
    </div>
  );
}

export function MilestoneCard({
  applicationId,
  milestone,
  actor,
  byName,
}: {
  applicationId: string;
  milestone: MilestoneView;
  actor: Actor;
  byName: string;
}) {
  const blocked = milestone.status === "Blocked";
  const blockers = milestone.blockedBy
    .map((k) => MILESTONE_BY_KEY.get(k)?.title ?? k)
    .join(", ");

  return (
    <Card className="lift relative overflow-hidden">
      {/* The stripe repeats the status chip in colour alone, so it adds no claim of its own. */}
      <span
        className={cn("absolute inset-y-0 left-0 w-1", STATUS_ACCENT[milestone.status])}
        aria-hidden
      />
      <CardHeader
        title={
          <span className="flex flex-wrap items-center gap-2 pl-1.5">
            <span className="text-muted tabular-nums">{milestone.def.number}.</span>
            {milestone.def.title}
            <MilestoneChip status={milestone.status} />
            <span className="text-xs font-normal text-muted">
              owned by {milestone.def.owner}
            </span>
          </span>
        }
        subtitle={milestone.def.description}
      />

      <div className="space-y-3 px-4 py-3">
        <p className="text-xs text-muted">
          Counts as complete when: {milestone.def.completionCriteria}
        </p>

        {blocked ? (
          <Banner tone="info" title="Waiting on an earlier milestone">
            {blockers} must be complete first. The controls here stay closed until then, so a
            step cannot be recorded out of order.
          </Banner>
        ) : null}

        {milestone.dueDate ? (
          <p className="text-xs text-muted">
            Date to aim at: {milestone.dueDate}.{" "}
            {milestone.dueDateIsIllustrative
              ? "Borrowed from the engine's indicative plan. It is not a date the brand has committed to."
              : null}
          </p>
        ) : null}

        {milestone.tasks.length > 0 ? (
          <ul className="space-y-1.5">
            {milestone.tasks.map((t) => (
              <TaskRow
                key={t.def.id}
                applicationId={applicationId}
                task={t}
                actor={actor}
                byName={byName}
                blocked={blocked}
                derived={milestone.def.key === "approved"}
                derivedComplete={milestone.status === "Complete"}
              />
            ))}
          </ul>
        ) : null}

        {milestone.documents.length > 0 ? (
          <div className="border-t border-line pt-3">
            <p className="text-xs font-medium text-muted">
              Documents. No file is ever uploaded — this product has no file storage, so a
              document marked sent means the partner says they sent it.
            </p>
            <ul className="mt-2 space-y-2">
              {milestone.documents.map((d) => (
                <DocumentRow
                  key={d.def.id}
                  applicationId={applicationId}
                  document={d}
                  actor={actor}
                  byName={byName}
                />
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </Card>
  );
}

function TaskRow({
  applicationId,
  task,
  actor,
  byName,
  blocked,
  derived,
  derivedComplete,
}: {
  applicationId: string;
  task: MilestoneView["tasks"][number];
  actor: Actor;
  byName: string;
  blocked: boolean;
  derived: boolean;
  derivedComplete: boolean;
}) {
  const { setJourneyTask } = useStore();
  const done = task.record !== null;
  const mine = task.def.completedBy === actor;

  // Milestone 1 is not a button. It is true exactly when the engine's decision says so, and
  // showing an unchecked box beside a complete milestone would invite someone to "fix" it.
  if (derived) {
    return (
      <li className="flex flex-wrap items-baseline gap-x-2 rounded-lg border border-line px-3 py-2 text-sm">
        <span className={derivedComplete ? "text-emerald-800" : "text-muted"}>
          {derivedComplete ? "Done" : "Not yet"}
        </span>
        <span>{task.def.label}</span>
        <span className="text-xs text-muted">
          Read from the decision engine, not recorded by a person. {task.def.help}
        </span>
      </li>
    );
  }

  const interactive = mine && !blocked;

  return (
    <li
      className={cn(
        "flex items-start gap-3 rounded-xl border border-line px-3 py-2 transition-colors duration-150",
        interactive && "hover:border-line-2 hover:bg-stone-50",
        done && "bg-emerald-50/40",
      )}
    >
      <input
        type="checkbox"
        className="accent-brand mt-0.5 size-4 shrink-0 disabled:cursor-not-allowed"
        checked={done}
        disabled={!interactive}
        aria-label={task.def.label}
        onChange={() => setJourneyTask(applicationId, task.def.id, !done, actor, byName)}
      />
      <div className="min-w-0 text-sm">
        <p className={done ? "text-muted line-through" : undefined}>{task.def.label}</p>
        <p className="text-xs text-muted">
          {!mine
            ? `${task.def.completedBy} closes this one. You cannot, and the store refuses it even if the control is reached another way.`
            : blocked
              ? "Waiting on an earlier milestone."
              : (task.def.help ?? `Closed by ${task.def.completedBy}.`)}
        </p>
        {task.record ? (
          <p className="text-xs text-muted">
            Closed {task.record.at.slice(0, 10)} by {task.record.byName ?? task.record.by}.
          </p>
        ) : null}
      </div>
    </li>
  );
}

function DocumentRow({
  applicationId,
  document,
  actor,
  byName,
}: {
  applicationId: string;
  document: MilestoneView["documents"][number];
  actor: Actor;
  byName: string;
}) {
  const { setJourneyDocument } = useStore();
  const [fileName, setFileName] = useState(document.record.fileNameClaimed ?? "");
  const [note, setNote] = useState(document.record.note ?? "");

  const states = actor === "Partner" ? PARTNER_DOC_STATES : BRAND_DOC_STATES;
  // A partner may say a document was sent; they may not accept their own document, so once
  // the brand has started reviewing it the partner's control goes away.
  const locked =
    actor === "Partner" &&
    (document.record.state === "Under review" || document.record.state === "Accepted");

  const write = (state: DocumentState) =>
    setJourneyDocument(
      applicationId,
      document.def.id,
      {
        state,
        at: new Date().toISOString(),
        note: actor === "Brand" ? (note.trim() || null) : document.record.note,
        fileNameClaimed: fileName.trim() || null,
      },
      actor,
      byName,
    );

  return (
    <li className="rounded-xl border border-line px-3 py-2 transition-colors duration-150 hover:border-line-2">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="text-sm">{document.def.label}</span>
        {document.def.required ? (
          <span className="text-xs text-muted">required</span>
        ) : (
          <span className="text-xs text-muted">optional</span>
        )}
        <DocChip state={document.record.state} />
        {!locked ? (
          <Select
            className="ml-auto w-auto"
            aria-label={`State of ${document.def.label}`}
            value={states.includes(document.record.state) ? document.record.state : ""}
            onChange={(e) => write(e.target.value as DocumentState)}
          >
            <option value="" disabled>
              {document.record.state}
            </option>
            {states.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        ) : (
          <span className="ml-auto text-xs text-muted">
            With the brand. You cannot accept your own document.
          </span>
        )}
      </div>

      {document.def.help ? (
        <p className="mt-1 text-xs text-muted">{document.def.help}</p>
      ) : null}

      {!locked ? (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <TextInput
            className="w-auto flex-1"
            placeholder="File name you sent (optional)"
            aria-label={`File name claimed for ${document.def.label}`}
            value={fileName}
            onChange={(e) => setFileName(e.target.value)}
          />
          {actor === "Brand" ? (
            <TextInput
              className="w-auto flex-1"
              placeholder="Note to the partner (optional)"
              aria-label={`Note on ${document.def.label}`}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          ) : null}
        </div>
      ) : null}

      {document.record.fileNameClaimed ? (
        <p className="mt-1 text-xs text-muted">
          Named <code className="font-mono">{document.record.fileNameClaimed}</code> on{" "}
          {document.record.at.slice(0, 10)}. No copy is held here.
        </p>
      ) : null}

      {document.record.note ? (
        <p className="mt-1 rounded border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-900">
          {document.record.note}
        </p>
      ) : null}
    </li>
  );
}

export function ActivityLog({ view }: { view: JourneyView }) {
  const [all, setAll] = useState(false);
  const shown = all ? view.activity : view.activity.slice(0, 8);

  return (
    <Card>
      <CardHeader
        title="What has happened"
        subtitle="Append-only. Entries are added as tasks and documents change; nothing here is edited afterwards."
        action={
          view.activity.length > 8 ? (
            <Button size="sm" variant="ghost" onClick={() => setAll((v) => !v)}>
              {all ? "Show recent" : `Show all ${view.activity.length}`}
            </Button>
          ) : undefined
        }
      />
      {view.activity.length === 0 ? (
        <p className="px-4 py-3 text-sm text-muted">
          Nothing has been recorded against this journey yet.
        </p>
      ) : (
        <ul className="stagger divide-y divide-line">
          {shown.map((a) => (
            <li
              key={a.id}
              className="flex flex-wrap items-baseline gap-x-2 px-4 py-2 text-sm transition-colors duration-150 hover:bg-stone-50"
            >
              <span className="text-muted tabular-nums">{a.at.slice(0, 10)}</span>
              <span className="text-xs text-muted">{a.byName ?? a.by}</span>
              <span>{a.summary}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
