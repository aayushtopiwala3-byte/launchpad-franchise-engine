"use client";

// One partner's journey, seen by company staff. Everything on this page is derived from the
// task and document records below it — there is no stored "status" to edit, so the summary at
// the top cannot disagree with the detail underneath.

import Link from "next/link";
import { Suspense, use } from "react";
import {
  ActivityLog,
  LaunchReadinessCard,
  MilestoneCard,
  ProgressHeader,
} from "../../../components/onboarding/Journey";
import { AppShell } from "../../../components/shell/AppShell";
import {
  Banner,
  Card,
  CardHeader,
  DemoBadge,
  EmptyState,
  Field,
  NotStated,
} from "../../../components/ui/primitives";
import { useOnboardingRecord } from "../../../lib/state/derive";
import { useFirstPaint } from "../../../lib/state/firstPaint";
import { useStore } from "../../../lib/state/store";

/** No account system exists, so the name recorded against a brand action says exactly that. */
const BRAND_ACTOR_NAME = "Expansion team (this browser)";

export default function OnboardingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <AppShell>
      <Suspense fallback={null}>
        <Resolved params={params} />
      </Suspense>
    </AppShell>
  );
}

function Resolved({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <Body applicationId={decodeURIComponent(id)} />;
}

function Body({ applicationId }: { applicationId: string }) {
  const record = useOnboardingRecord(applicationId);
  const { journeyProgress, result, hydrated } = useStore();
  const painted = useFirstPaint();

  if (!painted || !hydrated) {
    return (
      <Card>
        <EmptyState title="Loading…" body="Reading anything saved in this browser." />
      </Card>
    );
  }

  if (!record) {
    return (
      <Card>
        <EmptyState
          title="No journey for that application"
          body={`A journey exists only for an application the engine approved. ${applicationId} is not approved in this session, or no data is loaded.`}
          action={
            <Link href="/onboarding" className="underline underline-offset-2">
              Back to all journeys
            </Link>
          }
        />
      </Card>
    );
  }

  const { profile, view } = record;
  const siteNotes = journeyProgress[applicationId]?.siteNotes ?? null;
  const applicant = result?.applicants.find((a) => a.applicationId === applicationId) ?? null;

  return (
    <div className="space-y-4">
      <div>
        <Link href="/onboarding" className="text-sm text-muted underline underline-offset-2">
          ← All journeys
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">{profile.partnerName}</h1>
          {profile.isDemo ? <DemoBadge /> : null}
          <span className="font-mono text-sm text-muted">{profile.applicationId}</span>
        </div>
      </div>

      {profile.isDemo ? (
        <Banner tone="info" title="This is the sample partner">
          An invented record used to demonstrate the journey. It is not in the uploaded dataset
          and the engine has never seen it, so nothing you do here touches a real application.
        </Banner>
      ) : null}

      <Card>
        <CardHeader
          title="What the decision gave this partner"
          subtitle="Read from the engine's output. Onboarding cannot change any of it."
          action={
            applicant ? (
              <Link
                href={`/applicants/${encodeURIComponent(applicationId)}`}
                className="text-sm underline underline-offset-2"
              >
                Open the application
              </Link>
            ) : undefined
          }
        />
        <dl className="grid gap-3 px-4 py-3 sm:grid-cols-4">
          <Field label="City">{profile.city || <NotStated />}</Field>
          <Field label="Territory">{profile.territoryId ?? <NotStated />}</Field>
          <Field label="Pin code held">
            {profile.assignedPin ? (
              <span className="font-mono">{profile.assignedPin}</span>
            ) : (
              <NotStated />
            )}
          </Field>
          <Field label="Indicative launch date">
            {profile.illustrativeLaunchDate ? (
              <>
                {profile.illustrativeLaunchDate}{" "}
                <span className="text-xs text-muted">— indicative, not committed</span>
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
          tone={view.nextAction.owner === "Brand" ? "warn" : "info"}
          title={`Next: ${view.nextAction.label}`}
        >
          {view.nextAction.owner === "Brand"
            ? "This one is yours. The partner cannot move until it is recorded."
            : "This one belongs to the partner. Company staff cannot close it on their behalf."}
        </Banner>
      ) : null}

      <LaunchReadinessCard view={view} />

      {siteNotes ? (
        <Card>
          <CardHeader
            title="Site details the partner entered"
            subtitle="Entered by the partner in their own portal. Read-only here — correcting it on their behalf would hide who said what."
          />
          <p className="px-4 py-3 text-sm whitespace-pre-wrap">{siteNotes}</p>
        </Card>
      ) : null}

      <div className="stagger space-y-3">
        {view.milestones.map((m) => (
          <MilestoneCard
            key={m.def.key}
            applicationId={applicationId}
            milestone={m}
            actor="Brand"
            byName={BRAND_ACTOR_NAME}
          />
        ))}
      </div>

      <ActivityLog view={view} />

      <p className="rounded-lg border border-line bg-stone-50 px-3 py-2 text-xs text-muted">
        Actions here are recorded against &ldquo;{BRAND_ACTOR_NAME}&rdquo;. This product has no
        sign-in, so it cannot say which member of staff clicked — only that a brand-side control
        was used in this browser.
      </p>
    </div>
  );
}
