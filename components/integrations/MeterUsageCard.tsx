"use client";

import { UsageCard } from "@/components/settings/usage/UsageCard";
import type { ProjectMeteringUsage } from "@/lib/metering/user-types";
import { useFormatter, useTranslations } from "next-intl";

export function MeterUsageCard({ data }: Readonly<{ data: ProjectMeteringUsage }>) {
  const t = useTranslations("projectSettingsUsage.meter");
  const format = useFormatter();
  const date = (value: string) =>
    format.dateTime(new Date(value), {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZone: "UTC",
    });
  const unknown = t("unknown");
  const money = (value: string | null) => (value === null ? unknown : t("usdAmount", { value }));
  return (
    <UsageCard description={t("description")} id="meter-usage" title={t("title")}>
      {data.status !== "available" ? (
        <p className="text-fg-muted text-sm" role="status">
          {t(data.status)}
        </p>
      ) : (
        <div className="flex min-w-0 flex-col gap-4 text-sm">
          <p className="rounded-lg border border-border bg-bg p-3" role="status">
            {t(`authority.${data.authority}`)}
          </p>
          <p className="text-fg-muted">{t("walletAuthority")}</p>
          <p className="text-fg-muted">
            {t("period", { from: date(data.from), to: date(data.to) })}
          </p>
          {data.asOf ? (
            <p className="text-fg-muted">{t("asOf", { date: date(data.asOf) })}</p>
          ) : null}
          {!data.observed ? <p role="status">{t("noObservations")}</p> : null}
          {data.unresolved > 0 ? (
            <p className="rounded-lg border border-border p-3" role="status">
              {t("unresolved", { count: data.unresolved })}
              {data.oldestUnresolvedAt
                ? ` ${t("oldest", { date: date(data.oldestUnresolvedAt) })}`
                : ""}
            </p>
          ) : null}
          {data.rows.map((row, index) => (
            <div
              className="rounded-lg border border-border p-3"
              key={`${row.connection}:${row.surface}:${row.source}:${row.funding}:${index}`}
            >
              <p className="mb-2 font-medium">
                {row.provider || t("connection")} · {row.source || row.surface} · {t(row.funding)}
                {row.connection === null ? ` · ${t("retainedConnection")}` : ""}
              </p>
              <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div>
                  <dt className="text-fg-muted">
                    {t(row.funding === "byok" ? "providerCost" : "customerCharge")}
                  </dt>
                  <dd className="break-all tabular-nums">
                    {money(row.funding === "byok" ? row.providerCost : row.customerCharge)}
                  </dd>
                </div>
                <div>
                  <dt className="text-fg-muted">
                    {t("units")} · {t(`certaintyValue.${row.unitsCertainty}`)}
                  </dt>
                  <dd className="tabular-nums">{row.units ?? unknown}</dd>
                </div>
                <div>
                  <dt className="text-fg-muted">{t("certainty")}</dt>
                  <dd>{t(`certaintyValue.${row.certainty}`)}</dd>
                </div>
                <div>
                  <dt className="text-fg-muted">{t("unknownOperations")}</dt>
                  <dd className="tabular-nums">{row.unknownOperations}</dd>
                </div>
              </dl>
            </div>
          ))}
          <div className="flex flex-col gap-3">
            <h3 className="font-medium">{t("limitsTitle")}</h3>
            <p className="text-fg-muted">{t("limitsDescription")}</p>
            {data.budgets.length === 0 ? <p className="text-fg-muted">{t("noLimits")}</p> : null}
            {data.budgets.map((budget, index) => (
              <div
                className="rounded-lg border border-border p-3"
                key={`${budget.connection}:${budget.surface}:${budget.unit}:${index}`}
              >
                <p className="mb-2 break-words font-medium">
                  {t(budget.scope)}
                  {budget.provider ? ` · ${budget.provider}` : ""}
                  {budget.connection ? ` · ${budget.connection}` : ""}
                  {` · ${budget.surface} · ${budget.unit}`}
                </p>
                <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <div>
                    <dt className="text-fg-muted">{t("used")}</dt>
                    <dd className="break-all tabular-nums">
                      {budget.figuresKnown ? (budget.used ?? unknown) : unknown}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-fg-muted">{t("reserved")}</dt>
                    <dd className="break-all tabular-nums">
                      {budget.figuresKnown ? (budget.reserved ?? unknown) : unknown}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-fg-muted">{t("remaining")}</dt>
                    <dd className="break-all tabular-nums">
                      {budget.unlimited
                        ? t("unlimited")
                        : budget.figuresKnown
                          ? (budget.remaining ?? unknown)
                          : unknown}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-fg-muted">{t("limit")}</dt>
                    <dd className="break-all tabular-nums">
                      {budget.unlimited ? t("unlimited") : (budget.limit ?? unknown)}
                    </dd>
                  </div>
                </dl>
                <p className="mt-2 text-fg-muted">
                  {t(budget.policy === "block" ? "blocks" : "warns")}
                </p>
                {budget.hardLimit !== null ? (
                  <p>{t("hardLimit", { value: budget.hardLimit, unit: budget.unit })}</p>
                ) : null}
                {budget.resetsAt ? (
                  <p className="text-fg-muted">{t("resetsAt", { date: date(budget.resetsAt) })}</p>
                ) : null}
              </div>
            ))}
          </div>
          {data.truncated ? <p role="status">{t("truncated")}</p> : null}
        </div>
      )}
    </UsageCard>
  );
}
