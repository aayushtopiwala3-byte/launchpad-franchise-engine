"use client";

// The frame around the franchise owner's view. It is deliberately not the staff shell: the
// staff navigation is absent, because a partner has no business in the applicant list, and
// its absence is the honest way to show that — this product has no sign-in, so there is no
// real boundary to enforce and pretending otherwise would be the lie.

import Link from "next/link";
import type { ReactNode } from "react";
import { useStore } from "../../lib/state/store";

export function OwnerShell({ children }: { children: ReactNode }) {
  const { policy } = useStore();

  return (
    <div className="flex min-h-full flex-col bg-stone-50">
      <header className="sticky top-0 z-30 border-b border-line bg-surface/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5">
          <div className="min-w-0">
            <p className="text-sm font-semibold tracking-tight">{policy.brandName}</p>
            <p className="text-xs text-muted">Franchise owner dashboard</p>
          </div>
          <Link
            href="/dashboard"
            className="ml-auto shrink-0 rounded-md border border-line px-2.5 py-1.5 text-sm hover:bg-stone-50"
          >
            ← Back to the Command Centre
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 space-y-4 px-4 py-4">{children}</main>

      <footer className="border-t border-line">
        <div className="mx-auto max-w-3xl px-4 py-3 text-xs text-muted">
          This view has no sign-in behind it. It is a demonstration of what a partner would see,
          not an access-controlled account — anyone with the link reaches the same sample record.
        </div>
      </footer>
    </div>
  );
}
