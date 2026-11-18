import { ModelTransportError } from "./errors";

/** One deadline spans admission, headers and the entire body read. */
export function modelDeadline(timeoutMs: number, source: AbortSignal) {
  const controller = new AbortController();
  const expiresAt = performance.now() + timeoutMs;
  const cancel = () => controller.abort("aborted");
  source.addEventListener("abort", cancel, { once: true });
  if (source.aborted) cancel();
  const timer = setTimeout(() => controller.abort("timeout"), timeoutMs);
  const check = () => {
    if (!controller.signal.aborted && performance.now() >= expiresAt) controller.abort("timeout");
    if (controller.signal.aborted)
      throw new ModelTransportError(controller.signal.reason === "timeout" ? "timeout" : "aborted");
  };
  return {
    signal: controller.signal,
    check,
    async run<T>(work: () => Promise<T>): Promise<T> {
      check();
      let stop: () => void = () => {};
      const cancelled = new Promise<never>((_, reject) => {
        stop = () => {
          try {
            check();
          } catch (error) {
            reject(error);
          }
        };
        controller.signal.addEventListener("abort", stop, { once: true });
      });
      try {
        const result = await Promise.race([work(), cancelled]);
        check();
        return result;
      } finally {
        controller.signal.removeEventListener("abort", stop);
      }
    },
    close() {
      clearTimeout(timer);
      source.removeEventListener("abort", cancel);
    },
  };
}
export type ModelDeadline = ReturnType<typeof modelDeadline>;
