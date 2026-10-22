"use client";

import { ProviderBudgetRow } from "@/components/settings/usage/ProviderBudgetRow";
import type { ProjectBudgetRow } from "@/lib/metering/project-budget-display";
import type { ProjectUsageViews, UsageConnection } from "@/lib/metering/user-views";
import { useTranslations } from "next-intl";

export type HostedBudgetLabels = { title: string; description: string };

function connectionRows(rows: ProjectBudgetRow[], connection: UsageConnection) {
  return rows.filter(
    (row) =>
      row.kind === "connection" &&
      (row.display?.connectionId === connection.connectionId ||
        row.target === connection.connectionId) &&
      (connection.credentialSource === "hosted"
        ? row.unit === "customer_cents"
        : row.unit !== "customer_cents"),
  );
}

/** Notices must describe the same active-source constraints as the visible list. */
export function visibleBudgetRows(data: ProjectUsageViews) {
  return [
    ...data.budgets.filter((row) => row.kind === "group"),
    ...data.connections.flatMap((connection) => connectionRows(data.budgets, connection)),
  ];
}

/** Group only the current connection source; never add overlapping budget counters together. */
export function ProviderBudgetLists({
  data,
  hostedBudgetLabels,
  onEdit,
}: {
  data: ProjectUsageViews;
  hostedBudgetLabels?: HostedBudgetLabels;
  onEdit?: () => void;
}) {
  const t = useTranslations("projectSettingsUsage.provider");
  const projectRows = data.budgets.filter((row) => row.kind === "group");
  const groups = [
    {
      source: "own",
      title: t("ownKeysTitle"),
      description: t("ownKeysDescription"),
      connections: data.connections.filter(
        (connection) => connection.credentialSource !== "hosted",
      ),
    },
    ...(hostedBudgetLabels
      ? [
          {
            source: "hosted",
            ...hostedBudgetLabels,
            connections: data.connections.filter(
              (connection) => connection.credentialSource === "hosted",
            ),
          },
        ]
      : []),
  ];
  return (
    <div className="min-w-0 space-y-4">
      {projectRows.length > 0 && (
        <section aria-label={t("projectBudget")} className="min-w-0 border-l-2 border-accent pl-3">
          <ul className="m-0 min-w-0 list-none divide-y divide-border p-0">
            {projectRows.map((row) => (
              <ProviderBudgetRow key={row.id} row={row} onEdit={onEdit} />
            ))}
          </ul>
        </section>
      )}
      {groups.map((group) => (
        <section key={group.source} aria-label={group.title} className="min-w-0 space-y-2">
          <div className="min-w-0">
            <h3 className="break-words text-sm font-semibold">{group.title}</h3>
            <p className="break-words text-xs text-fg-muted">{group.description}</p>
          </div>
          {!group.connections.length ? (
            <p className="text-xs text-fg-muted">{t("noProviders")}</p>
          ) : (
            <ul className="m-0 min-w-0 list-none divide-y divide-border p-0">
              {group.connections.map((connection) => {
                const rows = connectionRows(data.budgets, connection);
                return (
                  <li
                    key={connection.connectionId}
                    data-provider-budget={connection.connectionId}
                    className="grid min-w-0 gap-x-4 gap-y-2 py-3 sm:grid-cols-[140px_minmax(0,1fr)]"
                  >
                    <h4 className="min-w-0 break-words text-sm font-medium">
                      {rows[0]?.display?.providerLabel ?? connection.provider}
                    </h4>
                    <div className="min-w-0 space-y-2">
                      {rows.length ? (
                        rows.map((row) => (
                          <ProviderBudgetRow key={row.id} row={row} compact onEdit={onEdit} />
                        ))
                      ) : (
                        <p className="text-xs text-fg-muted">{t("providerUnavailable")}</p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}
