"use client";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { UsageMeter } from "@/components/usagekit/usage-meter";
import type { ProjectBudgetRow } from "@/lib/metering/project-budget-display";
import { overviewPercent } from "@/lib/metering/usage-limit-view";
import type { Figure } from "@usagekit/views";
import type { ReactNode } from "react";
import { useLimitText } from "./ProviderLimitRows";

export type ProjectLimitItem = {
  id: "own" | "credits" | "single";
  label: string;
  scope: string;
  row: ProjectBudgetRow | undefined;
  /** Usage to show when the limit is optional and not set, such as Credits charges. */
  used?: Figure;
  /** Replaces "No limit" when there is no limit row, for example a shared project limit. */
  status?: string;
  onEdit?: () => void;
  editLabel?: string;
};

function ProjectLimitCell({ item }: { item: ProjectLimitItem }) {
  const text = useLimitText();
  const { row } = item;
  const capped = row ? text.capped(row) : false;
  const percent = row && row.level !== "unavailable" ? overviewPercent(row) : null;
  return (
    <div className="min-w-0 space-y-2" data-project-limit-item={item.id}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="break-words text-sm font-medium">{item.label}</p>
          <p className="break-words text-xs text-fg-muted">{item.scope}</p>
        </div>
        {item.onEdit && (
          <Button
            size="xs"
            variant="secondary"
            className="max-sm:min-h-11"
            aria-label={item.editLabel}
            onClick={item.onEdit}
          >
            {capped ? text.t("edit") : text.t("setLimit")}
          </Button>
        )}
      </div>
      <p className="break-words text-xl font-semibold tracking-tight tabular-nums">
        {row
          ? text.headline(row)
          : item.used
            ? text.t("used", { used: text.amount(item.used) })
            : (item.status ?? text.t("noLimit"))}
      </p>
      {row && capped && percent !== null && (
        <UsageMeter
          percent={percent}
          level={row.level === "unavailable" ? undefined : row.level}
          label={item.label}
          valueText={text.headline(row)}
          size="sm"
        />
      )}
      {!row && item.used && (
        <p className="text-xs text-fg-muted">{item.status ?? text.t("noLimit")}</p>
      )}
      {row && (
        <p className={`text-xs ${row.level === "exceeded" ? "text-red-text" : "text-fg-muted"}`}>
          {text.status(row)}
        </p>
      )}
    </div>
  );
}

/** Every project-wide monthly limit in one card; Cloud passes Credits next to your keys. */
export function ProjectLimitsCard({
  projectName,
  items,
  children,
}: {
  projectName: string;
  items: readonly ProjectLimitItem[];
  /** Host extras under the limits, such as the Credit balance. */
  children?: ReactNode;
}) {
  const text = useLimitText();
  if (!items.length) return null;
  return (
    <Card className="min-w-0 space-y-4" data-project-limits>
      <div>
        <h2 className="text-[15px] font-semibold">
          {items.length > 1 ? text.t("projectTitlePlural") : text.t("projectTitle")}
        </h2>
        <p className="mt-1 break-words text-xs text-fg-muted">
          {text.t("projectDescription", { project: projectName })}
        </p>
      </div>
      <div
        className={`grid min-w-0 gap-4 ${items.length > 1 ? "sm:grid-cols-2 sm:gap-0 sm:divide-x sm:divide-border sm:[&>*:first-child]:pr-4 sm:[&>*+*]:pl-4" : ""}`}
      >
        {items.map((item) => (
          <ProjectLimitCell key={item.id} item={item} />
        ))}
      </div>
      {children}
    </Card>
  );
}
