"use client";

import { Button } from "@/components/ui/Button";
import { InlineCallout } from "@/components/ui/InlineCallout";
import { googleInstallUrl } from "@/lib/providers/analytics/google-install-url";
import type { SearchInsightsOauthReturn as OauthReturn } from "@/lib/search-insights/queries/oauth-return";
import type { SearchSyncPreflightPlan } from "@/lib/search-insights/sync/plan";
import { useTranslations } from "next-intl";
import {
  SearchInsightsOauthReturn,
  type SearchInsightsOauthReturnProps,
} from "./SearchInsightsOauthReturn";

type SearchInsightsGa4OauthCardProps = Pick<
  SearchInsightsOauthReturnProps,
  "cancelAction" | "completeAction" | "disconnectAction" | "projectId"
> & {
  oauth: OauthReturn;
  returnPath: string;
  syncPlan?: SearchSyncPreflightPlan;
};

export function SearchInsightsGa4OauthCard({
  cancelAction,
  completeAction,
  disconnectAction,
  oauth,
  projectId,
  returnPath,
  syncPlan,
}: Readonly<SearchInsightsGa4OauthCardProps>) {
  const t = useTranslations("projectSearchInsights.copy");
  if (oauth.setup?.provider === "ga4") {
    return (
      <SearchInsightsOauthReturn
        cancelAction={cancelAction}
        completeAction={completeAction}
        disconnectAction={disconnectAction}
        projectId={projectId}
        setup={oauth.setup}
        syncPlan={syncPlan}
      />
    );
  }
  if (!oauth.error) return null;
  return (
    <div className="flex flex-col gap-3 rounded-card border border-border bg-bg-elev p-4">
      <div>
        <p className="m-0 text-ui-body font-semibold">{t("ga4ConnectionTitle")}</p>
        <p className="m-0 mt-1 text-ui-caption text-fg-muted">{t("ga4ConnectionFailed")}</p>
      </div>
      <InlineCallout tint="yellow">{oauth.error}</InlineCallout>
      <div>
        <Button
          href={googleInstallUrl({
            projectId,
            provider: "ga4",
            returnPath,
          })}
          size="sm"
          variant="secondary"
        >
          {t("tryConnectingAgain")}
        </Button>
      </div>
    </div>
  );
}
