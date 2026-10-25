"use client";

import { useEffect, useRef, useState } from "react";
import type { RunPageItem } from "./RunPageTypes";

type Page = { cursor: string | null; limit: number };
type Scope = { projectRef: string; runId: string };

function mergeItems(known: RunPageItem[], refreshed: RunPageItem[]) {
  const byId = new Map(refreshed.map((item) => [item.id, item]));
  const knownIds = new Set(known.map((item) => item.id));
  return [
    ...known.map((item) => byId.get(item.id) ?? item),
    ...refreshed.filter((item) => !knownIds.has(item.id)),
  ];
}

async function readPage(scope: Scope, page: Page, signal?: AbortSignal) {
  const query = new URLSearchParams({ project: scope.projectRef, limit: String(page.limit) });
  if (page.cursor) query.set("cursor", page.cursor);
  const response = await fetch(`/api/rank-check-runs/${scope.runId}/items?${query}`, {
    cache: "no-store",
    credentials: "same-origin",
    signal,
  });
  const payload = (await response.json()) as {
    data?: RunPageItem[];
    meta?: { next_cursor?: string | null };
  };
  if (!response.ok || !Array.isArray(payload.data)) throw new Error("Unable to load targets.");
  return { items: payload.data, cursor: payload.meta?.next_cursor ?? null };
}

export function useRunPageItems(
  scope: Scope,
  initialItems: RunPageItem[],
  initialCursor: string | null,
  version: number,
  onError: (message: string) => void,
  errorMessage: string,
) {
  const key = `${scope.projectRef}/${scope.runId}`;
  const [state, setState] = useState({
    key,
    initialItems,
    initialCursor,
    items: initialItems,
    cursor: initialCursor,
    pages: [{ cursor: null, limit: 20 }] as Page[],
  });
  if (state.key !== key) {
    setState({
      key,
      initialItems,
      initialCursor,
      items: initialItems,
      cursor: initialCursor,
      pages: [{ cursor: null, limit: 20 }],
    });
  } else if (state.initialItems !== initialItems || state.initialCursor !== initialCursor) {
    setState({
      ...state,
      initialItems,
      initialCursor,
      items: mergeItems(state.items, initialItems),
      cursor: state.pages.length === 1 ? initialCursor : state.cursor,
    });
  }
  const latest = useRef(state);
  latest.current = state;
  const observed = useRef({ key, version });

  // Synchronize all loaded target pages with the external realtime data-change subscription.
  useEffect(() => {
    const previous = observed.current;
    observed.current = { key, version };
    if (previous.key !== key || previous.version === version) return;
    const controller = new AbortController();
    const pages = latest.current.pages;
    void Promise.all(
      pages.map((page) =>
        readPage({ projectRef: scope.projectRef, runId: scope.runId }, page, controller.signal),
      ),
    )
      .then((results) => {
        if (controller.signal.aborted) return;
        setState((known) =>
          known.key === key
            ? {
                ...known,
                items: mergeItems(
                  known.items,
                  results.flatMap((page) => page.items),
                ),
              }
            : known,
        );
      })
      .catch(() => {
        if (!controller.signal.aborted) onError(errorMessage);
      });
    return () => controller.abort();
  }, [key, version, scope.projectRef, scope.runId, onError, errorMessage]);

  async function loadMore() {
    const current = latest.current;
    if (!current.cursor) return;
    try {
      const page = { cursor: current.cursor, limit: 50 };
      const next = await readPage(scope, page);
      setState((known) =>
        known.key === current.key && known.cursor === current.cursor
          ? {
              ...known,
              items: mergeItems(known.items, next.items),
              cursor: next.cursor,
              pages: [...known.pages, page],
            }
          : known,
      );
    } catch {
      if (latest.current.key === current.key) onError(errorMessage);
    }
  }
  return { items: state.items, cursor: state.cursor, loadMore };
}
