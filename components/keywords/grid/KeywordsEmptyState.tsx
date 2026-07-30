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
import type { TopQuerySuggestion } from "@/lib/keyword-suggest/sanitize-top-queries";
import type { ProjectCostContext } from "@/lib/queries/cost-calculator";
import { appPath } from "@/lib/routing/app-path";
import { DEFAULT_SERP_DEPTH } from "@/lib/serp/markets";
import { docsLinkProps } from "@/lib/site/site";
import { actionErrorMessage } from "@/lib/ui/action-error";
import {
  ArrowLineDownIcon as ArrowLineDown,
  MagnifyingGlassIcon as MagnifyingGlass,
  PlusIcon as Plus,
  UploadSimpleIcon as UploadSimple,
} from "@phosphor-icons/react";
import Link from "next/link";
import { type SyntheticEvent, useState } from "react";

type KeywordsEmptyStateProps = {
  canCreateKeyword: boolean;
  canManageProviders: boolean;
  costContext?: ProjectCostContext;
  importTopQueriesAction?: ImportTopQueriesAction;
  onAddKeyword: (keyword: string) => void;
  onImportCsv: () => void;
  onImportQueries: (queries: string[]) => void;
  providerConnected?: boolean;
  projectId: string;
};

type DrawerData = { hidden: TopQuerySuggestion[]; suggestions: TopQuerySuggestion[] };

const EMPTY_HEADERS = ["Keyword", "Pos", "Change", "Volume", "Tags"] as const;

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
}: Readonly<KeywordsEmptyStateProps>) {
  const [keyword, setKeyword] = useState("");
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

  function handleSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (readOnly || !canCreateKeyword) {
      return;
    }
    onAddKeyword(keyword.trim());
  }

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
      <div className="grid grid-cols-[minmax(0,2.2fr)_repeat(3,1fr)_1.4fr] gap-x-2.5 border-b border-border bg-bg-sunken px-[18px] py-[11px] font-mono text-[10px] uppercase tracking-[0.6px] text-fg-muted">
        {EMPTY_HEADERS.map((header) => (
          <span key={header}>{header}</span>
        ))}
      </div>
      <div className="flex flex-col items-center px-6 py-10 text-center">
        <span className="grid h-[54px] w-[54px] place-items-center rounded-[14px] bg-accent-soft text-accent">
          <MagnifyingGlass size={27} weight="bold" />
        </span>
        <h3 className="mt-[18px] text-lg font-semibold tracking-[-0.4px] text-fg">
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
              <ProjectReadOnlyTooltip className="mt-auto inline-flex pt-4">
                <button
                  className="inline-flex min-h-10 items-center gap-2 rounded-[10px] bg-accent px-4 text-[13px] font-semibold text-white outline-none hover:opacity-90 focus-visible:opacity-90 disabled:cursor-not-allowed disabled:opacity-55"
                  disabled={readOnly || importPending || !importTopQueriesAction}
                  onClick={() => void handleSearchConsoleImport()}
                  type="button"
                >
                  <ArrowLineDown aria-hidden size={15} weight="bold" />
                  {importPending ? "Importing queries..." : "Find Search Console queries"}
                </button>
              </ProjectReadOnlyTooltip>
              {importFeedback ? (
                <p
                  className={`mt-3 text-[11.5px] leading-[1.5] ${
                    importFeedback.kind === "error" ? "text-red" : "text-fg-muted"
                  }`}
                  role="status"
                >
                  {importFeedback.message}
                  {importFeedback.kind === "no_source" || importFeedback.kind === "needs_reauth" ? (
                    <>
                      {" "}
                      <Link
                        className="font-semibold text-accent"
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
              <h4 className="m-0 text-[14px] font-semibold text-fg">Add keywords manually</h4>
              <p className="mt-2 text-[12.5px] leading-[1.55] text-fg-muted">
                Add one idea now, paste more in the drawer, or import a prepared CSV.
              </p>
              <form className="mt-auto flex items-center gap-2 pt-4" onSubmit={handleSubmit}>
                <input
                  aria-label="Keyword"
                  className="min-w-0 flex-1 rounded-[10px] border border-border-strong bg-bg px-3 py-2.5 text-[13.5px] font-medium text-fg outline-none focus:border-accent"
                  onChange={(event) => setKeyword(event.target.value)}
                  placeholder="e.g. headless cms"
                  value={keyword}
                />
                <ProjectReadOnlyTooltip>
                  <button
                    className="inline-flex flex-none items-center gap-1.5 rounded-[10px] bg-accent px-3.5 py-2.5 text-[13px] font-semibold text-white outline-none hover:opacity-90 focus-visible:opacity-90 disabled:cursor-not-allowed disabled:opacity-55"
                    disabled={readOnly}
                    type="submit"
                  >
                    <Plus size={14} weight="bold" />
                    Add
                  </button>
                </ProjectReadOnlyTooltip>
              </form>
              <div className="mt-3 flex flex-wrap items-center gap-3 text-[12px] text-fg-faint">
                <ProjectReadOnlyTooltip>
                  <button
                    className="inline-flex items-center gap-1.5 font-semibold text-fg-muted outline-none hover:text-accent focus-visible:text-accent disabled:cursor-not-allowed disabled:opacity-55"
                    disabled={readOnly}
                    onClick={onImportCsv}
                    type="button"
                  >
                    <UploadSimple size={15} />
                    Import CSV
                  </button>
                </ProjectReadOnlyTooltip>
              </div>
            </section>
          </div>
        ) : null}

        {providerConnected === false && canManageProviders ? (
          <p className="mt-4 max-w-[520px] text-[12px] leading-[1.5] text-fg-muted">
            Rank checks need a connected SERP provider. You can add keywords now - they start
            checking once you{" "}
            <Link className="font-semibold text-accent" href={appPath(projectId, "integrations")}>
              connect one
            </Link>
            .
          </p>
        ) : null}

        <p className="mt-5 text-[12.5px] text-fg-muted">
          Not sure where to start? Most existing sites should begin with Search Console.{" "}
          <Link
            className="font-semibold text-accent"
            href="/docs/guides/choose-first-keywords"
            {...docsLinkProps("/docs/guides/choose-first-keywords")}
          >
            Read the first-keywords guide
          </Link>
        </p>
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
