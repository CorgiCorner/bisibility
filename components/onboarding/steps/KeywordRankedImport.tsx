"use client";

import { feedbackClass, keywordLines } from "@/components/onboarding/onboarding-form-utils";
import { Button, MenuSelect } from "@/components/ui";
import { rankedKeywordPageRate } from "@/lib/cost-estimate/provider-rates";
import type { RankedKeywordConnection } from "@/lib/ranked-keywords/service";
import { appPath } from "@/lib/routing/app-path";
import { KEYWORD_IMPORT_MAX } from "@/lib/schemas/keyword";
import Checkbox from "@mui/material/Checkbox";
import Link from "next/link";
import { useRef, useState } from "react";
import {
  type FetchRankedKeywordSuggestionsAction,
  groupRankedKeywords,
  normalizeRankedKeyword,
  type RankedKeywordsPage as Page,
  type RankedKeywordError,
  rankedKeywordErrorCopy,
  rankedKeywordTraffic as traffic,
} from "./keyword-ranked-model";

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
  const [error, setError] = useState<RankedKeywordError | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [pages, setPages] = useState<Page[]>([]);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const feedbackTimer = useRef<number | null>(null);
  const current = new Set(keywordLines(currentKeywords).map(normalizeRankedKeyword));
  const grouped = groupRankedKeywords(pages);
  const selectable = grouped.filter((group) => !group.alreadyTracked && !current.has(group.key));
  const remaining = Math.max(0, KEYWORD_IMPORT_MAX - current.size);
  const activeSelected = selectable.filter((group) => selected.has(group.key)).slice(0, remaining);
  const loadedCount = pages.reduce((sum, page) => sum + page.rows.length, 0);
  const totalCount = pages.at(-1)?.totalCount ?? null;
  const lastPage = pages.at(-1);
  const selectedConnection =
    connections.find((connection) => connection.id === connectionId) ?? connections[0];
  const pageRate = rankedKeywordPageRate(selectedConnection?.provider ?? "");
  const pageCost = pageRate ? `$${(pageRate.costCents / 100).toFixed(2)}` : null;
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
      if (offset === 0) {
        const existing = new Set(keywordLines(currentKeywords).map(normalizeRankedKeyword));
        const firstGroups = groupRankedKeywords([result])
          .filter((group) => !group.alreadyTracked && !existing.has(group.key))
          .sort((a, b) => traffic(b.row.estimatedTraffic) - traffic(a.row.estimatedTraffic))
          .slice(0, Math.min(20, Math.max(0, KEYWORD_IMPORT_MAX - existing.size)));
        setSelected(new Set(firstGroups.map((group) => group.key)));
      }
    } catch {
      showFeedback("Ranked-keyword lookup failed. Try again.");
    } finally {
      setPending(false);
    }
  }

  function toggleAll() {
    const keys = selectable.slice(0, remaining).map((group) => group.key);
    setSelected(activeSelected.length === keys.length ? new Set() : new Set(keys));
  }

  function appendSelected() {
    const existing = new Set(keywordLines(currentKeywords).map(normalizeRankedKeyword));
    const queries = activeSelected.flatMap((group) =>
      existing.has(group.key) ? [] : [group.row.keyword.trim()],
    );
    onAppendQueries(queries);
    setSelected(new Set());
    showFeedback(`${queries.length} ${queries.length === 1 ? "keyword" : "keywords"} added`);
  }

  if (connections.length === 0) return null;
  if (pages.length === 0) {
    return (
      <section className="mt-4 rounded-xl border border-border bg-bg-sunken p-4">
        <h3 className="m-0 text-[13.5px] font-semibold">
          Find keywords {domain} already ranks for
        </h3>
        <p className="m-0 mt-1 text-[12.5px] leading-5 text-fg-muted">
          Paid lookups against your own DataForSEO account, 100 keywords per page. Results are
          cached for 12 hours.
        </p>
        {pageCost ? (
          <p className="m-0 mt-2 text-[12px] font-semibold text-fg-muted">
            About {pageCost} per page
          </p>
        ) : null}
        {connections.length > 1 ? (
          <div className="mt-3 flex items-center gap-2">
            <span className="text-[12px] font-semibold text-fg-muted">Connection</span>
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
            aria-busy={pending}
            disabled={!fetchAction}
            loading={pending}
            onClick={() => void load(0)}
            type="button"
          >
            Find ranked keywords
          </Button>
        </div>
        {error ? <ErrorMessage projectRef={projectId} reason={error} /> : null}
        {feedback ? <p className={`m-0 mt-2 ${feedbackClass} text-red-text`}>{feedback}</p> : null}
      </section>
    );
  }

  return (
    <section className="mt-4 rounded-xl border border-border bg-bg-sunken p-4">
      <h3 className="m-0 text-[13.5px] font-semibold">
        Found {totalCount === null ? "keywords" : `${totalCount} keywords`} - showing {loadedCount}
      </h3>
      {loadedCount === 0 ? (
        <p className="m-0 mt-3 text-[12.5px] text-fg-muted">
          No ranked keywords found for {domain} yet.
        </p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table
            aria-label="Ranked keyword suggestions"
            className="w-full min-w-[620px] border-collapse text-left text-[12px]"
          >
            <thead>
              <tr className="border-b border-border-strong text-fg-muted">
                <th>
                  <Checkbox
                    checked={
                      activeSelected.length > 0 &&
                      activeSelected.length === Math.min(selectable.length, remaining)
                    }
                    indeterminate={
                      activeSelected.length > 0 &&
                      activeSelected.length < Math.min(selectable.length, remaining)
                    }
                    inputProps={{ "aria-label": "Select all ranked keyword suggestions" }}
                    onChange={toggleAll}
                    size="small"
                  />
                </th>
                <th>Keyword</th>
                <th>Position</th>
                <th>Volume</th>
                <th>Est. traffic</th>
              </tr>
            </thead>
            <tbody>
              {grouped.map((group) => {
                const tracked = group.alreadyTracked || current.has(group.key);
                return (
                  <tr className="border-b border-border" key={group.key}>
                    <td>
                      <Checkbox
                        checked={!tracked && selected.has(group.key)}
                        disabled={tracked}
                        inputProps={{ "aria-label": `Select ${group.row.keyword}` }}
                        onChange={() =>
                          setSelected((value) => {
                            const next = new Set(value);
                            if (next.has(group.key)) next.delete(group.key);
                            else if (activeSelected.length < remaining) next.add(group.key);
                            return next;
                          })
                        }
                        size="small"
                      />
                    </td>
                    <td className="py-2 font-medium">
                      {group.row.keyword}
                      {group.count > 1 ? (
                        <span className="ml-1 text-fg-muted">+{group.count - 1} variants</span>
                      ) : null}
                      {tracked ? (
                        <span className="ml-2 rounded-full bg-bg-inset px-2 py-0.5 text-[10px] text-fg-muted">
                          Already tracked
                        </span>
                      ) : null}
                    </td>
                    <td>{group.row.position ?? "-"}</td>
                    <td>{group.row.searchVolume ?? "-"}</td>
                    <td>
                      {group.row.estimatedTraffic === null
                        ? "-"
                        : Math.round(group.row.estimatedTraffic)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="m-0 mt-3 text-[12px] text-fg-muted">
        {activeSelected.length} of {selectable.length} selected
      </p>
      <p className="m-0 mt-1 text-[11.5px] text-fg-muted">
        Spent this session: ${(spent / 100).toFixed(2)}.{" "}
        {pages
          .map((page, index) => (page.cached ? `Page ${index + 1} cached.` : null))
          .filter(Boolean)
          .join(" ")}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {canLoad ? (
          <Button
            aria-busy={pending}
            loading={pending}
            onClick={() => void load((lastPage?.offset ?? 0) + 100)}
            type="button"
          >
            Load next 100{pageCost ? ` (about ${pageCost})` : ""}
          </Button>
        ) : null}
        <Button disabled={activeSelected.length === 0} onClick={appendSelected} type="button">
          Add {activeSelected.length} keywords
        </Button>
      </div>
      {error ? <ErrorMessage projectRef={projectId} reason={error} /> : null}
      {feedback ? <p className={`m-0 mt-2 ${feedbackClass} text-fg-muted`}>{feedback}</p> : null}
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
        <>
          {" "}
          <Link
            className="font-semibold text-accent-text"
            href={appPath(projectRef, "integrations")}
          >
            Reconnect DataForSEO
          </Link>
        </>
      ) : null}
      {reason === "budget_exhausted" ? (
        <>
          {" "}
          <Link
            className="font-semibold text-accent-text"
            href={`${appPath(projectRef, "settings")}#provider-usage`}
          >
            Raise the budget
          </Link>
        </>
      ) : null}
    </p>
  );
}
