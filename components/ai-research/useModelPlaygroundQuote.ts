"use client";
import { scheduleComposerExpiry } from "@/lib/model-playground/composer-timer";
import type {
  ModelPlaygroundLaunchService,
  ModelPlaygroundQuote,
} from "@/lib/model-playground/launch-service";
import type { ModelPlaygroundInput } from "@/lib/model-playground/types";
import { useEffect, useRef, useState } from "react";

export function useModelPlaygroundQuote(
  service: ModelPlaygroundLaunchService,
  input: ModelPlaygroundInput,
  revision: string,
  enabled: boolean,
  debounceMs: number,
) {
  const [state, setState] = useState<{ quote: ModelPlaygroundQuote | null; failed: boolean }>({
    quote: null,
    failed: false,
  });
  const current = useRef<ModelPlaygroundQuote | null>(null);
  const requestFresh = useRef<(() => Promise<void>) | null>(null);
  // Synchronize the cancellable free preflight service and its expiry timer with the current revision.
  useEffect(() => {
    current.current = null;
    setState({ quote: null, failed: false });
    if (!enabled) return;
    let controller: AbortController | undefined;
    let cancelExpiry: (() => void) | undefined;
    const load = async () => {
      controller?.abort();
      cancelExpiry?.();
      const request = new AbortController();
      controller = request;
      current.current = null;
      setState({ quote: null, failed: false });
      try {
        const quote = await service.preview({ input, revision }, request.signal);
        if (request.signal.aborted || quote.revision !== revision) return;
        current.current = quote;
        setState({ quote, failed: false });
        cancelExpiry = scheduleComposerExpiry(Date.parse(quote.expiresAt), () => {
          current.current = null;
          setState({ quote: null, failed: false });
        });
      } catch {
        if (!request.signal.aborted) setState({ quote: null, failed: true });
      }
    };
    const timer = setTimeout(load, debounceMs);
    requestFresh.current = async () => {
      clearTimeout(timer);
      await load();
    };
    return () => {
      clearTimeout(timer);
      cancelExpiry?.();
      controller?.abort();
      current.current = null;
      requestFresh.current = null;
    };
  }, [service, input, revision, enabled, debounceMs]);
  return {
    ...state,
    invalidate: () => requestFresh.current?.(),
    isCurrent: (quote: ModelPlaygroundQuote) => current.current === quote,
  };
}
