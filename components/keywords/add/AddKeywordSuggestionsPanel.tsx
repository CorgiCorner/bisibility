"use client";

import { KeywordRankedImport } from "@/components/onboarding/steps/KeywordRankedImport";
import { KeywordTopQueryImport } from "@/components/onboarding/steps/KeywordTopQueryImport";
import { useProjectKeywordImportMessages } from "@/components/rank-tracker/useProjectKeywordImportMessages";
import { useProjectWriteMode } from "@/components/shell/ProjectWriteModeProvider";
import { Button } from "@/components/ui/Button";
import { importTopQueries } from "@/lib/actions/keyword-suggest";
import { fetchRankedKeywordSuggestions } from "@/lib/actions/ranked-keywords";
import { parseKeywordTargetLines } from "@/lib/keywords/add-keyword-drawer-shared";
import { appPath } from "@/lib/routing/app-path";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { useKeywordSuggestionSources } from "./useKeywordSuggestionSources";

type Props = {
  sourceState: ReturnType<typeof useKeywordSuggestionSources>;
  currentKeywords: string;
  onAppendQueries: (queries: string[]) => void;
  projectId: string;
};
const cardClass = "flex flex-col gap-3 rounded-card border border-border p-4";

export default function AddKeywordSuggestionsPanel({
  currentKeywords,
  sourceState,
  onAppendQueries,
  projectId,
}: Readonly<Props>) {
  const t = useTranslations("projectRankTracker.keywordImport.sources");
  const importMessages = useProjectKeywordImportMessages();
  const { readOnly } = useProjectWriteMode();
  const { sources, failed, load } = sourceState;

  if (failed)
    return (
      <div className="flex flex-col items-start gap-3" role="alert">
        <p className="m-0 text-sm text-fg-muted">{t("failed")}</p>
        <Button onClick={() => void load()} type="button" variant="secondary">
          {t("retry")}
        </Button>
      </div>
    );
  if (!sources)
    return (
      <p className="m-0 text-sm text-fg-muted" role="status">
        {t("loading")}
      </p>
    );
  if (!sources.searchConsole && sources.rankedConnections.length === 0)
    return (
      <div className="flex flex-col items-start gap-3">
        <p className="m-0 text-sm leading-6 text-fg-muted">{t("unavailable")}</p>
        <Link
          className="text-sm font-semibold text-fg underline underline-offset-4"
          href={appPath(projectId, "integrations")}
        >
          {t("manageIntegrations")}
        </Link>
      </div>
    );
  const draftKeywords = parseKeywordTargetLines(currentKeywords)
    .map((entry) => entry.keyword)
    .join("\n");
  return (
    <div className="flex flex-col gap-4">
      <p className="m-0 text-sm leading-6 text-fg-muted">{t("chooseSource")}</p>
      {sources.searchConsole ? (
        <section aria-label={t("searchConsole")} className={cardClass}>
          <div>
            <h3 className="m-0 text-[15px] font-semibold">{t("searchConsole")}</h3>
            <p className="m-0 mt-1 text-sm leading-6 text-fg-muted">
              {t("searchConsoleDescription")}
            </p>
          </div>
          <KeywordTopQueryImport
            compact
            currentKeywords={draftKeywords}
            hasAnalyticsSource
            importTopQueriesAction={readOnly ? undefined : importTopQueries}
            messages={importMessages.topQueries}
            onAppendQueries={onAppendQueries}
            projectId={projectId}
          />
        </section>
      ) : null}
      {sources.rankedConnections.length > 0 ? (
        <section aria-label={t("rankedProvider")} className={cardClass}>
          <div>
            <h3 className="m-0 text-[15px] font-semibold">{t("rankedProvider")}</h3>
            <p className="m-0 mt-1 text-sm leading-6 text-fg-muted">
              {t("rankedDescription", { domain: sources.domain ?? t("yourSite") })}
            </p>
          </div>
          <KeywordRankedImport
            allowTracked
            compact
            connections={sources.rankedConnections}
            currentKeywords={draftKeywords}
            domain={sources.domain ?? ""}
            fetchAction={readOnly ? undefined : fetchRankedKeywordSuggestions}
            messages={importMessages.ranked}
            onAppendQueries={onAppendQueries}
            projectId={projectId}
          />
        </section>
      ) : null}
    </div>
  );
}
