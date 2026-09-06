export const HEARTBEAT_INTERVAL_MS = 25_000;
export const POLL_INTERVAL_MS = 4_000;
export const RECONCILIATION_INTERVAL_MS = 30_000;
export const RECONNECT_RETRY_MS = 15_000;
export const SNAPSHOT_COALESCE_MS = 250;
export const SUBSCRIBER_READY_TIMEOUT_MS = 2_000;

export function streamHeaders() {
  return {
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "Content-Type": "text/event-stream; charset=utf-8",
    "X-Accel-Buffering": "no",
  };
}

export function sseEvent(event: string, data: unknown) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export function createCoalescedTask(task: () => void) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return {
    cancel() {
      if (timer) clearTimeout(timer);
      timer = null;
    },
    schedule() {
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        task();
      }, SNAPSHOT_COALESCE_MS);
    },
  };
}
