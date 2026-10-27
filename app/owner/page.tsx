"use client";

// The franchise owner's own view of their onboarding, for the sample partner.
//
// It is the same journey the expansion team sees on /onboarding/[id] — the same derivation,
// the same milestone components — rendered with actor="Partner". That is deliberate: two
// implementations of the same journey would eventually disagree, and the one place they must
// never disagree is who is allowed to close which step.

import { useMemo, useState } from "react";
import {
  ActivityLog,
  DocChip,
  LaunchReadinessCard,
  MilestoneCard,
  ProgressHeader,
} from "../../components/onboarding/Journey";
import { OwnerAssist } from "../../components/owner/OwnerAssist";
import { OwnerShell } from "../../components/shell/OwnerShell";
import {
  Banner,
  Button,
  Card,
  CardHeader,
  DemoBadge,
  EmptyState,
  Field,
  NotStated,
  TextArea,
} from "../../components/ui/primitives";
import { DEMO_APPLICATION_ID, demoOwnerProfile } from "../../lib/onboarding/demo";
import { useOnboardingRecord } from "../../lib/state/derive";
import { useStore } from "../../lib/state/store";

export default function OwnerPage() {
  const { hydrated, journeyProgress, restoreDemoRecords } = useStore();
  const record = useOnboardingRecord(DEMO_APPLICATION_ID);

  if (!hydrated) {
    return (
      <OwnerShell>
        <Card>
          <EmptyState title="Loading…" body="Reading anything saved in this browser." />
        </Card>
      </OwnerShell>
    );
  }

  if (!record || !journeyProgress[DEMO_APPLICATION_ID]) {
    return (
      <OwnerShell>
        <Card>
          <EmptyState
            title="The sample partner has been removed"
            body="This dashboard shows one invented partner. Somebody cleared the sample records in this browser, so there is nothing to show until they are put back."
            action={<Button onClick={restoreDemoRecords}>Restore the sample partner</Button>}
          />
        </Card>
      </OwnerShell>
    );
  }

  return (
    <OwnerShell>
      <Body />
    </OwnerShell>
  );
}

function Body() {
  const { journeyProgress, setSiteNotes, asOfDate } = useStore();
  const record = useOnboardingRecord(DEMO_APPLICATION_ID)!;
  const { profile, view } = record;

  const progress = journeyProgress[DEMO_APPLICATION_ID];
  const [notes, setNotes] = useState(progress?.siteNotes ?? "");
  const [notesSaved, setNotesSaved] = useState(false);

  const corrections = useMemo(
    () =>
      view.milestones
        .flatMap((m) => m.documents)
        .filter((d) => d.record.state === "Needs correction"),
    [view],
  );

  const asOf = asOfDate ?? new Date().toISOString().slice(0, 10);
  const contact = profile.supportContact ?? demoOwnerProfile(asOf).supportContact;

  return (
    <>
      <Banner tone="warn" title="Everything on this page is invented">
        This is a demonstration of the partner&apos;s view. &ldquo;{profile.partnerName}&rdquo; is
        not a real person, the engine has never decided their application, and no message you
        send from here reaches anybody.
      </Banner>

      <Card className="px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-semibold tracking-tight">
            Welcome, {profile.partnerName}
          </h1>
          <DemoBadge />
        </div>
        <dl className="mt-3 grid gap-3 sm:grid-cols-4">
          <Field label="City">{profile.city || <NotStated />}</Field>
          <Field label="Pin code held for you">
            {profile.assignedPin ? (
              <span className="font-mono">{profile.assignedPin}</span>
            ) : (
              <NotStated />
            )}
          </Field>
          <Field label="Territory">{profile.territoryId ?? <NotStated />}</Field>
          <Field label="Date to aim at">
            {profile.illustrativeLaunchDate ? (
              <>
                {profile.illustrativeLaunchDate}
                <span className="block text-xs text-muted">
                  Illustrative. Nobody at the brand has committed to this date.
                </span>
              </>
            ) : (
              <NotStated />
            )}
          </Field>
        </dl>
      </Card>

      <ProgressHeader view={view} />

      {view.nextAction ? (
        <Banner
          tone={view.nextAction.owner === "Partner" ? "info" : "success"}
          title={
            view.nextAction.owner === "Partner"
              ? `Your next step: ${view.nextAction.label}`
              : `Waiting on us: ${view.nextAction.label}`
          }
        >
          {view.nextAction.owner === "Partner"
            ? "Mark it below once it is done."
            : "Nothing is needed from you for this one. The brand will record it."}
        </Banner>
      ) : null}

      {corrections.length > 0 ? (
        <Card>
          <CardHeader
            title={`${corrections.length} document${corrections.length === 1 ? "" : "s"} came back`}
            subtitle="Each one says why. Send it again and mark it below."
          />
          <ul className="space-y-2 px-4 py-3">
            {corrections.map((d) => (
              <li key={d.def.id} className="text-sm">
                <span className="flex flex-wrap items-center gap-2">
                  {d.def.label} <DocChip state={d.record.state} />
                </span>
                {d.record.note ? (
                  <span className="mt-0.5 block text-xs text-muted">{d.record.note}</span>
                ) : null}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <LaunchReadinessCard view={view} />

      <Card>
        <CardHeader
          title="Your site"
          subtitle="Size, floor, frontage and rent for the unit you have found. The brand reads this before the visit — writing it here does not get the site approved."
        />
        <div className="space-y-2 px-4 py-3">
          <TextArea
            rows={3}
            aria-label="Site details"
            placeholder="Describe the unit: size, floor, frontage, rent…"
            value={notes}
            onChange={(e) => {
              setNotes(e.target.value);
              setNotesSaved(false);
            }}
          />
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              disabled={notes.trim() === (progress?.siteNotes ?? "").trim()}
              onClick={() => {
                setSiteNotes(DEMO_APPLICATION_ID, notes, profile.partnerName);
                setNotesSaved(true);
              }}
            >
              Save these details
            </Button>
            {notesSaved ? (
              <span className="text-sm text-muted">
                Saved in this browser. Nothing was sent anywhere.
              </span>
            ) : null}
          </div>
        </div>
      </Card>

      <OwnerAssist profile={profile} view={view} />

      <Card>
        <CardHeader
          title="Your journey, step by step"
          subtitle="Ten milestones. The ones marked as the brand's are shown so you can see where you are — you cannot tick them, and neither can anyone else on your behalf."
        />
      </Card>

      <div className="space-y-3">
        {view.milestones.map((m) => (
          <MilestoneCard
            key={m.def.key}
            applicationId={DEMO_APPLICATION_ID}
            milestone={m}
            actor="Partner"
            byName={profile.partnerName}
          />
        ))}
      </div>

      <ActivityLog view={view} />

      <Card>
        <CardHeader title="Who to ask" subtitle="Your contact at the brand." />
        {contact ? (
          <dl className="grid gap-3 px-4 py-3 sm:grid-cols-3">
            <Field label="Name">
              {contact.name}
              <span className="block text-xs text-muted">{contact.role}</span>
            </Field>
            <Field label="Email">{contact.email}</Field>
            <Field label="Phone">{contact.phone}</Field>
          </dl>
        ) : (
          <p className="px-4 py-3 text-sm text-muted">
            No contact is configured. Rather than invent one, this says so.
          </p>
        )}
        <p className="border-t border-line px-4 py-2 text-xs text-muted">
          These details are invented for the demonstration. The address does not receive mail and
          the number does not ring.
        </p>
      </Card>
    </>
  );
}
