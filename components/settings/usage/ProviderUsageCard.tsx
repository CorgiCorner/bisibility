"use client";
import { useUsagePresentation } from "@/components/metering/use-usage-presentation";
import { BudgetEditModal } from "@/components/settings/usage/BudgetEditModal";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { projectLimitRows, usageLimitEntries } from "@/lib/metering/usage-limit-view";
import type { ProjectUsageViews, UsageConnection } from "@/lib/metering/user-views";
import { PROVIDER_CATALOG } from "@/lib/providers/catalog-metadata";
import { appPath } from "@/lib/routing/app-path";
import { useProviderAction } from "@usagekit/react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { ProjectLimitsCard } from "./ProjectLimitsCard";
import { type LimitSurface, ProviderLimitGroup } from "./ProviderLimitRows";

type Editing = { connections: readonly UsageConnection[]; surface?: LimitSurface };

/** Rows a reader can act on: project limits plus the active-source limits of each provider. */
export function visibleBudgetRows(data: ProjectUsageViews) {
  return [
    ...data.budgets.filter((row) => row.kind === "group" && row.unit !== "customer_cents"),
    ...usageLimitEntries(data)
      .filter((entry) => entry.connection.credentialSource !== "hosted")
      .flatMap((entry) => entry.rows),
  ];
}

/** Self-host Usage: the project limit, then one row per provider traffic limit. */
export function ProviderUsageCard({
  canEditBudget,
  initialBudgetEditOpen = false,
  projectId,
  projectRef,
  projectName,
  data,
}: {
  canEditBudget: boolean;
  initialBudgetEditOpen?: boolean;
  projectId: string;
  projectRef: string;
  projectName: string;
  data: ProjectUsageViews;
}) {
  const t = useTranslations("projectSettingsUsage.provider");
  const limits = useTranslations("projectSettingsUsage.limits");
  const common = useTranslations("projectIntegrations.providerManagement");
  const p = useUsagePresentation();
  const action = useProviderAction();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [editing, setEditing] = useState<Editing | null>(
    initialBudgetEditOpen && canEditBudget ? { connections: data.connections } : null,
  );
  const attentionRows = visibleBudgetRows(data).filter(
    (row) => row.level === "warning" || row.level === "exceeded",
  );
  const blocked = attentionRows.find(
    (row) => row.level === "exceeded" && row.boundary.onExceed === "block",
  );
  // Name the provider, not its connection reference, in the notice.
  const boundLabel = (row: (typeof attentionRows)[number]) =>
    p.bound({ ...row, target: row.display?.providerLabel ?? row.target });
  const attentionMessage = attentionRows.length
    ? t(blocked ? "attentionBlocked" : "attentionWarning", {
        bound: boundLabel(blocked ?? attentionRows[0]),
        count: attentionRows.length,
      })
    : "";
  const canEdit = canEditBudget && action.canReconcile;
  const budgetAction =
    canEditBudget || (action.ambiguous && action.canReconcile) ? (
      <Button
        type="button"
        size="sm"
        variant="secondary"
        disabled={!action.canReconcile}
        onClick={() => setEditing({ connections: data.connections })}
      >
        {canEditBudget ? t("editBudget") : common("reconcile")}
      </Button>
    ) : null;
  const limited = usageLimitEntries(data);
  const entries = data.connections
    .filter((connection) => {
      const catalog = PROVIDER_CATALOG.find(
        (item) =>
          item.id.toLowerCase() === connection.provider.toLowerCase() ||
          item.label.toLowerCase() === connection.provider.toLowerCase(),
      );
      return (
        connection.credentialSource !== "hosted" &&
        (!catalog || (catalog.kind !== "analytics" && catalog.allocation.kind !== "non_billable"))
      );
    })
    .map(
      (connection) =>
        limited.find((entry) => entry.connection.connectionId === connection.connectionId) ?? {
          connection,
          label:
            PROVIDER_CATALOG.find((item) => item.id === connection.provider)?.label ??
            connection.provider,
          rows: [],
        },
    )
    .sort((a, b) => {
      const priority = (entry: typeof a) =>
        entry.rows.some((row) => row.level === "exceeded")
          ? 0
          : entry.rows.some((row) => row.level === "warning")
            ? 1
            : 2;
      return priority(a) - priority(b);
    });
  const filtered = entries.filter((entry) =>
    `${entry.label} ${entry.connection.provider}`
      .toLocaleLowerCase()
      .includes(search.trim().toLocaleLowerCase()),
  );
  const current = Math.min(page, Math.max(0, Math.ceil(filtered.length / 5) - 1));
  const visible = filtered.slice(current * 5, current * 5 + 5);
  const own = projectLimitRows(data).own;
  return (
    <>
      {data.status === "restricted" ? (
        <div className="flex justify-end">{budgetAction}</div>
      ) : (
        <div id="provider-usage" className="flex min-w-0 flex-col gap-4">
          {attentionMessage && (
            <div
              role="alert"
              className={`space-y-1 rounded-lg border p-3 text-sm ${blocked ? "border-red/30 bg-red/5" : "border-yellow/30 bg-yellow/5"}`}
            >
              <p>{attentionMessage}</p>
              <Link href={appPath(projectRef, "providers")}>{t("connectionSettings")}</Link>
            </div>
          )}
          {data.status === "available" && (
            <ProjectLimitsCard
              projectName={projectName}
              items={[
                {
                  id: "single",
                  label: limits("ownKeys"),
                  scope: limits("ownKeysScope"),
                  row: own,
                  status:
                    data.truncated ||
                    data.budgets.some(
                      (row) => row.kind === "group" && row.unit === "budget_cents" && row.redacted,
                    )
                      ? limits("unavailable")
                      : undefined,
                },
              ]}
            />
          )}
          <Card className="min-w-0 space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1 space-y-1">
                <SectionTitle>{limits("providersTitle")}</SectionTitle>
                <p className="text-xs leading-relaxed text-fg-muted">
                  {limits("providersDescription")}
                </p>
              </div>
              {budgetAction}
            </div>
            {data.status !== "available" ? (
              <p role="status" className="text-sm text-fg-muted">
                {limits("unavailable")}
              </p>
            ) : entries.length ? (
              <div className="min-w-0 space-y-5">
                {entries.length > 5 && (
                  <Input
                    type="search"
                    aria-label={limits("searchProviders")}
                    placeholder={limits("searchProviders")}
                    value={search}
                    onChange={(event) => {
                      setSearch(event.target.value);
                      setPage(0);
                    }}
                  />
                )}
                {visible.map((entry) =>
                  entry.rows.length ? (
                    <ProviderLimitGroup
                      key={entry.connection.connectionId}
                      entry={entry}
                      onEdit={
                        canEdit
                          ? (connection, surface) =>
                              setEditing({ connections: [connection], surface })
                          : undefined
                      }
                    />
                  ) : (
                    <section
                      key={entry.connection.connectionId}
                      aria-label={entry.label}
                      className="space-y-2"
                    >
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-semibold">{entry.label}</h3>
                        <span className="rounded-full bg-bg-band px-2 py-0.5 text-[11px] text-fg-muted">
                          {limits("ownKeyTag")}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center justify-between gap-2 rounded-control border border-border px-3 py-2.5">
                        <p className="text-sm text-fg-muted">
                          {data.truncated ? limits("partial") : limits("noProviderLimitOwn")}
                        </p>
                        {canEdit && (
                          <Button
                            size="xs"
                            variant="secondary"
                            onClick={() =>
                              setEditing({ connections: [entry.connection], surface: "app" })
                            }
                          >
                            {limits("setLimit")}
                          </Button>
                        )}
                      </div>
                    </section>
                  ),
                )}
                {!filtered.length && (
                  <p role="status" className="text-sm text-fg-muted">
                    {limits("noMatches")}
                  </p>
                )}
                {filtered.length > 0 && (
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p role="status" className="text-xs text-fg-muted">
                      {limits("pageRange", {
                        from: String(current * 5 + 1),
                        to: String(Math.min((current + 1) * 5, filtered.length)),
                        total: String(filtered.length),
                      })}
                    </p>
                    {filtered.length > 5 && (
                      <div className="flex gap-2">
                        <Button
                          size="xs"
                          variant="outline"
                          disabled={current === 0}
                          onClick={() => setPage(current - 1)}
                        >
                          {limits("previous")}
                        </Button>
                        <Button
                          size="xs"
                          variant="outline"
                          disabled={(current + 1) * 5 >= filtered.length}
                          onClick={() => setPage(current + 1)}
                        >
                          {limits("next")}
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <p role="status" className="text-sm text-fg-muted">
                {limits("noProviders")}
              </p>
            )}
          </Card>
        </div>
      )}
      {editing && (
        <BudgetEditModal
          connections={editing.connections}
          surface={editing.surface}
          projectId={projectId}
          projectRef={projectRef}
          onClose={() => setEditing(null)}
          onSaved={() => setEditing(null)}
        />
      )}
    </>
  );
}
