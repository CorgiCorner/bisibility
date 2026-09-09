"use client";

import {
  HEADER_SPEND_CAP_TOOLTIP,
  headerNoCapAriaLabel,
  headerNoCapLabel,
} from "@/components/cost-estimate/header-spend-cap-copy";
import { formatProviderBudgetUsedLabel } from "@/components/cost-estimate/provider-spend-label";
import { spendFillClass, spendTone } from "@/components/cost-estimate/spend-tone";
import { quietChipVariants } from "@/components/ui/quiet-chip-styles";
import { Tooltip } from "@/components/ui/Tooltip";
import { appPath, type ProjectRef } from "@/lib/routing/app-path";
import { cn } from "@/lib/ui/cn";
import Link from "next/link";

export type HeaderProviderSpendProps = {
  action: "details" | "set_budget" | null | undefined;
  recorded: { cents: number; units: number } | null;
  projectRef: ProjectRef;
  tightest: { provider: string; usedPercent: number } | null;
  usedPercent: number | null;
};

const pillClassName = cn(
  quietChipVariants({ size: "sm" }),
  "max-w-none font-sans text-[10.5px] font-semibold leading-none tabular-nums text-fg transition-colors",
);

const linkPillClassName = cn(
  pillClassName,
  "no-underline hover:border-border-control hover:bg-bg-inset active:bg-bg-inset",
);

function CapMiniBar({ percent }: Readonly<{ percent: number }>) {
  const tone = spendTone(percent, true);
  return (
    <span
      aria-hidden
      className="relative h-1 w-9 shrink-0 overflow-hidden rounded-full border border-border-strong bg-transparent"
    >
      <span
        className={cn("absolute inset-y-0 left-0 rounded-full", spendFillClass[tone])}
        style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
      />
    </span>
  );
}

function WarningDot() {
  return (
    <span
      aria-hidden
      className="h-1.5 w-1.5 shrink-0 rounded-full"
      style={{ backgroundColor: "var(--yellow)" }}
    />
  );
}

// Compact monthly-cap pill for the app header. Figures come from the server read model.
export function HeaderProviderSpend({
  action,
  recorded,
  projectRef,
  usedPercent,
}: Readonly<HeaderProviderSpendProps>) {
  if (action === null) {
    return null;
  }

  if (recorded == null || action === undefined) {
    return (
      <div className="hidden self-center md:flex md:items-center">
        <span className={cn(pillClassName, "text-fg-muted")}>Spend unavailable</span>
      </div>
    );
  }

  const usageHref = appPath(projectRef, "settings", "usage");
  const setCapHref = `${usageHref}?budget=edit`;
  const spentCents = recorded.cents;

  if (action === "set_budget" || usedPercent == null) {
    return (
      <div className="hidden self-center md:flex md:items-center">
        <Tooltip
          content={HEADER_SPEND_CAP_TOOLTIP}
          placement="bottom"
          wrapperClassName="items-center"
        >
          <Link
            aria-label={headerNoCapAriaLabel(spentCents)}
            className={cn(linkPillClassName, "gap-1.5")}
            href={setCapHref}
          >
            <WarningDot />
            <span>{headerNoCapLabel(spentCents)}</span>
          </Link>
        </Tooltip>
      </div>
    );
  }

  const usedLabel = formatProviderBudgetUsedLabel(usedPercent);
  return (
    <div className="hidden self-center md:flex md:items-center">
      <Tooltip
        content={HEADER_SPEND_CAP_TOOLTIP}
        placement="bottom"
        wrapperClassName="items-center"
      >
        <Link
          aria-label={`Monthly cap ${usedLabel}`}
          className={cn(linkPillClassName, "gap-2")}
          href={usageHref}
        >
          <CapMiniBar percent={usedPercent} />
          <span>{usedLabel}</span>
        </Link>
      </Tooltip>
    </div>
  );
}
