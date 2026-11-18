"use client";

import { AssistantRequestError, assistantFetch, assistantGet } from "@/lib/assistant/client/api";
import {
  type ConversationState,
  conversationReducer,
  conversationState,
} from "@/lib/assistant/client/conversation-store";
import { readAssistantStream } from "@/lib/assistant/client/stream";
import type { AssistantEffort } from "@/lib/assistant/effort";
import {
  ASSISTANT_API,
  type AssistantConfigView,
  type AssistantErrorView,
  type ConversationSummaryView,
  type ConversationView,
  type ToolCallView,
  type TurnRequest,
} from "@/lib/assistant/wire";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";

const STOP_CHARGE_TRIES = 5;
const STOP_CHARGE_INTERVAL_MS = 600;

export function useAssistantConversation(project: string, open: boolean) {
  const queryClient = useQueryClient();
  const [id, setId] = useState<string | null | undefined>(undefined);
  const [live, setLive] = useState<ConversationState | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [pendingText, setPendingText] = useState<string | null>(null);
  const [error, setError] = useState<AssistantErrorView | null>(null);
  const [networkError, setNetworkError] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const runId = useRef<string | null>(null);
  const lastRequest = useRef<{ request: TurnRequest; base: ConversationView | null } | null>(null);
  const config = useQuery({
    queryKey: ["assistant", project, "config"],
    enabled: open,
    queryFn: ({ signal }) =>
      assistantGet<AssistantConfigView>(
        `${ASSISTANT_API.config}?project=${encodeURIComponent(project)}`,
        signal,
      ),
  });
  const history = useQuery({
    queryKey: ["assistant", project, "history"],
    enabled: open && config.data?.enabled === true,
    queryFn: ({ signal }) =>
      assistantGet<ConversationSummaryView[]>(
        `${ASSISTANT_API.conversations}?project=${encodeURIComponent(project)}`,
        signal,
      ),
  });
  const selectedId = id === undefined ? (history.data?.[0]?.id ?? null) : id;
  const conversation = useQuery({
    queryKey: ["assistant", project, "conversation", selectedId],
    enabled: open && Boolean(selectedId),
    queryFn: async ({ signal }) => {
      if (!selectedId) throw new Error("Conversation ID missing");
      const result = await assistantGet<ConversationView>(
        ASSISTANT_API.conversation(selectedId),
        signal,
      );
      if (result.projectPublicId !== project) throw new Error("Conversation project mismatch");
      return result;
    },
  });
  const current = live?.conversation ?? conversation.data ?? null;
  function select(next: string | null) {
    if (streaming) return;
    setLive(null);
    setId(next);
    setError(null);
    setNetworkError(false);
    lastRequest.current = null;
  }
  async function refresh(target: string | null) {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["assistant", project, "config"] }),
      queryClient.invalidateQueries({ queryKey: ["assistant", project, "history"] }),
      target
        ? queryClient.invalidateQueries({
            queryKey: ["assistant", project, "conversation", target],
          })
        : Promise.resolve(),
    ]);
  }
  /**
   * A stopped answer is charged at once on the server, a moment after the stream drops. Re-read
   * the conversation until that run holds nothing unsettled (a few tries), so the run cost and
   * the Credits balance in the composer show the charge right after Stop.
   */
  async function awaitStopCharge(target: string | null, stopped: string) {
    if (!target) return;
    for (let tries = 0; tries < STOP_CHARGE_TRIES; tries++) {
      const view = queryClient.getQueryData<ConversationView>([
        "assistant",
        project,
        "conversation",
        target,
      ]);
      const run = view?.runs.find((item) => item.id === stopped);
      if (run && !run.usageUncertain) return;
      await new Promise((resolve) => setTimeout(resolve, STOP_CHARGE_INTERVAL_MS));
      await refresh(target);
    }
  }
  async function consume(response: Response, initial: ConversationView | null) {
    if (!response.body) throw new Error("Missing stream");
    let state = conversationState(initial);
    let target = initial?.id ?? null;
    let finished = false;
    setLive(state);
    await readAssistantStream(response.body, (event) => {
      if (event.type === "run.started") {
        setPendingText(null);
        target = event.conversationId;
        runId.current = event.run.id;
        setId(target);
      }
      if (event.type === "run.finished") {
        finished = true;
        runId.current = null;
      }
      state = conversationReducer(state, event);
      setLive(state);
    });
    if (finished) {
      await refresh(target);
      setLive(null);
    } else {
      throw new Error("Stream ended before run.finished");
    }
  }
  async function sendRequest(request: TurnRequest, base: ConversationView | null) {
    if (controller.current) return;
    const abort = new AbortController();
    controller.current = abort;
    lastRequest.current = { request, base };
    setPendingText(request.text ?? "");
    setStreaming(true);
    setError(null);
    setNetworkError(false);
    try {
      const response = await assistantFetch(ASSISTANT_API.turns, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
        signal: abort.signal,
      });
      await consume(response, base);
      lastRequest.current = null;
    } catch (failure) {
      if (abort.signal.aborted) lastRequest.current = null;
      else if (failure instanceof AssistantRequestError && failure.detail) {
        lastRequest.current = null;
        setError(failure.detail);
      } else setNetworkError(true);
    } finally {
      controller.current = null;
      setPendingText(null);
      setStreaming(false);
    }
  }
  function send(
    text: string | null,
    retryOfRunId: string | null,
    modelId: string,
    effort: AssistantEffort | null = null,
    maxOutputTokens: number | null = null,
  ) {
    if (!text && !retryOfRunId) return;
    const request: TurnRequest = {
      project,
      conversationId: selectedId,
      requestId: crypto.randomUUID(),
      modelId,
      ...(effort ? { effort } : {}),
      ...(maxOutputTokens ? { maxOutputTokens } : {}),
      ...(text ? { text } : { retryOfRunId: retryOfRunId ?? undefined }),
    };
    void sendRequest(request, current);
  }
  function stop() {
    const active = runId.current ?? current?.activeRunId;
    const stream = controller.current;
    lastRequest.current = null;
    if (!active) {
      stream?.abort();
      return;
    }
    void (async () => {
      try {
        // Record the Stop before dropping the stream so the server reports a user cancellation.
        await Promise.race([
          assistantFetch(ASSISTANT_API.stop(active), { method: "POST" }),
          new Promise((resolve) => setTimeout(resolve, 2000)),
        ]);
      } catch {
        setNetworkError(true);
      } finally {
        stream?.abort();
        await refresh(selectedId);
        await awaitStopCharge(selectedId, active);
        // A newer run may have started while the Stop was in flight; leave its state alone.
        if (runId.current === active || runId.current === null) {
          setLive(null);
          runId.current = null;
        }
      }
    })();
  }
  async function decide(call: ToolCallView, decision: "approve" | "deny") {
    if (!call.argsHash || controller.current) throw new Error("Decision unavailable");
    const abort = new AbortController();
    controller.current = abort;
    setError(null);
    setNetworkError(false);
    setStreaming(true);
    try {
      const response = await assistantFetch(ASSISTANT_API.decision(call.id), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          decision,
          argsHash: call.argsHash,
          maxCostCents: call.maxCostCents,
          requestId: crypto.randomUUID(),
        }),
        signal: abort.signal,
      });
      if (response.body && response.headers.get("content-type")?.includes("application/x-ndjson"))
        await consume(response, current);
      else await refresh(selectedId);
    } catch (failure) {
      if (!abort.signal.aborted) {
        if (failure instanceof AssistantRequestError && failure.detail) setError(failure.detail);
        else setNetworkError(true);
        await refresh(selectedId);
      }
      throw failure;
    } finally {
      controller.current = null;
      setPendingText(null);
      setStreaming(false);
    }
  }
  return {
    config,
    history,
    conversation,
    current,
    streaming,
    pendingText,
    error: error ?? live?.error ?? null,
    networkError,
    canResubmit: Boolean(lastRequest.current),
    resubmit: () => {
      const previous = lastRequest.current;
      if (previous) void sendRequest(previous.request, previous.base);
    },
    select,
    send,
    stop,
    decide,
  };
}
