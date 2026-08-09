"use client";

import { appPath, type ProjectRef } from "@/lib/routing/app-path";
import { DOCS_URL } from "@/lib/site/site";
import { ProviderSpendMeter } from "./ProviderSpendMeter";
import { useSessionSpend } from "./SessionSpendProvider";

export type HeaderProviderSpendProps = {
  capCents: number | null;
  projectRef: ProjectRef;
  spentCents: number | null;
};

// Compact provider-spend meter for the app header. The monthly figures come from
// the server render; session spend accrues client-side as paid lookups run.
export function HeaderProviderSpend({
  capCents,
  projectRef,
  spentCents,
}: Readonly<HeaderProviderSpendProps>) {
  const { sessionCents } = useSessionSpend();
  if (spentCents == null) {
    return (
      <div
        aria-label="Provider spend temporarily unavailable"
        className="hidden min-w-[210px] flex-none pt-[3px] md:block"
      >
        <span className="block font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-fg-muted">
          PROVIDER SPEND
        </span>
        <span className="mt-1 block font-mono text-xs text-fg-muted">Temporarily unavailable</span>
      </div>
    );
  }

  return (
    <div className="hidden min-w-[210px] flex-none pt-[3px] md:block">
      <ProviderSpendMeter
        capCents={capCents}
        docsHref={`${DOCS_URL}/integrations#budget-cap`}
        editBudgetHref={`${appPath(projectRef, "settings")}#provider-usage`}
        sessionCents={sessionCents}
        spentCents={spentCents}
        variant="header"
      />
    </div>
  );
}
