"use client";

import { EmptyState } from "@/components/ui/EmptyState";
import { ModuleMark } from "@/components/ui/ModuleMark";
import type { FeedFacet } from "@/lib/feeds/facets";
import { appPath } from "@/lib/routing/app-path";
import { BellIcon as Bell } from "@phosphor-icons/react/dist/csr/Bell";
import { BellRingingIcon as BellRinging } from "@phosphor-icons/react/dist/csr/BellRinging";
import { CheckCircleIcon as CheckCircle } from "@phosphor-icons/react/dist/csr/CheckCircle";
import { PlusIcon as Plus } from "@phosphor-icons/react/dist/csr/Plus";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

export function AlertsSetupEmpty({
  action,
  canCreateKeyword,
  projectRef,
}: Readonly<{ action?: ReactNode; canCreateKeyword: boolean; projectRef: string }>) {
  const t = useTranslations("projectAlerts.empty");

  return (
    <EmptyState
      action={
        canCreateKeyword
          ? (action ?? (
              <Link
                className="inline-flex min-h-10 items-center gap-[7px] rounded-control bg-accent-solid px-4.5 text-[13.5px] font-semibold text-accent-on-solid outline-none transition-colors hover:bg-accent-solid-hover focus-visible:bg-accent-solid-hover"
                href={appPath(projectRef, "rank-tracker")}
              >
                <Plus aria-hidden size={14} weight="regular" />
                {t("addKeyword")}
              </Link>
            ))
          : undefined
      }
      description={t("setupDescription")}
      footnote={t("setupFootnote")}
      mark={<ModuleMark bordered icon={Bell} />}
      title={t("setupTitle")}
    />
  );
}

export function AlertsAllClear({
  action,
  activeRuleCount,
}: Readonly<{
  action?: ReactNode;
  activeRuleCount: number;
}>) {
  const t = useTranslations("projectAlerts.empty");

  return (
    <EmptyState
      action={action}
      description={t("clearDescription", { count: activeRuleCount })}
      footnote={
        <span className="flex flex-wrap items-center justify-center gap-3">
          <span className="inline-flex items-center gap-1.5">
            <CheckCircle aria-hidden className="text-green-text" size={13} weight="regular" />
            {t("activeRuleCount", { count: activeRuleCount })}
          </span>
          <span className="h-[11px] w-px bg-border" />
          <span>{t("nothingFired")}</span>
        </span>
      }
      icon={<BellRinging aria-hidden size={27} weight="regular" />}
      title={t("clearTitle")}
      tone="positive"
    />
  );
}

export function AlertsCaughtUp({ snoozedCount }: Readonly<{ snoozedCount: number }>) {
  const t = useTranslations("projectAlerts.empty");

  return (
    <EmptyState
      description={t("caughtUpDescription", { count: snoozedCount })}
      icon={<BellRinging aria-hidden size={27} weight="regular" />}
      title={t("caughtUpTitle")}
      tone="positive"
    />
  );
}

export function AlertsFilteredEmpty({ facets }: Readonly<{ facets: readonly FeedFacet[] }>) {
  const t = useTranslations("projectAlerts.empty");

  return (
    <EmptyState
      description={t("filteredDescription")}
      icon={<BellRinging aria-hidden size={27} weight="regular" />}
      title={t("filteredTitle")}
      footnote={t("activeFilters", { count: facets.length })}
    />
  );
}
