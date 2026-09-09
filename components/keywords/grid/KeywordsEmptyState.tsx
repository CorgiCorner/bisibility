"use client";

import {
  KeywordSuggestionDrawer,
  type SuggestionCostContext,
} from "@/components/keywords/import/KeywordSuggestionDrawer";
import type { ImportTopQueriesAction } from "@/components/onboarding/steps/KeywordTopQueryImport";
import { ProjectReadOnlyTooltip } from "@/components/shell/ProjectWriteModeNotices";
import { useProjectWriteMode } from "@/components/shell/ProjectWriteModeProvider";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { DataTable } from "@/components/ui/data-table/DataTable";
import type { DataTableColumn } from "@/components/ui/data-table/data-table-types";
import { EmptyState } from "@/components/ui/EmptyState";
import type { TopQuerySuggestion } from "@/lib/keyword-suggest/sanitize-top-queries";
import type { ProjectCostContext } from "@/lib/queries/cost-calculator";
import { appPath } from "@/lib/routing/app-path";
import { DEFAULT_SERP_DEPTH } from "@/lib/serp/constants";
import { actionErrorMessage } from "@/lib/ui/action-error";
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

const emptyColumns: readonly DataTableColumn<{ id: string }>[] = (
  [
    ["keyword", "Keyword", 2.2, 100],
    ["position", "Pos", 1, 56],
    ["change", "Change", 1, 80],
    ["volume", "Volume", 1, 80],
    ["tags", "Tags", 1.4, 80],
  ] as const
).map(([id, header, flex, minSize]) => ({
  id,
  header,
  meta: { flex, lockResize: true, sortable: false },
  minSize,
  size: minSize,
}));

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
      <Card className="min-w-0 overflow-hidden p-0">
        <DataTable
          ariaLabel="Rank tracker keywords"
          bordered={false}
          columns={emptyColumns}
          id="rank-tracker-keywords-empty"
          onSortingChange={() => undefined}
          rows={[]}
          sorting={null}
          emptyState={
            <EmptyState
              compact
              title={hasMarkets ? "No keywords yet" : "Start with your first market"}
              description={
                hasMarkets
                  ? "Add keywords to start tracking your Google rankings."
                  : "A market defines the country, location and language of your rankings. Create one when adding your first keywords. Adding another market later keeps existing keywords and their history in the original market."
              }
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
              footnote={
                importFeedback || (providerConnected === false && canManageProviders) ? (
                  <div className="max-w-[440px] space-y-2 text-[12px] leading-[1.5]">
                    {importFeedback ? (
                      <p
                        className={`m-0 ${importFeedback.kind === "error" ? "text-red-text" : "text-fg-muted"}`}
                        role="status"
                      >
                        {importFeedback.message}
                        {importFeedback.kind === "no_source" ||
                        importFeedback.kind === "needs_reauth" ? (
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
                        Rank checks need a connected SERP provider. You can add keywords now - they
                        start checking once you{" "}
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
            />
          }
        />
      </Card>
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
