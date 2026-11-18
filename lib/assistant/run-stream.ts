import "server-only";
import { prisma } from "@/lib/db/prisma";
import { registerAssistantRun, unregisterAssistantRun } from "./run-control";
import {
  type EngineInput,
  executeAssistantRun,
  type UnsequencedAssistantEvent,
} from "./run-engine";
import { ASSISTANT_STREAM_CONTENT_TYPE } from "./wire";

/** Stream lifetime owns generation; a disconnected reader aborts the upstream provider. */
export function assistantRunStream(
  input: Omit<EngineInput, "signal" | "timedOut" | "emit">,
  request: Request,
) {
  const controller = new AbortController();
  registerAssistantRun(input.run.id, controller);
  let timedOut = false,
    sequence = 0,
    closed = false,
    polling = false;
  const stop = () => controller.abort();
  request.signal.addEventListener("abort", stop, { once: true });
  if (request.signal.aborted) stop();
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, 120000);
  const poll = setInterval(() => {
    if (polling || controller.signal.aborted) return;
    polling = true;
    void prisma.assistantRun
      .findUnique({ where: { id: input.run.id }, select: { status: true } })
      .then((run) => {
        if (!run || run.status === "cancelled") controller.abort();
      })
      .catch(() => controller.abort())
      .finally(() => {
        polling = false;
      });
  }, 2000);
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(output) {
      const emit = (event: UnsequencedAssistantEvent) => {
        if (closed) return;
        try {
          output.enqueue(encoder.encode(`${JSON.stringify({ ...event, seq: ++sequence })}\n`));
        } catch {
          closed = true;
          controller.abort();
        }
      };
      void executeAssistantRun({
        ...input,
        signal: controller.signal,
        timedOut: () => timedOut,
        emit,
      })
        .catch(() =>
          emit({
            type: "error",
            error: { code: "internal", message: "Assistant request failed." },
          }),
        )
        .finally(() => {
          clearTimeout(timer);
          clearInterval(poll);
          request.signal.removeEventListener("abort", stop);
          unregisterAssistantRun(input.run.id, controller);
          if (!closed) {
            closed = true;
            try {
              output.close();
            } catch {}
          }
        });
    },
    cancel() {
      closed = true;
      controller.abort();
    },
  });
  return new Response(stream, {
    headers: {
      "content-type": ASSISTANT_STREAM_CONTENT_TYPE,
      "cache-control": "no-store, no-transform",
      "x-accel-buffering": "no",
    },
  });
}
