"use client";

import {
  KeywordSuggestionDrawer,
  type SuggestionCostContext,
} from "@/components/keywords/import/KeywordSuggestionDrawer";
import type { ImportTopQueriesAction } from "@/components/onboarding/steps/KeywordTopQueryImport";
import { ProjectReadOnlyTooltip } from "@/components/shell/ProjectWriteModeNotices";
import { useProjectWriteMode } from "@/components/shell/ProjectWriteModeProvider";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ModuleMark } from "@/components/ui/ModuleMark";
import type { TopQuerySuggestion } from "@/lib/keyword-suggest/sanitize-top-queries";
import type { ProjectCostContext } from "@/lib/queries/cost-calculator";
import { appPath } from "@/lib/routing/app-path";
import { DEFAULT_SERP_DEPTH } from "@/lib/serp/constants";
import { actionErrorMessage } from "@/lib/ui/action-error";
import { RankingIcon as Ranking } from "@phosphor-icons/react/dist/csr/Ranking";
import Link from "next/link";
import { useState } from "react";

type KeywordsEmptyStateProps = {
  canCreateKeyword: boolean;
  hasMarkets?: boolean;
  canManageProviders: boolean;
  costContext?: ProjectCostContext;
  importTopQueriesAction?: ImportTopQueriesAction;
  onAddKeyword: () => void;
  onImportCsv: () => void;
  onImportQueries: (queries: string[]) => void;
  providerConnected?: boolean;
  projectId: string;
  searchConsoleConnected?: boolean;
};

type DrawerData = { hidden: TopQuerySuggestion[]; suggestions: TopQuerySuggestion[] };

export function KeywordsEmptyState({
  canCreateKeyword,
  hasMarkets = true,
  canManageProviders,
  costContext,
  importTopQueriesAction,
  onAddKeyword,
  onImportCsv,
  onImportQueries,
  providerConnected,
  projectId,
  searchConsoleConnected = false,
}: Readonly<KeywordsEmptyStateProps>) {
  const [importFeedback, setImportFeedback] = useState<{
    kind: "empty" | "error" | "needs_reauth" | "no_source";
    message: string;
  } | null>(null);
  const [importPending, setImportPending] = useState(false);
  const [drawer, setDrawer] = useState<DrawerData | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerNonce, setDrawerNonce] = useState(0);
  const { readOnly } = useProjectWriteMode();

  const suggestionCostContext: SuggestionCostContext = {
    cronExpression: costContext?.cronExpression ?? null,
    depth: costContext?.depth ?? DEFAULT_SERP_DEPTH,
    deviceCount: costContext?.deviceCount ?? 1,
    frequency: costContext?.rawFrequency ?? "daily",
    locationCount: costContext?.locationCount ?? 1,
    overrideCents: costContext?.costPerCheckCents ?? null,
    providerId: costContext?.providerId ?? null,
  };

  async function handleSearchConsoleImport() {
    if (!importTopQueriesAction || importPending || readOnly || !canCreateKeyword) return;

    setImportFeedback(null);
    setImportPending(true);
    try {
      const result = await importTopQueriesAction({ limit: 50, projectId });
      if ("reason" in result) {
        setImportFeedback({
          kind: result.reason,
          message:
            result.reason === "no_source"
              ? "No Search Console source is connected."
              : "Google authorization has expired.",
        });
        return;
      }
      const suggestions = result.suggestions ?? result.queries.map((query) => ({ query }));
      if (suggestions.length === 0) {
        setImportFeedback({
          kind: "empty",
          message: "No queries observed yet - new Search Console properties can take a few days.",
        });
        return;
      }
      setDrawer({ hidden: result.hidden ?? [], suggestions });
      setDrawerNonce((value) => value + 1);
      setDrawerOpen(true);
    } catch (error) {
      setImportFeedback({
        kind: "error",
        message: actionErrorMessage(
          error,
          "Could not import Search Console queries. Try again shortly.",
        ),
      });
    } finally {
      setImportPending(false);
    }
  }

  return (
    <>
      <EmptyState
        action={
          canCreateKeyword ? (
            <div className="flex max-w-full flex-wrap items-center justify-center gap-3">
              <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
                <ProjectReadOnlyTooltip>
                  <Button
                    disabled={readOnly}
                    onClick={onImportCsv}
                    size="sm"
                    style={{ minHeight: 40, paddingLeft: 12, paddingRight: 12 }}
                    type="button"
                    variant="ghost"
                  >
                    Import CSV
                  </Button>
                </ProjectReadOnlyTooltip>
                {searchConsoleConnected ? (
                  <ProjectReadOnlyTooltip>
                    <Button
                      disabled={readOnly || !importTopQueriesAction}
                      loading={importPending}
                      loadingLabel="Finding queries..."
                      onClick={() => void handleSearchConsoleImport()}
                      size="sm"
                      style={{ minHeight: 40, paddingLeft: 12, paddingRight: 12 }}
                      type="button"
                      variant="ghost"
                    >
                      From Search Console
                    </Button>
                  </ProjectReadOnlyTooltip>
                ) : null}
              </div>
              <ProjectReadOnlyTooltip>
                <Button
                  disabled={readOnly}
                  onClick={onAddKeyword}
                  style={{ minHeight: 40 }}
                  type="button"
                >
                  Add keywords
                </Button>
              </ProjectReadOnlyTooltip>
            </div>
          ) : undefined
        }
        description={
          hasMarkets
            ? "Add keywords to start tracking your Google rankings."
            : "A market is the country, location and language you rank in. Add one with your first keywords."
        }
        footnote={
          importFeedback || (providerConnected === false && canManageProviders) ? (
            <div className="max-w-[440px] space-y-2 text-[12px] leading-[1.5]">
              {importFeedback ? (
                <p
                  className={`m-0 ${importFeedback.kind === "error" ? "text-red-text" : "text-fg-muted"}`}
                  role="status"
                >
                  {importFeedback.message}
                  {importFeedback.kind === "no_source" || importFeedback.kind === "needs_reauth" ? (
                    <>
                      {" "}
                      <Link
                        className="font-semibold text-accent-text"
                        href={appPath(projectId, "integrations")}
                      >
                        {importFeedback.kind === "needs_reauth"
                          ? "Reconnect your Google account"
                          : "Open Integrations"}
                      </Link>
                    </>
                  ) : null}
                </p>
              ) : null}
              {providerConnected === false && canManageProviders ? (
                <p className="m-0 text-fg-muted">
                  Rank checks need a connected SERP provider. You can add keywords now - they start
                  checking once you{" "}
                  <Link
                    className="font-semibold text-accent-text"
                    href={appPath(projectId, "integrations")}
                  >
                    connect one
                  </Link>
                  .
                </p>
              ) : null}
            </div>
          ) : undefined
        }
        mark={<ModuleMark bordered icon={Ranking} label="Rank tracker" />}
        title={hasMarkets ? "No keywords yet" : "Start with your first market"}
      />
      {drawer ? (
        <KeywordSuggestionDrawer
          costContext={suggestionCostContext}
          existingKeywords={[]}
          hidden={drawer.hidden}
          key={drawerNonce}
          onClose={() => setDrawerOpen(false)}
          onConfirm={(queries) => {
            setDrawerOpen(false);
            if (queries.length > 0) onImportQueries(queries);
          }}
          open={drawerOpen}
          suggestions={drawer.suggestions}
        />
      ) : null}
    </>
  );
}
