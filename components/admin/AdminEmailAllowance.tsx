"use client";

import { Panel } from "@/components/admin/AdminPrimitives";
import { AdminSectionUnavailable } from "@/components/admin/AdminSectionUnavailable";
import { ExternalLink } from "@/components/ui/ExternalLink";
import { InfoTooltip } from "@/components/ui/InfoTooltip";
import type { InstanceEmailAllowance } from "@/lib/email/allowance-model";
import { DOCS_URL } from "@/lib/site/site";
import { useFormatter, useTranslations } from "next-intl";

export function AdminEmailAllowance({
  allowance,
}: Readonly<{ allowance: InstanceEmailAllowance }>) {
  const t = useTranslations("instanceAdmin.dashboard.emailAllowance");
  const common = useTranslations("instanceAdmin.values");
  const format = useFormatter();
  const dateTime = (value: string) =>
    format.dateTime(new Date(value), {
      timeZone: "UTC",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  if (allowance.status === "disabled") return null;
  return (
    <Panel id="admin-email-allowance" title={t("title")} description={t("description")}>
      {allowance.status === "not_configured" ? (
        <div className="space-y-2 text-xs text-fg-muted">
          <p>{t("notConfigured")}</p>
          <ExternalLink
            className="font-medium text-accent-text hover:underline"
            href={`${DOCS_URL}/self-hosting/email`}
          >
            {t("setup")}
          </ExternalLink>
        </div>
      ) : (
        <div className="space-y-3">
          {allowance.status === "unavailable" ? (
            <AdminSectionUnavailable>
              {t(allowance.categories.length ? "countsUnavailable" : "configurationUnavailable")}
            </AdminSectionUnavailable>
          ) : null}
          <div className="grid gap-4 lg:grid-cols-2">
            {allowance.categories.map((category) => (
              <div key={category.category}>
                <h3 className="text-sm font-semibold text-fg">{t(category.category)}</h3>
                <dl className="mt-2 space-y-2 text-xs">
                  {(
                    [
                      ["attempts", category.reservedAttempts],
                      ["remaining", category.remaining],
                      ["limit", category.limit],
                    ] as const
                  ).map(([key, value]) => (
                    <div key={key} className="flex items-baseline justify-between gap-4">
                      <dt className="text-fg-muted">{t(key)}</dt>
                      <dd className="m-0 font-medium tabular-nums text-fg">
                        {value === null ? common("unavailable") : format.number(value)}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            ))}
          </div>
          {allowance.categories.length ? (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-fg-muted">
              <span>{t("reset", { time: dateTime(allowance.resetsAt) })}</span>
              <span>{t("asOf", { time: dateTime(allowance.asOf) })}</span>
              <InfoTooltip text={t("help")} />
            </div>
          ) : null}
        </div>
      )}
    </Panel>
  );
}
