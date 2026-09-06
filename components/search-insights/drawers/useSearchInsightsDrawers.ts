"use client";

import type {
  LoadSearchInsightsBandListAction,
  LoadSearchInsightsOverlapListAction,
  LoadSearchInsightsPageDetailAction,
  LoadSearchInsightsQueryDetailAction,
} from "@/lib/actions/search-insights-drawers";
import { track } from "@/lib/analytics/client";
import { DRAWER_LIST_CAP } from "@/lib/search-insights/constants";
import { useRef, useState } from "react";
import {
  drawerFrameKey,
  type SearchInsightsDrawerContent,
  type SearchInsightsDrawerEntry,
  type SearchInsightsDrawerFrame,
} from "./drawer-model";
import { useDrawerStack } from "./useDrawerStack";
import { useVisitedMarks } from "./useVisitedMarks";

export type SearchInsightsDrawerActions = {
  loadBandListAction: LoadSearchInsightsBandListAction;
  loadOverlapListAction: LoadSearchInsightsOverlapListAction;
  loadPageDetailAction: LoadSearchInsightsPageDetailAction;
  loadQueryDetailAction: LoadSearchInsightsQueryDetailAction;
};

export type UseSearchInsightsDrawersInput = SearchInsightsDrawerActions & {
  comparison?: string;
  period: string;
  projectId: string;
  property: string;
};

type Entries = Record<string, SearchInsightsDrawerEntry>;

function analyticsFrameKind(frame: SearchInsightsDrawerFrame) {
  return frame.kind === "list" ? frame.which : frame.kind;
}

async function readFrame(
  input: UseSearchInsightsDrawersInput,
  frame: SearchInsightsDrawerFrame,
  limit: number | undefined,
): Promise<SearchInsightsDrawerContent> {
  const scope = {
    ...(input.comparison ? { comparison: input.comparison } : {}),
    period: input.period,
    projectId: input.projectId,
    property: input.property,
  };
  if (frame.kind === "query") {
    return {
      detail: await input.loadQueryDetailAction({ ...scope, query: frame.query }),
      kind: "query",
    };
  }
  if (frame.kind === "page") {
    return {
      detail: await input.loadPageDetailAction({ ...scope, page: frame.url }),
      kind: "page",
    };
  }
  if (frame.which === "band") {
    return { kind: "band", list: await input.loadBandListAction({ ...scope, limit }) };
  }
  return { kind: "overlap", list: await input.loadOverlapListAction({ ...scope, limit }) };
}

/**
 * The drawer stack and the reads behind it. Every frame is read from the stored daily tables, so
 * a frame already read is kept for the life of the panel: going back is free, and so is going
 * forward again into a row the customer has already opened.
 */
export function useSearchInsightsDrawers(input: UseSearchInsightsDrawersInput) {
  const bodyRef = useRef<HTMLDivElement>(null);
  // Answers to frames the customer has already left are still applied; answers to a panel they
  // closed are not, which is what this counter separates.
  const session = useRef(0);
  // Two reads of the same frame can overlap - a retry, then Show all - and the slower one must
  // not land on top of the newer answer, so each frame keeps its own request number.
  const requests = useRef(new Map<string, number>());
  const stack = useDrawerStack(bodyRef);
  const visited = useVisitedMarks(input.projectId);
  const [entries, setEntries] = useState<Entries>({});

  const key = stack.frame ? drawerFrameKey(stack.frame) : null;

  async function load(frame: SearchInsightsDrawerFrame, limit?: number) {
    const frameKey = drawerFrameKey(frame);
    const generation = session.current;
    const token = (requests.current.get(frameKey) ?? 0) + 1;
    requests.current.set(frameKey, token);
    const stale = () => session.current !== generation || requests.current.get(frameKey) !== token;
    setEntries((state) => ({ ...state, [frameKey]: { status: "loading" } }));
    try {
      const content = await readFrame(input, frame, limit);
      if (stale()) return;
      setEntries((state) => ({ ...state, [frameKey]: { content, status: "ready" } }));
    } catch {
      if (stale()) return;
      setEntries((state) => ({ ...state, [frameKey]: { status: "failed" } }));
    }
  }

  function open(frame: SearchInsightsDrawerFrame) {
    session.current += 1;
    requests.current.clear();
    setEntries({});
    if (frame.kind !== "list") visited.mark(drawerFrameKey(frame));
    stack.open(frame);
    void load(frame);
  }

  function push(frame: SearchInsightsDrawerFrame) {
    if (stack.frame) {
      track("search_insights_drawer_pivot", {
        from: analyticsFrameKind(stack.frame),
        to: analyticsFrameKind(frame),
      });
    }
    visited.mark(drawerFrameKey(frame));
    stack.push(frame);
    if (entries[drawerFrameKey(frame)]?.status !== "ready") void load(frame);
  }

  return {
    back: stack.back,
    bodyRef,
    close: stack.close,
    entry: key ? entries[key] : undefined,
    frame: stack.frame,
    onExited: () => {
      session.current += 1;
      requests.current.clear();
      setEntries({});
      stack.reset();
    },
    open,
    opened: stack.opened,
    pop: stack.pop,
    push,
    retry: () => {
      if (stack.frame) void load(stack.frame);
    },
    seen: visited.seen,
    // Show all reaches the rest of a list, still from stored rows and still capped at what one
    // click is allowed to materialize.
    showAll: () => {
      if (stack.frame?.kind === "list") void load(stack.frame, DRAWER_LIST_CAP);
    },
  };
}
