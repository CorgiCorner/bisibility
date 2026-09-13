"use client";

import { formatProviderBudgetUsedLabel } from "@/components/cost-estimate/provider-spend-label";
import { SpendBar } from "@/components/cost-estimate/SpendBar";
import { spendTone } from "@/components/cost-estimate/spend-tone";
import { BudgetEditModal } from "@/components/settings/usage/BudgetEditModal";
import { ProviderUsageRow } from "@/components/settings/usage/ProviderUsageRow";
import { UsageCard } from "@/components/settings/usage/UsageCard";
import { Button } from "@/components/ui/Button";
import type { updateProviderConnectionAllocationAction } from "@/lib/actions/provider-allocation";
import { formatMoneyCents } from "@/lib/format/money";
import { createUserDateTimeFormatter } from "@/lib/format/user-datetime";
import type { ProjectProviderSpend } from "@/lib/queries/provider-spend";
import { appPath } from "@/lib/routing/app-path";
import type { ProviderUsageData } from "@/lib/settings/options";
import { metricEyebrowClassName } from "@/lib/ui/elevated-surface-styles";
import { WarningCircleIcon as WarningCircle } from "@phosphor-icons/react/dist/csr/WarningCircle";
import Link from "next/link";
import { useState } from "react";

type ProviderUsageCardProps = {
  canEditBudget: boolean;
  initialBudgetEditOpen?: boolean;
  projectId: string;
  projectRef: string;
  updateProviderAllocation: typeof updateProviderConnectionAllocationAction;
  usage: ProviderUsageData & { providerSpend: ProjectProviderSpend };
};

function Kpi({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div>
      <span className={metricEyebrowClassName}>{label}</span>
      <p className="m-0 mt-[5px] text-[15px] font-semibold text-fg tabular-nums">{value}</p>
    </div>
  );
}

function recordedSpend(recorded: ProjectProviderSpend["summary"]["recorded"]) {
  const values = [];
  if (recorded.cents) values.push(formatMoneyCents(recorded.cents));
  if (recorded.units) values.push(`${recorded.units.toLocaleString("en-US")} searches`);
  return values.length ? values.join(" + ") : "$0.00";
}

function periodLine(usage: ProviderUsageCardProps["usage"]) {
  const period = usage.providerSpend.summary.period;
  const formatter = createUserDateTimeFormatter({
    dateFormat: usage.period.dateFormat,
    timezone: "UTC",
  });
  const start = new Date(period.startsAt);
  const end = new Date(period.endsAt);
  const calendarMonth = start.getUTCDate() === 1 && end.getUTCDate() === 1;
  const range = calendarMonth
    ? formatter.formatMonthYear(start)
    : `${formatter.formatDate(start)} - ${formatter.formatDate(end)}`;
  const reset =
    period.daysUntilReset === 1 ? "resets in 1 day" : `resets in ${period.daysUntilReset} days`;
  return `${range} (UTC) · ${reset}`;
}

function projectionExplanation(usage: ProviderUsageCardProps["usage"]) {
  const projected = usage.providerSpend.summary.projected;
  if (projected.kind === "no_usage") return "No usage yet";
  if (projected.kind === "within_limits") return "within budgets";
  const formatter = createUserDateTimeFormatter({
    dateFormat: usage.period.dateFormat,
    timezone: "UTC",
  });
  const otherBelow = usage.providerSpend.connections
    .filter((item) => item.provider !== projected.provider)
    .every((item) => (item.usedPercent ?? 0) < 40);
  return `on pace to hit ${projected.provider} budget ${formatter.formatDate(new Date(projected.at))}${otherBelow ? " · other providers below 40%" : ""}`;
}

function projectionKpi(usage: ProviderUsageCardProps["usage"]) {
  const projected = usage.providerSpend.summary.projected;
  if (projected.kind === "no_usage") return "No usage yet";
  if (projected.kind === "within_limits") return "within budgets";
  const formatter = createUserDateTimeFormatter({
    dateFormat: usage.period.dateFormat,
    timezone: "UTC",
  });
  return `${projected.provider} budget by ${formatter.formatDate(new Date(projected.at))}`;
}

function attentionCopy(usage: ProviderUsageCardProps["usage"]) {
  const connections = usage.providerSpend.connections.filter((item) =>
    usage.providerSpend.summary.attention.includes(item.connectionId),
  );
  if (connections.length > 1)
    return `${connections.length} providers need attention. Check the provider settings.`;
  const connection = connections[0];
  if (!connection) return null;
  if (connection.state === "fallback_active") {
    const fallback = usage.providerSpend.connections.find(
      (item) =>
        item.connectionId !== connection.connectionId && item.enabled && item.state !== "capped",
    );
    return `${connection.provider} hit its budget - checks are falling back to ${fallback?.provider ?? "another provider"}.`;
  }
  if (connection.state === "top_up_required")
    return `${connection.provider} needs a top up before checks can continue.`;
  return `${connection.provider} hit its budget - checks are paused.`;
}

export function ProviderUsageCard({
  canEditBudget,
  initialBudgetEditOpen = false,
  projectId,
  projectRef,
  updateProviderAllocation,
  usage,
}: Readonly<ProviderUsageCardProps>) {
  const [editOpen, setEditOpen] = useState(initialBudgetEditOpen && canEditBudget);
  const { connections, summary } = usage.providerSpend;
  const banner = summary.attention.length ? attentionCopy(usage) : null;
  const summaryTone = spendTone(summary.maxUsedPercent ?? 0, summary.maxUsedPercent != null);
  return (
    <UsageCard
      action={
        canEditBudget ? (
          <Button onClick={() => setEditOpen(true)} size="sm" type="button" variant="secondary">
            Edit budget
          </Button>
        ) : null
      }
      className="min-h-0"
      description="Monthly budget and provider spend for this project. Checks pause once the budget is spent."
      id="provider-usage"
      title="Provider spend"
    >
      <p className="m-0 text-[12px] text-fg-muted">{periodLine(usage)}</p>
      {banner ? (
        <div className="mt-4 flex items-start gap-2.5 rounded-control border border-red/30 bg-[color-mix(in_srgb,var(--red)_8%,transparent)] px-3.5 py-3 text-[12.5px] leading-5 text-red-text">
          <WarningCircle aria-hidden className="mt-0.5 shrink-0" size={16} weight="regular" />
          <span>
            <span className="font-semibold">{banner}</span>{" "}
            <Link
              className="font-medium underline hover:no-underline"
              href={appPath(projectRef, "integrations")}
            >
              Connection settings
            </Link>
          </span>
        </div>
      ) : null}
      <section className="mt-4" aria-label="Budget used">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <span className={metricEyebrowClassName}>Budget used</span>
          {summary.tightest ? (
            <span className="font-sans tabular-nums text-[11px] text-fg-muted">
              tightest: {summary.tightest.provider} ·{" "}
              {formatProviderBudgetUsedLabel(summary.tightest.usedPercent)}
            </span>
          ) : (
            <span className="font-sans tabular-nums text-[11px] text-fg-muted">No budget set</span>
          )}
        </div>
        {summary.maxUsedPercent == null ? null : (
          <SpendBar
            ariaLabel="Budget used"
            className="mt-2 h-1.5 w-full overflow-hidden rounded-full"
            percent={summary.maxUsedPercent}
            roundedFill
            tone={summaryTone}
          />
        )}
        <p className="m-0 mt-2 font-sans tabular-nums text-[11px] text-fg-muted">
          {projectionExplanation(usage)}
        </p>
      </section>
      <div className="mt-4 grid grid-cols-2 gap-4 border-t border-border pt-4 sm:grid-cols-3">
        <Kpi label="Recorded spend" value={recordedSpend(summary.recorded)} />
        <Kpi label="Provider requests (mo)" value={summary.requestCount.toLocaleString("en-US")} />
        <Kpi label="Projected spend" value={projectionKpi(usage)} />
      </div>
      {connections.length ? (
        <ul className="m-0 mt-4 list-none border-t border-border p-0">
          {connections.map((connection) => (
            <ProviderUsageRow
              connection={connection}
              key={connection.connectionId}
              now={usage.period.now}
            />
          ))}
        </ul>
      ) : (
        <p className="m-0 mt-4 border-t border-border pt-4 text-[12px] text-fg-muted">
          Usage appears once a provider is connected.
        </p>
      )}
      {editOpen ? (
        <BudgetEditModal
          connections={connections}
          onClose={() => setEditOpen(false)}
          onSaved={() => setEditOpen(false)}
          projectId={projectId}
          projectRef={projectRef}
          updateProviderAllocation={updateProviderAllocation}
        />
      ) : null}
    </UsageCard>
  );
}
