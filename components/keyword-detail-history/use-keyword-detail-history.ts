"use client";

import { useRef, useState } from "react";
import type {
  HistoryFailure,
  HistoryPage,
  HistoryPages,
  KeywordHistoryPort,
  RetainedHistorySnapshot,
} from "./history-contract";
import {
  appendHistoryPage,
  historyWindowMatches,
  sameHistorySelection,
  validHistoryPages,
  validHistorySnapshot,
} from "./history-page-state";

/** Reads occur only in handlers; new source/window/cursor is accepted atomically or refused. */
export function useKeywordDetailHistory(history: KeywordHistoryPort) {
  const [pages, setPages] = useState<HistoryPages>(history.initial);
  const [stream, setStream] = useState<HistoryPage["stream"]>("observations");
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<HistoryFailure | null>(
    validHistoryPages(history.initial) ? null : "snapshot_conflict",
  );
  const [snapshot, setSnapshot] = useState<RetainedHistorySnapshot | null>(null);
  const request = useRef(0);
  const page = pages[stream];
  const windowId =
    history.windows.find((option) => historyWindowMatches(pages.observations, option.window))?.id ??
    "";

  async function loadMore() {
    if (!page.nextCursor || busy) return;
    const token = ++request.current;
    setBusy(true);
    setFailure(null);
    try {
      const result = await history.readPage({
        cursor: page.nextCursor,
        stream,
        window: page.window,
      });
      if (token !== request.current) return;
      if (!result.ok) {
        setFailure(result.reason);
        return;
      }
      const appended = appendHistoryPage(page, result.value, page.nextCursor);
      if (!appended) {
        setFailure("snapshot_conflict");
        return;
      }
      if (appended.stream === "observations")
        setPages((current) => ({ ...current, observations: appended }));
      else setPages((current) => ({ ...current, attempts: appended }));
    } catch {
      if (token === request.current) setFailure("unavailable");
    } finally {
      if (token === request.current) setBusy(false);
    }
  }

  async function changeWindow(id: string) {
    const option = history.windows.find((option) => option.id === id);
    if (!option || busy) return;
    const token = ++request.current;
    setBusy(true);
    setFailure(null);
    try {
      const result = await history.readWindow(option.window);
      if (token !== request.current) return;
      if (!result.ok) {
        setFailure(result.reason);
        return;
      }
      if (
        !validHistoryPages(result.value) ||
        !historyWindowMatches(result.value.observations, option.window) ||
        !sameHistorySelection(pages.observations, result.value.observations)
      ) {
        setFailure("snapshot_conflict");
        return;
      }
      setPages(result.value);
      setSnapshot(null);
    } catch {
      if (token === request.current) setFailure("unavailable");
    } finally {
      if (token === request.current) setBusy(false);
    }
  }

  async function openSnapshot(checkId: string) {
    if (busy || !pages.observations.records.some((record) => record.id === checkId)) return;
    const token = ++request.current;
    setBusy(true);
    setFailure(null);
    try {
      const result = await history.readSnapshot({ asOf: pages.observations.asOf, checkId });
      if (token !== request.current) return;
      if (!result.ok) {
        setFailure(result.reason);
        return;
      }
      if (!validHistorySnapshot(pages.observations, checkId, result.value)) {
        setFailure("snapshot_conflict");
        return;
      }
      setSnapshot(result.value);
    } catch {
      if (token === request.current) setFailure("unavailable");
    } finally {
      if (token === request.current) setBusy(false);
    }
  }

  return {
    pages,
    page,
    stream,
    setStream,
    busy,
    failure,
    snapshot,
    windowId,
    loadMore,
    changeWindow,
    openSnapshot,
  };
}
