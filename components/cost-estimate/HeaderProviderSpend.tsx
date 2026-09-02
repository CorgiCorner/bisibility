"use client";

import { appPath, type ProjectRef } from "@/lib/routing/app-path";
import { DOCS_URL } from "@/lib/site/site";
import { ProviderSpendMeter } from "./ProviderSpendMeter";

export type HeaderProviderSpendProps = {
  action: "details" | "set_budget" | null | undefined;
  recorded: { cents: number; units: number } | null;
  projectRef: ProjectRef;
  tightest: { provider: string; usedPercent: number } | null;
  usedPercent: number | null;
};

// Compact provider-spend meter for the app header. Its figures are the server
// read model, so the displayed amount and allocation percentage always agree.
export function HeaderProviderSpend({
  action,
  recorded,
  projectRef,
  tightest,
  usedPercent,
}: Readonly<HeaderProviderSpendProps>) {
  if (action === null) return null;
  if (recorded == null || action === undefined) {
    return (
      <div
        aria-label="Provider spend temporarily unavailable"
        className="hidden min-w-[210px] flex-none pt-[3px] md:block"
      >
        <span className="block font-sans tabular-nums text-[10px] font-medium uppercase tracking-[0.08em] text-fg-muted">
          BUDGET
        </span>
        <span className="mt-1 block font-sans tabular-nums text-xs text-fg-muted">
          Temporarily unavailable
        </span>
      </div>
    );
  }

  return (
    <div className="hidden min-w-[210px] flex-none pt-[3px] md:block">
      <ProviderSpendMeter
        capCents={null}
        docsHref={`${DOCS_URL}/integrations#budget-cap`}
        headerAction={{
          href:
            action === "set_budget"
              ? `${appPath(projectRef, "settings", "usage")}?budget=edit`
              : appPath(projectRef, "settings", "usage"),
          label: action === "set_budget" ? "Set budget" : "Details",
        }}
        recorded={recorded}
        spentCents={recorded.cents}
        tightest={tightest}
        usedPercent={usedPercent}
        variant="header"
      />
    </div>
  );
}
