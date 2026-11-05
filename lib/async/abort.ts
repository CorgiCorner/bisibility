/** Stop waiting even when a dependency ignores cancellation; observe late rejections. */
export async function awaitWithSignal<T>(
  operation: () => T | PromiseLike<T>,
  signal?: AbortSignal | null,
): Promise<T> {
  signal?.throwIfAborted();
  if (!signal) return await operation();
  let abort: (() => void) | undefined;
  const aborted = new Promise<never>((_resolve, reject) => {
    abort = () => reject(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
  });
  try {
    return await Promise.race([aborted, operation()]);
  } finally {
    if (abort) signal.removeEventListener("abort", abort);
  }
}

/** The operation must use the supplied signal at every asynchronous boundary. */
export async function withDeadline<T>(
  parent: AbortSignal | undefined,
  timeoutMs: number,
  operation: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort(new DOMException("Operation deadline reached.", "TimeoutError"));
  }, timeoutMs);
  const signal = parent ? AbortSignal.any([parent, controller.signal]) : controller.signal;
  try {
    return await operation(signal);
  } finally {
    clearTimeout(timer);
  }
}
