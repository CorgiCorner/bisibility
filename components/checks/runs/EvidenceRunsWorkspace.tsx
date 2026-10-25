"use client";
import { Button } from "@/components/ui/Button";
import { useBrowserTimeZone } from "@/components/ui/ZonedTime";
import type { AppLocale } from "@/i18n/config";
import type { CheckRunsView } from "@/lib/checks/contract";
import { zonedDateInputValue } from "@/lib/checks/date-boundary";
import {
  type EvidenceRunsQuery,
  evidenceRunsPath,
  validEvidenceRunsRange,
} from "@/lib/checks/evidence-runs-query";
import { formatCheckWindowLabel } from "@/lib/notifications/check-summaries/window-label";
import { appPath } from "@/lib/routing/app-path";
import { useRouter } from "next/navigation";
import { useLocale, useTimeZone, useTranslations } from "next-intl";
import { CheckRunsSection } from "./CheckRunsSection";
import { ExactRangeControl } from "./ExactRangeControl";

export function EvidenceRunsWorkspace({
  projectRef,
  query,
  view,
  now,
  timeZone: zoneOverride,
}: Readonly<{
  projectRef: string;
  query: EvidenceRunsQuery;
  view: CheckRunsView;
  now: string;
  timeZone?: string;
}>) {
  const router = useRouter();
  const browserZone = useBrowserTimeZone();
  const documentZone = useTimeZone();
  const timeZone = zoneOverride ?? browserZone ?? documentZone ?? "UTC";
  const locale = useLocale() as AppLocale;
  const t = useTranslations("projectRankTracker.checks");
  const { range, error } = validEvidenceRunsRange(query);
  const navigate = (patch: Partial<EvidenceRunsQuery>) =>
    router.push(evidenceRunsPath(projectRef, { ...query, cursor: undefined, ...patch }));
  return (
    <div className="grid min-w-0 gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="ghost" href={appPath(projectRef, "runs")}>
          {t("checkRuns")}
        </Button>
        <ExactRangeControl
          key={`${range?.from}:${range?.to}:${timeZone}`}
          error={!!error}
          value={range}
          now={new Date(now)}
          timeZone={timeZone}
          onApply={(value) => navigate(value)}
        />
        {range ? (
          <span className="text-ui-caption text-fg-muted">
            {new Intl.DateTimeFormat(locale, { timeZone, dateStyle: "medium" }).formatRange(
              new Date(range.from),
              new Date(range.to),
            )}{" "}
            · {formatCheckWindowLabel({ start: range.from, end: range.to, timeZone, locale })}
          </span>
        ) : null}
      </div>
      <CheckRunsSection
        hideAsOfDate
        hideProvider
        exactRange={!!range}
        asOfDate={zonedDateInputValue(new Date(now), timeZone)}
        budget={{ blocked: [], forecast: null }}
        budgetSettingsHref={appPath(projectRef, "settings#provider-usage")}
        connectProviderHref={appPath(projectRef, "integrations")}
        reviewProvidersHref={appPath(projectRef, "integrations")}
        reorderProvidersHref={appPath(projectRef, "integrations")}
        timelineHref={evidenceRunsPath(projectRef, query)}
        keywordHref={(id) => appPath(projectRef, "rank-tracker", id)}
        filter={query.status}
        now={new Date(now)}
        onAsOfDateChange={() => {}}
        onFilterChange={(status) => navigate({ status })}
        onLoadMore={() => {
          if (view.nextCursor) navigate({ cursor: JSON.stringify(view.nextCursor) });
        }}
        onProviderChange={() => {}}
        onRangeChange={(range) => navigate({ range, from: undefined, to: undefined })}
        onTriggerChange={(trigger) => navigate({ trigger })}
        provider="all"
        providerOptions={[]}
        range={query.range}
        timeZone={timeZone}
        trigger={query.trigger}
        view={view}
      />
    </div>
  );
}
