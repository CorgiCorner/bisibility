"use client";

import { Button } from "@/components/ui";
import { googleInstallUrl } from "@/lib/providers/analytics/google-install-url";
import { ChartDonutIcon as ChartDonut } from "@phosphor-icons/react";
import { usePathname, useSearchParams } from "next/navigation";
import {
  SESSIONS_CONNECT_BODY,
  SESSIONS_CONNECT_CTA,
  SESSIONS_CONNECT_TITLE,
} from "./search-insights-copy";
import { searchInsightsCurrentReturnPath } from "./search-insights-return-path";

export function SearchInsightsSessionsCard({ projectId }: Readonly<{ projectId: string }>) {
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
        <span className="text-ui-body font-semibold">{SESSIONS_CONNECT_TITLE}</span>
        <span className="text-ui-caption leading-normal text-fg-muted">
          {SESSIONS_CONNECT_BODY}
        </span>
      </span>
      <Button className="ml-auto shrink-0" href={href} size="sm" variant="secondary">
        {SESSIONS_CONNECT_CTA}
      </Button>
    </div>
  );
}
