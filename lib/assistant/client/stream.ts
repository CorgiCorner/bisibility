import type { AssistantStreamEvent } from "@/lib/assistant/wire";

const eventTypes = new Set([
  "run.started",
  "text.delta",
  "tool.updated",
  "run.updated",
  "error",
  "run.finished",
]);

/** Consume NDJSON incrementally; unknown event types are reserved for future protocol versions. */
export async function readAssistantStream(
  body: ReadableStream<Uint8Array>,
  onEvent: (event: AssistantStreamEvent) => void,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let pending = "";
  const consume = (line: string) => {
    if (!line.trim()) return;
    const value: unknown = JSON.parse(line);
    if (typeof value !== "object" || value === null) return;
    const candidate = value as { type?: unknown; seq?: unknown };
    if (
      typeof candidate.type === "string" &&
      eventTypes.has(candidate.type) &&
      typeof candidate.seq === "number" &&
      Number.isSafeInteger(candidate.seq) &&
      candidate.seq >= 0
    ) {
      onEvent(value as AssistantStreamEvent);
    }
  };
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      pending += decoder.decode(value, { stream: true });
      let newline = pending.indexOf("\n");
      while (newline !== -1) {
        consume(pending.slice(0, newline));
        pending = pending.slice(newline + 1);
        newline = pending.indexOf("\n");
      }
    }
    pending += decoder.decode();
    consume(pending);
  } finally {
    reader.releaseLock();
  }
}
