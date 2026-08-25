"use client";

import {
  KeywordSuggestionDrawer,
  type SuggestionCostContext,
} from "@/components/keywords/import/KeywordSuggestionDrawer";
import type { ImportTopQueriesAction } from "@/components/onboarding/steps/KeywordTopQueryImport";
import {
  ProjectReadOnlyTooltip,
  useProjectWriteMode,
} from "@/components/shell/ProjectWriteModeProvider";
import { Button } from "@/components/ui";
import type { TopQuerySuggestion } from "@/lib/keyword-suggest/sanitize-top-queries";
import type { ProjectCostContext } from "@/lib/queries/cost-calculator";
import { appPath } from "@/lib/routing/app-path";
import { DEFAULT_SERP_DEPTH } from "@/lib/serp/markets";
import { actionErrorMessage } from "@/lib/ui/action-error";
import { MagnifyingGlassIcon as MagnifyingGlass } from "@phosphor-icons/react";
import Link from "next/link";
import { useState } from "react";

type KeywordsEmptyStateProps = {
  canCreateKeyword: boolean;
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

const EMPTY_HEADERS = ["Keyword", "Pos", "Change", "Volume", "Tags"] as const;
const CARD_ACTIONS = "mt-auto flex w-full flex-wrap items-center justify-end gap-2 pt-4";

export function KeywordsEmptyState({
  canCreateKeyword,
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

  // Keep the table chrome + column headers; replace the body with the first-keyword prompt.
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-bg-elev">
      <div className="grid grid-cols-[minmax(0,2.2fr)_repeat(3,1fr)_1.4fr] gap-x-2.5 border-b border-border bg-bg-sunken px-4.5 py-[11px] font-mono text-[10px] uppercase tracking-[0.6px] text-fg-muted">
        {EMPTY_HEADERS.map((header) => (
          <span key={header}>{header}</span>
        ))}
      </div>
      <div className="flex flex-col items-center px-6 py-10 text-center">
        <span className="grid h-[54px] w-[54px] place-items-center rounded-[14px] bg-accent-soft text-accent-solid">
          <MagnifyingGlass size={27} weight="bold" />
        </span>
        <h3 className="mt-4.5 text-lg font-semibold tracking-[-0.4px] text-fg">
          Choose what to track
        </h3>
        <p className="mt-[7px] max-w-[420px] text-[13.5px] leading-[1.55] text-fg-muted">
          Start from queries your site already earns, or add a focused list of your own.
        </p>

        {canCreateKeyword ? (
          <div className="mt-6 grid w-full max-w-[780px] items-stretch gap-3 text-left md:grid-cols-2">
            <section className="flex h-full flex-col rounded-xl border border-border bg-bg-sunken p-5">
              <h4 className="m-0 text-[14px] font-semibold text-fg">
                Find opportunities in Search Console
              </h4>
              <p className="mt-2 text-[12.5px] leading-[1.55] text-fg-muted">
                Import observed queries live, then pick the ones to track in the review picker.
              </p>
              <div className={CARD_ACTIONS}>
                {searchConsoleConnected ? (
                  <ProjectReadOnlyTooltip>
                    <Button
                      disabled={readOnly || !importTopQueriesAction}
                      loading={importPending}
                      loadingLabel="Importing queries..."
                      onClick={() => void handleSearchConsoleImport()}
                      sx={{ minHeight: 40 }}
                      type="button"
                      variant="primary"
                    >
                      Find Search Console queries
                    </Button>
                  </ProjectReadOnlyTooltip>
                ) : (
                  <Button
                    component={Link}
                    href={appPath(projectId, "integrations")}
                    sx={{ minHeight: 40 }}
                  >
                    Connect Search Console
                  </Button>
                )}
              </div>
              {importFeedback ? (
                <p
                  className={`mt-3 text-[11.5px] leading-[1.5] ${
                    importFeedback.kind === "error" ? "text-red-text" : "text-fg-muted"
                  }`}
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
            </section>

            <section className="flex h-full flex-col rounded-xl border border-border bg-bg-sunken p-5">
              <h4 className="m-0 text-[14px] font-semibold text-fg">Add keywords</h4>
              <p className="mt-2 text-[12.5px] leading-[1.55] text-fg-muted">
                Add a focused list of your own, or import a prepared CSV.
              </p>
              <div className={CARD_ACTIONS}>
                <ProjectReadOnlyTooltip>
                  <Button
                    disabled={readOnly}
                    onClick={onAddKeyword}
                    sx={{ minHeight: 40 }}
                    type="button"
                  >
                    Add manually
                  </Button>
                </ProjectReadOnlyTooltip>
                <ProjectReadOnlyTooltip>
                  <Button
                    disabled={readOnly}
                    onClick={onImportCsv}
                    sx={{ minHeight: 40 }}
                    type="button"
                    variant="secondary"
                  >
                    Import CSV
                  </Button>
                </ProjectReadOnlyTooltip>
              </div>
            </section>
          </div>
        ) : null}

        {providerConnected === false && canManageProviders ? (
          <p className="mt-4 max-w-[520px] text-[12px] leading-[1.5] text-fg-muted">
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
    </div>
  );
}
