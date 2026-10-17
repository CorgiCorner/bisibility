import type { ConsentState } from "@/lib/analytics/consent";
import { readBrowserConsent } from "@/lib/analytics/consent-client";
import { MOTION_MODAL_EXIT } from "@/lib/ui/motion";

export type ConsentBannerDelay = 0 | 5000;
type Snapshot = { phase: "waiting" | "open" | "closing" | "closed"; shownAt: number | null };

/** A subscribed clock keeps delayed presentation and exit timers outside rendering. */
export function createConsentBannerState(initialConsent: ConsentState, delay: ConsentBannerDelay) {
  let state: Snapshot = { phase: delay === 0 ? "open" : "waiting", shownAt: null };
  const initialState = state;
  const listeners = new Set<() => void>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let deadline: number | undefined;

  function update(next: Snapshot) {
    state = next;
    for (const listener of listeners) listener();
  }
  function show() {
    timer = undefined;
    const fresh = readBrowserConsent(initialConsent);
    update({
      phase: fresh.status === "pending" || fresh.replayNeedsDecision ? "open" : "closed",
      shownAt: Date.now(),
    });
  }
  function finishClosing() {
    timer = undefined;
    update({ ...state, phase: "closed" });
  }
  return {
    getSnapshot: () => state,
    getServerSnapshot: () => initialState,
    close() {
      if (state.phase !== "open") return;
      update({ ...state, phase: "closing" });
      clearTimeout(timer);
      deadline = Date.now() + MOTION_MODAL_EXIT;
      timer = setTimeout(finishClosing, MOTION_MODAL_EXIT);
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      if (state.phase === "waiting" && !timer) {
        deadline ??= Date.now() + delay;
        timer = setTimeout(show, Math.max(0, deadline - Date.now()));
      } else if (state.phase === "closing" && !timer) {
        timer = setTimeout(finishClosing, Math.max(0, (deadline ?? Date.now()) - Date.now()));
      } else if (state.phase === "open" && state.shownAt === null) {
        update({ ...state, shownAt: Date.now() });
      }
      return () => {
        listeners.delete(listener);
        if (listeners.size) return;
        clearTimeout(timer);
        timer = undefined;
      };
    },
  };
}
