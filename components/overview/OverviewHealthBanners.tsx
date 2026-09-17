"use client";

import { AlertBanner } from "@/components/ui/AlertBanner";
import { AlertBannerStack } from "@/components/ui/AlertBannerStack";
import type { CheckHealth } from "@/lib/queries/check-health";
import { providerFailurePresentation } from "@/lib/rank-check/failure-presentation";
import { appPath } from "@/lib/routing/app-path";
import { projectRunsPath } from "@/lib/routing/project-runs-path";
import Link from "next/link";
import { useTranslations } from "next-intl";

export function OverviewHealthBanners({
  checkHealth,
  projectRef,
}: Readonly<{ checkHealth: CheckHealth; projectRef: string }>) {
  const t = useTranslations("projectDashboard.dashboard");
  const latest = checkHealth.failed24h.latest;
  const failureDetail = (() => {
    if (!latest) return null;
    const values = { keyword: latest.keyword };
    const code = providerFailurePresentation(latest.errorCode, latest.error).code;
    if (code === "provider_billing") return t("providerBillingDetail", values);
    if (code === "provider_account_restricted") return t("providerAccountRestrictedDetail", values);
    if (code === "provider_auth") return t("providerAuthDetail", values);
    if (code === "provider_rate_limited") return t("providerRateLimitedDetail", values);
    if (code === "provider_transient") return t("providerTransientDetail", values);
    return t("rankCheckFailedDetail", values);
  })();

  return (
    <AlertBannerStack>
      {checkHealth.failed24h.count > 0 ? (
        <AlertBanner
          detail={failureDetail}
          tint="red"
          title={t("failedChecks", { count: checkHealth.failed24h.count })}
        />
      ) : null}
      {checkHealth.budget.exhausted ? (
        <AlertBanner
          action={{
            href: projectRunsPath(projectRef),
            icon: "arrow",
            label: t("viewCheckRuns"),
          }}
          detail={t.rich("budgetDetail", {
            budgetLink: (chunks) => (
              <Link
                className="font-semibold text-accent-text hover:underline"
                href={appPath(projectRef, "settings#provider-usage")}
              >
                {chunks}
              </Link>
            ),
            cap: checkHealth.budget.capCents / 100,
            spent: checkHealth.budget.spentCents / 100,
          })}
          tint="yellow"
          title={t("budgetTitle")}
        />
      ) : null}
    </AlertBannerStack>
  );
}
