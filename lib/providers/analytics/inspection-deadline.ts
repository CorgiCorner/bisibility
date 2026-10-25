export class InspectionDeadlineError extends Error {}

/** Abort the transport and stop waiting even if a dependency ignores cancellation. */
export async function withInspectionDeadline<T>(
  inspect: (signal: AbortSignal) => Promise<T>,
  remainingMs: number,
): Promise<T> {
  const reason = new InspectionDeadlineError("URL inspection deadline reached.");
  if (remainingMs <= 0) throw reason;
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      controller.abort(reason);
      reject(reason);
    }, remainingMs);
  });
  try {
    return await Promise.race([inspect(controller.signal), deadline]);
  } finally {
    clearTimeout(timer);
  }
}
