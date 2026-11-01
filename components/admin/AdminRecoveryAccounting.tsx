"use client";

import type { InstanceRecoveryAccounting } from "@/lib/queries/instance-recovery-accounting";
import { appRootPath } from "@/lib/routing/app-path";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useId } from "react";
import { formatRecordedUsd } from "./admin-usage-money";

export function AdminRecoveryAccounting({
  data,
}: Readonly<{ data: InstanceRecoveryAccounting | null }>) {
  const t = useTranslations("instanceAdmin.recoveryAccounting");
  const locale = useLocale();
  const heading = useId();
  return (
    <section aria-labelledby={heading} className="mt-4 border-t border-border-soft pt-4">
      <h3 id={heading} className="text-sm font-semibold">
        {t("title")}
      </h3>
      <p className="mt-1 text-xs text-fg-muted">{t("description")}</p>
      {data ? (
        <dl className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="min-w-0">
            <dt className="text-xs text-fg-muted">{t("historical")}</dt>
            <dd className="mt-1 text-lg font-semibold tabular-nums">
              {formatRecordedUsd(data.historicalCostUsdUnits, locale)}
            </dd>
            <dd className="mt-1 text-xs text-fg-muted">
              {t("requests", { count: data.historicalCount })}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-xs text-fg-muted">{t("closedUnknown")}</dt>
            <dd className="mt-1 text-lg font-semibold tabular-nums">
              {t("requests", { count: data.closedUnknownCount })}
            </dd>
            <dd className="mt-1 text-xs text-fg-muted">{t("unknown")}</dd>
          </div>
        </dl>
      ) : (
        <p role="status" className="mt-3 text-xs text-fg-muted">
          {t("unavailable")}
        </p>
      )}
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs font-medium text-accent-text">
        <Link href={appRootPath("admin", "metering")} className="hover:underline">
          {t("ledger")}
        </Link>
        <Link href={appRootPath("admin", "metering", "recovery")} className="hover:underline">
          {t("view")}
        </Link>
      </div>
    </section>
  );
}
