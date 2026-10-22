"use client";

import { useCallback, useSyncExternalStore } from "react";

/** The deadline is an external clock, independent of interaction or unrelated renders. */
export function usePaymentQuoteExpiry(deadline: number) {
  const subscribe = useCallback(
    (changed: () => void) => {
      if (!Number.isFinite(deadline)) return () => {};
      let timer: ReturnType<typeof setTimeout>;
      const tick = () => {
        const remaining = deadline - Date.now();
        if (remaining <= 0) changed();
        else timer = setTimeout(tick, Math.min(remaining, 2_147_483_646));
      };
      timer = setTimeout(tick, Math.min(Math.max(0, deadline - Date.now()), 2_147_483_646));
      return () => clearTimeout(timer);
    },
    [deadline],
  );
  return useSyncExternalStore(
    subscribe,
    () => Number.isFinite(deadline) && deadline <= Date.now(),
    () => false,
  );
}
