"use client";

import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { googleInstallUrl } from "@/lib/providers/analytics/google-install-url";
import { ChartDonutIcon as ChartDonut } from "@phosphor-icons/react/dist/csr/ChartDonut";
import { XIcon } from "@phosphor-icons/react/dist/csr/X";
import { usePathname, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useState, useSyncExternalStore } from "react";
import { searchInsightsCurrentReturnPath } from "./search-insights-return-path";

const CHANGE_EVENT = "bisibility:search-insights-ga4-connect-change";

export function ga4ConnectDismissalKey(projectId: string) {
  return `bisibility:search-insights:ga4-connect:v1:${projectId}`;
}

function subscribe(listener: () => void) {
  window.addEventListener("storage", listener);
  window.addEventListener(CHANGE_EVENT, listener);
  return () => {
    window.removeEventListener("storage", listener);
    window.removeEventListener(CHANGE_EVENT, listener);
  };
}

function readDismissed(projectId: string) {
  try {
    return window.localStorage.getItem(ga4ConnectDismissalKey(projectId)) === "dismissed";
  } catch {
    return false;
  }
}

export function SearchInsightsSessionsCard({ projectId }: Readonly<{ projectId: string }>) {
  const t = useTranslations("projectSearchInsights.copy");
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const readStoredDismissal = useCallback(() => readDismissed(projectId), [projectId]);
  const storedDismissal = useSyncExternalStore(subscribe, readStoredDismissal, () => false);
  const [localDismissal, setLocalDismissal] = useState<{
    dismissed: boolean;
    projectId: string;
  } | null>(null);
  const dismissed =
    (localDismissal?.projectId === projectId ? localDismissal.dismissed : null) ?? storedDismissal;
  const href = googleInstallUrl({
    projectId,
    provider: "ga4",
    returnPath: searchInsightsCurrentReturnPath(pathname, searchParams),
  });

  function dismiss() {
    try {
      window.localStorage.setItem(ga4ConnectDismissalKey(projectId), "dismissed");
      setLocalDismissal(null);
      window.dispatchEvent(new Event(CHANGE_EVENT));
    } catch {
      // Keep this visit dismissed when browser storage is unavailable.
      setLocalDismissal({ dismissed: true, projectId });
    }
  }

  if (dismissed) return null;
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
      <IconButton
        aria-label={t("sessionsConnectDismiss")}
        onClick={dismiss}
        size="small"
        type="button"
      >
        <XIcon aria-hidden size={15} weight="regular" />
      </IconButton>
    </div>
  );
}
