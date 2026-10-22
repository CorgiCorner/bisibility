"use client";

import type { PlanStatus } from "@/components/shell/plan-status";
import { appPath } from "@/lib/routing/app-path";
import { cn } from "@/lib/ui/cn";
import Link from "next/link";
import { useTranslations } from "next-intl";

const badgeClassName = cn(
  "inline-flex min-w-0 max-w-full flex-none items-center rounded-full",
  "bg-accent-soft px-[7px] py-0.5 text-[9.5px] font-semibold text-accent-text",
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2",
  "focus-visible:outline-accent-solid",
);

export function PlanStatusBadge({
  collapsed = false,
  projectRef,
  status,
}: Readonly<{
  collapsed?: boolean;
  projectRef: string;
  status: PlanStatus;
}>) {
  const t = useTranslations("shell.planStatus");
  const fullLabel = status.kind === "pro" ? t("pro") : t("trialDays", { days: status.days });
  // The visible trial label stays short enough for the sidebar in every locale; the full
  // sentence remains the accessible name and tooltip.
  const visibleLabel =
    status.kind === "pro"
      ? fullLabel
      : collapsed
        ? t("trial")
        : t("trialDaysShort", { days: status.days });

  return (
    <Link
      aria-label={status.kind === "trial" ? fullLabel : undefined}
      title={status.kind === "trial" ? fullLabel : undefined}
      className={cn(badgeClassName, collapsed && "justify-center")}
      href={appPath(projectRef, "settings", "billing")}
    >
      <span className="whitespace-nowrap">{visibleLabel}</span>
    </Link>
  );
}
