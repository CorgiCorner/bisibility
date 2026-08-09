"use client";

import { ProviderSpendMeter } from "@/components/cost-estimate/ProviderSpendMeter";
import {
  buildSpendSegments,
  OTHER_SEGMENT_COLOR,
} from "@/components/cost-estimate/provider-spend-segments";
import { SettingsSection } from "@/components/settings/SettingsSection";
import { MonoText } from "@/components/ui";
import { formatMoneyCents } from "@/lib/format/money";
import type {
  ProviderConnectionUsageData,
  ProviderUsageData,
  ProviderUsageStat,
} from "@/lib/settings/options";
import { DOCS_URL } from "@/lib/site/site";
import {
  CaretRightIcon as CaretRight,
  PencilSimpleIcon as PencilSimple,
} from "@phosphor-icons/react";
import Link from "next/link";
import { useState } from "react";
import { EditBudgetDialog, type EditBudgetSubmit } from "./EditBudgetDialog";

export type ProviderUsageViewData = Omit<ProviderUsageData, "budget"> & {
  /** capCents null = no cap set: bar hidden, amounts read "{spent} this month". */
  budget: { capCents: number | null; spentCents: number };
};

export type ProviderUsageProps = {
  /** Owner/admin budget editing; the button is hidden entirely when absent or not allowed. */
  editBudget?: { canEdit: boolean; submit: EditBudgetSubmit };
  /** Stories/tests only: render with the Edit budget dialog already open. */
  initialEditOpen?: boolean;
  /**
   * The cost-calculator link targets a marketing route the self-host build does
   * not ship. Callers pass false in self-host mode to hide it (avoids a 404).
   */
  showCostCalculatorLink?: boolean;
  usage: ProviderUsageViewData;
};

function connectionSpendCents(connection: ProviderConnectionUsageData) {
  return connection.rankChecks.costCents + (connection.lookups?.costCents ?? 0);
}

function StatCell({
  label,
  value,
}: Readonly<{ label: string; value: ProviderUsageStat | string | null }>) {
  return (
    <div>
      <MonoText className="uppercase tracking-[0.05em]" muted size="sm">
        {label}
      </MonoText>
      {value == null ? (
        <div className="mt-[5px] text-xs font-normal italic text-fg-muted">not supported</div>
      ) : (
        <div className="mt-[5px] text-[13.5px] font-semibold text-fg tabular-nums">
          {typeof value === "string" ? (
            value
          ) : (
            <>
              {value.count.toLocaleString("en-US")}
              <span className="font-mono text-[11px] font-normal text-fg-muted">
                {" "}
                · {formatMoneyCents(value.costCents)}
              </span>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function ConnectionUsageBlock({
  color,
  connection,
  showSquare,
}: Readonly<{
  color: string;
  connection: ProviderConnectionUsageData;
  showSquare: boolean;
}>) {
  return (
    <li className="mt-4 border-t border-bg-sunken pt-4">
      <div className="flex items-center gap-2">
        {showSquare ? (
          <span
            aria-hidden
            className="h-[7px] w-[7px] flex-none rounded-[2px]"
            style={{ backgroundColor: color }}
          />
        ) : null}
        <span className="text-[13.5px] font-semibold text-fg">{connection.provider}</span>
        {connection.primary ? (
          <span className="rounded-full bg-accent-soft px-[7px] py-[2px] font-mono text-[9px] font-bold uppercase tracking-[0.4px] text-accent-text">
            PRIMARY
          </span>
        ) : null}
      </div>
      <div className="mt-[10px] grid gap-4 sm:grid-cols-3">
        <StatCell label="Rank checks (mo)" value={connection.rankChecks} />
        <StatCell label="Keyword lookups (mo)" value={connection.lookups} />
        <StatCell label="Cost / check" value={connection.costPerCheck} />
      </div>
    </li>
  );
}

export function ProviderUsage({
  editBudget,
  initialEditOpen = false,
  showCostCalculatorLink = true,
  usage,
}: Readonly<ProviderUsageProps>) {
  const [editOpen, setEditOpen] = useState(initialEditOpen);
  // After a save, reflect the returned cap in the meter in place.
  const [savedCapCents, setSavedCapCents] = useState<number | null>(null);
  const capCents = savedCapCents ?? usage.budget.capCents;

  // Blocks render primary first, then by spend descending (HANDOFF-35 section 4).
  const ordered = [...usage.connections].sort((a, b) => {
    if (a.primary !== b.primary) return a.primary ? -1 : 1;
    return connectionSpendCents(b) - connectionSpendCents(a);
  });
  const providers = ordered.map((connection) => ({
    label: connection.provider,
    spentCents: connectionSpendCents(connection),
  }));
  const segments = buildSpendSegments(providers, capCents ?? 0);
  const segmentColorByLabel = new Map(segments.map((segment) => [segment.label, segment.color]));
  const showSquares = ordered.length > 1;

  const kpis: [string, string][] = [
    ["SERP checks (mo)", usage.serpChecksMonth],
    ["Recorded spend", formatMoneyCents(usage.budget.spentCents)],
    ["Primary provider", usage.primaryProvider],
    [
      "On pace",
      usage.onPaceCents == null
        ? "Available after day 2"
        : `~${formatMoneyCents(usage.onPaceCents)}/mo`,
    ],
  ];

  return (
    <SettingsSection
      description="SERP checks this month across your connected providers. The budget meter includes all recorded provider spend. Billed directly by each provider, not a bisibility invoice."
      id="provider-usage"
      title="Provider usage"
    >
      <ProviderSpendMeter
        action={
          editBudget?.canEdit ? (
            <button
              className="flex items-center gap-[5px] rounded-[7px] border border-border-strong bg-transparent px-2.5 py-1 text-[11.5px] font-medium text-fg transition-colors hover:border-accent-hover hover:text-accent-text"
              onClick={() => setEditOpen(true)}
              type="button"
            >
              <PencilSimple aria-hidden size={12} />
              Edit budget
            </button>
          ) : null
        }
        capCents={capCents}
        docsHref={`${DOCS_URL}/integrations#budget-cap`}
        providers={providers}
        spentCents={usage.budget.spentCents}
        variant="segmented"
      />
      <div className="mt-4 grid gap-4 border-t border-bg-sunken pt-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map(([label, value]) => (
          <div key={label}>
            <MonoText className="uppercase tracking-[0.05em]" muted size="sm">
              {label}
            </MonoText>
            <div className="mt-[5px] text-[15px] font-semibold text-fg tabular-nums">{value}</div>
          </div>
        ))}
      </div>
      {ordered.length === 0 ? null : (
        // Explicit role: list-none strips implicit list semantics in some browsers.
        // biome-ignore lint/a11y/noRedundantRoles: intentional per HANDOFF-35 accessibility notes.
        <ul className="m-0 list-none p-0" role="list">
          {ordered.map((connection) => (
            <ConnectionUsageBlock
              color={segmentColorByLabel.get(connection.provider) ?? OTHER_SEGMENT_COLOR}
              connection={connection}
              key={connection.connectionId}
              showSquare={showSquares}
            />
          ))}
        </ul>
      )}
      {usage.hasProvider ? null : (
        <MonoText className="mt-4 border-t border-bg-sunken pt-4 uppercase tracking-[0.5px]" muted>
          Usage appears once a SERP provider is connected.
        </MonoText>
      )}
      {showCostCalculatorLink ? (
        <div className="mt-4 border-t border-bg-sunken pt-4">
          <Link
            className="inline-flex items-center gap-1.5 text-[13px] font-medium text-accent-text outline-none transition-colors hover:text-accent-text focus-visible:text-accent-text"
            href="/rank-tracking-cost-calculator"
          >
            Estimate future cost <CaretRight aria-hidden size={14} weight="bold" />
          </Link>
        </div>
      ) : null}
      {editOpen && editBudget ? (
        <EditBudgetDialog
          capCents={capCents}
          onClose={() => setEditOpen(false)}
          onSaved={(nextCapCents) => {
            setSavedCapCents(nextCapCents);
            setEditOpen(false);
          }}
          submit={editBudget.submit}
        />
      ) : null}
    </SettingsSection>
  );
}
