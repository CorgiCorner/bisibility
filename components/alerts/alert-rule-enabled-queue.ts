"use client";

import { useRef, useState } from "react";

type ToggleQueueHandlers = {
  onError?: () => void;
  onPending: (pending: boolean) => void;
  onRequest?: () => void;
  onState: (enabled: boolean) => void;
  save: (enabled: boolean) => Promise<unknown>;
};

export class SerializedToggleQueue {
  private confirmed: boolean;
  /** Newest server value seen while a save was pending; a failed save rolls back to it. */
  private external: boolean | undefined;
  private handlers: ToggleQueueHandlers;
  private pending = false;
  private queued: boolean | undefined;

  constructor(initial: boolean, handlers: ToggleQueueHandlers) {
    this.confirmed = initial;
    this.handlers = handlers;
  }

  setHandlers(handlers: ToggleQueueHandlers) {
    this.handlers = handlers;
  }

  /** Idempotent, so a replayed render applies the same server value without diverging. */
  sync(enabled: boolean) {
    if (this.pending) {
      this.external = enabled;
      return false;
    }
    this.confirmed = enabled;
    return true;
  }

  request(enabled: boolean) {
    this.handlers.onRequest?.();
    this.handlers.onState(enabled);
    if (this.pending) {
      this.queued = enabled;
      return;
    }
    void this.save(enabled);
  }

  private async save(intent: boolean) {
    this.pending = true;
    this.handlers.onPending(true);
    try {
      await this.handlers.save(intent);
      this.confirmed = intent;
    } catch {
      if (this.external !== undefined) this.confirmed = this.external;
      this.queued = undefined;
      this.handlers.onState(this.confirmed);
      this.handlers.onError?.();
    }
    this.pending = false;
    this.external = undefined;
    const next = this.queued;
    this.queued = undefined;
    if (next !== undefined && next !== this.confirmed) {
      await this.save(next);
      return;
    }
    this.handlers.onPending(false);
    this.handlers.onState(this.confirmed);
  }
}

export function useRuleEnabledQueue(
  initial: boolean,
  save: (enabled: boolean) => Promise<unknown>,
  errorMessage: string,
) {
  const saveRef = useRef(save);
  const [enabled, setEnabled] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const queueRef = useRef<SerializedToggleQueue | null>(null);
  const [previousInitial, setPreviousInitial] = useState(initial);
  saveRef.current = save;

  const handlers: ToggleQueueHandlers = {
    onError: () => setError(errorMessage),
    onPending: setPending,
    onRequest: () => setError(null),
    onState: setEnabled,
    save: (next) => saveRef.current(next),
  };
  if (!queueRef.current) queueRef.current = new SerializedToggleQueue(initial, handlers);
  queueRef.current.setHandlers(handlers);
  // Derive from the previous prop held in state (not a ref) so a discarded render retries the sync.
  if (previousInitial !== initial) {
    setPreviousInitial(initial);
    if (queueRef.current.sync(initial)) setEnabled(initial);
  }

  return { enabled, error, pending, request: (next: boolean) => queueRef.current?.request(next) };
}
