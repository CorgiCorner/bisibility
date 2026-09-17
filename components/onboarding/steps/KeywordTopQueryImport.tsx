"use client";

import { useSharedErrorMessages } from "@/components/i18n/useSharedErrorMessages";
import {
  KeywordSuggestionDrawer,
  type SuggestionCostContext,
  type SuggestionDrawerMessages,
} from "@/components/keywords/import/KeywordSuggestionDrawer";
import { feedbackClass, keywordLines } from "@/components/onboarding/onboarding-form-utils";
import { Button } from "@/components/ui/Button";
import type { TopQuerySuggestion } from "@/lib/keyword-suggest/sanitize-top-queries";
import { appPath } from "@/lib/routing/app-path";
import { classifyActionError, presentActionError } from "@/lib/ui/action-error";
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
  messages: KeywordTopQueryImportMessages;
  onAppendQueries: (queries: string[]) => void;
  projectId: string;
};

export type KeywordTopQueryImportMessages = {
  added: (values: { count: number }) => string;
  choose: string;
  drawer: SuggestionDrawerMessages;
  empty: string;
  expiredAuthorization: string;
  importing: string;
  import: string;
  loadError: string;
  noSource: string;
  rateLimited: string;
  reconnect: string;
};

type DrawerData = {
  hidden: TopQuerySuggestion[];
  suggestions: TopQuerySuggestion[];
};

export function KeywordTopQueryImport({
  compact = false,
  costContext,
  currentKeywords,
  hasAnalyticsSource,
  importTopQueriesAction,
  messages,
  onAppendQueries,
  projectId,
}: Readonly<KeywordTopQueryImportProps>) {
  const sharedErrors = useSharedErrorMessages();
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

  function importError(error: unknown) {
    const classified = classifyActionError(error);
    if (classified.kind === "staleDeployment" || classified.kind === "serverComponentDigest") {
      return presentActionError(error, sharedErrors, messages.loadError);
    }
    if (
      classified.kind === "ownedMessage" &&
      classified.message === "Rate limited, try again shortly."
    ) {
      return messages.rateLimited;
    }
    return messages.loadError;
  }

  function handleImport() {
    if (!importTopQueriesAction || isPending) return;
    setIsPending(true);
    void importTopQueriesAction({ limit: 50, projectId })
      .then((result) => {
        if ("reason" in result) {
          showFeedback(
            result.reason === "no_source" ? messages.noSource : messages.expiredAuthorization,
            result.reason === "needs_reauth",
          );
          return;
        }
        const suggestions = result.suggestions ?? result.queries.map((query) => ({ query }));
        if (suggestions.length === 0) {
          showFeedback(messages.empty);
          return;
        }
        setDrawer({ hidden: result.hidden ?? [], suggestions });
        setDrawerNonce((value) => value + 1);
        setDrawerOpen(true);
      })
      .catch((error: unknown) => showFeedback(importError(error)))
      .finally(() => setIsPending(false));
  }

  function handleConfirm(queries: string[]) {
    setDrawerOpen(false);
    if (queries.length === 0) return;
    onAppendQueries(queries);
    showFeedback(messages.added({ count: queries.length }));
  }

  if (!hasAnalyticsSource) return null;

  return (
    <div className={`${compact ? "" : "mt-4.5 "}flex flex-wrap items-center gap-2`}>
      <Button
        disabled={!importTopQueriesAction}
        loading={isPending}
        loadingLabel={messages.importing}
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
        {compact ? messages.choose : messages.import}
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
                {messages.reconnect}
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
          messages={messages.drawer}
          onClose={() => setDrawerOpen(false)}
          onConfirm={handleConfirm}
          open={drawerOpen}
          suggestions={drawer.suggestions}
        />
      ) : null}
    </div>
  );
}
