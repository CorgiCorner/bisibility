export type ToastLifecycle = {
  start: (durationMs: number, onExpire: () => void) => void;
  pause: (reason: string) => void;
  resume: (reason: string) => void;
  expire: () => void;
  cancel: () => void;
  dispose: () => void;
  readonly remainingMs: number;
  readonly isPaused: boolean;
  readonly isExpired: boolean;
  readonly isDisposed: boolean;
};

export function createToastLifecycle(): ToastLifecycle {
  let startedAt = 0;
  let storedRemaining = 0;
  let timerId: ReturnType<typeof setTimeout> | null = null;
  let onExpire: (() => void) | null = null;
  let expired = false;
  let disposed = false;
  const pauseReasons = new Set<string>();

  function clearTimer(): void {
    if (timerId !== null) {
      clearTimeout(timerId);
      timerId = null;
    }
  }

  function startTimer(ms: number): void {
    clearTimer();
    startedAt = Date.now();
    storedRemaining = ms;
    timerId = setTimeout(() => {
      timerId = null;
      fireExpiry();
    }, ms);
  }

  function fireExpiry(): void {
    if (expired || disposed) return;
    expired = true;
    clearTimer();
    storedRemaining = 0;
    const cb = onExpire;
    onExpire = null;
    pauseReasons.clear();
    if (cb) cb();
  }

  const lifecycle: ToastLifecycle = {
    start(durationMs: number, callback: () => void): void {
      if (disposed || expired) return;
      onExpire = callback;
      if (pauseReasons.size > 0) {
        storedRemaining = durationMs;
        startedAt = 0;
      } else {
        startTimer(durationMs);
      }
    },

    pause(reason: string): void {
      if (disposed || expired) return;
      const wasEmpty = pauseReasons.size === 0;
      pauseReasons.add(reason);
      if (wasEmpty && timerId !== null) {
        storedRemaining = Math.max(0, storedRemaining - (Date.now() - startedAt));
        clearTimer();
      }
    },

    resume(reason: string): void {
      if (disposed || expired) return;
      pauseReasons.delete(reason);
      if (pauseReasons.size === 0 && timerId === null && onExpire) {
        if (storedRemaining > 0) {
          startTimer(storedRemaining);
        } else {
          fireExpiry();
        }
      }
    },

    expire(): void {
      fireExpiry();
    },

    cancel(): void {
      if (expired || disposed) return;
      expired = true;
      storedRemaining = 0;
      clearTimer();
      onExpire = null;
      pauseReasons.clear();
    },

    dispose(): void {
      if (disposed) return;
      disposed = true;
      storedRemaining = 0;
      clearTimer();
      onExpire = null;
      pauseReasons.clear();
    },

    get remainingMs(): number {
      if (timerId !== null) {
        return Math.max(0, storedRemaining - (Date.now() - startedAt));
      }
      return storedRemaining;
    },

    get isPaused(): boolean {
      return pauseReasons.size > 0;
    },

    get isExpired(): boolean {
      return expired;
    },

    get isDisposed(): boolean {
      return disposed;
    },
  };

  return lifecycle;
}
