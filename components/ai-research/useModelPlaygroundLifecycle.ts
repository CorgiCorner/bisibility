"use client";
import { scheduleComposerExpiry } from "@/lib/model-playground/composer-timer";
import type { ModelCatalogSnapshot } from "@/lib/providers/model/types";
import { useEffect, useReducer, useRef, useState } from "react";

export function notifyRetainedModelRun(
  callback: ((runId: string) => Promise<void>) | undefined,
  runId: string,
) {
  // Supplementary history failure cannot enter the paid launch failure path.
  void Promise.resolve()
    .then(() => callback?.(runId))
    .catch(() => {});
}

export function useModelPlaygroundLifecycle(catalogs: readonly ModelCatalogSnapshot[]) {
  const mounted = useRef(true);
  const [, refresh] = useReducer((value: number) => value + 1, 0);
  const nextExpiry = Math.min(
    ...catalogs.map((catalog) => Date.parse(catalog.expiresAt)).filter((time) => time > Date.now()),
  );
  // Synchronize catalog expiry with the wall clock and fence responses after this subscriber leaves.
  useEffect(() => {
    mounted.current = true;
    const cancel = scheduleComposerExpiry(nextExpiry, refresh);
    return () => {
      mounted.current = false;
      cancel();
    };
  }, [nextExpiry]);
  return { mounted, refresh };
}

type Failure = "not_dispatched" | "uncertain";
/** Per-content model: idle -> uncertain on a lost response or server confirmation;
 * definite rejection -> rejected unless an earlier attempt is still uncertain;
 * admitted -> clear uncertainty; edit -> select that content, hiding stale failure/confirmation.
 * Rejection also drops/requotes through the quote port. Unmount forbids state updates or requotes.
 * Launch clears the visible failure; confirmation gates every retry of uncertain content. */
export function useModelPlaygroundFailure(contentKey: string) {
  const uncertainContents = useRef(new Set<string>());
  const [failure, setFailure] = useState<{ contentKey: string; value: Failure } | null>(null);
  return {
    failure: failure?.contentKey === contentKey ? failure.value : null,
    uncertainContents,
    clearFailure: () => setFailure(null),
    rejectLaunch(key: string, definite: boolean) {
      if (!definite) uncertainContents.current.add(key);
      setFailure({
        contentKey: key,
        value: uncertainContents.current.has(key) ? "uncertain" : "not_dispatched",
      });
    },
  };
}
