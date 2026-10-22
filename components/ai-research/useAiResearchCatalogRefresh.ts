"use client";

import { getAiResearchCatalogAction } from "@/lib/actions/ai-research";
import {
  freshResearchCatalog,
  isResearchCatalogPastWindow,
  researchCatalogNeedsRefresh,
} from "@/lib/ai-research/catalog-freshness";
import type { AiCatalogFailureReason, AiResearchCatalog } from "@/lib/ai-research/catalog-types";
import { useRef, useState, useTransition } from "react";
import { flushSync } from "react-dom";

export type AiResearchCatalogStatus = "hidden" | "refreshing" | "unavailable";

type RefreshState = {
  reason?: AiCatalogFailureReason;
  state: "idle" | "refreshing" | "failed";
};

function newerCatalog(left?: AiResearchCatalog, right?: AiResearchCatalog) {
  if (!left) return right;
  if (!right) return left;
  const leftAt = Date.parse(left.fetchedAt);
  const rightAt = Date.parse(right.fetchedAt);
  if (!Number.isFinite(rightAt)) return left;
  if (!Number.isFinite(leftAt)) return right;
  return rightAt >= leftAt ? right : left;
}

export function useAiResearchCatalogRefresh({
  catalog,
  catalogError,
  catalogFailure,
  projectId,
}: Readonly<{
  catalog?: AiResearchCatalog;
  catalogError?: string;
  catalogFailure?: AiCatalogFailureReason;
  projectId: string;
}>) {
  const [refreshed, setRefreshed] = useState<AiResearchCatalog | undefined>();
  const [refresh, setRefresh] = useState<RefreshState>({ state: "idle" });
  const [, startTransition] = useTransition();
  const inFlight = useRef(false);
  const held = newerCatalog(catalog, refreshed);
  const freshCatalog = freshResearchCatalog(held, catalogError);
  const [retained, setRetained] = useState(freshCatalog);
  if (freshCatalog && freshCatalog.fetchedAt !== retained?.fetchedAt) setRetained(freshCatalog);
  // A catalog that has never been usable in this session is an outage. One that
  // was usable and then aged stays on screen so the current selections remain.
  const displayCatalog = catalogError ? undefined : (freshCatalog ?? (retained ? held : undefined));
  const pastWindow = isResearchCatalogPastWindow(held, Date.now());
  const outage = !held || Boolean(catalogError) || (!freshCatalog && !retained);
  const status: AiResearchCatalogStatus =
    catalogFailure === "no_source"
      ? "hidden"
      : outage
        ? "unavailable"
        : pastWindow
          ? refresh.state === "failed"
            ? "unavailable"
            : "refreshing"
          : "hidden";

  function applyRefresh(next: RefreshState, nextCatalog?: AiResearchCatalog) {
    flushSync(() => {
      if (nextCatalog) setRefreshed(nextCatalog);
      setRefresh(next);
    });
  }
  function onCatalogInteract() {
    if (catalogFailure === "no_source" || catalogError || inFlight.current) return;
    const current = held;
    if (!current || !researchCatalogNeedsRefresh(current, Date.now())) return;
    if (!freshCatalog && !retained) return;
    inFlight.current = true;
    setRefresh({ state: "refreshing" });
    startTransition(() => {
      // Attach to the action promise itself. A later microtask stays inside the
      // transition and leaves the refreshing status mounted after the caller resolves.
      void getAiResearchCatalogAction(projectId).then(
        (outcome) => {
          if (outcome.ok) applyRefresh({ state: "idle" }, outcome.catalog);
          else
            applyRefresh({
              reason: outcome.reason ?? "provider_unavailable",
              state: "failed",
            });
          inFlight.current = false;
        },
        () => {
          applyRefresh({ reason: "provider_unavailable", state: "failed" });
          inFlight.current = false;
        },
      );
    });
  }

  return {
    displayCatalog,
    freshCatalog,
    noticeReason: refresh.reason ?? catalogFailure,
    onCatalogInteract,
    status,
  };
}
