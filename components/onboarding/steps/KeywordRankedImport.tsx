"use client";

import { feedbackClass, keywordLines } from "@/components/onboarding/onboarding-form-utils";
import { Button } from "@/components/ui/Button";
import { MenuSelect } from "@/components/ui/MenuSelect";
import { rankedKeywordPageRate } from "@/lib/cost-estimate/provider-rates";
import type { RankedKeywordConnection } from "@/lib/ranked-keywords/service";
import { appPath } from "@/lib/routing/app-path";
import { KEYWORD_IMPORT_MAX } from "@/lib/schemas/keyword";
import Link from "next/link";
import { useRef, useState } from "react";
import {
  type FetchRankedKeywordSuggestionsAction,
  groupRankedKeywords,
  normalizeRankedKeyword,
  type RankedKeywordError,
  type RankedKeywordsPage,
} from "./keyword-ranked-model";
import {
  RankedKeywordSuggestionDrawer,
  type RankedKeywordSuggestionDrawerMessages,
} from "./RankedKeywordSuggestionDrawer";

export type { FetchRankedKeywordSuggestionsAction } from "./keyword-ranked-model";

type Props = {
  allowTracked?: boolean;
  compact?: boolean;
  connections: RankedKeywordConnection[];
  currentKeywords: string;
  domain: string;
  fetchAction?: FetchRankedKeywordSuggestionsAction;
  messages: KeywordRankedImportMessages;
  onAppendQueries: (queries: string[]) => void;
  projectId: string;
};

export type KeywordRankedImportMessages = {
  added: (values: { count: number }) => string;
  budgetExhausted: string;
  choose: string;
  connection: string;
  connectionLabel: string;
  description: string;
  drawer: RankedKeywordSuggestionDrawerMessages;
  import: string;
  importFor: (values: { domain: string }) => string;
  lookupFailed: string;
  needsReauth: string;
  noDomain: string;
  noSource: string;
  rateLimited: string;
  raiseBudget: string;
  reconnect: string;
  unsupportedLocation: string;
};

export function KeywordRankedImport({
  allowTracked = false,
  compact = false,
  connections,
  currentKeywords,
  domain,
  fetchAction,
  messages,
  onAppendQueries,
  projectId,
}: Readonly<Props>) {
  const [connectionId, setConnectionId] = useState(connections[0]?.id ?? "");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [error, setError] = useState<RankedKeywordError | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [pages, setPages] = useState<RankedKeywordsPage[]>([]);
  const feedbackTimer = useRef<number | null>(null);
  const current = keywordLines(currentKeywords);
  const remaining = Math.max(
    0,
    KEYWORD_IMPORT_MAX - new Set(current.map(normalizeRankedKeyword)).size,
  );
  const lastPage = pages.at(-1);
  const loadedCount = pages.reduce((sum, page) => sum + page.rows.length, 0);
  const totalCount = lastPage?.totalCount ?? null;
  const selectedConnection =
    connections.find((connection) => connection.id === connectionId) ?? connections[0];
  const rate = rankedKeywordPageRate(selectedConnection?.provider ?? "");
  const pageCostCents = rate?.costCents ?? null;
  const canLoad = Boolean(
    lastPage &&
      lastPage.offset < 900 &&
      (totalCount === null ? lastPage.rows.length === 100 : loadedCount < totalCount),
  );
  const spent = pages.reduce((sum, page) => sum + (page.cached ? 0 : page.costCents), 0);

  function showFeedback(message: string) {
    if (feedbackTimer.current !== null) window.clearTimeout(feedbackTimer.current);
    setFeedback(message);
    feedbackTimer.current = window.setTimeout(() => setFeedback(null), 3_000);
  }

  async function load(offset: number) {
    if (!fetchAction || pending) return;
    setPending(true);
    setError(null);
    try {
      const result = await fetchAction({
        connectionId: connectionId || undefined,
        offset,
        projectId,
      });
      if ("reason" in result) {
        setError(result.reason);
        return;
      }
      setPages((existing) => (offset === 0 ? [result] : [...existing, result]));
      setDrawerOpen(true);
    } catch {
      showFeedback(messages.lookupFailed);
    } finally {
      setPending(false);
    }
  }

  function openDrawer() {
    if (pages.length > 0) setDrawerOpen(true);
    else void load(0);
  }

  function appendSelected(queries: string[]) {
    setDrawerOpen(false);
    onAppendQueries(queries);
    showFeedback(messages.added({ count: queries.length }));
  }

  if (connections.length === 0) return null;
  return (
    <section
      className={compact ? "" : "mt-4 rounded-card border border-border bg-bg-sunken p-4"}
      data-analytics-mask
    >
      {!compact ? (
        <>
          <h3 className="m-0 text-[13.5px] font-semibold">{messages.importFor({ domain })}</h3>
          <p className="m-0 mt-1 text-[12.5px] leading-5 text-fg-muted">{messages.description}</p>
        </>
      ) : null}
      {connections.length > 1 ? (
        <div className="mt-3 flex items-center gap-2">
          <span className="text-[12px] font-medium text-fg-muted">{messages.connection}</span>
          <MenuSelect
            ariaLabel={messages.connectionLabel}
            onChange={(id) => {
              setConnectionId(id);
              setPages([]);
              setError(null);
            }}
            options={connections.map((item) => ({ label: item.label, value: item.id }))}
            value={connectionId}
          />
        </div>
      ) : null}
      <div className={compact && connections.length === 1 ? "" : "mt-3"}>
        <Button
          disabled={!fetchAction}
          loading={pending}
          onClick={openDrawer}
          type="button"
          variant="secondary"
        >
          {compact ? messages.choose : messages.import}
          {pageCostCents == null
            ? ""
            : ` ${messages.drawer.aboutPage({ cost: pageCostCents / 100 })}`}
        </Button>
      </div>
      {error ? <ErrorMessage messages={messages} projectRef={projectId} reason={error} /> : null}
      {feedback ? <p className={`m-0 mt-2 ${feedbackClass} text-fg-muted`}>{feedback}</p> : null}
      {pages.length > 0 ? (
        <RankedKeywordSuggestionDrawer
          canLoad={canLoad}
          currentKeywords={current}
          groups={groupRankedKeywords(pages).map((group) =>
            allowTracked ? { ...group, alreadyTracked: false } : group,
          )}
          selectionOnly={compact}
          onClose={() => setDrawerOpen(false)}
          onConfirm={appendSelected}
          onLoadMore={() => void load((lastPage?.offset ?? 0) + 100)}
          open={drawerOpen}
          pageCount={pages.length}
          pageCostCents={pageCostCents}
          pending={pending}
          remaining={remaining}
          spentCents={spent}
          lastPageCached={lastPage?.cached ?? false}
          messages={messages.drawer}
        />
      ) : null}
    </section>
  );
}

function ErrorMessage({
  messages,
  projectRef,
  reason,
}: Readonly<{
  messages: KeywordRankedImportMessages;
  projectRef: string;
  reason: RankedKeywordError;
}>) {
  const message = {
    budget_exhausted: messages.budgetExhausted,
    needs_reauth: messages.needsReauth,
    no_domain: messages.noDomain,
    no_source: messages.noSource,
    rate_limited: messages.rateLimited,
    unsupported_location: messages.unsupportedLocation,
  }[reason];
  return (
    <p className={`m-0 mt-2 ${feedbackClass} text-red-text`}>
      {message}
      {reason === "needs_reauth" ? (
        <Link
          className="ml-1 font-semibold text-accent-text"
          href={appPath(projectRef, "integrations")}
        >
          {messages.reconnect}
        </Link>
      ) : null}
      {reason === "budget_exhausted" ? (
        <Link
          className="ml-1 font-semibold text-accent-text"
          href={`${appPath(projectRef, "settings")}#provider-usage`}
        >
          {messages.raiseBudget}
        </Link>
      ) : null}
    </p>
  );
}
