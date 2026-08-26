"use client";

import { appPath, type ProjectRef } from "@/lib/routing/app-path";
import { DOCS_URL } from "@/lib/site/site";
import { ProviderSpendMeter } from "./ProviderSpendMeter";

export type HeaderProviderSpendProps = {
  recorded: { cents: number; units: number } | null;
  projectRef: ProjectRef;
  tightest: { provider: string; usedPercent: number } | null;
  usedPercent: number | null;
};

// Compact provider-spend meter for the app header. Its figures are the server
// read model, so the displayed amount and allocation percentage always agree.
export function HeaderProviderSpend({
  recorded,
  projectRef,
  tightest,
  usedPercent,
}: Readonly<HeaderProviderSpendProps>) {
  if (recorded == null) {
    return (
      <div
        aria-label="Provider spend temporarily unavailable"
        className="hidden min-w-[210px] flex-none pt-[3px] md:block"
      >
        <span className="block font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-fg-muted">
          BUDGET
        </span>
        <span className="mt-1 block font-mono text-xs text-fg-muted">Temporarily unavailable</span>
      </div>
    );
  }

  return (
    <div className="hidden min-w-[210px] flex-none pt-[3px] md:block">
      <ProviderSpendMeter
        capCents={null}
        docsHref={`${DOCS_URL}/integrations#budget-cap`}
        editBudgetHref={appPath(projectRef, "settings", "usage")}
        recorded={recorded}
        spentCents={recorded.cents}
        tightest={tightest}
        usedPercent={usedPercent}
        variant="header"
      />
    </div>
  );
}
