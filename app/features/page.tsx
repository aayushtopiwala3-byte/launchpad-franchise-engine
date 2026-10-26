"use client";

import { useState } from "react";
import { AppShell } from "../../components/shell/AppShell";
import { Banner, Button, Card, CardHeader, Toggle } from "../../components/ui/primitives";
import {
  ALL_OFF,
  ALL_ON,
  FEATURE_KEYS,
  FEATURE_LABELS,
  FEATURE_PRESETS,
  encodeFlags,
  presetNameFor,
} from "../../lib/state/features";
import { useStore } from "../../lib/state/store";
import type { FeatureFlags } from "../../lib/types";

/** Everything on this page is presentation or AI polish. None of it decides anything. */
export default function FeaturesPage() {
  const { flags, setFlags, toggleFlag, safeMode } = useStore();
  const [copied, setCopied] = useState(false);
  const preset = presetNameFor(flags);

  const shareUrl = () =>
    typeof window === "undefined"
      ? ""
      : `${window.location.origin}/dashboard?f=${encodeFlags(flags)}`;

  const copy = async () => {
    await navigator.clipboard.writeText(shareUrl());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const apply = (next: FeatureFlags) => {
    setFlags(next);
    setCopied(false);
  };

  return (
    <AppShell>
      <div className="space-y-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Features</h1>
          <p className="text-sm text-muted">
            Every switch here changes what you see, never what the rules decide. Turn them all off
            and the same applicants get the same verdicts, for the same reasons.
          </p>
        </div>

        <Banner tone="info" title="These switches cannot change a decision">
          The decision engine reads the policy profile and the uploaded file, and nothing else. A
          test in the suite runs the whole seed set twice — all switches on, then all off — and
          fails the build if a single verdict differs.
        </Banner>

        {safeMode ? (
          <Banner tone="warn" title="Safe mode is on, so the AI switches stay off">
            Leave safe mode by opening the app without <code>?safe=1</code>.
          </Banner>
        ) : null}

        <Card>
          <CardHeader
            title="Presets"
            subtitle={preset ? `Current setting matches “${preset}”.` : "Current setting is custom."}
          />
          <div className="flex flex-wrap gap-2 px-4 py-3">
            {Object.entries(FEATURE_PRESETS).map(([name, value]) => (
              <Button
                key={name}
                size="sm"
                variant={preset === name ? "primary" : "secondary"}
                onClick={() => apply(value)}
              >
                {name}
              </Button>
            ))}
            <Button size="sm" variant="ghost" onClick={() => apply(ALL_ON)}>
              Everything on
            </Button>
            <Button size="sm" variant="ghost" onClick={() => apply(ALL_OFF)}>
              Everything off
            </Button>
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Switches"
            subtitle="Saved in this browser. A shared link carries them too."
          />
          <div className="grid gap-2 px-4 py-4 sm:grid-cols-2">
            {FEATURE_KEYS.map((key) => (
              <Toggle
                key={key}
                checked={flags[key]}
                onChange={() => toggleFlag(key)}
                title={FEATURE_LABELS[key].title}
                help={FEATURE_LABELS[key].help}
                disabled={safeMode && (key === "aiExplanations" || key === "aiContradictionCheck")}
                disabledReason="Held off by safe mode."
              />
            ))}
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Share this exact setup"
            subtitle="The link opens the app with these switches, so a judge sees what you saw."
            action={
              <Button size="sm" variant="primary" onClick={() => void copy()}>
                {copied ? "Copied" : "Copy link"}
              </Button>
            }
          />
          <p className="px-4 py-3 font-mono text-xs break-all text-muted">
            /dashboard?f={encodeFlags(flags)}
          </p>
        </Card>
      </div>
    </AppShell>
  );
}
