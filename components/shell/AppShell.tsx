"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { policyDifferences } from "../../lib/state/policy";
import { downloadRecovery } from "../../lib/state/persistence";
import { useStore } from "../../lib/state/store";
import { Banner, Button, cn } from "../ui/primitives";
import { HealthStrip } from "./HealthStrip";
import { RoleSwitcher } from "./RoleSwitcher";

const NAV = [
  { href: "/dashboard", label: "Command Centre" },
  { href: "/applicants", label: "Applicants" },
  { href: "/territories", label: "Territories" },
  { href: "/acquisition", label: "Partner Acquisition" },
  { href: "/onboarding", label: "Onboarding & Launch" },
  { href: "/chat", label: "Ask & Update" },
  { href: "/quality", label: "Data quality" },
  { href: "/timeline", label: "Timeline" },
  { href: "/policy", label: "Settings" },
];

function NavLinks({ pathname }: { pathname: string | null }) {
  return (
    <nav className="-mx-1 flex gap-0.5 overflow-x-auto" aria-label="Main">
      {NAV.map((item) => {
        const active = pathname === item.href || pathname?.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "shrink-0 rounded-xl px-2.5 py-1.5 text-sm font-semibold whitespace-nowrap transition-colors duration-150",
              active ? "bg-brand-soft text-brand" : "text-muted hover:bg-stone-100 hover:text-foreground",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

/** Split out so the pathname read sits behind its own Suspense boundary. */
function ActiveNav() {
  return <NavLinks pathname={usePathname()} />;
}

export function AppShell({ children }: { children: ReactNode }) {
  const store = useStore();
  const { policy, result, safeMode, rollbackBanner, corruptPayload, aiDegraded, lastDenial } =
    store;
  const differences = policyDifferences(policy);

  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-30 border-b border-line bg-surface/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5">
          <Link href="/" className="flex items-center gap-2">
            <span
              className="grid size-7 shrink-0 place-items-center rounded-[9px] bg-brand text-xs font-bold text-white shadow-[0_6px_14px_#7c3aed47]"
              aria-hidden
            >
              L
            </span>
            <span className="flex flex-col leading-tight">
              <span className="text-sm font-semibold tracking-tight">Launchpad</span>
              <span className="hidden text-xs text-muted sm:inline">{policy.brandName}</span>
            </span>
          </Link>
          <div className="ml-auto order-last w-full sm:order-none sm:ml-0 sm:w-auto sm:flex-1">
            <Suspense fallback={<NavLinks pathname={null} />}>
              <ActiveNav />
            </Suspense>
          </div>
          <RoleSwitcher />
          <HealthStrip />
        </div>
      </header>

      <div className="mx-auto w-full max-w-7xl space-y-3 px-4 pt-4 empty:hidden">
        {rollbackBanner ? (
          <Banner
            tone="error"
            title="The last change was rolled back — nothing on screen has changed"
            action={
              <Button size="sm" variant="secondary" onClick={store.dismissRollback}>
                Dismiss
              </Button>
            }
          >
            {rollbackBanner}
          </Banner>
        ) : null}

        {lastDenial ? (
          <Banner
            tone="warn"
            title="That change was refused, and nothing was written"
            action={
              <Button size="sm" variant="secondary" onClick={store.dismissDenial}>
                Dismiss
              </Button>
            }
          >
            {lastDenial} The refusal happened where the data is written, so the record is
            untouched — see Settings for what each role may do and why this is not a login.
          </Banner>
        ) : null}

        {corruptPayload ? (
          <Banner
            tone="warn"
            title="Saved data could not be read, so it was reset"
            action={
              <Button
                size="sm"
                variant="secondary"
                onClick={() => downloadRecovery(corruptPayload)}
              >
                Download the old copy
              </Button>
            }
          >
            Your work starts fresh. The unreadable copy is still downloadable if you want it.
          </Banner>
        ) : null}

        {aiDegraded ? (
          <Banner tone="warn" title="Explanations are rule-generated; AI polish is off">
            {aiDegraded} Every decision on screen was reached without it.
          </Banner>
        ) : null}

        {safeMode ? (
          <Banner tone="info" title="Safe mode">
            AI and saving are switched off. Every decision still works — the rules never needed
            either of them.
          </Banner>
        ) : null}

        {differences.length > 0 ? (
          <Banner
            tone="warn"
            title={`Custom policy active — ${differences.length} threshold${differences.length === 1 ? "" : "s"} differ from brand default`}
            action={
              <Link href="/policy">
                <Button size="sm" variant="secondary">
                  Review
                </Button>
              </Link>
            }
          >
            Profile: {policy.name}. Decisions below use these thresholds, not the brand defaults.
          </Banner>
        ) : null}
      </div>

      <main className="anim-fade mx-auto w-full max-w-7xl flex-1 px-4 py-4">{children}</main>

      <footer className="no-print border-t border-line">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-xs text-muted">
          <span>
            Rules decide, AI explains. Every verdict here comes from deterministic rules you can
            read.
          </span>
          <div className="ml-auto flex gap-3">
            <Link href="/system" className="underline underline-offset-2">
              System log
            </Link>
            <Link href="/features" className="underline underline-offset-2">
              Features
            </Link>
            <Link href="/calibration" className="underline underline-offset-2">
              Calibration
            </Link>
            <a href="?safe=1" className="underline underline-offset-2">
              Safe mode
            </a>
            {result ? <span className="tabular-nums">Result {result.resultHash}</span> : null}
          </div>
        </div>
      </footer>
    </div>
  );
}
