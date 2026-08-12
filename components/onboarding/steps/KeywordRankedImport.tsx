"use client";

import { feedbackClass, keywordLines } from "@/components/onboarding/onboarding-form-utils";
import { Button, MenuSelect } from "@/components/ui";
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
  rankedKeywordErrorCopy,
} from "./keyword-ranked-model";
import { RankedKeywordSuggestionDrawer } from "./RankedKeywordSuggestionDrawer";

export type { FetchRankedKeywordSuggestionsAction } from "./keyword-ranked-model";

type Props = {
  connections: RankedKeywordConnection[];
  currentKeywords: string;
  domain: string;
  fetchAction?: FetchRankedKeywordSuggestionsAction;
  onAppendQueries: (queries: string[]) => void;
  projectId: string;
};

export function KeywordRankedImport({
  connections,
  currentKeywords,
  domain,
  fetchAction,
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
  const pageCost = rate ? `$${(rate.costCents / 100).toFixed(2)}` : null;
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
      showFeedback("Ranked-keyword lookup failed. Try again.");
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
    showFeedback(`${queries.length} ${queries.length === 1 ? "keyword" : "keywords"} added`);
  }

  if (connections.length === 0) return null;
  return (
    <section className="mt-4 rounded-xl border border-border bg-bg-sunken p-4">
      <h3 className="m-0 text-[13.5px] font-semibold">Import keywords {domain} ranks for</h3>
      <p className="m-0 mt-1 text-[12.5px] leading-5 text-fg-muted">
        Uses your DataForSEO account. Results are cached for 12 hours.
      </p>
      {connections.length > 1 ? (
        <div className="mt-3 flex items-center gap-2">
          <span className="text-[12px] font-medium text-fg-muted">Connection</span>
          <MenuSelect
            ariaLabel="DataForSEO connection"
            onChange={setConnectionId}
            options={connections.map((item) => ({ label: item.label, value: item.id }))}
            value={connectionId}
          />
        </div>
      ) : null}
      <div className="mt-3">
        <Button
          disabled={!fetchAction}
          loading={pending}
          onClick={openDrawer}
          type="button"
          variant="secondary"
        >
          Import from DataForSEO{pageCost ? ` (about ${pageCost}/page)` : ""}
        </Button>
      </div>
      {error ? <ErrorMessage projectRef={projectId} reason={error} /> : null}
      {feedback ? <p className={`m-0 mt-2 ${feedbackClass} text-fg-muted`}>{feedback}</p> : null}
      {pages.length > 0 ? (
        <RankedKeywordSuggestionDrawer
          canLoad={canLoad}
          currentKeywords={current}
          groups={groupRankedKeywords(pages)}
          onClose={() => setDrawerOpen(false)}
          onConfirm={appendSelected}
          onLoadMore={() => void load((lastPage?.offset ?? 0) + 100)}
          open={drawerOpen}
          pageCount={pages.length}
          pageCost={pageCost}
          pending={pending}
          remaining={remaining}
          spentCents={spent}
          lastPageCached={lastPage?.cached ?? false}
        />
      ) : null}
    </section>
  );
}

function ErrorMessage({
  projectRef,
  reason,
}: Readonly<{ projectRef: string; reason: RankedKeywordError }>) {
  return (
    <p className={`m-0 mt-2 ${feedbackClass} text-red-text`}>
      {rankedKeywordErrorCopy(reason)}
      {reason === "needs_reauth" ? (
        <Link
          className="ml-1 font-semibold text-accent-text"
          href={appPath(projectRef, "integrations")}
        >
          Reconnect DataForSEO
        </Link>
      ) : null}
      {reason === "budget_exhausted" ? (
        <Link
          className="ml-1 font-semibold text-accent-text"
          href={`${appPath(projectRef, "settings")}#provider-usage`}
        >
          Raise the budget
        </Link>
      ) : null}
    </p>
  );
}
