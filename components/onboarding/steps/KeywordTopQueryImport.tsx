"use client";

import {
  KeywordSuggestionDrawer,
  type SuggestionCostContext,
} from "@/components/keywords/import/KeywordSuggestionDrawer";
import {
  actionErrorMessage,
  feedbackClass,
  keywordLines,
} from "@/components/onboarding/onboarding-form-utils";
import { Button } from "@/components/ui/Button";
import type { TopQuerySuggestion } from "@/lib/keyword-suggest/sanitize-top-queries";
import { appPath } from "@/lib/routing/app-path";
import { ArrowLineDownIcon as ArrowLineDown } from "@phosphor-icons/react/dist/csr/ArrowLineDown";
import Link from "next/link";
import { useRef, useState } from "react";

export type ImportTopQueriesAction = (input: { limit?: number; projectId: string }) => Promise<
  | {
      queries: string[];
      suggestions?: TopQuerySuggestion[];
      hidden?: TopQuerySuggestion[];
      hiddenCount?: number;
    }
  | { queries: []; reason: "needs_reauth" | "no_source" }
>;

type KeywordTopQueryImportProps = {
  compact?: boolean;
  costContext?: SuggestionCostContext;
  currentKeywords: string;
  hasAnalyticsSource: boolean;
  importTopQueriesAction?: ImportTopQueriesAction;
  onAppendQueries: (queries: string[]) => void;
  projectId: string;
};

type DrawerData = {
  hidden: TopQuerySuggestion[];
  suggestions: TopQuerySuggestion[];
};

function importedMessage(count: number) {
  return `${count} ${count === 1 ? "query" : "queries"} added`;
}

function emptyImportMessage() {
  return "No queries observed yet - new Search Console properties can take a few days.";
}

export function KeywordTopQueryImport({
  compact = false,
  costContext,
  currentKeywords,
  hasAnalyticsSource,
  importTopQueriesAction,
  onAppendQueries,
  projectId,
}: Readonly<KeywordTopQueryImportProps>) {
  const [feedback, setFeedback] = useState<string | null>(null);
  const [needsReauth, setNeedsReauth] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [drawer, setDrawer] = useState<DrawerData | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerNonce, setDrawerNonce] = useState(0);
  const feedbackTimer = useRef<number | null>(null);

  function showFeedback(message: string, reconnect = false) {
    if (feedbackTimer.current !== null) {
      window.clearTimeout(feedbackTimer.current);
    }
    setFeedback(message);
    setNeedsReauth(reconnect);
    feedbackTimer.current = window.setTimeout(() => setFeedback(null), 3000);
  }

  function handleImport() {
    if (!importTopQueriesAction || isPending) return;
    setIsPending(true);
    void importTopQueriesAction({ limit: 50, projectId })
      .then((result) => {
        if ("reason" in result) {
          showFeedback(
            result.reason === "no_source"
              ? "No analytics source connected."
              : "Google authorization has expired.",
            result.reason === "needs_reauth",
          );
          return;
        }
        const suggestions = result.suggestions ?? result.queries.map((query) => ({ query }));
        if (suggestions.length === 0) {
          showFeedback(emptyImportMessage());
          return;
        }
        setDrawer({ hidden: result.hidden ?? [], suggestions });
        setDrawerNonce((value) => value + 1);
        setDrawerOpen(true);
      })
      .catch((error: unknown) => showFeedback(actionErrorMessage(error)))
      .finally(() => setIsPending(false));
  }

  function handleConfirm(queries: string[]) {
    setDrawerOpen(false);
    if (queries.length === 0) return;
    onAppendQueries(queries);
    showFeedback(importedMessage(queries.length));
  }

  if (!hasAnalyticsSource) return null;

  return (
    <div className={`${compact ? "" : "mt-4.5 "}flex flex-wrap items-center gap-2`}>
      <Button
        disabled={!importTopQueriesAction}
        loading={isPending}
        loadingLabel="Importing top queries..."
        onClick={handleImport}
        startIcon={compact ? undefined : <ArrowLineDown aria-hidden size={14} weight="regular" />}
        style={
          compact
            ? undefined
            : {
                "--control-color": "var(--fg-muted)",
                "--control-hover-border-color": "var(--accent)",
                "--control-hover-color": "var(--accent-text)",
              }
        }
        type="button"
        variant="secondary"
      >
        {compact ? "Choose queries" : "Import top queries from Search Console"}
      </Button>
      {feedback ? (
        <span className={`${feedbackClass} text-fg-muted`}>
          {feedback}
          {needsReauth ? (
            <>
              {" "}
              <Link
                className="font-semibold text-accent-text"
                href={appPath(projectId, "integrations")}
              >
                Reconnect your Google account
              </Link>
            </>
          ) : null}
        </span>
      ) : null}
      {drawer ? (
        <KeywordSuggestionDrawer
          costContext={costContext}
          selectionOnly={compact}
          existingKeywords={keywordLines(currentKeywords)}
          hidden={drawer.hidden}
          key={drawerNonce}
          onClose={() => setDrawerOpen(false)}
          onConfirm={handleConfirm}
          open={drawerOpen}
          suggestions={drawer.suggestions}
        />
      ) : null}
    </div>
  );
}
