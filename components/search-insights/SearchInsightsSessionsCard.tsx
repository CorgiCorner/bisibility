"use client";

import { Button } from "@/components/ui/Button";
import { googleInstallUrl } from "@/lib/providers/analytics/google-install-url";
import { ChartDonutIcon as ChartDonut } from "@phosphor-icons/react/dist/csr/ChartDonut";
import { usePathname, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { searchInsightsCurrentReturnPath } from "./search-insights-return-path";

export function SearchInsightsSessionsCard({ projectId }: Readonly<{ projectId: string }>) {
  const t = useTranslations("projectSearchInsights.copy");
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const href = googleInstallUrl({
    projectId,
    provider: "ga4",
    returnPath: searchInsightsCurrentReturnPath(pathname, searchParams),
  });
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-card border border-dashed border-border-control px-4 py-3">
      <span className="grid h-9.5 w-9.5 shrink-0 place-items-center rounded-control bg-bg-sunken text-fg-muted">
        <ChartDonut weight="regular" aria-hidden size={19} />
      </span>
      <span className="flex min-w-48 flex-1 flex-col items-start gap-0.5">
        <span className="text-ui-body font-semibold">{t("sessionsConnectTitle")}</span>
        <span className="text-ui-caption leading-normal text-fg-muted">
          {t("sessionsConnectBody")}
        </span>
      </span>
      <Button className="ml-auto shrink-0" href={href} size="sm" variant="secondary">
        {t("connect")}
      </Button>
    </div>
  );
}
