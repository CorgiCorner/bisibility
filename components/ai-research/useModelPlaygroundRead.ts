"use client";
import type {
  ModelPlaygroundLaunchResult,
  ModelPlaygroundLaunchService,
} from "@/lib/model-playground/launch-service";
import { useEffect, useRef, useState } from "react";

export const MODEL_READ_ATTEMPTS = 150;
const READ_TIMEOUT_MS = 10_000;
/** Bounded subscription to persisted progress; a read never invokes a provider. */
export function useModelPlaygroundRead(
  service: ModelPlaygroundLaunchService,
  initial: ModelPlaygroundLaunchResult | null,
) {
  const [updated, setUpdated] = useState<{
    source: string;
    value: ModelPlaygroundLaunchResult;
  } | null>(null);
  const [expired, setExpired] = useState<string | null>(null);
  const value = updated && updated.source === initial?.runId ? updated.value : initial;
  const unconfirmed = Boolean(initial && expired === initial.runId);
  const pending =
    !unconfirmed &&
    value?.progress?.some((c) => ["queued", "claimed", "admitted", "in_flight"].includes(c.state));
  const source = initial?.runId;
  const budgetRef = useRef<{ source: string; attempts: number; deadline: number } | null>(null);
  useEffect(() => {
    if (!source || !service.read || !pending) return;
    let live = true;
    let budget = budgetRef.current;
    if (!budget || budget.source !== source) {
      budget = { source, attempts: 0, deadline: Date.now() + 300_000 };
      budgetRef.current = budget;
    }
    if (Date.now() >= budget.deadline) {
      setExpired(source);
      return;
    }
    let timer: ReturnType<typeof setTimeout>;
    let timeout: ReturnType<typeof setTimeout>;
    const poll = async () => {
      if (budget.attempts >= MODEL_READ_ATTEMPTS || Date.now() >= budget.deadline) {
        setExpired(source);
        return;
      }
      budget.attempts++;
      try {
        const result = await Promise.race([
          service.read?.(source),
          new Promise<null>((resolve) => {
            timeout = setTimeout(() => resolve(null), READ_TIMEOUT_MS);
          }),
        ]);
        if (live && result) setUpdated({ source, value: result });
      } catch {
        /* Reads cannot initiate paid work. */
      } finally {
        clearTimeout(timeout);
      }
      if (!live) return;
      if (budget.attempts >= MODEL_READ_ATTEMPTS || Date.now() >= budget.deadline)
        setExpired(source);
      else timer = setTimeout(poll, 2_000);
    };
    timer = setTimeout(poll, 1_000);
    return () => {
      live = false;
      clearTimeout(timer);
      clearTimeout(timeout);
    };
  }, [source, service, pending]);
  return { result: value, pending: Boolean(pending), unconfirmed };
}
