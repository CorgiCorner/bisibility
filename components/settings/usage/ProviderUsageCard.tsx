"use client";

import { ProviderSpendMeter } from "@/components/cost-estimate/ProviderSpendMeter";
import {
  BudgetEditModal,
  type UpdateUsageBudget,
} from "@/components/settings/usage/BudgetEditModal";
import { UsageCard } from "@/components/settings/usage/UsageCard";
import { Button, ExternalLink, MonoText, StatusPill } from "@/components/ui";
import { formatMoneyCents } from "@/lib/format/money";
import type { ProviderConnectionUsageData, ProviderUsageData } from "@/lib/settings/options";
import { DOCS_URL, MARKETING_URL } from "@/lib/site/site";
import { PencilSimpleIcon as PencilSimple } from "@phosphor-icons/react";
import { useState } from "react";

type ProviderUsageCardProps = {
  canEditBudget: boolean;
  projectId: string;
  updateBudget: UpdateUsageBudget;
  usage: ProviderUsageData;
};

function connectionSpendCents(connection: ProviderConnectionUsageData) {
  return connection.rankChecks.costCents + (connection.lookups?.costCents ?? 0);
}

function UsageStat({
  label,
  value,
}: Readonly<{
  label: string;
  value: { costCents: number; count: number } | null;
}>) {
  return (
    <div>
      <MonoText className="tracking-[0.05em] uppercase" muted size="sm">
        {label}
      </MonoText>
      {value ? (
        <p className="m-0 mt-[5px] text-[13.5px] font-semibold text-fg tabular-nums">
          {value.count.toLocaleString("en-US")}
          <span className="font-mono text-[11px] font-normal text-fg-muted">
            {" "}
            · {formatMoneyCents(value.costCents)}
          </span>
        </p>
      ) : (
        <p className="m-0 mt-[5px] text-[12px] italic text-fg-muted">not supported</p>
      )}
    </div>
  );
}

function ConnectionUsage({ connection }: Readonly<{ connection: ProviderConnectionUsageData }>) {
  return (
    <li className="border-t border-border-soft pt-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[13.5px] font-semibold text-fg">{connection.provider}</span>
        {connection.primary ? (
          <StatusPill label="Primary" showDot={false} size="sm" status="optional" />
        ) : null}
      </div>
      <div className="mt-3 grid gap-4 sm:grid-cols-2">
        <UsageStat label="Rank checks (mo)" value={connection.rankChecks} />
        <UsageStat label="Keyword lookups (mo)" value={connection.lookups} />
      </div>
    </li>
  );
}

function Kpi({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div>
      <MonoText className="tracking-[0.05em] uppercase" muted size="sm">
        {label}
      </MonoText>
      <p className="m-0 mt-[5px] text-[15px] font-semibold text-fg tabular-nums">{value}</p>
    </div>
  );
}

export function ProviderUsageCard({
  canEditBudget,
  projectId,
  updateBudget,
  usage,
}: Readonly<ProviderUsageCardProps>) {
  const [editOpen, setEditOpen] = useState(false);
  const [savedCapCents, setSavedCapCents] = useState<number | null>(null);
  const capCents = savedCapCents ?? usage.budget.capCents;
  const ordered = [...usage.connections].sort((left, right) => {
    if (left.primary !== right.primary) return left.primary ? -1 : 1;
    return connectionSpendCents(right) - connectionSpendCents(left);
  });
  const providers = ordered.map((connection) => ({
    label: connection.provider,
    spentCents: connectionSpendCents(connection),
  }));
  const onPace =
    usage.onPaceCents == null
      ? "Available after day 2"
      : `~${formatMoneyCents(usage.onPaceCents)}/mo`;

  return (
    <UsageCard
      className="min-h-[510px]"
      description="SERP checks this month across connected providers. Provider invoices remain authoritative."
      id="provider-usage"
      title="Provider usage"
    >
      <div className="[&>div>div:first-child>span:last-child]:min-w-0 [&>div>div:first-child>span:last-child]:w-full [&>div>div:first-child>span:last-child]:flex-wrap [&>div>div:first-child>span:last-child]:justify-start [&>div>div:first-child>span:last-child]:whitespace-normal [&>div>div:first-child>span:last-child>a]:hidden sm:[&>div>div:first-child>span:last-child]:w-auto sm:[&>div>div:first-child>span:last-child]:flex-nowrap sm:[&>div>div:first-child>span:last-child]:justify-end sm:[&>div>div:first-child>span:last-child]:whitespace-nowrap">
        <ProviderSpendMeter
          action={
            canEditBudget ? (
              <Button
                onClick={() => setEditOpen(true)}
                size="xs"
                startIcon={<PencilSimple aria-hidden size={12} />}
                type="button"
                variant="secondary"
              >
                Edit budget
              </Button>
            ) : null
          }
          capCents={capCents}
          docsHref={`${DOCS_URL}/integrations#budget-cap`}
          providers={providers}
          spentCents={usage.budget.spentCents}
          variant="segmented"
        />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-4 border-t border-border-soft pt-4 sm:grid-cols-4">
        <Kpi label="SERP checks (mo)" value={usage.serpChecksMonth} />
        <Kpi label="Recorded spend" value={formatMoneyCents(usage.budget.spentCents)} />
        <Kpi label="Primary provider" value={usage.primaryProvider} />
        <Kpi label="On pace" value={onPace} />
      </div>
      {ordered.length ? (
        <ul className="m-0 mt-4 grid list-none gap-4 p-0">
          {ordered.map((connection) => (
            <ConnectionUsage connection={connection} key={connection.connectionId} />
          ))}
        </ul>
      ) : (
        <p className="m-0 mt-4 border-t border-border-soft pt-4 text-[12px] text-fg-muted">
          Usage appears once a SERP provider is connected.
        </p>
      )}
      <div
        className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border-soft pt-4"
        data-provider-usage-footer=""
      >
        <ExternalLink
          className="text-[12px] font-medium text-accent-text hover:underline"
          href="/docs/integrations#budget-cap"
        >
          How budgets work
        </ExternalLink>
        <ExternalLink
          className="text-[12px] font-medium text-accent-text hover:underline"
          href={`${MARKETING_URL}/rank-tracking-cost-calculator`}
        >
          Estimate future cost
        </ExternalLink>
      </div>
      {editOpen ? (
        <BudgetEditModal
          capCents={capCents}
          onClose={() => setEditOpen(false)}
          onSaved={(nextCapCents) => {
            setSavedCapCents(nextCapCents);
            setEditOpen(false);
          }}
          projectId={projectId}
          updateBudget={updateBudget}
        />
      ) : null}
    </UsageCard>
  );
}
